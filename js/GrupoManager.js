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

    // NUEVO: Función auxiliar para buscar equipo con su lógica de fallback
    getEquipoData(equipoKey) {
        // 1. Buscar por clave exacta
        let equipo = this.equiposPendientes.get(equipoKey);
        
        // 2. Búsqueda inteligente (NO DESTRUCTIVA) enfocada SOLO en variaciones vacías vs "Equipo X"
        // Si el grupo pide "95", pero la factura se guardó como "95-Equipo 95"
        if (!equipo && !equipoKey.includes('-')) {
            equipo = this.equiposPendientes.get(`${equipoKey}-Equipo ${equipoKey}`);
        }
        
        // 3. Inverso: Si el grupo pide "95-Equipo 95" pero la factura vieja se guardó como "95"
        if (!equipo && equipoKey.includes('-Equipo ')) {
            const numeroSolo = equipoKey.split('-')[0];
            equipo = this.equiposPendientes.get(numeroSolo);
        }

        return equipo;
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
                let processedEquipos = new Set(); // Evitar doble suma

                for (const equipoKey of grupo.equipos) {
                    // 1. Buscar por clave exacta o fallback
                    let equipoEncontrado = this.getEquipoData(equipoKey);

                    if (equipoEncontrado && equipoEncontrado.total > 0) {
                        if (!processedEquipos.has(equipoEncontrado)) {
                            processedEquipos.add(equipoEncontrado);
                            nuevoTotal += equipoEncontrado.total;
                        }
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
                const equipo = venta.equipoNumber !== undefined && venta.equipoNumber !== null ? String(venta.equipoNumber).trim() : '';
                let cliente = venta.clientName || '';
                
                let saldoPendiente = venta.total || 0;
                if (venta.abonos && venta.abonos.length > 0) {
                    const totalAbonado = venta.abonos.reduce((sum, abono) => sum + abono.monto, 0);
                    saldoPendiente = venta.total - totalAbonado;
                }

                if (equipo !== '' && saldoPendiente > 0) {
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

    getGrupoDeEquipo(key, numeroCorto) {
        let result = null;
        this.grupos.forEach(grupo => {
            if (grupo.equipos.includes(key)) {
                result = { id: grupo.id, nombre: grupo.nombre };
            } else if (numeroCorto !== undefined && numeroCorto !== null && String(numeroCorto).trim() !== '' && grupo.equipos.includes(String(numeroCorto).trim())) {
                const nStr = String(numeroCorto).trim();
                // Fallback para nombres por defecto / legacy
                if (key === `${nStr}-Equipo ${nStr}` || key === nStr) {
                    result = { id: grupo.id, nombre: grupo.nombre };
                }
            }
        });
        return result;
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

        // Ordenar facturas por fecha (de la más antigua a la más reciente)
        const sortedFacturas = [...equipo.facturas].sort((a, b) => {
            const dateA = a.timestamp ? (a.timestamp.toDate ? a.timestamp.toDate() : new Date(a.timestamp)) : new Date(0);
            const dateB = b.timestamp ? (b.timestamp.toDate ? b.timestamp.toDate() : new Date(b.timestamp)) : new Date(0);
            return dateA - dateB;
        });

        // Si hay facturas marcadas con casilla, imprimir las seleccionadas con formato de ticket normal
        if (AppState.selectedInvoicesForPayment && AppState.selectedInvoicesForPayment.size > 0) {
            const seleccionadas = sortedFacturas.filter(f => AppState.selectedInvoicesForPayment.has(f.id));
            if (seleccionadas.length > 0) {
                if (typeof PrintingService !== 'undefined' && PrintingService.printMultipleTickets) {
                    PrintingService.printMultipleTickets(seleccionadas);
                } else if (typeof PrintingService !== 'undefined' && PrintingService.printTicket) {
                    seleccionadas.forEach(f => PrintingService.printTicket(f));
                }
                return;
            }
        }

        // Transformar datos jerárquicos a movimiento plano de respaldo
        let movimientos = [];

        sortedFacturas.forEach(factura => {
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
            facturas: sortedFacturas,
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

    generarHTMLTarjetaFactura(factura, dentroDeFusion = false, conCheckbox = true) {
        const saldoPendiente = factura.saldoPendiente !== undefined ? factura.saldoPendiente : factura.total;
        const tieneAbonos = factura.abonos && factura.abonos.length > 0;
        const totalAbonado = tieneAbonos ? factura.abonos.reduce((sum, a) => sum + a.monto, 0) : 0;
        const pagada = saldoPendiente <= 0.009;

        // Tabla de productos
        let productosHTML = '';
        if (factura.products && factura.products.length > 0) {
            let filasProductos = '';
            factura.products.forEach((producto, pIdx) => {
                filasProductos += `
                    <tr style="background: ${pIdx % 2 === 0 ? '#fafbfc' : 'white'};">
                        <td ondblclick="GrupoManager.activarEdicionCeldaFactura(this, '${factura.id}', ${pIdx}, 'cantidad')"
                            style="padding: 5px 8px; text-align: center; font-weight: 600; color: #2c3e50; border-bottom: 1px solid #f0f0f0;">${producto.cantidad}</td>
                        <td ondblclick="GrupoManager.activarEdicionCeldaFactura(this, '${factura.id}', ${pIdx}, 'descripcion')"
                            style="padding: 5px 8px; color: #555; border-bottom: 1px solid #f0f0f0;">
                            <i class="fas fa-wrench" style="color: #bdc3c7; font-size: 0.65rem; margin-right: 4px;"></i>${producto.descripcion}
                        </td>
                        <td ondblclick="GrupoManager.activarEdicionCeldaFactura(this, '${factura.id}', ${pIdx}, 'precio')"
                            style="padding: 5px 8px; text-align: right; color: #7f8c8d; border-bottom: 1px solid #f0f0f0;">$${Number(producto.precio || 0).toFixed(2)}</td>
                        <td style="padding: 5px 8px; text-align: right; font-weight: 600; color: #2c3e50; border-bottom: 1px solid #f0f0f0;">$${(Number(producto.precio || 0) * Number(producto.cantidad || 0)).toFixed(2)}</td>
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

        // Detalle de abonos y saldo individual de la factura
        let detalleAbonos = '';
        if (tieneAbonos) {
            detalleAbonos = factura.abonos.map(a => {
                const fechaAbono = a.fecha ? new Date(a.fecha.toDate ? a.fecha.toDate() : a.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }) : 'N/A';
                return `<span style="font-size: 0.75rem; color: #27ae60;">+$${a.monto.toFixed(2)} (${fechaAbono})</span>`;
            }).join(' · ');
        }

        const abonosHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: ${totalAbonado > 0 ? '#e8f8f5' : '#f1f5f9'}; border-top: 1px solid #cbd5e1; font-size: 0.8rem; flex-wrap: wrap; gap: 6px;">
                <div>
                    ${totalAbonado > 0
                        ? `<i class="fas fa-coins" style="color: #27ae60; margin-right: 4px;"></i> <strong>Abonado a esta factura:</strong> $${totalAbonado.toFixed(2)} <span style="margin-left: 4px;">${detalleAbonos}</span>`
                        : `<span style="color: #64748b;"><i class="fas fa-receipt"></i> Sin abonos previos</span>`
                    }
                </div>
                <div>
                    ${pagada
                        ? `<span style="background: #27ae60; color: white; padding: 2px 8px; border-radius: 12px; font-weight: 700; font-size: 0.75rem;"><i class="fas fa-check"></i> CUBIERTA ($0.00)</span>`
                        : `<span style="font-weight: 700; color: #e74c3c;">Saldo de esta factura: $${saldoPendiente.toFixed(2)}</span>`
                    }
                </div>
            </div>
        `;

        // Detección de aceite y marco oscuro definido
        let tieneCaja = false, tieneAceite = false;
        if (factura.products && factura.products.length > 0) {
            const matchStr = factura.products.map(p => p.descripcion).join(' ').toLowerCase();
            if (matchStr.includes('caja') || matchStr.includes('transmision')) tieneCaja = true;
            const frasesAceite = ['cambio de aceite', 'cambio de aceite de caja', 'cambio de aceite de motor y caja'];
            if (frasesAceite.some(frase => matchStr.includes(frase))) tieneAceite = true;
        }

        let borderStyle = '2px solid #34495e';
        let bgFactura = 'white';
        let iconoServicio = '';

        if (tieneCaja) {
            borderStyle = '2px solid #e74c3c';
            bgFactura = '#fff5f5';
            iconoServicio = '<span style="background: #e74c3c; color: white; font-size: 0.65rem; padding: 2px 6px; border-radius: 10px; font-weight: 600; margin-left: 8px;">🔧 CAJA</span>';
        } else if (tieneAceite) {
            borderStyle = '2px solid #27ae60';
            bgFactura = '#f0fff4';
            iconoServicio = '<span style="background: #27ae60; color: white; font-size: 0.65rem; padding: 2px 6px; border-radius: 10px; font-weight: 600; margin-left: 8px;">🛢️ ACEITE</span>';
        }

        const fechaFactura = factura.timestamp ?
            new Date(factura.timestamp.toDate ? factura.timestamp.toDate() : factura.timestamp).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
            : 'N/A';

        let controlIzquierdoHTML = '';
        if (conCheckbox) {
            controlIzquierdoHTML += `
                <input type="checkbox" class="invoice-checkbox" data-id="${factura.id}" data-en-fusion="${dentroDeFusion ? '1' : '0'}"
                       onchange="GrupoManager.toggleInvoiceSelection('${factura.id}')" 
                       style="width: 18px; height: 18px; cursor: pointer;">
            `;
        }
        if (dentroDeFusion) {
            controlIzquierdoHTML += `
                <span style="background: #ede9fe; color: #6d28d9; font-size: 0.7rem; font-weight: 700; padding: 2px 7px; border-radius: 6px;">
                    <i class="fas fa-link"></i> En Fusión
                </span>
            `;
        }

        const botonEditarDatosCardHTML = conCheckbox ? `
            <button type="button" onclick="GrupoManager.abrirModalEditarDatosFactura('${factura.id}')"
                title="Editar Fecha, Equipo o Nombre de Grupo"
                style="background: #fffbeb; color: #b45309; border: 1px solid #f59e0b; padding: 2px 8px; border-radius: 6px; font-size: 0.72rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;">
                <i class="fas fa-edit"></i> EDITAR DATOS
            </button>
        ` : '';

        return `
            <div style="background: ${bgFactura}; border-radius: 8px; margin: 0; display: flex; flex-direction: column; height: 100%; overflow: hidden; border: ${borderStyle}; box-shadow: 0 3px 8px rgba(0,0,0,0.12);">
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); border-bottom: 1px solid #e0e0e0; flex-wrap: wrap; gap: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                        ${controlIzquierdoHTML}
                        <i class="fas fa-file-invoice" style="color: #3498db; font-size: 0.9rem;"></i>
                        <span style="font-weight: 700; color: #2c3e50; font-size: 0.9rem;">#${factura.invoiceNumber}</span>
                        ${iconoServicio}
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                        ${botonEditarDatosCardHTML}
                        <span style="color: #475569; font-size: 0.78rem; font-weight: 600; background: #fff; padding: 2px 8px; border-radius: 6px; border: 1px solid #cbd5e1;">
                            <i class="fas fa-calendar-alt" style="margin-right: 4px; color: #3498db;"></i>${fechaFactura}
                        </span>
                        <span style="font-weight: 700; color: #2c3e50; font-size: 0.95rem;">Total: $${factura.total.toFixed(2)}</span>
                    </div>
                </div>
                <div style="padding: 0; flex: 1;">
                    ${productosHTML}
                </div>
                ${abonosHTML}
            </div>
        `;
    },

    renderizarListaFacturasConFusiones(sortedFacturas, safeKey = '', permitirAcciones = true) {
        if (!sortedFacturas || sortedFacturas.length === 0) return '';

        const gruposFusion = new Map();
        const itemsRender = [];

        sortedFacturas.forEach(factura => {
            if (factura.fusionId) {
                if (!gruposFusion.has(factura.fusionId)) {
                    const grupoObj = { tipo: 'fusion', fusionId: factura.fusionId, facturas: [] };
                    gruposFusion.set(factura.fusionId, grupoObj);
                    itemsRender.push(grupoObj);
                }
                gruposFusion.get(factura.fusionId).facturas.push(factura);
            } else {
                itemsRender.push({ tipo: 'individual', factura: factura });
            }
        });

        const cantidadSueltas = itemsRender.filter(i => i.tipo === 'individual').length;
        const usarDosColumnasExterior = cantidadSueltas >= 2;
        const gridExteriorStyle = usarDosColumnasExterior
            ? 'display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; align-items: stretch;'
            : 'display: grid; grid-template-columns: 1fr; gap: 14px;';

        let facturasHTML = `<div style="${gridExteriorStyle}">`;

        itemsRender.forEach(item => {
            if (item.tipo === 'fusion') {
                const lista = item.facturas;
                const totalOriginalFusion = lista.reduce((s, f) => s + (f.total || 0), 0);
                const totalAbonadoFusion = lista.reduce((s, f) => {
                    const abonado = (f.abonos && f.abonos.length > 0) ? f.abonos.reduce((aSum, a) => aSum + a.monto, 0) : 0;
                    return s + abonado;
                }, 0);
                const saldoPendienteFusion = lista.reduce((s, f) => {
                    const saldo = f.saldoPendiente !== undefined ? f.saldoPendiente : f.total;
                    return s + saldo;
                }, 0);

                const formatFecha = (fac) => fac.timestamp ?
                    new Date(fac.timestamp.toDate ? fac.timestamp.toDate() : fac.timestamp).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
                    : 'N/A';

                const primeraFecha = formatFecha(lista[0]);
                const ultimaFecha = formatFecha(lista[lista.length - 1]);
                const textoRangoFechas = primeraFecha === ultimaFecha
                    ? `<strong>${primeraFecha}</strong>`
                    : `<strong>${primeraFecha}</strong> hasta <strong>${ultimaFecha}</strong>`;

                let tarjetasInternasHTML = '';
                lista.forEach(f => {
                    tarjetasInternasHTML += this.generarHTMLTarjetaFactura(f, true, permitirAcciones);
                });

                const gridInternoFusionStyle = lista.length >= 2
                    ? 'display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; align-items: stretch;'
                    : 'display: grid; grid-template-columns: 1fr; gap: 12px;';

                const safeFusionId = String(item.fusionId).replace(/'/g, "\\'");

                const botonesFusionHTML = `
                    <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                        <button type="button" onclick="GrupoManager.abrirModalImprimirFusion('${safeFusionId}', '${safeKey}')"
                            style="background: rgba(255,255,255,0.22); color: white; border: 1px solid rgba(255,255,255,0.45); padding: 6px 12px; border-radius: 6px; font-size: 0.78rem; font-weight: 700; cursor: pointer;"
                            title="Imprimir facturas fusionadas">
                            <i class="fas fa-print"></i> Imprimir
                        </button>
                        ${permitirAcciones ? `
                            <button onclick="GrupoManager.deshacerFusion('${safeFusionId}', '${safeKey}')"
                                style="background: rgba(255,255,255,0.18); color: white; border: 1px solid rgba(255,255,255,0.4); padding: 6px 10px; border-radius: 6px; font-size: 0.75rem; font-weight: 600; cursor: pointer;"
                                title="Volver a dejar las facturas sueltas">
                                <i class="fas fa-unlink"></i> Separar
                            </button>
                            ${saldoPendienteFusion > 0 ? `
                                <button onclick="GrupoManager.abonarAFusion('${safeFusionId}', '${safeKey}')"
                                    style="background: #2ecc71; color: white; border: none; padding: 7px 14px; border-radius: 6px; font-size: 0.8rem; font-weight: 800; cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,0.15);">
                                    <i class="fas fa-money-bill-wave"></i> ABONAR A FUSIONADAS
                                </button>
                            ` : `
                                <span style="background: #2ecc71; color: white; padding: 5px 12px; border-radius: 20px; font-size: 0.78rem; font-weight: 800;">
                                    <i class="fas fa-check-circle"></i> CORTE PAGADO
                                </span>
                            `}
                        ` : ''}
                    </div>
                `;

                facturasHTML += `
                    <div style="grid-column: 1 / -1; background: #f8f6ff; border: 2px solid #8e44ad; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 14px rgba(142, 68, 173, 0.12);">
                        <div style="background: linear-gradient(135deg, #6c5ce7 0%, #8e44ad 100%); color: white; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                                <i class="fas fa-layer-group" style="font-size: 1.15rem;"></i>
                                <div>
                                    <div style="font-weight: 800; font-size: 1rem;">FACTURAS FUSIONADAS (${lista.length} factura${lista.length > 1 ? 's' : ''})</div>
                                    <div style="font-size: 0.78rem; opacity: 0.9;">
                                        <i class="fas fa-calendar-check"></i> Fechas incluidas: ${textoRangoFechas}
                                    </div>
                                </div>
                            </div>
                            ${botonesFusionHTML}
                        </div>

                        <div style="padding: 12px 14px; background: #f5f3ff;">
                            <div style="font-size: 0.76rem; text-transform: uppercase; letter-spacing: 0.8px; color: #6c5ce7; font-weight: 700; margin-bottom: 10px; display: flex; align-items: center; gap: 6px;">
                                <i class="fas fa-arrow-down"></i> Detalle de facturas dentro de esta fusión (ordenadas por fecha):
                            </div>
                            <div style="${gridInternoFusionStyle}">
                                ${tarjetasInternasHTML}
                            </div>
                        </div>

                        <div style="background: white; border-top: 2px dashed #d6bcfa; padding: 14px 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
                            <div style="display: flex; gap: 18px; flex-wrap: wrap; align-items: center;">
                                <div style="font-size: 0.82rem; color: #64748b;">
                                    Suma de las ${lista.length} facturas:<br>
                                    <strong style="font-size: 0.95rem; color: #2c3e50;">$${totalOriginalFusion.toFixed(2)}</strong>
                                </div>
                                <div style="font-size: 0.82rem; color: #64748b;">
                                    Abonos a favor respetados:<br>
                                    <strong style="font-size: 0.95rem; color: #27ae60;">-$${totalAbonadoFusion.toFixed(2)}</strong>
                                </div>
                            </div>

                            <div style="background: ${saldoPendienteFusion <= 0 ? '#f0fff4' : '#fff5f5'}; border: 1px solid ${saldoPendienteFusion <= 0 ? '#9ae6b4' : '#feb2b2'}; padding: 8px 14px; border-radius: 8px; text-align: right;">
                                <span style="font-size: 0.7rem; text-transform: uppercase; color: ${saldoPendienteFusion <= 0 ? '#27ae60' : '#c53030'}; font-weight: 700; display: block;">Saldo Total Fusionado</span>
                                <strong style="font-size: 1.25rem; color: ${saldoPendienteFusion <= 0 ? '#27ae60' : '#e74c3c'}; font-weight: 800;">$${saldoPendienteFusion.toFixed(2)}</strong>
                            </div>
                        </div>
                    </div>
                `;
            } else {
                facturasHTML += this.generarHTMLTarjetaFactura(item.factura, false, permitirAcciones);
            }
        });

        facturasHTML += `</div>`;
        return facturasHTML;
    },

    async mostrarDetalleEquipo(key) {
        let equipo = this.equiposPendientes.get(key);

        // FALLBACK PARA CLIC EN DETALLES:
        if (!equipo) {
            equipo = this.equiposPendientes.get(`${key}-Equipo ${key}`);
        }

        AppState.selectedInvoicesForPayment = new Set();
        const safeKey = String(key).replace(/'/g, "\\'");

        let facturasHTML = '';
        let cantidadFacturas = 0;
        let totalPendiente = 0;
        let totalFacturadoOriginal = 0;

        if (equipo) {
            // Ordenar facturas por fecha (las más antiguas primero)
            const sortedFacturas = [...equipo.facturas].sort((a, b) => {
                const dateA = a.timestamp ? (a.timestamp.toDate ? a.timestamp.toDate() : new Date(a.timestamp)) : new Date(0);
                const dateB = b.timestamp ? (b.timestamp.toDate ? b.timestamp.toDate() : new Date(b.timestamp)) : new Date(0);
                return dateA - dateB;
            });

            cantidadFacturas = sortedFacturas.length;

            sortedFacturas.forEach(factura => {
                const saldoPendiente = factura.saldoPendiente !== undefined ? factura.saldoPendiente : factura.total;
                totalPendiente += saldoPendiente;
                totalFacturadoOriginal += (factura.total || 0);
            });

            facturasHTML = this.renderizarListaFacturasConFusiones(sortedFacturas, safeKey, true);
        }

        // Ajustar el ancho y alto del modal según la cantidad de facturas (1 columna si es 1, ancho amplio de 2 columnas si son 2 o más)
        const modalBox = document.getElementById('detalle-modal-box') || document.querySelector('#detalle-modal .modal-content');
        if (modalBox) {
            modalBox.style.height = '95vh';
            modalBox.style.maxHeight = '95vh';
            if (cantidadFacturas >= 2) {
                modalBox.style.width = '94%';
                modalBox.style.maxWidth = '1280px';
            } else {
                modalBox.style.width = '90%';
                modalBox.style.maxWidth = '760px';
            }
        }

        const printBtn = document.getElementById('imprimir-detalle-modal');
        if (printBtn) {
            printBtn.innerHTML = `<i class="fas fa-print"></i> IMPRIMIR HISTORIAL`;
        }

        const captureBtn = document.getElementById('capturar-detalle-modal');
        if (captureBtn) {
            captureBtn.onclick = () => this.capturarImagenEquipo(key);
        }

        const nombreEquipo = equipo && equipo.cliente && equipo.cliente !== `Equipo ${equipo.numero}`
            ? `${equipo.numero} - ${equipo.cliente}`
            : `Equipo ${equipo ? equipo.numero : key}`;

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
                    <div style="font-size: 1.4rem; font-weight: 800;">$${totalFacturadoOriginal.toFixed(2)}</div>
                    <div style="font-size: 0.7rem; opacity: 0.85;">Total Facturado</div>
                </div>
                <div style="background: linear-gradient(135deg, #e67e22 0%, #d35400 100%); padding: 14px 10px; border-radius: 10px; text-align: center; color: white;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 1.2rem; margin-bottom: 4px; display: block; opacity: 0.8;"></i>
                    <div style="font-size: 1.4rem; font-weight: 800;">$${totalPendiente.toFixed(2)}</div>
                    <div style="font-size: 0.7rem; opacity: 0.85;">Pendiente</div>
                </div>
            </div>
            
            <div style="display: flex; justify-content: space-between; align-items: center; background: #f1f5f9; padding: 10px 14px; border-radius: 10px; margin: 12px 0; border: 1px solid #e2e8f0; flex-wrap: wrap; gap: 10px;">
                <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
                    <label style="display: inline-flex; align-items: center; gap: 8px; background: white; border: 2px solid #8e44ad; color: #2c3e50; padding: 6px 12px; border-radius: 8px; font-size: 0.84rem; font-weight: 700; cursor: pointer; user-select: none; box-shadow: 0 2px 4px rgba(0,0,0,0.06);">
                        <input type="checkbox" id="select-all-invoices-chk" onchange="GrupoManager.toggleSelectAllInvoices()" style="width: 18px; height: 18px; cursor: pointer;">
                        <span id="select-all-invoices-label">Seleccionar todas</span>
                    </label>
                    <span style="font-size: 0.82rem; color: #64748b; font-weight: 500;">
                        Marca 2 o más facturas para <strong>Fusionarlas</strong> o <strong>Abonarles</strong>
                    </span>
                </div>
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    <button class="btn" id="edit-selected-btn" onclick="GrupoManager.abrirModalEditarDatosSeleccionada()" style="display: none; background: linear-gradient(135deg, #f39c12 0%, #e67e22 100%); border: none; padding: 8px 15px; border-radius: 6px; color: white; font-weight: bold; cursor: pointer; box-shadow: 0 2px 5px rgba(0,0,0,0.12);">
                        <i class="fas fa-edit"></i> EDITAR DATOS
                    </button>
                    <button class="btn" id="fuse-selected-btn" onclick="GrupoManager.fusionarFacturasSeleccionadas('${safeKey}')" style="display: none; background: linear-gradient(135deg, #8e44ad 0%, #6c5ce7 100%); border: none; padding: 8px 15px; border-radius: 6px; color: white; font-weight: bold; cursor: pointer; box-shadow: 0 2px 5px rgba(0,0,0,0.12);">
                        <i class="fas fa-object-group"></i> FUSIONAR
                    </button>
                    <button class="btn btn-info" id="pay-selected-btn" onclick="GrupoManager.showBulkPaymentModal(false)" style="display: none; background: linear-gradient(135deg, #3498db 0%, #2980b9 100%); border: none; padding: 8px 15px; border-radius: 6px; color: white; font-weight: bold; cursor: pointer; box-shadow: 0 2px 5px rgba(0,0,0,0.12);">
                        <i class="fas fa-money-bill-wave"></i> ABONAR SELECCIONADAS
                    </button>
                </div>
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
        this.actualizarBotonesSeleccionFacturas();
    },

    toggleSelectAllInvoices() {
        const masterChk = document.getElementById('select-all-invoices-chk');
        const marcarTodas = masterChk ? masterChk.checked : true;

        const checkboxesSueltas = Array.from(document.querySelectorAll('#detalle-modal-content .invoice-checkbox[data-en-fusion="0"]'));
        const checkboxesTodas = Array.from(document.querySelectorAll('#detalle-modal-content .invoice-checkbox'));
        const objetivos = checkboxesSueltas.length > 0 ? checkboxesSueltas : checkboxesTodas;

        if (marcarTodas) {
            objetivos.forEach(chk => {
                chk.checked = true;
                const id = chk.getAttribute('data-id');
                if (id) AppState.selectedInvoicesForPayment.add(id);
            });
        } else {
            checkboxesTodas.forEach(chk => {
                chk.checked = false;
                const id = chk.getAttribute('data-id');
                if (id) AppState.selectedInvoicesForPayment.delete(id);
            });
        }

        this.actualizarBotonesSeleccionFacturas();
    },

    actualizarBotonesSeleccionFacturas() {
        const n = AppState.selectedInvoicesForPayment.size;
        const payBtn = document.getElementById('pay-selected-btn');
        const fuseBtn = document.getElementById('fuse-selected-btn');
        const editBtn = document.getElementById('edit-selected-btn');
        const printBtn = document.getElementById('imprimir-detalle-modal');
        const masterChk = document.getElementById('select-all-invoices-chk');
        const masterLabel = document.getElementById('select-all-invoices-label');

        const checkboxesSueltas = Array.from(document.querySelectorAll('#detalle-modal-content .invoice-checkbox[data-en-fusion="0"]'));
        const checkboxesTodas = Array.from(document.querySelectorAll('#detalle-modal-content .invoice-checkbox'));
        const objetivos = checkboxesSueltas.length > 0 ? checkboxesSueltas : checkboxesTodas;

        if (masterChk && objetivos.length > 0) {
            const todasMarcadas = objetivos.every(chk => chk.checked);
            masterChk.checked = todasMarcadas;
            if (masterLabel) {
                masterLabel.textContent = todasMarcadas ? 'Desmarcar todas' : 'Seleccionar todas';
            }
        }

        if (editBtn) {
            editBtn.style.display = n === 1 ? 'inline-block' : 'none';
        }

        if (payBtn) {
            if (n > 0) {
                payBtn.style.display = 'inline-block';
                payBtn.innerHTML = `<i class="fas fa-money-bill-wave"></i> ABONAR (${n})`;
            } else {
                payBtn.style.display = 'none';
            }
        }

        if (fuseBtn) {
            if (n >= 2) {
                fuseBtn.style.display = 'inline-block';
                fuseBtn.innerHTML = `<i class="fas fa-object-group"></i> FUSIONAR (${n})`;
            } else {
                fuseBtn.style.display = 'none';
            }
        }

        if (printBtn) {
            if (n > 0) {
                printBtn.innerHTML = `<i class="fas fa-print"></i> IMPRIMIR TICKET${n > 1 ? 'S' : ''} SELECCIONADO${n > 1 ? 'S' : ''} (${n})`;
            } else {
                printBtn.innerHTML = `<i class="fas fa-print"></i> IMPRIMIR HISTORIAL`;
            }
        }
    },

    abrirModalEditarDatosSeleccionada() {
        if (!AppState.selectedInvoicesForPayment || AppState.selectedInvoicesForPayment.size !== 1) {
            UIService.showStatus("Seleccione 1 sola factura para editar sus datos", "warning");
            return;
        }
        const invoiceId = Array.from(AppState.selectedInvoicesForPayment)[0];
        this.abrirModalEditarDatosFactura(invoiceId);
    },

    async abrirModalEditarDatosFactura(invoiceId) {
        let factura = null;
        this.equiposPendientes.forEach(eq => {
            if (factura) return;
            const found = eq.facturas.find(f => f.id === invoiceId);
            if (found) factura = found;
        });

        if (!factura) {
            try {
                factura = await DataService.getSaleById(invoiceId);
            } catch (e) {
                console.error("Error obteniendo factura:", e);
            }
        }

        if (!factura) {
            UIService.showStatus("No se encontró la factura", "error");
            return;
        }

        let fechaYYYYMMDD = factura.date || '';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaYYYYMMDD)) {
            const d = factura.timestamp
                ? (factura.timestamp.toDate ? factura.timestamp.toDate() : new Date(factura.timestamp))
                : new Date();
            if (!isNaN(d.getTime())) {
                fechaYYYYMMDD = DateUtils.formatDateToYYYYMMDD(d);
            } else {
                fechaYYYYMMDD = DateUtils.getCurrentDateStringElSalvador();
            }
        }

        const equipoNum = String(factura.equipoNumber || '');
        const clienteRaw = String(factura.clientName || '').trim();
        const clienteLimpio = (clienteRaw === `Equipo ${equipoNum}` || clienteRaw === equipoNum) ? '' : clienteRaw;

        document.getElementById('edit-datos-factura-id').value = factura.id;
        document.getElementById('edit-datos-factura-num').textContent = `#${factura.invoiceNumber || 'S/N'}`;
        document.getElementById('edit-datos-fecha').value = fechaYYYYMMDD;
        document.getElementById('edit-datos-equipo').value = equipoNum;
        document.getElementById('edit-datos-cliente').value = clienteLimpio;

        document.getElementById('editar-datos-factura-modal').style.display = 'block';
    },

    async guardarDatosFacturaEditada() {
        const invoiceId = document.getElementById('edit-datos-factura-id').value;
        const nuevaFecha = document.getElementById('edit-datos-fecha').value.trim();
        const nuevoEquipo = document.getElementById('edit-datos-equipo').value.trim();
        const nuevoClienteInput = document.getElementById('edit-datos-cliente').value.trim();

        if (!invoiceId) return;
        if (!nuevaFecha) {
            UIService.showStatus("Seleccione una fecha válida para la factura", "error");
            return;
        }
        if (!nuevoEquipo) {
            UIService.showStatus("Ingrese el número de equipo", "error");
            return;
        }

        try {
            UIService.showLoading(true);
            const facturaActual = await DataService.getSaleById(invoiceId);
            if (!facturaActual) {
                throw new Error("No se encontró la factura en la base de datos");
            }

            const finalCliente = nuevoClienteInput || `Equipo ${nuevoEquipo}`;

            // Construir nuevo timestamp conservando la hora original si existía
            const [y, m, d] = nuevaFecha.split('-').map(Number);
            let fechaBase = new Date(y, m - 1, d, 12, 0, 0);
            if (facturaActual.timestamp) {
                const origDate = facturaActual.timestamp.toDate
                    ? facturaActual.timestamp.toDate()
                    : new Date(facturaActual.timestamp);
                if (!isNaN(origDate.getTime())) {
                    fechaBase = new Date(y, m - 1, d, origDate.getHours(), origDate.getMinutes(), origDate.getSeconds());
                }
            }

            const updatePayload = {
                date: nuevaFecha,
                timestamp: fechaBase,
                equipoNumber: nuevoEquipo,
                clientName: finalCliente,
                fechaActualizacion: DateUtils.getCurrentTimestampElSalvador()
            };

            // Si cambió de número de equipo y estaba en una fusión del equipo anterior, desvincularla de esa fusión
            if (String(facturaActual.equipoNumber) !== String(nuevoEquipo) && facturaActual.fusionId) {
                updatePayload.fusionId = firebase.firestore.FieldValue.delete();
                updatePayload.fechaFusion = firebase.firestore.FieldValue.delete();
            }

            // Verificar asignación de grupo según el nuevo equipo/cliente
            const keyBusqueda = finalCliente ? `${nuevoEquipo}-${finalCliente}` : String(nuevoEquipo);
            const grupoDestino = this.getGrupoDeEquipo(keyBusqueda, nuevoEquipo);
            if (grupoDestino) {
                updatePayload.grupo = grupoDestino.id;
                updatePayload.grupoNombre = grupoDestino.nombre;
            } else {
                updatePayload.grupo = firebase.firestore.FieldValue.delete();
                updatePayload.grupoNombre = firebase.firestore.FieldValue.delete();
            }

            await AppState.db.collection("VENTAS").doc(invoiceId).update(updatePayload);

            document.getElementById('editar-datos-factura-modal').style.display = 'none';
            UIService.showStatus(`Datos de la factura #${facturaActual.invoiceNumber} actualizados correctamente`, "success");

            await this.loadEquiposPendientes(true);
            await this.actualizarTotalesGrupos(true);
            this.updateUI();
            if (typeof SalesService !== 'undefined' && SalesService.loadHistorial) {
                await SalesService.loadHistorial();
            }

            const keyAnterior = AppState.currentDetalle && AppState.currentDetalle.tipo === 'equipo'
                ? AppState.currentDetalle.data
                : null;
            const nuevaKey = `${nuevoEquipo}-${finalCliente}`;

            if (keyAnterior && this.equiposPendientes.has(keyAnterior)) {
                await this.mostrarDetalleEquipo(keyAnterior);
            } else if (this.equiposPendientes.has(nuevaKey)) {
                await this.mostrarDetalleEquipo(nuevaKey);
            } else {
                document.getElementById('detalle-modal').style.display = 'none';
            }
        } catch (error) {
            console.error("Error guardando datos de factura:", error);
            UIService.showStatus("Error al guardar cambios: " + error.message, "error");
        } finally {
            UIService.showLoading(false);
        }
    },

    enviarFacturaAlCarritoDesdeModal() {
        const invoiceId = document.getElementById('edit-datos-factura-id').value;
        if (!invoiceId) return;
        document.getElementById('editar-datos-factura-modal').style.display = 'none';
        document.getElementById('detalle-modal').style.display = 'none';
        if (typeof UIService !== 'undefined' && UIService.activateTab) {
            UIService.activateTab('carrito');
        }
        if (typeof SalesService !== 'undefined' && SalesService.editInvoice) {
            SalesService.editInvoice(invoiceId);
        }
    },

    activarEdicionCeldaFactura(td, invoiceId, itemIdx, field) {
        if (!td || td.dataset.editing === '1') return;

        let facturaLocal = null;
        for (const [, eq] of this.equiposPendientes) {
            const match = (eq.facturas || []).find(f => f.id === invoiceId);
            if (match) { facturaLocal = match; break; }
        }
        if (!facturaLocal || !facturaLocal.products || !facturaLocal.products[itemIdx]) return;

        const item = facturaLocal.products[itemIdx];
        const originalVal = item[field];
        const originalHTML = td.innerHTML;
        td.dataset.editing = '1';

        const input = document.createElement('input');
        if (field === 'descripcion') {
            input.type = 'text';
            input.value = String(originalVal || '');
            input.style.cssText = 'width: 100%; padding: 3px 6px; font-size: 0.8rem; border: 1px solid #3498db; border-radius: 4px; outline: none; box-sizing: border-box;';
        } else if (field === 'precio') {
            input.type = 'number';
            input.step = '0.01';
            input.min = '0';
            input.value = Number(originalVal || 0).toFixed(2);
            input.style.cssText = 'width: 68px; text-align: right; padding: 3px 5px; font-size: 0.8rem; border: 1px solid #3498db; border-radius: 4px; outline: none;';
        } else {
            input.type = 'number';
            input.step = 'any';
            input.min = '1';
            input.value = Number(originalVal || 1);
            input.style.cssText = 'width: 52px; text-align: center; padding: 3px 4px; font-size: 0.8rem; border: 1px solid #3498db; border-radius: 4px; outline: none;';
        }

        td.innerHTML = '';
        td.appendChild(input);
        input.focus();
        input.select();

        let finished = false;
        const restore = () => {
            td.innerHTML = originalHTML;
            delete td.dataset.editing;
        };

        const commit = async () => {
            if (finished) return;
            finished = true;

            let newVal;
            if (field === 'descripcion') {
                newVal = input.value.trim();
                if (!newVal) {
                    UIService.showStatus("La descripción no puede quedar vacía", "error");
                    return restore();
                }
                if (newVal === String(originalVal || '').trim()) return restore();
            } else if (field === 'precio') {
                newVal = parseFloat(input.value);
                if (isNaN(newVal) || !isFinite(newVal) || newVal < 0) {
                    UIService.showStatus("Ingrese un precio válido mayor o igual a $0.00", "error");
                    return restore();
                }
                if (Math.abs(newVal - Number(originalVal || 0)) < 0.001) return restore();
                newVal = Number(newVal.toFixed(2));
            } else {
                newVal = parseFloat(input.value);
                if (isNaN(newVal) || !isFinite(newVal) || newVal <= 0) {
                    UIService.showStatus("La cantidad debe ser mayor a 0", "error");
                    return restore();
                }
                if (newVal === Number(originalVal || 1)) return restore();
            }

            try {
                UIService.showLoading(true);
                const ventaActual = await DataService.getSaleById(invoiceId);
                if (!ventaActual || !ventaActual.products || !ventaActual.products[itemIdx]) {
                    throw new Error("No se encontró el producto en la factura");
                }

                // Clonar productos preservando id, codigo y costo unitario intactos
                const updatedProducts = ventaActual.products.map((p, idx) =>
                    idx === itemIdx ? { ...p, [field]: newVal } : { ...p }
                );

                const nuevoTotal = Number(updatedProducts.reduce((sum, p) =>
                    sum + ((Number(p.precio) || 0) * (Number(p.cantidad) || 0)), 0
                ).toFixed(2));

                const totalAbonado = (ventaActual.abonos || []).reduce((s, a) => s + (Number(a.monto) || 0), 0);
                let nuevoSaldo = Number((nuevoTotal - totalAbonado).toFixed(2));

                if (nuevoSaldo < -0.009) {
                    UIService.showStatus(`El nuevo total ($${nuevoTotal.toFixed(2)}) no puede ser menor al monto ya abonado ($${totalAbonado.toFixed(2)})`, "error");
                    return restore();
                }
                if (Math.abs(nuevoSaldo) <= 0.009) nuevoSaldo = 0;

                await AppState.db.collection("VENTAS").doc(invoiceId).update({
                    products: updatedProducts,
                    total: nuevoTotal,
                    saldoPendiente: nuevoSaldo,
                    paymentType: nuevoSaldo <= 0 ? 'contado' : 'pendiente',
                    status: nuevoSaldo <= 0 ? 'pagado' : 'pendiente',
                    fechaActualizacion: DateUtils.getCurrentTimestampElSalvador()
                });

                delete td.dataset.editing;
                UIService.showStatus("Factura actualizada correctamente", "success");

                await this.loadEquiposPendientes(true);
                await this.actualizarTotalesGrupos(true);
                this.updateUI();
                if (typeof SalesService !== 'undefined' && SalesService.loadHistorial) {
                    await SalesService.loadHistorial();
                }

                const detalleModal = document.getElementById('detalle-modal');
                if (detalleModal && detalleModal.style.display === 'block' && AppState.currentDetalle?.tipo === 'equipo') {
                    const key = AppState.currentDetalle.data;
                    if (this.equiposPendientes.has(key) || this.getEquipoData(key)) {
                        await this.mostrarDetalleEquipo(key);
                    } else {
                        detalleModal.style.display = 'none';
                    }
                }
                const grupoDetalleModal = document.getElementById('grupo-detalle-modal');
                if (grupoDetalleModal && grupoDetalleModal.style.display === 'block' && this.currentGrupoDetalle) {
                    await this.mostrarDetalleGrupoCompleto(this.currentGrupoDetalle.id);
                }
            } catch (error) {
                console.error("Error actualizando línea de factura:", error);
                UIService.showStatus("Error al guardar cambio: " + error.message, "error");
                restore();
            } finally {
                UIService.showLoading(false);
            }
        };

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                commit();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                finished = true;
                restore();
            }
        });
        input.addEventListener('blur', () => commit());
    },

    async fusionarFacturasSeleccionadas(key) {
        if (!AppState.selectedInvoicesForPayment || AppState.selectedInvoicesForPayment.size < 2) {
            UIService.showStatus("Seleccione al menos 2 facturas para fusionar", "warning");
            return;
        }

        try {
            UIService.showLoading(true);
            const fusionId = 'FUS-' + Date.now();
            const batch = AppState.db.batch();

            for (const invoiceId of AppState.selectedInvoicesForPayment) {
                const ref = AppState.db.collection("VENTAS").doc(invoiceId);
                batch.update(ref, {
                    fusionId: fusionId,
                    fechaFusion: new Date()
                });
            }

            await batch.commit();
            const cantidad = AppState.selectedInvoicesForPayment.size;
            AppState.selectedInvoicesForPayment.clear();

            await this.loadEquiposPendientes(true);
            await this.actualizarTotalesGrupos(true);
            this.updateUI();
            await this.mostrarDetalleEquipo(key);

            UIService.showStatus(`${cantidad} facturas fusionadas correctamente`, "success");
        } catch (error) {
            console.error("Error fusionando facturas:", error);
            UIService.showStatus("Error al fusionar facturas: " + error.message, "error");
        } finally {
            UIService.showLoading(false);
        }
    },

    async deshacerFusion(fusionId, key) {
        if (!confirm("¿Desea separar estas facturas para que vuelvan a mostrarse por separado?")) {
            return;
        }

        try {
            UIService.showLoading(true);
            const batch = AppState.db.batch();
            let count = 0;

            for (const [, equipo] of this.equiposPendientes) {
                for (const factura of equipo.facturas) {
                    if (factura.fusionId === fusionId) {
                        const ref = AppState.db.collection("VENTAS").doc(factura.id);
                        batch.update(ref, {
                            fusionId: firebase.firestore.FieldValue.delete(),
                            fechaFusion: firebase.firestore.FieldValue.delete()
                        });
                        count++;
                    }
                }
            }

            if (count > 0) {
                await batch.commit();
            }

            await this.loadEquiposPendientes(true);
            await this.actualizarTotalesGrupos(true);
            this.updateUI();
            if (key) {
                await this.mostrarDetalleEquipo(key);
            }

            UIService.showStatus("Las facturas se separaron correctamente", "success");
        } catch (error) {
            console.error("Error separando facturas:", error);
            UIService.showStatus("Error al separar facturas: " + error.message, "error");
        } finally {
            UIService.showLoading(false);
        }
    },

    abonarAFusion(fusionId, key) {
        const facturasFusion = [];
        for (const [, equipo] of this.equiposPendientes) {
            for (const factura of equipo.facturas) {
                const saldo = factura.saldoPendiente !== undefined ? factura.saldoPendiente : factura.total;
                if (factura.fusionId === fusionId && saldo > 0.009) {
                    facturasFusion.push(factura);
                }
            }
        }

        if (facturasFusion.length === 0) {
            UIService.showStatus("No hay saldo pendiente en esta fusión", "info");
            return;
        }

        AppState.selectedInvoicesForPayment = new Set(facturasFusion.map(f => f.id));
        this.showBulkPaymentModal(true);
    },

    abrirModalImprimirFusion(fusionId, key) {
        let equipo = this.equiposPendientes.get(key) || this.getEquipoData(key);
        const facturasFusion = [];
        if (equipo && equipo.facturas) {
            equipo.facturas.forEach(f => {
                if (f.fusionId === fusionId) facturasFusion.push(f);
            });
        } else {
            for (const [, eq] of this.equiposPendientes) {
                for (const f of (eq.facturas || [])) {
                    if (f.fusionId === fusionId) {
                        if (!equipo) equipo = eq;
                        facturasFusion.push(f);
                    }
                }
            }
        }

        if (facturasFusion.length === 0) {
            UIService.showStatus("No se encontraron facturas dentro de esta fusión", "warning");
            return;
        }

        facturasFusion.sort((a, b) => DateUtils.getTimeMs(a) - DateUtils.getTimeMs(b));

        const saldoFinal = facturasFusion.reduce((sum, f) => {
            const s = f.saldoPendiente !== undefined ? f.saldoPendiente : f.total;
            return sum + Number(s || 0);
        }, 0);

        const clienteNombre = equipo ? (equipo.cliente || `Equipo ${equipo.numero}`) : '';
        const equipoNum = equipo ? equipo.numero : '';

        const modal = document.getElementById('fusion-print-modal');
        const subtitle = document.getElementById('fusion-print-subtitle');
        const btnActual = document.getElementById('fusion-print-actual-btn');
        const btnSolida = document.getElementById('fusion-print-solida-btn');

        const reportData = {
            cliente: clienteNombre,
            equipo: equipoNum,
            facturas: facturasFusion,
            movimientos: [],
            saldoFinal: saldoFinal,
            fechaImpresion: new Date()
        };

        if (!modal || !btnActual || !btnSolida) {
            PrintingService.printFusionSolida(reportData);
            return;
        }

        if (subtitle) {
            subtitle.innerHTML = `<strong>Equipo ${equipoNum}</strong> &bull; ${facturasFusion.length} factura${facturasFusion.length > 1 ? 's' : ''} fusionada${facturasFusion.length > 1 ? 's' : ''} &bull; Saldo: <strong>$${saldoFinal.toFixed(2)}</strong>`;
        }

        btnActual.onclick = () => {
            modal.style.display = 'none';
            PrintingService.printBalanceHistory(reportData);
        };
        btnSolida.onclick = () => {
            modal.style.display = 'none';
            PrintingService.printFusionSolida(reportData);
        };

        modal.style.display = 'flex';
    },

    showBulkPaymentModal(esFusion = false) {
        if (AppState.selectedInvoicesForPayment.size === 0) return;

        const modal = document.getElementById('bulk-abono-modal');
        const info = document.getElementById('bulk-abono-info');

        // Mostrar info y ocultar elementos de grupo
        info.style.display = 'block';
        if (esFusion) {
            info.innerHTML = `
                <strong><i class="fas fa-layer-group" style="color: #8e44ad;"></i> Abono a Facturas Fusionadas (${AppState.selectedInvoicesForPayment.size} facturas):</strong><br>
                El monto que ingrese se aplicará <strong>únicamente a las facturas dentro de esta fusión</strong> (de la más antigua a la más reciente), sin tocar las facturas nuevas creadas después.
            `;
        } else {
            info.innerHTML = `
                <strong>Facturas Seleccionadas:</strong> ${AppState.selectedInvoicesForPayment.size}<br>
                Ingrese el monto total a abonar. Se distribuirá entre las facturas seleccionadas (más antiguas primero).
            `;
        }

        // Mostrar columna izquierda con las facturas seleccionadas y el filtro TODAS / FUSIONADAS / INDIVIDUALES
        document.getElementById('bulk-abono-grupo-nombre').textContent = esFusion ? 'Facturas Fusionadas' : 'Facturas Seleccionadas';
        document.getElementById('bulk-abono-fecha').textContent = new Date().toLocaleDateString('es-ES', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
        document.getElementById('bulk-abono-left-col').style.display = 'block';
        document.querySelector('.modal-opt2').classList.remove('single-column');

        // Recopilar las facturas seleccionadas y calcular total
        let totalSeleccionado = 0;
        const selectedInvoicesList = [];
        for (const invoiceId of AppState.selectedInvoicesForPayment) {
            for (const [, equipo] of this.equiposPendientes) {
                const factura = equipo.facturas.find(f => f.id === invoiceId);
                if (factura) {
                    const saldo = Number(factura.saldoPendiente !== undefined ? factura.saldoPendiente : factura.total) || 0;
                    const timeMs = (typeof DateUtils !== 'undefined' && DateUtils.getTimeMs) ? DateUtils.getTimeMs(factura) : 0;
                    const fechaStr = factura.timestamp ? new Date(timeMs).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '';
                    totalSeleccionado += saldo;
                    selectedInvoicesList.push({
                        id: factura.id,
                        invoiceNumber: factura.invoiceNumber || '',
                        fecha: fechaStr,
                        timeMs,
                        fusionId: factura.fusionId || null,
                        saldo
                    });
                    break;
                }
            }
        }
        selectedInvoicesList.sort((a, b) => a.timeMs - b.timeMs);

        const invListHTML = selectedInvoicesList.map(f => `
            <label class="bulk-inv-row" data-eq="sel" data-fusion="${f.fusionId ? '1' : '0'}" style="display:flex; justify-content:space-between; align-items:center; gap:8px; padding:7px 10px; border-bottom:1px solid #f1f5f9; font-size:13px; cursor:pointer; color:#334155; background:#fff;">
                <span style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                    <input type="checkbox" class="bulk-inv-checkbox" data-eq="sel" data-id="${f.id}" data-saldo="${f.saldo}" data-fusion="${f.fusionId ? '1' : '0'}" checked onchange="GrupoManager.recalculateBulkGroupSelection()">
                    <strong>#${f.invoiceNumber}</strong>
                    <span style="color:#94a3b8;">(${f.fecha})</span>
                    ${f.fusionId ? '<span style="background:#ede9fe; color:#6d28d9; padding:1px 6px; border-radius:4px; font-size:10px; font-weight:700;">Fusionada</span>' : ''}
                </span>
                <span style="font-weight:700; color:#dc2626;">$${f.saldo.toFixed(2)}</span>
            </label>
        `).join('');

        document.getElementById('bulk-abono-equipos-list').innerHTML = `
            <div style="font-weight: 800; color: #747d8c; margin-bottom: 8px; font-size: 12px; text-transform: uppercase;">Facturas en Abono</div>
            <div style="border:1px solid #e2e8f0; border-radius:10px; overflow:hidden; background:#fff;">
                ${invListHTML || '<div style="padding:12px; text-align:center; color:#94a3b8;">Sin facturas</div>'}
            </div>
        `;

        // Mostrar el total en el cuadro oscuro y guardarlo para el calculador
        document.getElementById('bulk-abono-total').textContent = totalSeleccionado.toFixed(2);
        modal.dataset.totalGrupo = totalSeleccionado;

        document.getElementById('monto-bulk-abono').value = '';
        document.getElementById('saldo-restante-container').style.display = 'block';
        document.getElementById('saldo-restante').textContent = `$${totalSeleccionado.toFixed(2)}`;
        document.getElementById('saldo-restante').style.color = '#e74c3c';
        if (typeof GrupoManager.setBulkFusionFilter === 'function') {
            GrupoManager.setBulkFusionFilter('todas');
        }
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

            const checkedBoxes = Array.from(document.querySelectorAll('#bulk-abono-equipos-list .bulk-inv-checkbox:checked'));
            if (checkedBoxes.length === 0) {
                UIService.showStatus("Seleccione al menos una factura para abonar", "error");
                processBtn.disabled = false;
                return;
            }

            const facturasIds = checkedBoxes.map(cb => cb.dataset.id);
            const saldoSeleccionado = checkedBoxes.reduce((s, cb) => s + (parseFloat(cb.dataset.saldo) || 0), 0);

            if (monto > saldoSeleccionado + 0.009) {
                UIService.showStatus(`El monto ($${monto.toFixed(2)}) no puede ser mayor al saldo pendiente seleccionado ($${saldoSeleccionado.toFixed(2)})`, "error");
                processBtn.disabled = false;
                return;
            }

            try {
                UIService.showLoading(true);

                // Snapshot de TODAS las facturas pendientes del equipo(s) afectado(s) antes del abono
                const equiposAfectados = [];
                const seenEq = new Set();
                for (const [, equipo] of this.equiposPendientes) {
                    if (!equipo.facturas) continue;
                    const tieneAlguna = equipo.facturas.some(f => AppState.selectedInvoicesForPayment.has(f.id));
                    if (tieneAlguna && !seenEq.has(equipo.numero)) {
                        seenEq.add(equipo.numero);
                        equiposAfectados.push(equipo);
                    }
                }

                const snapshotFacturas = [];
                equiposAfectados.forEach(eq => {
                    eq.facturas.forEach(f => {
                        const saldoAnt = f.saldoPendiente !== undefined ? f.saldoPendiente : f.total;
                        if (saldoAnt > 0.009) {
                            const fDate = f.timestamp ? new Date(DateUtils.getTimeMs(f)).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '';
                            snapshotFacturas.push({
                                id: f.id,
                                invoiceNumber: f.invoiceNumber || '',
                                fecha: fDate,
                                timeMs: DateUtils.getTimeMs(f),
                                saldoAnterior: Number(saldoAnt)
                            });
                        }
                    });
                });
                snapshotFacturas.sort((a, b) => a.timeMs - b.timeMs);

                const facturasAfectadas = await SalesService.processMultiAbono(facturasIds, monto);
                const abonoById = {};
                (facturasAfectadas || []).forEach(fa => {
                    abonoById[fa.id] = (abonoById[fa.id] || 0) + (Number(fa.abono) || 0);
                });

                const facturasTicket = snapshotFacturas.map(f => {
                    const ab = abonoById[f.id] || 0;
                    return {
                        invoiceNumber: f.invoiceNumber,
                        fecha: f.fecha,
                        saldoAnterior: f.saldoAnterior,
                        montoAbonado: ab,
                        nuevoSaldo: Math.max(0, f.saldoAnterior - ab)
                    };
                });

                const saldoTotalAnterior = facturasTicket.reduce((s, f) => s + f.saldoAnterior, 0);
                const abonoTotal = facturasTicket.reduce((s, f) => s + f.montoAbonado, 0);
                const nuevoSaldoTotal = Math.max(0, saldoTotalAnterior - abonoTotal);

                const primerEquipo = equiposAfectados[0];
                const comprobanteData = {
                    tipo: 'facturas',
                    grupoNombre: primerEquipo ? (primerEquipo.cliente || '') : '',
                    equipoNumber: equiposAfectados.map(e => e.numero).join(', '),
                    fechaTicket: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }),
                    facturas: facturasTicket,
                    saldoTotalAnterior,
                    abonoTotal,
                    nuevoSaldoTotal
                };

                DataService.saveAbonoComprobante(comprobanteData).catch(e => console.error('Error guardando comprobante:', e));

                UIService.showStatus("Abono masivo realizado correctamente", "success");
                modal.style.display = 'none';
                document.getElementById('detalle-modal').style.display = 'none';
                AppState.selectedInvoicesForPayment.clear();

                // Recargar datos de grupos y equipos
                await GrupoManager.loadEquiposPendientes(true);
                await GrupoManager.actualizarTotalesGrupos(true);
                GrupoManager.updateUI();

                this.mostrarModalImprimirAbono(
                    `<strong>${comprobanteData.equipoNumber ? 'Equipo ' + comprobanteData.equipoNumber : 'Facturas Seleccionadas'}</strong><br>Abono aplicado: <strong style="color:#16a34a;">$${abonoTotal.toFixed(2)}</strong><br>Nuevo saldo pendiente: <strong>$${nuevoSaldoTotal.toFixed(2)}</strong>`,
                    () => PrintingService.printBulkAbonoTicket(comprobanteData, false)
                );

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
            // NOTA REVERTIBLE: Se cambió .get(equipoKey) por .getEquipoData(equipoKey) para usar el traductor inteligente
            let equipoEncontrado = this.getEquipoData ? this.getEquipoData(equipoKey) : this.equiposPendientes.get(equipoKey);

            // 2. Fallback para grupos antiguos: buscar por número
            const equiposCoincidentes = [];
            if (equipoEncontrado && equipoEncontrado.total > 0) {
                equiposCoincidentes.push(equipoEncontrado);
            }

            for (const equipo of equiposCoincidentes) {
                totalGeneral += equipo.total;
                cantidadFacturas += equipo.facturas.length;
                cantidadEquiposConDeuda++;

                const sortedFacturas = [...equipo.facturas].sort((a, b) => {
                    const dateA = a.timestamp ? (a.timestamp.toDate ? a.timestamp.toDate() : new Date(a.timestamp)) : new Date(0);
                    const dateB = b.timestamp ? (b.timestamp.toDate ? b.timestamp.toDate() : new Date(b.timestamp)) : new Date(0);
                    return dateA - dateB;
                });

                sortedFacturas.forEach((factura) => {
                    const saldoPendiente = factura.saldoPendiente !== undefined ? factura.saldoPendiente : factura.total;
                    totalPendiente += saldoPendiente;

                    if (factura.abonos && factura.abonos.length > 0) {
                        tieneAbonos = true;
                    }
                });

                const facturasHTML = this.renderizarListaFacturasConFusiones(sortedFacturas, '', false);

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
            // NOTA REVERTIBLE: Se cambió .get(equipoKey) por .getEquipoData(equipoKey) para usar el traductor inteligente
            let equipoEncontrado = this.getEquipoData ? this.getEquipoData(equipoKey) : this.equiposPendientes.get(equipoKey);

            // Fallback eliminado: exigimos coincidencia exacta.

            if (equipoEncontrado && equipoEncontrado.total > 0) {
                equipoEncontrado.facturas.forEach(factura => {
                    this.imprimirTicketFactura(factura, equipoEncontrado);
                });
            }
        }
    },

    imprimirTicketFactura(factura, equipo) {
        if (!factura) return;

        // Verificar si contiene productos con precio $0.00
        const tienePrecioCero = factura.products && factura.products.some(p => Number(p.precio) === 0);
        if (tienePrecioCero) {
            if (typeof UIService !== 'undefined' && UIService.showStatus) {
                UIService.showStatus("No se puede imprimir el ticket: contiene productos con precio $0.00", "warning");
            } else {
                alert("No se puede imprimir el ticket: contiene productos con precio $0.00");
            }
            return;
        }

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

    getFacturaMotivoTag(factura) {
        const parts = [];
        const items = factura.products || factura.items || factura.productos || [];
        items.forEach(item => {
            const desc = item.descripcionPapel || item.descripcion || item.producto || '';
            if (desc) parts.push(desc);
        });
        if (factura.concepto) parts.push(factura.concepto);
        if (factura.nota) parts.push(factura.nota);

        const fullText = parts.join(' ')
            .toUpperCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');

        const tags = [];
        if (/CAMBIO\s*(DE)?\s*ACEITE/.test(fullText)) tags.push('CAMBIO DE ACEITE');
        if (/\bCAJA\b/.test(fullText)) tags.push('CAJA');
        return tags.join(' / ');
    },

    buildEquipoCaptureHTML(equipo, includeSubtotal = true) {
        const nombreEquipo = equipo.cliente && equipo.cliente !== `Equipo ${equipo.numero}`
            ? `Equipo ${equipo.numero} - ${equipo.cliente}`
            : `Equipo ${equipo.numero}`;

        const sortedFacturas = [...(equipo.facturas || [])]
            .map(f => {
                const saldo = f.saldoPendiente !== undefined ? f.saldoPendiente : f.total;
                const timeMs = (typeof DateUtils !== 'undefined' && DateUtils.getTimeMs) ? DateUtils.getTimeMs(f) : 0;
                const fecha = f.timestamp
                    ? new Date(timeMs).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' })
                    : '';
                return {
                    ...f,
                    saldo: Number(saldo || 0),
                    timeMs,
                    fecha,
                    motivo: this.getFacturaMotivoTag(f)
                };
            })
            .filter(f => f.saldo > 0.009)
            .sort((a, b) => a.timeMs - b.timeMs);

        const rowsHTML = sortedFacturas.map((f, idx) => {
            const bgColor = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
            const motivoHTML = f.motivo
                ? `<span style="background:#fef3c7; color:#92400e; padding:2px 6px; border-radius:4px; font-size:11px; font-weight:700;">${f.motivo}</span>`
                : '';
            return `
                <div style="display:grid; grid-template-columns: 74px 1fr 82px; align-items:center; gap:8px; padding:7px 10px; border-bottom:1px solid #e2e8f0; background:${bgColor}; font-size:13px;">
                    <div style="color:#475569; font-weight:600;">${f.fecha}</div>
                    <div style="text-align:center;">${motivoHTML}</div>
                    <div style="text-align:right; font-weight:700; color:#dc2626;">$${f.saldo.toFixed(2)}</div>
                </div>
            `;
        }).join('');

        const totalEq = sortedFacturas.reduce((s, f) => s + f.saldo, 0);

        return `
            <div style="border:1px solid #cbd5e1; border-radius:8px; overflow:hidden; margin-bottom:14px;">
                <div style="display:flex; justify-content:space-between; align-items:center; background:#e2e8f0; padding:8px 12px; font-weight:800; color:#0f172a; font-size:15px;">
                    <span>${nombreEquipo}</span>
                    ${includeSubtotal ? `<span style="color:#dc2626;">$${totalEq.toFixed(2)}</span>` : ''}
                </div>
                ${rowsHTML}
            </div>
        `;
    },

    async capturarImagenEquipo(key) {
        let equipo = this.equiposPendientes.get(key) || this.getEquipoData(key);
        if (!equipo) {
            UIService.showStatus('Equipo no encontrado', 'error');
            return;
        }
        if (typeof html2canvas === 'undefined') {
            UIService.showStatus('Error: Recarga la página para cargar la librería de captura', 'error');
            return;
        }

        try {
            UIService.showLoading(true);
            const captureDiv = document.createElement('div');
            captureDiv.style.cssText = `
                position: fixed;
                left: -9999px;
                top: 0;
                background: white;
                padding: 20px;
                width: 440px;
                font-family: Arial, sans-serif;
                border: 2px solid #2c3e50;
                border-radius: 10px;
            `;

            const nombreEquipo = equipo.cliente && equipo.cliente !== `Equipo ${equipo.numero}`
                ? `Equipo ${equipo.numero} - ${equipo.cliente}`
                : `Equipo ${equipo.numero}`;

            captureDiv.innerHTML = `
                <div style="text-align: center; margin-bottom: 14px; padding-bottom: 12px; border-bottom: 3px solid #3498db;">
                    <h2 style="margin: 0; color: #2c3e50; font-size: 23px;">TALLER WILLIAN</h2>
                    <h3 style="margin: 5px 0 0 0; color: #3498db; font-size: 18px;">${nombreEquipo}</h3>
                </div>
                ${this.buildEquipoCaptureHTML(equipo, false)}
                <div style="background: #2c3e50; color: white; padding: 14px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 13px; margin-bottom: 4px;">SALDO TOTAL PENDIENTE</div>
                    <div style="font-size: 26px; font-weight: bold;">$${equipo.total.toFixed(2)}</div>
                </div>
                <div style="text-align: center; margin-top: 12px; color: #7f8c8d; font-size: 12px;">
                    ${new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                </div>
            `;

            document.body.appendChild(captureDiv);
            const canvas = await html2canvas(captureDiv, {
                backgroundColor: '#ffffff',
                scale: 2,
                logging: false
            });
            document.body.removeChild(captureDiv);

            canvas.toBlob((blob) => {
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.download = `Equipo_${String(equipo.numero).replace(/\s+/g, '_')}_${new Date().getTime()}.png`;
                link.href = url;
                link.click();
                URL.revokeObjectURL(url);
                UIService.showStatus('Imagen capturada y descargada correctamente', 'success');
            });
        } catch (error) {
            console.error('Error al capturar imagen del equipo:', error);
            UIService.showStatus('Error al capturar imagen: ' + error.message, 'error');
        } finally {
            UIService.showLoading(false);
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
                width: 440px;
                font-family: Arial, sans-serif;
                border: 2px solid #2c3e50;
                border-radius: 10px;
            `;

            // Recopilar equipos del grupo con detalle de facturas
            let equiposHTML = '';
            let totalGrupo = 0;

            let procesadosVisual = new Set();
            for (const equipoKey of grupo.equipos) {
                let equipoEncontrado = this.getEquipoData(equipoKey);

                if (equipoEncontrado && equipoEncontrado.total > 0) {
                    if (!procesadosVisual.has(equipoEncontrado)) {
                        procesadosVisual.add(equipoEncontrado);
                        totalGrupo += equipoEncontrado.total;
                        equiposHTML += this.buildEquipoCaptureHTML(equipoEncontrado, true);
                    }
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

        // ITERAR DEL 0 AL 130 PARA INCLUIR EQUIPO 0 (ej. 0 - Cliente) Y TODOS LOS LUGARES DISPONIBLES
        for (let i = 0; i <= 130; i++) {
            const numeroStr = i.toString();

            // 1. Buscar si hay variantes con deuda para este número (ej: "0-Jolman", "1-Cedros")
            const variantes = [];
            let existeGenericoConDeuda = false;

            this.equiposPendientes.forEach((equipo, key) => {
                // Comparación estricta por texto para evitar que "" o "0000" coincidan con 0
                if (String(equipo.numero).trim() === numeroStr) {
                    const esGenerico = !equipo.cliente ||
                        equipo.cliente.trim() === '' ||
                        equipo.cliente === `Equipo ${i}`;

                    variantes.push({
                        key: key,
                        nombre: equipo.cliente || `Equipo ${i}`,
                        total: equipo.total,
                        esGenerico: esGenerico
                    });

                    if (esGenerico) existeGenericoConDeuda = true;
                }
            });

            // También conservar variantes ya seleccionadas en este grupo aunque actualmente tengan deuda $0.00
            selectedSet.forEach(selKey => {
                const selStr = String(selKey);
                const matchesExact = selStr === numeroStr || selStr.startsWith(`${numeroStr}-`);
                if (matchesExact && !variantes.some(v => v.key === selStr)) {
                    const dashIdx = selStr.indexOf('-');
                    const subNombre = dashIdx !== -1 ? selStr.slice(dashIdx + 1) : `Equipo ${i}`;
                    const esGen = subNombre === `Equipo ${i}` || dashIdx === -1;
                    variantes.push({
                        key: selStr,
                        nombre: subNombre,
                        total: 0,
                        esGenerico: esGen
                    });
                    if (esGen) existeGenericoConDeuda = true;
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

                // CORRECCIÓN: Siempre mostrar el número de equipo en la etiqueta (incluyendo el 0)
                const parsedNum = parseInt(key);
                const numeroKey = !isNaN(parsedNum) ? parsedNum : '?';
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
    },

    async openHistorialAbonosModal() {
        const modal = document.getElementById('historial-abonos-modal');
        const listEl = document.getElementById('historial-abonos-list');
        const searchEl = document.getElementById('historial-abonos-search');
        if (!modal || !listEl) return;

        if (searchEl) searchEl.value = '';
        listEl.innerHTML = '<div style="text-align:center; padding:25px; color:#64748b;"><i class="fas fa-spinner fa-spin"></i> Cargando comprobantes de abono...</div>';
        modal.style.display = 'flex';

        try {
            this._savedAbonosCache = await DataService.loadAbonoComprobantes(120);
            this.renderHistorialAbonosList();
        } catch (err) {
            listEl.innerHTML = `<div style="text-align:center; padding:20px; color:#dc2626;">Error cargando comprobantes: ${err.message}</div>`;
        }
    },

    renderHistorialAbonosList() {
        const listEl = document.getElementById('historial-abonos-list');
        if (!listEl) return;
        const q = (document.getElementById('historial-abonos-search')?.value || '').toLowerCase().trim();
        const items = (this._savedAbonosCache || []).filter(c => {
            if (!q) return true;
            return (c.grupoNombre && c.grupoNombre.toLowerCase().includes(q)) ||
                (c.equipoNumber && String(c.equipoNumber).toLowerCase().includes(q)) ||
                (c.invoiceNumber && String(c.invoiceNumber).toLowerCase().includes(q)) ||
                (c.fechaString && c.fechaString.toLowerCase().includes(q)) ||
                (c.tipo && c.tipo.toLowerCase().includes(q));
        });

        if (items.length === 0) {
            listEl.innerHTML = '<div style="text-align:center; padding:25px; color:#64748b;">No hay comprobantes de abono guardados que coincidan.</div>';
            return;
        }

        listEl.innerHTML = items.map(c => {
            const isInd = c.tipo === 'individual';
            const badge = isInd
                ? '<span style="background:#e0f2fe; color:#0369a1; padding:2px 8px; border-radius:12px; font-size:11px; font-weight:700;">Individual</span>'
                : (c.tipo === 'grupo'
                    ? '<span style="background:#ede9fe; color:#6d28d9; padding:2px 8px; border-radius:12px; font-size:11px; font-weight:700;">Masivo Grupo</span>'
                    : '<span style="background:#dcfce7; color:#15803d; padding:2px 8px; border-radius:12px; font-size:11px; font-weight:700;">Masivo Facturas</span>');

            const titulo = isInd
                ? `Factura #${c.invoiceNumber || ''} — Eq. ${c.equipoNumber || ''}`
                : (c.tipo === 'grupo'
                    ? `Grupo: ${c.grupoNombre || 'Grupo'}`
                    : `Equipo ${c.equipoNumber || ''} ${c.grupoNombre ? '(' + c.grupoNombre + ')' : ''}`);

            const monto = isInd ? Number(c.monto || 0) : Number(c.abonoTotal || 0);
            const saldoNuevo = isInd ? Number(c.nuevoSaldo || 0) : Number(c.nuevoSaldoTotal || 0);

            return `
                <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; padding:10px 12px; border:1px solid #e2e8f0; border-radius:8px; margin-bottom:8px; background:#fff;">
                    <div style="flex:1;">
                        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:3px;">
                            ${badge}
                            <strong style="color:#0f172a; font-size:14px;">${titulo}</strong>
                        </div>
                        <div style="font-size:12px; color:#64748b;">
                            ${c.fechaString || c.fechaTicket || ''} &bull; Nuevo saldo: <strong>$${saldoNuevo.toFixed(2)}</strong>
                        </div>
                    </div>
                    <div style="text-align:right; display:flex; align-items:center; gap:10px;">
                        <span style="font-size:15px; font-weight:800; color:#059669;">$${monto.toFixed(2)}</span>
                        <button type="button" class="btn btn-info" onclick="GrupoManager.reprintSavedAbono('${c.id}')" style="padding:6px 12px; font-size:12px; font-weight:700;">
                            <i class="fas fa-print"></i> Reimprimir
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    },

    reprintSavedAbono(id) {
        const comp = (this._savedAbonosCache || []).find(c => c.id === id);
        if (!comp) return;
        if (comp.tipo === 'individual') {
            PrintingService.printAbonoTicket(
                {
                    invoiceNumber: comp.invoiceNumber,
                    clientName: comp.clientName,
                    equipoNumber: comp.equipoNumber,
                    saldoPendiente: comp.saldoAnterior,
                    total: comp.saldoAnterior
                },
                {
                    monto: Number(comp.monto || 0),
                    fecha: comp.timestamp || new Date()
                },
                Number(comp.nuevoSaldo || 0)
            );
        } else {
            PrintingService.printBulkAbonoTicket(comp);
        }
    },

    mostrarModalImprimirAbono(summaryHtml, printFn) {
        const confirmModal = document.getElementById('abono-print-confirm-modal');
        const summaryEl = document.getElementById('abono-print-confirm-summary');
        const printBtn = document.getElementById('abono-print-confirm-btn');
        if (!confirmModal || !summaryEl || !printBtn) {
            if (typeof printFn === 'function') printFn();
            return;
        }
        summaryEl.innerHTML = summaryHtml;
        printBtn.onclick = () => {
            const printed = typeof printFn === 'function' ? printFn() : true;
            if (printed !== false) {
                confirmModal.style.display = 'none';
            }
        };
        confirmModal.style.display = 'flex';
    }
};
