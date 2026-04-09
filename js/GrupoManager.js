window.GrupoManager = {
    grupos: new Map(),
    equiposPendientes: new Map(),
    currentEditingGroup: null,
    currentGrupoDetalle: null,
    unsubscribe: null,
    // CORRECCIÓN 5: Cache para optimizar rendimiento
    totalesCache: new Map(),
    lastUpdateTime: null,

    async initialize() {
        await this.loadGrupos();
        await this.loadEquiposPendientes();
        this.setupRealTimeListener();
        this.updateUI();
    },

    setupRealTimeListener() {
        if (!AppState.firebaseInitialized) return;

        this.unsubscribe = AppState.db.collection("VENTAS")
            .where("paymentType", "==", "pendiente")
            .where("status", "==", "pendiente")
            .onSnapshot(async (snapshot) => {
                await this.loadEquiposPendientes(true); // Forzar actualización
                await this.actualizarTotalesGrupos(true); // Forzar actualización de totales
                this.updateUI();
            }, (error) => {
                console.error("Error en listener tiempo real:", error);
            });
    },

    async loadGrupos() {
        try {
            if (!AppState.firebaseInitialized) return;

            const snapshot = await ErrorHandler.withRetry(
                () => AppState.db.collection("GRUPOS").get(),
                3,
                "Carga de grupos"
            );

            this.grupos.clear();
            snapshot.forEach(doc => {
                this.grupos.set(doc.id, { id: doc.id, ...doc.data() });
            });

            await this.actualizarTotalesGrupos();

        } catch (error) {
            console.error("Error cargando grupos:", error);
            UIService.showStatus("Error cargando grupos: " + error.message, "error");
        }
    },

    // CORRECCIÓN 5: Función optimizada para actualizar totales
    async actualizarTotalesGrupos(force = false) {
        try {
            const now = Date.now();
            // Usar cache si la actualización fue hace menos de 30 segundos, a menos que se fuerce
            if (!force && this.lastUpdateTime && (now - this.lastUpdateTime < 30000)) {
                return;
            }

            const batch = AppState.db.batch();
            let updatesCount = 0;

            for (const [grupoId, grupo] of this.grupos.entries()) {
                // CORRECCIÓN: Siempre recalcular el total desde equiposPendientes
                // No usar caché porque los saldos cambian con abonos
                let nuevoTotal = 0;

                for (const equipoKey of grupo.equipos) {
                    // 1. Buscar por clave exacta (ej: "65-Cedros" o "65-Equipo 65")
                    let equipoEncontrado = this.equiposPendientes.get(equipoKey);

                    if (equipoEncontrado && equipoEncontrado.total > 0) {
                        nuevoTotal += equipoEncontrado.total;
                    }
                }

                // Actualizar si hay diferencia
                if (grupo.total !== nuevoTotal) {
                    grupo.total = nuevoTotal;

                    if (AppState.firebaseInitialized) {
                        try {
                            const grupoRef = AppState.db.collection("GRUPOS").doc(grupoId);
                            batch.update(grupoRef, {
                                total: nuevoTotal,
                                fechaActualizacion: new Date()
                            });
                            updatesCount++;

                            // Limitar tamaño del batch para evitar timeouts
                            if (updatesCount >= 400) {
                                await batch.commit();
                                updatesCount = 0;
                            }
                        } catch (error) {
                            console.error(`Error actualizando grupo ${grupo.nombre}:`, error);
                        }
                    }
                }
            }

            // Commit batch final si hay updates pendientes
            if (updatesCount > 0) {
                await batch.commit();
            }

            this.lastUpdateTime = now;

        } catch (error) {
            console.error("Error actualizando totales de grupos:", error);
        }
    },

    async loadEquiposPendientes(force = false) {
        try {
            if (!AppState.firebaseInitialized) return;

            const snapshot = await ErrorHandler.withRetry(
                () => AppState.db.collection("VENTAS")
                    .where("paymentType", "==", "pendiente")
                    .where("status", "==", "pendiente")
                    .get(),
                3,
                "Carga de equipos pendientes"
            );

            this.equiposPendientes.clear();

            snapshot.forEach(doc => {
                const venta = doc.data();
                const equipo = venta.equipoNumber;
                const cliente = venta.clientName || '';

                let saldoPendiente = venta.total || 0;
                if (venta.abonos && venta.abonos.length > 0) {
                    const totalAbonado = venta.abonos.reduce((sum, abono) => sum + abono.monto, 0);
                    saldoPendiente = venta.total - totalAbonado;
                }

                if (equipo && saldoPendiente > 0) {
                    // CORRECCIÓN LÓGICA: Separar por equipo Y cliente para evitar mezclar cuentas distintas con el mismo número de equipo
                    const key = cliente ? `${equipo}-${cliente}` : equipo;

                    if (!this.equiposPendientes.has(key)) {
                        this.equiposPendientes.set(key, {
                            numero: equipo,
                            cliente: cliente,
                            total: 0,
                            facturas: []
                        });
                    }

                    const equipoData = this.equiposPendientes.get(key);

                    // Actualizar cliente principal si el actual está vacío (para casos donde la primera factura no tenía nombre)
                    if (!equipoData.cliente && cliente) equipoData.cliente = cliente;

                    equipoData.facturas.push({
                        id: doc.id,
                        ...venta,
                        saldoPendiente: saldoPendiente
                    });
                    equipoData.total += saldoPendiente;
                }
            });

            // Lógica de Sets de clientes eliminada porque ahora las claves son únicas por cliente

            await this.actualizarTotalesGrupos(force);
            MemoryManager.cleanupIfNeeded(this.equiposPendientes);

        } catch (error) {
            console.error("Error cargando equipos pendientes:", error);
        }
    },

    async crearGrupo(nombre, equiposSeleccionados) {
        try {
            if (!AppState.firebaseInitialized) {
                throw new Error("No hay conexión a la base de datos");
            }

            // PERMITIR EQUIPOS SIN DEUDA (Eliminado el filtro estricto)
            // Se guardan tal cual vienen seleccionados
            const equiposAGuardar = equiposSeleccionados;

            // Calcular total inicial (solo de los que tengan deuda activa)
            let totalGrupo = 0;
            equiposAGuardar.forEach(equipoKey => {
                const equipo = this.equiposPendientes.get(equipoKey);
                if (equipo) {
                    totalGrupo += equipo.total;
                }
            });

            const grupoData = {
                nombre: nombre,
                equipos: equiposAGuardar,
                total: totalGrupo,
                fechaCreacion: new Date(),
                activo: true
            };

            const docRef = await ErrorHandler.withRetry(
                () => AppState.db.collection("GRUPOS").add(grupoData),
                3,
                "Creación de grupo"
            );

            grupoData.id = docRef.id;
            this.grupos.set(docRef.id, grupoData);

            // Actualizar las facturas con la información del grupo
            for (const equipoKey of equiposAGuardar) {
                const equipo = this.equiposPendientes.get(equipoKey);
                if (equipo && equipo.facturas) {
                    for (const factura of equipo.facturas) {
                        try {
                            await AppState.db.collection("VENTAS").doc(factura.id).update({
                                grupo: docRef.id,
                                grupoNombre: nombre
                            });
                        } catch (error) {
                            console.error(`Error actualizando factura ${factura.id}:`, error);
                        }
                    }
                }
            }

            await this.loadEquiposPendientes();
            await this.actualizarTotalesGrupos();
            this.updateUI();

            return docRef.id;
        } catch (error) {
            console.error("Error creando grupo:", error);
            throw error;
        }
    },

    async actualizarGrupo(grupoId, nombre, equiposSeleccionados) {
        try {
            if (!AppState.firebaseInitialized) {
                throw new Error("No hay conexión a la base de datos");
            }

            // PERMITIR EQUIPOS SIN DEUDA (Eliminado el filtro estricto)
            const equiposAGuardar = equiposSeleccionados;

            let totalGrupo = 0;
            equiposAGuardar.forEach(equipoKey => {
                const equipo = this.equiposPendientes.get(equipoKey);
                if (equipo) {
                    totalGrupo += equipo.total;
                }
            });

            const grupoData = {
                nombre: nombre,
                equipos: equiposAGuardar,
                total: totalGrupo,
                fechaActualizacion: new Date()
            };

            await ErrorHandler.withRetry(
                () => AppState.db.collection("GRUPOS").doc(grupoId).update(grupoData),
                3,
                "Actualización de grupo"
            );

            const grupoExistente = this.grupos.get(grupoId);
            if (grupoExistente) {
                Object.assign(grupoExistente, grupoData);
            }

            // Actualizar facturas con el nuevo grupo
            for (const equipoKey of equiposAGuardar) {
                const equipo = this.equiposPendientes.get(equipoKey);
                if (equipo && equipo.facturas) {
                    for (const factura of equipo.facturas) {
                        try {
                            await AppState.db.collection("VENTAS").doc(factura.id).update({
                                grupo: grupoId,
                                grupoNombre: nombre
                            });
                        } catch (error) {
                            console.error(`Error actualizando factura ${factura.id}:`, error);
                        }
                    }
                }
            }

            // Remover grupo de facturas que ya no están en el grupo
            const grupoOriginal = this.grupos.get(grupoId);
            if (grupoOriginal) {
                for (const equipoKey of grupoOriginal.equipos) {
                    if (!equiposAGuardar.includes(equipoKey)) {
                        const equipo = this.equiposPendientes.get(equipoKey);
                        if (equipo && equipo.facturas) {
                            for (const factura of equipo.facturas) {
                                try {
                                    if (AppState.firebaseInitialized) {
                                        await AppState.db.collection("VENTAS").doc(factura.id).update({
                                            grupo: firebase.firestore.FieldValue.delete(),
                                            grupoNombre: firebase.firestore.FieldValue.delete()
                                        });
                                    }
                                } catch (error) {
                                    console.error(`Error removiendo grupo de factura ${factura.id}:`, error);
                                }
                            }
                        }
                    }
                }
            }

            await this.loadEquiposPendientes();
            await this.actualizarTotalesGrupos();
            this.updateUI();

            return grupoId;
        } catch (error) {
            console.error("Error actualizando grupo:", error);
            throw error;
        }
    },

    async eliminarGrupo(grupoId) {
        try {
            if (!AppState.firebaseInitialized) {
                throw new Error("No hay conexión a la base de datos");
            }

            const grupo = this.grupos.get(grupoId);
            if (grupo) {
                for (const equipoNum of grupo.equipos) {
                    for (const [key, equipo] of this.equiposPendientes.entries()) {
                        if (equipo.numero === equipoNum) {
                            for (const factura of equipo.facturas) {
                                try {
                                    if (AppState.firebaseInitialized) {
                                        // CORRECCIÓN 1: Usar firebase.firestore.FieldValue consistentemente
                                        await AppState.db.collection("VENTAS").doc(factura.id).update({
                                            grupo: firebase.firestore.FieldValue.delete(),
                                            grupoNombre: firebase.firestore.FieldValue.delete()
                                        });
                                    }
                                } catch (error) {
                                    console.error(`Error removiendo grupo de factura ${factura.id}:`, error);
                                }
                            }
                        }
                    }
                }
            }

            await ErrorHandler.withRetry(
                () => AppState.db.collection("GRUPOS").doc(grupoId).delete(),
                3,
                "Eliminación de grupo"
            );

            this.grupos.delete(grupoId);
            this.totalesCache.clear(); // Limpiar cache

            await this.loadEquiposPendientes();
            await this.actualizarTotalesGrupos();
            this.updateUI();

        } catch (error) {
            console.error("Error eliminando grupo:", error);
            throw error;
        }
    },

    getEquiposSinGrupo() {
        const equiposSinGrupo = new Map();
        const equiposEnGrupos = this.getEquiposEnGrupos(); // Usar el Set optimizado

        this.equiposPendientes.forEach((equipo, key) => {
            // Verificar si esta CLAVE ESPECÍFICA está en algún grupo
            let isGrouped = equiposEnGrupos.has(key);

            // LOGICA DE COMPATIBILIDAD CRÍTICA:
            // Si la clave es del tipo "65-Equipo 65" (nombre por defecto) y NO está explícitamente en un grupo,
            // verificamos si el número simple "65" sí está en un grupo (grupos antiguos).
            // Si es así, consideramos que este equipo genérico pertenece a ese grupo antiguo.
            // ESTO PREVIENE duplicados visuales para el dueño original.
            // PERO permite que "65-Amadeo" (que no coincide con este formato) se muestre libre en Facturas.
            if (!isGrouped && key === `${equipo.numero}-Equipo ${equipo.numero}`) {
                if (equiposEnGrupos.has(equipo.numero.toString())) {
                    isGrouped = true;
                }
            }
            // También verificar si el número simple está en grupo para casos sin nombre de cliente
            else if (!isGrouped && key === equipo.numero.toString()) {
                if (equiposEnGrupos.has(equipo.numero.toString())) {
                    isGrouped = true;
                }
            }

            if (!isGrouped && equipo.total > 0) {
                equiposSinGrupo.set(key, equipo);
            }
        });

        return equiposSinGrupo;
    },

    getEquiposEnGrupos() {
        const equiposEnGrupos = new Set();

        this.grupos.forEach(grupo => {
            grupo.equipos.forEach(equipoNum => {
                equiposEnGrupos.add(equipoNum);
            });
        });

        return equiposEnGrupos;
    },

    updateUI() {
        if (window.FacturasTabManager) {
            FacturasTabManager.renderEquiposIndividuales();
        }
        if (window.GruposTabManager) {
            GruposTabManager.renderGruposVisual();
        }
    },

    // Delegación para impresión de saldos si se llama desde HTML
    imprimirSaldosEquipos() {
        if (window.FacturasTabManager) {
            FacturasTabManager.imprimirSaldosEquipos();
        }
    },

    printBalanceHistory(key) {
        let equipo = this.equiposPendientes.get(key);

        // Fallback igual que en mostrarDetalleEquipo
        if (!equipo) {
            equipo = this.equiposPendientes.get(`${key}-Equipo ${key}`);
        }

        if (!equipo) {
            alert("Error: No se encontraron datos del equipo.");
            return;
        }

        // Transformar datos jerárquicos a movimiento plano para el ticket simplificado
        let movimientos = [];

        equipo.facturas.forEach(factura => {
            const fechaFactura = factura.timestamp ? new Date(factura.timestamp.toDate ? factura.timestamp.toDate() : factura.timestamp) : new Date();

            // 1. Agregar Venta
            movimientos.push({
                fecha: fechaFactura,
                concepto: `Venta #${factura.invoiceNumber}`,
                cargo: factura.total,
                abono: 0,
                monto: factura.total,
                tipo: 'venta'
            });

            // 2. Agregar Abonos individuales
            if (factura.abonos && factura.abonos.length > 0) {
                factura.abonos.forEach(abono => {
                    const fechaAbono = abono.fecha ? new Date(abono.fecha.toDate ? abono.fecha.toDate() : abono.fecha) : fechaFactura;
                    movimientos.push({
                        fecha: fechaAbono,
                        concepto: `Abono a #${factura.invoiceNumber}`,
                        cargo: 0,
                        abono: abono.monto,
                        monto: abono.monto,
                        tipo: 'abono'
                    });
                });
            }
        });

        // Ordenar cronológicamente
        movimientos.sort((a, b) => a.fecha - b.fecha);

        // Calcular saldos acumulativos
        let saldoAcumulado = 0;
        movimientos = movimientos.map(m => {
            saldoAcumulado += (m.cargo - m.abono);
            return { ...m, saldo: saldoAcumulado };
        });

        const datosReporte = {
            cliente: equipo.cliente || `Equipo ${equipo.numero}`,
            equipo: equipo.numero,
            movimientos: movimientos,
            saldoFinal: equipo.total,
            fechaImpresion: new Date()
        };

        try {
            console.log("Llamando a PrintingService...");
            if (typeof PrintingService === 'undefined') {
                alert("CRITICO: PrintingService no está definido.");
            } else if (!PrintingService.printBalanceHistory) {
                alert("CRITICO: La función printBalanceHistory no existe en PrintingService.");
            } else {
                PrintingService.printBalanceHistory(datosReporte);
            }
        } catch (e) {
            alert("Excepción al llamar a imprimir: " + e.message);
        }
    },

    async mostrarDetalleEquipo(key) {
        let equipo = this.equiposPendientes.get(key);

        // FALLBACK PARA CLIC EN DETALLES:
        if (!equipo) {
            equipo = this.equiposPendientes.get(`${key}-Equipo ${key}`);
        }

        AppState.selectedInvoicesForPayment = new Set();

        let facturasHTML = '';
        let cantidadFacturas = 0;
        let totalPendiente = 0;

        if (equipo) {
            // Ordenar facturas por fecha (las más antiguas primero)
            const sortedFacturas = [...equipo.facturas].sort((a, b) => {
                const dateA = a.timestamp ? (a.timestamp.toDate ? a.timestamp.toDate() : new Date(a.timestamp)) : new Date(0);
                const dateB = b.timestamp ? (b.timestamp.toDate ? b.timestamp.toDate() : new Date(b.timestamp)) : new Date(0);
                return dateA - dateB;
            });

            cantidadFacturas = sortedFacturas.length;

            sortedFacturas.forEach((factura, index) => {
                const saldoPendiente = factura.saldoPendiente !== undefined ? factura.saldoPendiente : factura.total;
                totalPendiente += saldoPendiente;
                const tieneAbonos = factura.abonos && factura.abonos.length > 0;

                // Tabla de productos
                let productosHTML = '';
                if (factura.products && factura.products.length > 0) {
                    let filasProductos = '';
                    factura.products.forEach((producto, pIdx) => {
                        filasProductos += `
                            <tr style="background: ${pIdx % 2 === 0 ? '#fafbfc' : 'white'};">
                                <td style="padding: 5px 8px; text-align: center; font-weight: 600; color: #2c3e50; border-bottom: 1px solid #f0f0f0;">${producto.cantidad}</td>
                                <td style="padding: 5px 8px; color: #555; border-bottom: 1px solid #f0f0f0;">
                                    <i class="fas fa-wrench" style="color: #bdc3c7; font-size: 0.65rem; margin-right: 4px;"></i>${producto.descripcion}
                                </td>
                                <td style="padding: 5px 8px; text-align: right; color: #7f8c8d; border-bottom: 1px solid #f0f0f0;">$${producto.precio.toFixed(2)}</td>
                                <td style="padding: 5px 8px; text-align: right; font-weight: 600; color: #2c3e50; border-bottom: 1px solid #f0f0f0;">$${(producto.precio * producto.cantidad).toFixed(2)}</td>
                            </tr>
                        `;
                    });
                    productosHTML = `
                        <table style="width: 100%; border-collapse: collapse; font-size: 0.8rem;">
                            <thead>
                                <tr style="background: linear-gradient(135deg, #2c3e50, #34495e);">
                                    <th style="padding: 6px 8px; text-align: center; color: white; font-size: 0.72rem; font-weight: 600; width: 45px;">CANT.</th>
                                    <th style="padding: 6px 8px; text-align: left; color: white; font-size: 0.72rem; font-weight: 600;">DESCRIPCIÓN</th>
                                    <th style="padding: 6px 8px; text-align: right; color: white; font-size: 0.72rem; font-weight: 600; width: 70px;">P. UNIT.</th>
                                    <th style="padding: 6px 8px; text-align: right; color: white; font-size: 0.72rem; font-weight: 600; width: 70px;">TOTAL</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${filasProductos}
                            </tbody>
                        </table>
                    `;
                }

                // Abonos info
                let abonosHTML = '';
                if (tieneAbonos) {
                    const totalAbonado = factura.abonos.reduce((sum, a) => sum + a.monto, 0);
                    let detalleAbonos = factura.abonos.map(a => {
                        const fechaAbono = a.fecha ? new Date(a.fecha.toDate ? a.fecha.toDate() : a.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }) : 'N/A';
                        return `<span style="font-size: 0.75rem; color: #27ae60;">+$${a.monto.toFixed(2)} (${fechaAbono})</span>`;
                    }).join(' · ');
                    abonosHTML = `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: #e8f8f5; border-top: 1px solid #d5f5e3; font-size: 0.8rem; flex-wrap: wrap; gap: 4px;">
                            <div><i class="fas fa-coins" style="color: #27ae60; margin-right: 4px;"></i> Abonado: $${totalAbonado.toFixed(2)} <span style="color: #95a5a6; margin-left: 4px;">${detalleAbonos}</span></div>
                            <span style="font-weight: 700; color: #e74c3c;">Pendiente: $${saldoPendiente.toFixed(2)}</span>
                        </div>
                    `;
                }

                // Detección de aceite
                let tieneCaja = false, tieneAceite = false;
                if (factura.products && factura.products.length > 0) {
                    const matchStr = factura.products.map(p => p.descripcion).join(' ').toLowerCase();
                    if (matchStr.includes('caja') || matchStr.includes('transmision')) tieneCaja = true;
                    const frasesAceite = ['cambio de aceite', 'cambio de aceite de caja', 'cambio de aceite de motor y caja'];
                    if (frasesAceite.some(frase => matchStr.includes(frase))) tieneAceite = true;
                }

                let borderStyle = '1px solid #e8e8e8';
                let bgFactura = 'white';
                let iconoServicio = '';

                if (tieneCaja) {
                    borderStyle = '3px solid #e74c3c';
                    bgFactura = '#fff5f5';
                    iconoServicio = '<span style="background: #e74c3c; color: white; font-size: 0.65rem; padding: 2px 6px; border-radius: 10px; font-weight: 600; margin-left: 8px;">🔧 CAJA</span>';
                } else if (tieneAceite) {
                    borderStyle = '3px solid #27ae60';
                    bgFactura = '#f0fff4';
                    iconoServicio = '<span style="background: #27ae60; color: white; font-size: 0.65rem; padding: 2px 6px; border-radius: 10px; font-weight: 600; margin-left: 8px;">🛢️ ACEITE</span>';
                }

                const fechaFactura = factura.timestamp ?
                    new Date(factura.timestamp.toDate ? factura.timestamp.toDate() : factura.timestamp).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
                    : 'N/A';

                facturasHTML += `
                    <div style="background: ${bgFactura}; border-radius: 8px; margin: 8px 0; overflow: hidden; border: ${borderStyle}; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); border-bottom: 1px solid #e0e0e0;">
                            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                                <input type="checkbox" class="invoice-checkbox" data-id="${factura.id}" 
                                       onchange="GrupoManager.toggleInvoiceSelection('${factura.id}')" 
                                       style="width: 18px; height: 18px; cursor: pointer;">
                                <i class="fas fa-file-invoice" style="color: #3498db; font-size: 0.9rem;"></i>
                                <span style="font-weight: 700; color: #2c3e50; font-size: 0.9rem;">${factura.invoiceNumber}</span>
                                ${iconoServicio}
                            </div>
                            <div style="display: flex; align-items: center; gap: 12px;">
                                <span style="color: #7f8c8d; font-size: 0.78rem;"><i class="fas fa-calendar-alt" style="margin-right: 3px;"></i>${fechaFactura}</span>
                                <span style="font-weight: 700; color: #2c3e50; font-size: 0.95rem;">$${factura.total.toFixed(2)}</span>
                            </div>
                        </div>
                        <div style="padding: 0;">
                            ${productosHTML}
                        </div>
                        ${abonosHTML}
                    </div>
                `;
            });
        }

        const nombreEquipo = equipo && equipo.cliente && equipo.cliente !== `Equipo ${equipo.numero}`
            ? `${equipo.numero} - ${equipo.cliente}`
            : `Equipo ${equipo ? equipo.numero : key}`;

        const tieneAbonosGlobal = totalPendiente !== (equipo ? equipo.total : 0);

        const modalContent = `
            <div style="text-align: center; padding: 16px 0 12px 0; border-bottom: 3px solid #3498db; margin-bottom: 16px;">
                <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 2px; color: #95a5a6; margin-bottom: 4px;">Detalle del Equipo</div>
                <h2 style="margin: 0; color: #2c3e50; font-size: 1.5rem; font-weight: 800;"><i class="fas fa-motorcycle" style="margin-right: 8px;"></i>${nombreEquipo}</h2>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; margin-bottom: 18px;">
                <div style="background: linear-gradient(135deg, #9b59b6 0%, #8e44ad 100%); padding: 14px 10px; border-radius: 10px; text-align: center; color: white;">
                    <i class="fas fa-file-invoice" style="font-size: 1.2rem; margin-bottom: 4px; display: block; opacity: 0.8;"></i>
                    <div style="font-size: 1.4rem; font-weight: 800;">${cantidadFacturas}</div>
                    <div style="font-size: 0.7rem; opacity: 0.85;">Facturas</div>
                </div>
                <div style="background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%); padding: 14px 10px; border-radius: 10px; text-align: center; color: white;">
                    <i class="fas fa-dollar-sign" style="font-size: 1.2rem; margin-bottom: 4px; display: block; opacity: 0.8;"></i>
                    <div style="font-size: 1.4rem; font-weight: 800;">$${equipo ? equipo.total.toFixed(2) : '0.00'}</div>
                    <div style="font-size: 0.7rem; opacity: 0.85;">Total</div>
                </div>
                <div style="background: linear-gradient(135deg, #e67e22 0%, #d35400 100%); padding: 14px 10px; border-radius: 10px; text-align: center; color: white;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 1.2rem; margin-bottom: 4px; display: block; opacity: 0.8;"></i>
                    <div style="font-size: 1.4rem; font-weight: 800;">$${totalPendiente.toFixed(2)}</div>
                    <div style="font-size: 0.7rem; opacity: 0.85;">Pendiente</div>
                </div>
            </div>
            
            <div style="margin: 12px 0; text-align: right;">
                <button class="btn btn-info" id="pay-selected-btn" onclick="GrupoManager.showBulkPaymentModal()" style="display: none; background-color: #3498db; border: none; padding: 8px 15px; border-radius: 5px; color: white; font-weight: bold; cursor: pointer; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
                    <i class="fas fa-check-circle"></i> ABONAR SELECCIONADAS
                </button>
            </div>

            <div style="margin-bottom: 10px;">
                <h4 style="color: #2c3e50; font-size: 0.95rem; margin: 0 0 12px 0; padding-bottom: 8px; border-bottom: 2px solid #ecf0f1; display: flex; align-items: center; gap: 8px;">
                    <i class="fas fa-list-alt" style="color: #3498db;"></i> Facturas Pendientes
                </h4>
                ${facturasHTML || '<p style="text-align: center; color: #999; padding: 20px;">No hay facturas pendientes para este equipo</p>'}
            </div>
        `;

        document.getElementById('detalle-modal-content').innerHTML = modalContent;
        document.getElementById('detalle-modal').style.display = 'block';
        AppState.currentDetalle = { tipo: 'equipo', data: key };
    },

    toggleInvoiceSelection(invoiceId) {
        if (AppState.selectedInvoicesForPayment.has(invoiceId)) {
            AppState.selectedInvoicesForPayment.delete(invoiceId);
        } else {
            AppState.selectedInvoicesForPayment.add(invoiceId);
        }

        const btn = document.getElementById('pay-selected-btn');
        if (AppState.selectedInvoicesForPayment.size > 0) {
            btn.style.display = 'inline-block';
            btn.textContent = `ABONAR (${AppState.selectedInvoicesForPayment.size})`;
        } else {
            btn.style.display = 'none';
        }
    },

    showBulkPaymentModal() {
        if (AppState.selectedInvoicesForPayment.size === 0) return;

        const modal = document.getElementById('bulk-abono-modal');
        const info = document.getElementById('bulk-abono-info');

        // Mostrar info y ocultar elementos de grupo
        info.style.display = 'block';
        info.innerHTML = `
            <strong>Facturas Seleccionadas:</strong> ${AppState.selectedInvoicesForPayment.size}<br>
            Ingrese el monto total a abonar. Se distribuirá entre las facturas seleccionadas (más antiguas primero).
        `;

        // Ocultar elementos específicos de grupos
        document.getElementById('bulk-abono-grupo-nombre').textContent = '';
        document.getElementById('bulk-abono-fecha').textContent = '';
        document.getElementById('bulk-abono-equipos-list').innerHTML = '';
        document.getElementById('bulk-abono-left-col').style.display = 'none';

        document.getElementById('monto-bulk-abono').value = '';
        modal.style.display = 'block';

        // Configurar el botón para procesar facturas seleccionadas
        const processBtn = document.getElementById('process-bulk-abono-btn');
        processBtn.onclick = async () => {
            if (processBtn.disabled) return;
            processBtn.disabled = true;

            const monto = parseFloat(document.getElementById('monto-bulk-abono').value);
            if (!monto || monto <= 0) {
                UIService.showStatus("Ingrese un monto válido", "error");
                processBtn.disabled = false;
                return;
            }

            try {
                UIService.showLoading(true);
                const facturasIds = Array.from(AppState.selectedInvoicesForPayment);
                await SalesService.processMultiAbono(facturasIds, monto);

                UIService.showStatus("Abono masivo realizado correctamente", "success");
                modal.style.display = 'none';
                document.getElementById('detalle-modal').style.display = 'none';
                AppState.selectedInvoicesForPayment.clear();

                // Recargar datos de grupos y equipos
                await GrupoManager.loadEquiposPendientes(true);
                await GrupoManager.actualizarTotalesGrupos(true);
                GrupoManager.updateUI();

            } catch (error) {
                UIService.showStatus("Error: " + error.message, "error");
            } finally {
                UIService.showLoading(false);
                processBtn.disabled = false;
            }
        };
    },

    showGroupPaymentModal(grupoId) {
        const grupo = this.grupos.get(grupoId);
        if (!grupo) return;

        const modal = document.getElementById('bulk-abono-modal');
        const info = document.getElementById('bulk-abono-info');

        // Ocultar info de facturas individuales
        info.style.display = 'none';
        info.innerHTML = '';

        // Mostrar elementos específicos de grupos
        document.getElementById('bulk-abono-equipos-list').parentElement.style.display = 'block';

        document.getElementById('monto-bulk-abono').value = '';
        modal.style.display = 'block';

        const processBtn = document.getElementById('process-bulk-abono-btn');
        processBtn.onclick = async () => {
            if (processBtn.disabled) return;
            processBtn.disabled = true;

            const monto = parseFloat(document.getElementById('monto-bulk-abono').value);
            if (!monto || monto <= 0) {
                UIService.showStatus("Ingrese un monto válido", "error");
                processBtn.disabled = false;
                return;
            }

            if (monto > grupo.total) {
                UIService.showStatus("El monto no puede ser mayor al total del grupo", "error");
                processBtn.disabled = false;
                return;
            }

            try {
                UIService.showLoading(true);

                // Recopilar todas las facturas del grupo y ordenarlas por fecha (más antiguas primero)
                const facturas = [];
                for (const equipoKey of grupo.equipos) {
                    // 1. Buscar por clave exacta
                    let equipoEncontrado = this.equiposPendientes.get(equipoKey);

                    if (equipoEncontrado && equipoEncontrado.facturas) {
                        equipoEncontrado.facturas.forEach(f => {
                            facturas.push({
                                id: f.id,
                                timestamp: f.timestamp,
                                saldoPendiente: f.saldoPendiente !== undefined ? f.saldoPendiente : f.total
                            });
                        });
                    }
                }

                if (facturas.length === 0) {
                    throw new Error("El grupo no tiene facturas pendientes");
                }

                // Ordenar por fecha (más antiguas primero)
                facturas.sort((a, b) => {
                    const dateA = a.timestamp ? (a.timestamp.toDate ? a.timestamp.toDate() : new Date(a.timestamp)) : new Date(0);
                    const dateB = b.timestamp ? (b.timestamp.toDate ? b.timestamp.toDate() : new Date(b.timestamp)) : new Date(0);
                    return dateA - dateB;
                });

                // Distribuir el abono entre las facturas
                let montoRestante = monto;
                const abonoData = {
                    fechaString: (new Date()).toLocaleString('es-ES')
                };

                for (const factura of facturas) {
                    if (montoRestante <= 0) break;

                    const montoAbonar = Math.min(montoRestante, factura.saldoPendiente);

                    if (montoAbonar > 0) {
                        await DataService.addAbono(factura.id, {
                            ...abonoData,
                            monto: montoAbonar
                        });
                        montoRestante -= montoAbonar;
                    }
                }

                UIService.showStatus(`Abono de $${monto.toFixed(2)} aplicado al grupo correctamente`, "success");
                modal.style.display = 'none';

                // Recargar datos del grupo
                await this.loadEquiposPendientes(true);
                await this.actualizarTotalesGrupos(true);
                this.updateUI();

                // Recargar historial si existe
                if (typeof SalesService !== 'undefined' && SalesService.loadHistorial) {
                    await SalesService.loadHistorial();
                }

            } catch (error) {
                UIService.showStatus("Error: " + error.message, "error");
            } finally {
                UIService.showLoading(false);
                processBtn.disabled = false;
            }
        };
    },

    showGroupPaymentModalSelector() {
        const gruposActivos = Array.from(this.grupos.values()).filter(g => g.activo && g.total > 0);

        if (gruposActivos.length === 0) {
            UIService.showStatus("No hay grupos con saldo pendiente", "info");
            return;
        }

        // Si solo hay un grupo, abrir directamente
        if (gruposActivos.length === 1) {
            this.showGroupPaymentModal(gruposActivos[0].id);
            return;
        }

        // Mostrar selector de grupos
        let gruposHTML = '';
        gruposActivos.forEach(grupo => {
            gruposHTML += `
                <div style="padding: 12px; border: 1px solid #ddd; border-radius: 6px; margin-bottom: 8px; cursor: pointer; transition: all 0.2s;"
                     onclick="GrupoManager.showGroupPaymentModal('${grupo.id}'); document.getElementById('grupo-selector-modal').style.display='none';"
                     onmouseover="this.style.background='#e8f4fd'; this.style.borderColor='#3498db';"
                     onmouseout="this.style.background='white'; this.style.borderColor='#ddd';">
                    <div style="font-weight: bold; color: #2c3e50;">${grupo.nombre}</div>
                    <div style="font-size: 0.85rem; color: #666;">Equipos: ${grupo.equipos.length} | Saldo: $${grupo.total.toFixed(2)}</div>
                </div>
            `;
        });

        // Crear modal temporal si no existe
        let modal = document.getElementById('grupo-selector-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'grupo-selector-modal';
            modal.className = 'modal-overlay';
            modal.innerHTML = `
                <div class="modal-content" style="max-width: 400px;">
                    <h3 style="margin-bottom: 15px; text-align: center;">Seleccionar Grupo</h3>
                    <div id="grupo-selector-list" style="max-height: 300px; overflow-y: auto;"></div>
                    <button class="btn btn-secondary" style="width: 100%; margin-top: 15px;" 
                            onclick="document.getElementById('grupo-selector-modal').style.display='none';">
                        CANCELAR
                    </button>
                </div>
            `;
            document.body.appendChild(modal);
        }

        document.getElementById('grupo-selector-list').innerHTML = gruposHTML;
        modal.style.display = 'block';
    },

    async mostrarDetalleGrupoCompleto(grupoId) {
        const grupo = this.grupos.get(grupoId);
        if (!grupo) return;

        this.currentGrupoDetalle = grupo;

        let equiposHTML = '';
        let totalGeneral = 0;
        let totalPendiente = 0;
        let cantidadFacturas = 0;
        let cantidadEquiposConDeuda = 0;
        let tieneAbonos = false;

        for (const equipoKey of grupo.equipos) {
            // 1. Buscar por clave exacta
            let equipoEncontrado = this.equiposPendientes.get(equipoKey);

            // 2. Fallback para grupos antiguos: buscar por número
            const equiposCoincidentes = [];
            if (equipoEncontrado && equipoEncontrado.total > 0) {
                equiposCoincidentes.push(equipoEncontrado);
            }

            for (const equipo of equiposCoincidentes) {
                totalGeneral += equipo.total;
                cantidadFacturas += equipo.facturas.length;
                cantidadEquiposConDeuda++;

                let facturasHTML = '';
                equipo.facturas.forEach((factura, idx) => {
                    const saldoPendiente = factura.saldoPendiente !== undefined ? factura.saldoPendiente : factura.total;
                    totalPendiente += saldoPendiente;

                    if (factura.abonos && factura.abonos.length > 0) {
                        tieneAbonos = true;
                    }

                    let productosHTML = '';
                    if (factura.products && factura.products.length > 0) {
                        let filasProductos = '';
                        factura.products.forEach((producto, pIdx) => {
                            filasProductos += `
                                <tr style="background: ${pIdx % 2 === 0 ? '#fafbfc' : 'white'};">
                                    <td style="padding: 5px 8px; text-align: center; font-weight: 600; color: #2c3e50; border-bottom: 1px solid #f0f0f0;">${producto.cantidad}</td>
                                    <td style="padding: 5px 8px; color: #555; border-bottom: 1px solid #f0f0f0;">
                                        <i class="fas fa-wrench" style="color: #bdc3c7; font-size: 0.65rem; margin-right: 4px;"></i>${producto.descripcion}
                                    </td>
                                    <td style="padding: 5px 8px; text-align: right; color: #7f8c8d; border-bottom: 1px solid #f0f0f0;">$${producto.precio.toFixed(2)}</td>
                                    <td style="padding: 5px 8px; text-align: right; font-weight: 600; color: #2c3e50; border-bottom: 1px solid #f0f0f0;">$${(producto.precio * producto.cantidad).toFixed(2)}</td>
                                </tr>
                            `;
                        });
                        productosHTML = `
                            <table style="width: 100%; border-collapse: collapse; font-size: 0.8rem;">
                                <thead>
                                    <tr style="background: linear-gradient(135deg, #2c3e50, #34495e);">
                                        <th style="padding: 6px 8px; text-align: center; color: white; font-size: 0.72rem; font-weight: 600; width: 45px;">CANT.</th>
                                        <th style="padding: 6px 8px; text-align: left; color: white; font-size: 0.72rem; font-weight: 600;">DESCRIPCIÓN</th>
                                        <th style="padding: 6px 8px; text-align: right; color: white; font-size: 0.72rem; font-weight: 600; width: 70px;">P. UNIT.</th>
                                        <th style="padding: 6px 8px; text-align: right; color: white; font-size: 0.72rem; font-weight: 600; width: 70px;">TOTAL</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${filasProductos}
                                </tbody>
                            </table>
                        `;
                    }

                    // Calcular abonos info
                    let abonosHTML = '';
                    if (factura.abonos && factura.abonos.length > 0) {
                        const totalAbonado = factura.abonos.reduce((sum, a) => sum + a.monto, 0);
                        abonosHTML = `
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px; padding: 6px 10px; background: #e8f8f5; border-radius: 4px; font-size: 0.8rem;">
                                <span style="color: #27ae60;"><i class="fas fa-coins" style="margin-right: 4px;"></i> Abonado: $${totalAbonado.toFixed(2)}</span>
                                <span style="font-weight: 700; color: #e74c3c;">Pendiente: $${saldoPendiente.toFixed(2)}</span>
                            </div>
                        `;
                    }

                    const fechaFactura = factura.timestamp ?
                        new Date(factura.timestamp.toDate ? factura.timestamp.toDate() : factura.timestamp).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
                        : 'N/A';

                    // Análisis de contenido para resaltar cambios de aceite
                    let tieneCaja = false;
                    let tieneAceite = false;

                    if (factura.products && factura.products.length > 0) {
                        const matchStr = factura.products.map(p => p.descripcion).join(' ').toLowerCase();
                        if (matchStr.includes('caja') || matchStr.includes('transmision')) tieneCaja = true;
                        const frasesAceite = ['cambio de aceite', 'cambio de aceite de caja', 'cambio de aceite de motor y caja'];
                        if (frasesAceite.some(frase => matchStr.includes(frase))) tieneAceite = true;
                    }

                    let borderStyle = '1px solid #e8e8e8';
                    let bgFactura = 'white';
                    let iconoServicio = '';

                    if (tieneCaja) {
                        borderStyle = '3px solid #e74c3c';
                        bgFactura = '#fff5f5';
                        iconoServicio = '<span style="background: #e74c3c; color: white; font-size: 0.65rem; padding: 2px 6px; border-radius: 10px; font-weight: 600; margin-left: 8px;">🔧 CAJA</span>';
                    } else if (tieneAceite) {
                        borderStyle = '3px solid #27ae60';
                        bgFactura = '#f0fff4';
                        iconoServicio = '<span style="background: #27ae60; color: white; font-size: 0.65rem; padding: 2px 6px; border-radius: 10px; font-weight: 600; margin-left: 8px;">🛢️ ACEITE</span>';
                    }

                    facturasHTML += `
                        <div style="background: ${bgFactura}; border-radius: 8px; margin: 8px 0; overflow: hidden; border: ${borderStyle}; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
                            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); border-bottom: 1px solid #e0e0e0;">
                                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                                    <i class="fas fa-file-invoice" style="color: #3498db; font-size: 0.9rem;"></i>
                                    <span style="font-weight: 700; color: #2c3e50; font-size: 0.9rem;">${factura.invoiceNumber}</span>
                                    ${iconoServicio}
                                </div>
                                <div style="display: flex; align-items: center; gap: 12px;">
                                    <span style="color: #7f8c8d; font-size: 0.78rem;"><i class="fas fa-calendar-alt" style="margin-right: 3px;"></i>${fechaFactura}</span>
                                    <span style="font-weight: 700; color: #2c3e50; font-size: 0.95rem;">$${factura.total.toFixed(2)}</span>
                                </div>
                            </div>
                            <div style="padding: 0;">
                                ${productosHTML}
                            </div>
                            ${abonosHTML}
                        </div>
                    `;
                });

                const nombreEquipo = equipo.cliente && equipo.cliente !== `Equipo ${equipo.numero}`
                    ? `${equipo.numero} - ${equipo.cliente}`
                    : `Equipo ${equipo.numero}`;

                equiposHTML += `
                    <div style="margin-bottom: 16px; border-radius: 10px; overflow: hidden; border: 1px solid #d5e8f5; box-shadow: 0 2px 6px rgba(52,152,219,0.08);">
                        <div style="background: linear-gradient(135deg, #2c3e50 0%, #34495e 100%); padding: 12px 16px; display: flex; justify-content: space-between; align-items: center;">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <div style="background: rgba(255,255,255,0.2); width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                                    <i class="fas fa-motorcycle" style="color: white; font-size: 1rem;"></i>
                                </div>
                                <div>
                                    <div style="font-weight: 700; color: white; font-size: 1rem;">${nombreEquipo}</div>
                                    <div style="color: rgba(255,255,255,0.7); font-size: 0.75rem;">${equipo.facturas.length} factura${equipo.facturas.length > 1 ? 's' : ''}</div>
                                </div>
                            </div>
                            <div style="text-align: right;">
                                <div style="font-weight: 800; color: #e74c3c; font-size: 1.15rem; background: rgba(255,255,255,0.95); padding: 4px 12px; border-radius: 20px;">$${equipo.total.toFixed(2)}</div>
                            </div>
                        </div>
                        <div style="padding: 10px 12px; background: #fafbfc;">
                            ${facturasHTML}
                        </div>
                    </div>
                `;
            }
        }

        const fechaHoy = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });

        const modalContent = `
            <div style="text-align: center; padding: 16px 0 12px 0; border-bottom: 3px solid #3498db; margin-bottom: 16px;">
                <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 2px; color: #95a5a6; margin-bottom: 4px;">Detalles del Grupo</div>
                <h2 style="margin: 0; color: #2c3e50; font-size: 1.5rem; font-weight: 800;">${grupo.nombre}</h2>
                <div style="color: #7f8c8d; font-size: 0.8rem; margin-top: 4px;"><i class="fas fa-calendar"></i> ${fechaHoy}</div>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; margin-bottom: 18px;">
                <div style="background: linear-gradient(135deg, #3498db 0%, #2980b9 100%); padding: 14px 10px; border-radius: 10px; text-align: center; color: white;">
                    <i class="fas fa-users" style="font-size: 1.2rem; margin-bottom: 4px; display: block; opacity: 0.8;"></i>
                    <div style="font-size: 1.4rem; font-weight: 800;">${cantidadEquiposConDeuda}</div>
                    <div style="font-size: 0.7rem; opacity: 0.85;">Equipos</div>
                </div>
                <div style="background: linear-gradient(135deg, #9b59b6 0%, #8e44ad 100%); padding: 14px 10px; border-radius: 10px; text-align: center; color: white;">
                    <i class="fas fa-file-invoice" style="font-size: 1.2rem; margin-bottom: 4px; display: block; opacity: 0.8;"></i>
                    <div style="font-size: 1.4rem; font-weight: 800;">${cantidadFacturas}</div>
                    <div style="font-size: 0.7rem; opacity: 0.85;">Facturas</div>
                </div>
                <div style="background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%); padding: 14px 10px; border-radius: 10px; text-align: center; color: white;">
                    <i class="fas fa-dollar-sign" style="font-size: 1.2rem; margin-bottom: 4px; display: block; opacity: 0.8;"></i>
                    <div style="font-size: 1.4rem; font-weight: 800;">$${totalGeneral.toFixed(2)}</div>
                    <div style="font-size: 0.7rem; opacity: 0.85;">${tieneAbonos ? 'Total Original' : 'Total'}</div>
                </div>
                ${tieneAbonos ? `
                <div style="background: linear-gradient(135deg, #e67e22 0%, #d35400 100%); padding: 14px 10px; border-radius: 10px; text-align: center; color: white;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 1.2rem; margin-bottom: 4px; display: block; opacity: 0.8;"></i>
                    <div style="font-size: 1.4rem; font-weight: 800;">$${totalPendiente.toFixed(2)}</div>
                    <div style="font-size: 0.7rem; opacity: 0.85;">Pendiente</div>
                </div>
                ` : ''}
            </div>

            <div style="margin-bottom: 10px;">
                <h4 style="color: #2c3e50; font-size: 0.95rem; margin: 0 0 12px 0; padding-bottom: 8px; border-bottom: 2px solid #ecf0f1; display: flex; align-items: center; gap: 8px;">
                    <i class="fas fa-list-alt" style="color: #3498db;"></i> Desglose por Equipo
                </h4>
                ${equiposHTML || '<p style="text-align: center; color: #999; padding: 20px;">No hay equipos con facturas pendientes en este grupo</p>'}
            </div>
        `;

        document.getElementById('grupo-detalle-modal-content').innerHTML = modalContent;
        document.getElementById('grupo-detalle-modal').style.display = 'block';
    },

    async imprimirGrupoCompleto() {
        const grupo = this.currentGrupoDetalle;
        if (!grupo) return;

        for (const equipoKey of grupo.equipos) {
            // 1. Buscar por clave exacta
            let equipoEncontrado = this.equiposPendientes.get(equipoKey);

            // Fallback eliminado: exigimos coincidencia exacta.

            if (equipoEncontrado && equipoEncontrado.total > 0) {
                equipoEncontrado.facturas.forEach(factura => {
                    this.imprimirTicketFactura(factura, equipoEncontrado);
                });
            }
        }
    },

    imprimirTicketFactura(factura, equipo) {
        const printWindow = window.open('', '_blank');
        const fecha = factura.timestamp ? new Date(factura.timestamp.toDate ? factura.timestamp.toDate() : factura.timestamp) : new Date();
        const fechaFormateada = fecha.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' });

        const saldoPendiente = factura.saldoPendiente !== undefined ? factura.saldoPendiente : factura.total;
        const tieneAbonos = factura.abonos && factura.abonos.length > 0;
        const tipoPago = tieneAbonos && saldoPendiente > 0 ? 'PENDIENTE' : 'CONTADO';

        let abonosHTML = '';
        if (tieneAbonos) {
            factura.abonos.forEach(abono => {
                const fechaAbono = abono.fecha ? new Date(abono.fecha.toDate ? abono.fecha.toDate() : abono.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }) : 'N/A';
                abonosHTML += `
                    <div style="display: flex; justify-content: space-between; font-size: 20px; margin: 2px 0;">
                        <div>ABONO: $${abono.monto.toFixed(2)} (${fechaAbono})</div>
                    </div>
                `;
            });
        }

        let productosHTML = '';
        if (factura.products && factura.products.length > 0) {
            factura.products.forEach(producto => {
                const descripcion = producto.descripcion.length > 25 ? producto.descripcion.substring(0, 25) + '...' : producto.descripcion;
                productosHTML += `
                    <div style="margin: 4px 0;">
                        <div style="font-size: 16px;">• ${descripcion}</div>
                        <div style="display: flex; justify-content: space-between; font-size: 18px;">
                            <div>x${producto.cantidad}</div>
                            <div>$${(producto.precio * producto.cantidad).toFixed(2)}</div>
                        </div>
                    </div>
                    <div style="border-bottom: 1px dotted #000; margin: 2px 0;"></div>
                `;
            });
        }

        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Ticket #${factura.invoiceNumber}</title>
                <style>
                    body { 
                        font-family: 'Courier New', monospace; 
                        font-size: 22px; 
                        margin: 0; 
                        padding: 6px;
                        width: 58mm;
                        font-weight: bold;
                    }
                    .header { text-align: center; margin-bottom: 12px; }
                    .line { border-bottom: 2px dashed #000; margin: 4px 0; }
                    .total { font-weight: bold; text-align: center; margin-top: 12px; font-size: 24px; }
                    .footer { text-align: center; margin-top: 12px; font-size: 18px; font-weight: bold; }
                    .small-text { font-size: 18px; }
                    .medium-text { font-size: 20px; }
                    .large-text { font-size: 26px; }
                    .equipo-text { font-size: 32px; font-weight: 900; margin: 5px 0; }
                    .thank-you { text-align: center; margin-top: 15px; font-weight: bold; font-size: 20px; }
                    .saldo-info {
                        background: #f0f0f0;
                        padding: 8px;
                        margin: 8px 0;
                        border-radius: 4px;
                        font-size: 18px;
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h3 style="margin: 2px 0; font-size: 26px;">TALLER WILLIAN</h3>
                    <div class="small-text">Factura: ${factura.invoiceNumber}</div>
                    <div class="small-text">${fechaFormateada}, ${tipoPago}</div>
                </div>
                
                <div class="line"></div>
                
                ${equipo.cliente && equipo.cliente.toLowerCase() !== 'cliente general' && equipo.cliente !== `Equipo ${equipo.numero}` && equipo.cliente !== equipo.numero ? `
                    <div class="medium-text">
                        <strong>Cliente:</strong> ${equipo.cliente}
                    </div>
                ` : ''}
                <div class="equipo-text" style="text-align: center;">
                    ${equipo.numero}
                </div>
                
                <div class="line"></div>
                
                <div style="margin: 8px 0;">
                    ${productosHTML}
                </div>
                
                <div class="line"></div>
                
                <div class="total large-text">
                    TOTAL: $${factura.total.toFixed(2)}
                </div>

                ${abonosHTML}

                ${tieneAbonos && saldoPendiente > 0 ? `
                    <div class="saldo-info">
                        <div>SALDO PENDIENTE:</div>
                        <div class="large-text">$${saldoPendiente.toFixed(2)}</div>
                    </div>
                ` : ''}
                
                <div class="thank-you">
                    GRACIAS POR PREFERIRNOS
                </div>
            </body>
            </html>
        `);

        printWindow.document.close();
        printWindow.focus();

        setTimeout(() => {
            printWindow.print();
            setTimeout(() => {
                printWindow.close();
            }, 500);
        }, 500);
    },

    async actualizarDesdeVenta(ventaData) {
        if (ventaData.paymentType === 'pendiente' && ventaData.status === 'pendiente') {
            const equipo = ventaData.equipoNumber;
            if (equipo) {
                await this.loadEquiposPendientes();
                await this.actualizarTotalesGrupos();
                this.updateUI();
            }
        }
    },

    async capturarImagenGrupo(grupoId) {
        const grupo = this.grupos.get(grupoId);
        if (!grupo) {
            UIService.showStatus('Grupo no encontrado', 'error');
            return;
        }

        // Verificar que html2canvas esté disponible
        if (typeof html2canvas === 'undefined') {
            UIService.showStatus('Error: Recarga la página para cargar la librería de captura', 'error');
            console.error('html2canvas no está cargado');
            return;
        }

        try {
            UIService.showLoading(true);

            // Crear un contenedor temporal para la captura
            const captureDiv = document.createElement('div');
            captureDiv.style.cssText = `
                position: fixed;
                left: -9999px;
                top: 0;
                background: white;
                padding: 20px;
                width: 400px;
                font-family: Arial, sans-serif;
                border: 2px solid #2c3e50;
                border-radius: 10px;
            `;

            // Recopilar equipos del grupo
            let equiposHTML = '';
            let totalGrupo = 0;
            let filaIndex = 0;

            for (const equipoKey of grupo.equipos) {
                // 1. Buscar por clave exacta
                let equipoEncontrado = this.equiposPendientes.get(equipoKey);

                // Fallback eliminado: exigimos coincidencia exacta.

                if (equipoEncontrado && equipoEncontrado.total > 0) {
                    totalGrupo += equipoEncontrado.total;
                    const bgColor = filaIndex % 2 === 0 ? 'white' : '#f9f9f9';
                    filaIndex++;
                    const nombreEquipo = equipoEncontrado.cliente && equipoEncontrado.cliente !== `Equipo ${equipoEncontrado.numero}`
                        ? `Equipo ${equipoEncontrado.numero} - ${equipoEncontrado.cliente}`
                        : `Equipo ${equipoEncontrado.numero}`;
                    equiposHTML += `
                        <div style="display: flex; justify-content: space-between; padding: 10px; border-bottom: 1px solid #ddd; background: ${bgColor};">
                            <div style="font-weight: bold; color: #2c3e50; font-size: 16px;">${nombreEquipo}</div>
                            <div style="font-weight: bold; color: #e74c3c; font-size: 16px;">$${equipoEncontrado.total.toFixed(2)}</div>
                        </div>
                    `;
                }
            }

            captureDiv.innerHTML = `
                <div style="text-align: center; margin-bottom: 15px; padding-bottom: 15px; border-bottom: 3px solid #3498db;">
                    <h2 style="margin: 0; color: #2c3e50; font-size: 24px;">TALLER WILLIAN</h2>
                    <h3 style="margin: 5px 0 0 0; color: #3498db; font-size: 20px;">${grupo.nombre}</h3>
                </div>
                <div style="margin-bottom: 15px;">
                    ${equiposHTML}
                </div>
                <div style="background: #2c3e50; color: white; padding: 15px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 14px; margin-bottom: 5px;">TOTAL DEL GRUPO</div>
                    <div style="font-size: 28px; font-weight: bold;">$${totalGrupo.toFixed(2)}</div>
                </div>
                <div style="text-align: center; margin-top: 15px; color: #7f8c8d; font-size: 12px;">
                    ${new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                </div>
            `;

            document.body.appendChild(captureDiv);

            // Capturar con html2canvas
            const canvas = await html2canvas(captureDiv, {
                backgroundColor: '#ffffff',
                scale: 2,
                logging: false
            });

            // Remover el div temporal
            document.body.removeChild(captureDiv);

            // Convertir a blob y descargar
            canvas.toBlob((blob) => {
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.download = `${grupo.nombre.replace(/\s+/g, '_')}_${new Date().getTime()}.png`;
                link.href = url;
                link.click();
                URL.revokeObjectURL(url);

                UIService.showStatus('Imagen capturada y descargada correctamente', 'success');
            });

        } catch (error) {
            console.error('Error al capturar imagen:', error);
            UIService.showStatus('Error al capturar imagen: ' + error.message, 'error');
        } finally {
            UIService.showLoading(false);
        }
    },


    generarGridEquipos(modalType = 'crear') {
        const grid = document.getElementById(modalType === 'crear' ? 'all-equipos-grid' : 'editar-all-equipos-grid');
        const equiposEnGrupos = this.getEquiposEnGrupos();
        const selectedSet = modalType === 'crear' ? AppState.equiposSeleccionados : AppState.equiposEditSeleccionados;

        let html = '';

        // ITERAR DEL 1 AL 130 PARA MOSTRAR TODOS LOS LUGARES DISPONIBLES
        for (let i = 1; i <= 130; i++) {
            const numeroStr = i.toString();

            // 1. Buscar si hay variantes con deuda para este número (ej: "1-Cedros", "1-Otro")
            const variantes = [];
            let existeGenericoConDeuda = false;

            this.equiposPendientes.forEach((equipo, key) => {
                // Verificar coincidencia de número (flexible para strings/numbers)
                if (equipo.numero == i) {
                    // Determinar si es el genérico basado en si NO tiene cliente específico
                    // o si el cliente se llama "Equipo X"
                    const esGenerico = !equipo.cliente ||
                        equipo.cliente.trim() === '' ||
                        equipo.cliente === `Equipo ${i}`;

                    variantes.push({
                        key: key,
                        nombre: equipo.cliente || `Equipo ${i}`,
                        total: equipo.total,
                        esGenerico: esGenerico
                    });

                    // Si encontramos una variante que actúa como genérico (sin nombre especial), marcamos que ya existe
                    if (esGenerico) existeGenericoConDeuda = true;
                }
            });

            // 2. Si NO existe el genérico con deuda, agregarlo como opción vacía ($0)
            if (!existeGenericoConDeuda) {
                variantes.unshift({
                    key: numeroStr, // Clave simple para el genérico
                    nombre: `Equipo ${i}`, // Nombre por defecto
                    total: 0,
                    esGenerico: true
                });
            }

            // 3. Renderizar todas las opciones encontradas para este número
            variantes.forEach(variant => {
                const estaSeleccionado = selectedSet.has(variant.key);
                // Está en otro grupo si la clave exacta está en el set de agrupados
                const estaEnOtroGrupo = equiposEnGrupos.has(variant.key) &&
                    (modalType === 'crear' ||
                        (modalType === 'editar' && this.currentEditingGroup &&
                            !this.currentEditingGroup.equipos.includes(variant.key)));

                let estilo = '';
                let estiloInline = '';
                let infoExtra = '';

                if (estaEnOtroGrupo) {
                    estilo = 'equipo-en-grupo';
                    estiloInline = 'border-color: #e74c3c; background: #f8d7da; color: #721c24; cursor: not-allowed;';
                    infoExtra = '<br><small style="color: #e74c3c; font-size: 0.6rem;">EN GRUPO</small>';
                } else if (variant.total > 0) {
                    estilo = 'has-facturas';
                    estiloInline = 'border-color: #27ae60; background: #f0fff0;';
                }

                // Mostrar nombre si es una variante específica (ej: Cedros)
                const labelNombre = (!variant.esGenerico || variant.nombre !== `Equipo ${i}`) ?
                    `<br><small style="color: #2980b9; font-weight: bold; font-size: 0.7rem;">${variant.nombre}</small>` : '';

                // CORRECCIÓN VISUAL: Asegurar que el número tenga color oscuro siempre, excepto si está seleccionado que podría cambiar por CSS
                html += `
                    <div class="all-equipo-item ${estilo} ${estaSeleccionado ? 'selected' : ''}" 
                         data-id="${variant.key}"
                         onclick="${estaEnOtroGrupo ? '' : `GrupoManager.toggleEquipoSelection('${variant.key}', '${modalType}')`}"
                         style="${estiloInline} position: relative;">
                         <!-- Número grande y visible -->
                        <span style="font-size: 1.2em; font-weight: 900; color: ${estaSeleccionado ? 'white' : '#2c3e50'}; display: block; margin-bottom: 2px;">${i}</span>
                        ${labelNombre}
                        <br><small style="color: ${estaSeleccionado ? '#eee' : (variant.total > 0 ? '#27ae60' : '#95a5a6')}; font-weight: bold;">$${variant.total.toFixed(2)}</small>
                        ${infoExtra}
                    </div>
                `;
            });
        }

        grid.innerHTML = html;
    },

    actualizarListaSeleccionados(modalType = 'crear') {
        const selectedList = document.getElementById(modalType === 'crear' ? 'selected-equipos-list' : 'editar-selected-equipos-list');
        const contador = document.getElementById(modalType === 'crear' ? 'contador-equipos' : 'editar-contador-equipos');
        const selectedSet = modalType === 'crear' ? AppState.equiposSeleccionados : AppState.equiposEditSeleccionados;

        contador.textContent = selectedSet.size;

        if (selectedSet.size === 0) {
            selectedList.innerHTML = '<div style="color: #999; text-align: center; font-size: 0.8rem;">No hay equipos seleccionados</div>';
        } else {
            let badgesHTML = '';
            // Ordenar visualmente
            const equiposOrdenados = Array.from(selectedSet).sort((a, b) => {
                // Intentar extraer el número inicial para ordenar
                const numA = parseInt(a) || 0;
                const numB = parseInt(b) || 0;
                return numA - numB;
            });

            equiposOrdenados.forEach(key => {
                const equipo = this.equiposPendientes.get(key);
                const nombre = equipo ? (equipo.cliente || key) : `Equipo ${key}`;
                const total = equipo ? equipo.total : 0;

                // CORRECCIÓN: Siempre mostrar el número de equipo en la etiqueta
                const numeroKey = parseInt(key) || '?';
                let label = '';

                if (nombre === `Equipo ${numeroKey}`) {
                    label = `${numeroKey}`;
                } else if (nombre.startsWith(`${numeroKey} - `) || nombre.startsWith(`${numeroKey}-`)) {
                    label = nombre;
                } else if (!isNaN(nombre)) {
                    label = nombre;
                } else {
                    label = `${numeroKey} - ${nombre}`;
                }

                badgesHTML += `<span class="selected-equipo-badge" style="cursor: pointer; display: inline-flex; align-items: center; gap: 4px;" onclick="GrupoManager.toggleEquipoSelection('${key}', '${modalType}')" title="Clic para remover">${label} ($${total.toFixed(2)}) <i class="fas fa-times" style="font-size: 0.8em; opacity: 0.8;"></i></span>`;
            });
            selectedList.innerHTML = badgesHTML;
        }
    },

    async editarGrupo(grupoId) {
        const grupo = this.grupos.get(grupoId);
        if (!grupo) {
            UIService.showStatus("No se encontró el grupo para editar", "error");
            return;
        }

        this.currentEditingGroup = grupo;

        AppState.equiposEditSeleccionados = new Set(grupo.equipos);

        document.getElementById('editar-nombre-grupo').value = grupo.nombre;
        this.generarGridEquipos('editar');
        this.actualizarListaSeleccionados('editar');

        document.getElementById('editar-grupo-modal').style.display = 'block';
    },

    async actualizarGrupoDesdeModal() {
        const grupo = this.currentEditingGroup;
        if (!grupo) {
            UIService.showStatus("No hay grupo seleccionado para editar", "error");
            return;
        }

        const nombre = document.getElementById('editar-nombre-grupo').value.trim();
        if (!nombre) {
            UIService.showStatus("Ingrese un nombre para el grupo", "error");
            return;
        }

        if (AppState.equiposEditSeleccionados.size === 0) {
            UIService.showStatus("Seleccione al menos un equipo", "error");
            return;
        }

        try {
            const equiposArray = Array.from(AppState.equiposEditSeleccionados);
            await this.actualizarGrupo(grupo.id, nombre, equiposArray);
            UIService.showStatus(`Grupo "${nombre}" actualizado correctamente`, "success");
            document.getElementById('editar-grupo-modal').style.display = 'none';
            this.currentEditingGroup = null;
            AppState.equiposEditSeleccionados.clear();
        } catch (error) {
            UIService.showStatus("Error al actualizar grupo: " + error.message, "error");
        }
    },

    toggleEquipoSelection(equipoKey, modalType = 'crear') {
        const selectedSet = modalType === 'crear' ? AppState.equiposSeleccionados : AppState.equiposEditSeleccionados;

        if (selectedSet.has(equipoKey)) {
            selectedSet.delete(equipoKey);
        } else {
            if (selectedSet.size >= 130) {
                UIService.showStatus("Máximo 130 equipos permitidos", "error");
                return;
            }
            selectedSet.add(equipoKey);
        }

        this.actualizarListaSeleccionados(modalType);

        // Actualizar visualmente el item específico usando data-id
        const selector = modalType === 'crear' ? '.all-equipo-item' : '#editar-all-equipos-grid .all-equipo-item';
        document.querySelectorAll(selector).forEach(item => {
            if (item.dataset.id === equipoKey) {
                const spanNum = item.querySelector('span');
                const smalls = item.querySelectorAll('small');
                const lastSmall = smalls.length > 0 ? smalls[smalls.length - 1] : null;

                if (selectedSet.has(equipoKey)) {
                    item.classList.add('selected');
                    item.style.setProperty('background', '#3498db', 'important');
                    item.style.setProperty('border-color', '#2980b9', 'important');
                    if (spanNum) spanNum.style.setProperty('color', 'white', 'important');
                    if (lastSmall) lastSmall.style.setProperty('color', '#eee', 'important');
                } else {
                    item.classList.remove('selected');
                    item.style.removeProperty('background');
                    item.style.removeProperty('border-color');
                    if (spanNum) spanNum.style.removeProperty('color');
                    if (lastSmall) lastSmall.style.removeProperty('color');
                }
            }
        });
    },

    solicitarEliminarGrupo(grupoId) {
        if (!confirm("¿Está seguro de eliminar este grupo? Los equipos volverán a estar disponibles individualmente y se eliminarán las asociaciones de grupo.")) {
            return;
        }

        try {
            UIService.showLoading(true);
            this.eliminarGrupo(grupoId);
            UIService.showStatus("Grupo eliminado correctamente", "success");
            this.updateUI();
        } catch (error) {
            UIService.showStatus("Error al eliminar grupo: " + error.message, "error");
        } finally {
            UIService.showLoading(false);
        }
    },

    async actualizarDesdeVenta(venta) {
        // Forzar recarga de equipos y totales cuando una venta cambia
        console.log("Actualizando GrupoManager desde venta:", venta.invoiceNumber);
        await this.loadEquiposPendientes(true);
        this.updateUI();
    }
};
