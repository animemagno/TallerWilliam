import { AppState } from '../store/AppState.js';
import { DataService } from '../services/DataService.js';
import { UIService, ModalService } from '../services/UIService.js';
import { PrintService } from '../services/PrintService.js';
import { ErrorHandler } from '../utils/ErrorHandler.js';
import { MemoryManager } from '../utils/MemoryManager.js';
import { SalesService } from '../services/SalesService.js';

export const GrupoManager = {
    grupos: new Map(),
    equiposPendientes: new Map(),
    currentEditingGroup: null,
    currentGrupoDetalle: null,
    unsubscribe: null,
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
                await this.loadEquiposPendientes(true); // Force update
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

    async actualizarTotalesGrupos(force = false) {
        try {
            const now = Date.now();
            if (!force && this.lastUpdateTime && (now - this.lastUpdateTime < 30000)) {
                return;
            }

            const batch = AppState.db.batch();
            let updatesCount = 0;

            for (const [grupoId, grupo] of this.grupos.entries()) {
                const cacheKey = `${grupoId}-${grupo.equipos.join('-')}`;
                const cachedTotal = this.totalesCache.get(cacheKey);

                let nuevoTotal = 0;
                let needsUpdate = false;

                if (!cachedTotal) {
                    for (const equipoNum of grupo.equipos) {
                        let equipoEncontrado = null;
                        this.equiposPendientes.forEach((equipo, key) => {
                            if (equipo.numero === equipoNum && equipo.total > 0) {
                                equipoEncontrado = equipo;
                            }
                        });

                        if (equipoEncontrado) {
                            nuevoTotal += equipoEncontrado.total;
                        }
                    }
                    this.totalesCache.set(cacheKey, nuevoTotal);
                    needsUpdate = true;
                } else {
                    nuevoTotal = cachedTotal;
                }

                if (grupo.total !== nuevoTotal && needsUpdate) {
                    grupo.total = nuevoTotal;

                    if (AppState.firebaseInitialized) {
                        try {
                            const grupoRef = AppState.db.collection("GRUPOS").doc(grupoId);
                            batch.update(grupoRef, {
                                total: nuevoTotal,
                                fechaActualizacion: new Date()
                            });
                            updatesCount++;

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

            if (updatesCount > 0) {
                await batch.commit();
            }

            this.lastUpdateTime = now;
            MemoryManager.cleanupIfNeeded(this.totalesCache);

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
                    const key = `${equipo}-${cliente}`;

                    if (!this.equiposPendientes.has(key)) {
                        this.equiposPendientes.set(key, {
                            numero: equipo,
                            cliente: cliente,
                            total: 0,
                            facturas: []
                        });
                    }

                    const equipoData = this.equiposPendientes.get(key);
                    equipoData.facturas.push({
                        id: doc.id,
                        ...venta,
                        saldoPendiente: saldoPendiente
                    });
                    equipoData.total += saldoPendiente;
                }
            });

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

            const equiposConFacturas = equiposSeleccionados.filter(equipoNum => {
                let tieneFacturas = false;
                this.equiposPendientes.forEach((equipo, key) => {
                    if (equipo.numero === equipoNum && equipo.total > 0) {
                        tieneFacturas = true;
                    }
                });
                return tieneFacturas;
            });

            if (equiposConFacturas.length === 0) {
                throw new Error("Los equipos seleccionados no tienen facturas pendientes");
            }

            let totalGrupo = 0;
            equiposConFacturas.forEach(equipoNum => {
                this.equiposPendientes.forEach((equipo, key) => {
                    if (equipo.numero === equipoNum) {
                        totalGrupo += equipo.total;
                    }
                });
            });

            const grupoData = {
                nombre: nombre,
                equipos: equiposConFacturas,
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

            for (const equipoNum of equiposConFacturas) {
                this.equiposPendientes.forEach(async (equipo, key) => {
                    if (equipo.numero === equipoNum) {
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
                });
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

            const equiposConFacturas = equiposSeleccionados.filter(equipoNum => {
                let tieneFacturas = false;
                this.equiposPendientes.forEach((equipo, key) => {
                    if (equipo.numero === equipoNum && equipo.total > 0) {
                        tieneFacturas = true;
                    }
                });
                return tieneFacturas;
            });

            let totalGrupo = 0;
            equiposConFacturas.forEach(equipoNum => {
                this.equiposPendientes.forEach((equipo, key) => {
                    if (equipo.numero === equipoNum) {
                        totalGrupo += equipo.total;
                    }
                });
            });

            const grupoData = {
                nombre: nombre,
                equipos: equiposConFacturas,
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

            for (const equipoNum of equiposConFacturas) {
                this.equiposPendientes.forEach(async (equipo, key) => {
                    if (equipo.numero === equipoNum) {
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
                });
            }

            const grupoOriginal = this.grupos.get(grupoId);
            if (grupoOriginal) {
                for (const equipoNum of grupoOriginal.equipos) {
                    if (!equiposConFacturas.includes(equipoNum)) {
                        this.equiposPendientes.forEach(async (equipo, key) => {
                            if (equipo.numero === equipoNum) {
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
                        });
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

    async solicitarEliminarGrupo(grupoId) {
        if (!confirm("¿Está seguro de eliminar este grupo? Los equipos volverán a estar disponibles individualmente.")) {
            return;
        }
        try {
            UIService.showLoading(true);
            await this.eliminarGrupo(grupoId);
            UIService.showStatus("Grupo eliminado correctamente", "success");
        } catch (error) {
            UIService.showStatus("Error al eliminar grupo: " + error.message, "error");
        } finally {
            UIService.showLoading(false);
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
                    this.equiposPendientes.forEach(async (equipo, key) => {
                        if (equipo.numero === equipoNum) {
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
                    });
                }
            }

            await ErrorHandler.withRetry(
                () => AppState.db.collection("GRUPOS").doc(grupoId).delete(),
                3,
                "Eliminación de grupo"
            );

            this.grupos.delete(grupoId);
            this.totalesCache.clear();

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
        this.equiposPendientes.forEach((equipo, key) => {
            let tieneGrupo = false;
            this.grupos.forEach(grupo => {
                if (grupo.equipos.includes(equipo.numero)) {
                    tieneGrupo = true;
                }
            });
            if (!tieneGrupo && equipo.total > 0) {
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
        this.renderEquiposIndividuales();
        this.renderGruposVisual();
    },

    renderEquiposIndividuales() {
        const container = document.getElementById('equipos-individuales');
        const emptyState = document.getElementById('empty-equipos');
        const equiposSinGrupo = this.getEquiposSinGrupo();

        if (equiposSinGrupo.size === 0) {
            if (emptyState) emptyState.style.display = 'block';
            if (container) container.innerHTML = '';
            return;
        }

        if (emptyState) emptyState.style.display = 'none';

        const equiposOrdenados = Array.from(equiposSinGrupo.entries())
            .sort(([a], [b]) => {
                const numA = parseInt(a.split('-')[0]);
                const numB = parseInt(b.split('-')[0]);
                return numA - numB;
            });

        let html = '';
        equiposOrdenados.forEach(([key, equipo]) => {
            const mostrarNombre = equipo.cliente && !equipo.cliente.startsWith('Equipo ');
            html += `
                <div class="equipo-card" onclick="GrupoManager.mostrarDetalleEquipo('${key}')">
                    <div class="equipo-number">${equipo.numero}</div>
                    ${mostrarNombre ? `<div class="equipo-nombre">${equipo.cliente}</div>` : ''}
                    <div class="equipo-total">$${equipo.total.toFixed(2)}</div>
                </div>
            `;
        });

        if (container) container.innerHTML = html;
    },

    renderGruposVisual() {
        const container = document.getElementById('grupos-container');
        if (!container) return;

        if (this.grupos.size === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-users"></i>
                    <div>No hay grupos creados</div>
                    <div style="font-size: 0.8rem; margin-top: 5px; color: #999;">Crea tu primer grupo para organizar los equipos</div>
                </div>
            `;
            return;
        }

        const gruposOrdenados = Array.from(this.grupos.values())
            .filter(grupo => grupo.activo)
            .sort((a, b) => a.nombre.localeCompare(b.nombre));

        let html = '';
        gruposOrdenados.forEach(grupo => {
            let equiposHTML = '';
            grupo.equipos.forEach(equipoNum => {
                let equipoEncontrado = null;
                this.equiposPendientes.forEach((equipo, key) => {
                    if (equipo.numero === equipoNum && equipo.total > 0) {
                        equipoEncontrado = equipo;
                    }
                });

                if (equipoEncontrado) {
                    equiposHTML += `
                        <div class="grupo-equipo-item" onclick="GrupoManager.mostrarDetalleEquipo('${equipoEncontrado.numero}-${equipoEncontrado.cliente}')">
                            <div class="grupo-equipo-number">${equipoEncontrado.numero}</div>
                            <div class="grupo-equipo-total">$${equipoEncontrado.total.toFixed(2)}</div>
                        </div>
                    `;
                }
            });

            html += `
                <div class="grupo-card">
                    <div class="grupo-actions">
                        <button class="grupo-action-btn btn-detalle-grupo" onclick="GrupoManager.mostrarDetalleGrupoCompleto('${grupo.id}')" title="Ver detalles">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="grupo-action-btn btn-edit-grupo" onclick="GrupoManager.editarGrupo('${grupo.id}')" title="Editar grupo">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="grupo-action-btn btn-info" onclick="GrupoManager.showGroupPaymentModal('${grupo.id}')" title="Abonar a Grupo" style="background-color: #17a2b8; color: white;">
                            <i class="fas fa-money-bill-wave"></i>
                        </button>
                        <button class="grupo-action-btn btn-delete-grupo" onclick="GrupoManager.solicitarEliminarGrupo('${grupo.id}')" title="Eliminar grupo">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                    <div class="grupo-header">
                        <div class="grupo-name">${grupo.nombre}</div>
                    </div>
                    <div class="grupo-equipos-grid">
                        ${equiposHTML}
                    </div>
                    <div class="grupo-total">
                        Total: $${grupo.total.toFixed(2)}
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    },

    mostrarDetalleEquipo(key) {
        const equipo = this.equiposPendientes.get(key);
        AppState.selectedInvoicesForPayment = new Set();

        let facturasHTML = '';
        if (equipo) {
            const sortedFacturas = [...equipo.facturas].sort((a, b) => {
                const dateA = a.timestamp ? (a.timestamp.toDate ? a.timestamp.toDate() : new Date(a.timestamp)) : new Date(0);
                const dateB = b.timestamp ? (b.timestamp.toDate ? b.timestamp.toDate() : new Date(b.timestamp)) : new Date(0);
                return dateA - dateB;
            });

            facturasHTML = `
                <div style="overflow-x: auto;">
                    <table style="width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 14px;">
                        <thead>
                            <tr style="background-color: #2c3e50; color: white;">
                                <th style="padding: 10px; text-align: center; width: 40px;">
                                    <i class="fas fa-check-square"></i>
                                </th>
                                <th style="padding: 10px; text-align: left;">Factura</th>
                                <th style="padding: 10px; text-align: left;">Productos</th>
                                <th style="padding: 10px; text-align: right;">Total</th>
                                <th style="padding: 10px; text-align: right;">Abonos</th>
                                <th style="padding: 10px; text-align: right;">Saldo</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            sortedFacturas.forEach((factura, index) => {
                let productosHTML = '';
                if (factura.products && factura.products.length > 0) {
                    productosHTML = `<table style="width: 100%; font-size: 12px; border-collapse: collapse;">`;
                    factura.products.forEach(producto => {
                        const totalProducto = (producto.precio * producto.cantidad).toFixed(2);
                        productosHTML += `
                            <tr>
                                <td style="width: 35px; text-align: center; vertical-align: top; color: #2c3e50; font-weight: bold; padding: 2px;">${producto.cantidad}</td>
                                <td style="vertical-align: top; padding: 2px;">${producto.descripcion}</td>
                                <td style="text-align: right; vertical-align: top; font-weight: bold; color: #555; padding: 2px; width: 60px;">$${totalProducto}</td>
                            </tr>
                        `;
                    });
                    productosHTML += `</table>`;
                }
                const saldoPendiente = factura.saldoPendiente !== undefined ? factura.saldoPendiente : factura.total;

                let abonosHTML = '-';
                if (factura.abonos && factura.abonos.length > 0) {
                    abonosHTML = '';
                    factura.abonos.forEach(abono => {
                        const fechaAbono = abono.fecha ? new Date(abono.fecha.toDate ? abono.fecha.toDate() : abono.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }) : 'N/A';
                        abonosHTML += `<div style="font-size: 11px; color: #27ae60;">+$${abono.monto.toFixed(2)} (${fechaAbono})</div>`;
                    });
                }

                const rowStyle = index % 2 === 0 ? 'background-color: #f9f9f9;' : 'background-color: #ffffff;';

                facturasHTML += `
                    <tr style="${rowStyle} border-bottom: 1px solid #ddd;">
                        <td style="padding: 8px; text-align: center;">
                            <input type="checkbox" class="invoice-checkbox" data-id="${factura.id}" 
                                   onchange="GrupoManager.toggleInvoiceSelection('${factura.id}')" 
                                   style="width: 18px; height: 18px; cursor: pointer;">
                        </td>
                        <td style="padding: 8px; font-weight: bold; color: #2c3e50;">
                            #${factura.invoiceNumber}
                            <div style="font-size: 11px; color: #95a5a6; font-weight: normal;">
                                ${factura.timestamp ? new Date(factura.timestamp.toDate ? factura.timestamp.toDate() : factura.timestamp).toLocaleDateString('es-ES') : ''}
                            </div>
                        </td>
                        <td style="padding: 8px;">${productosHTML}</td>
                        <td style="padding: 8px; text-align: right; font-weight: bold;">$${factura.total.toFixed(2)}</td>
                        <td style="padding: 8px; text-align: right;">${abonosHTML}</td>
                        <td style="padding: 8px; text-align: right; font-weight: bold; color: #e74c3c;">$${saldoPendiente.toFixed(2)}</td>
                    </tr>
                `;
            });

            facturasHTML += `</tbody></table></div>`;
        }

        const modalContent = `
            <h3 style="margin-bottom: 15px; text-align: center; color: #2c3e50;">
                <i class="fas fa-tools"></i> Equipo ${equipo.numero}
            </h3>
            <div class="detalle-equipo" style="background: #f8f9fa; padding: 15px; border-radius: 8px; border: 1px solid #e9ecef; display: flex; justify-content: space-around; flex-wrap: wrap; gap: 10px;">
                <div><strong><i class="fas fa-user"></i> Cliente:</strong> ${equipo.cliente}</div>
                <div><strong><i class="fas fa-file-invoice-dollar"></i> Facturas:</strong> ${equipo ? equipo.facturas.length : 0}</div>
                <div style="font-size: 1.1em; color: #e74c3c;"><strong><i class="fas fa-money-bill-wave"></i> Total Pendiente:</strong> $${equipo ? equipo.total.toFixed(2) : '0.00'}</div>
            </div>
            
            <div style="margin: 15px 0; text-align: right;">
                <button class="btn btn-info" id="pay-selected-btn" onclick="GrupoManager.showBulkPaymentModal()" style="display: none; background-color: #3498db; border: none; padding: 8px 15px; border-radius: 5px; color: white; font-weight: bold; cursor: pointer; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
                    <i class="fas fa-check-circle"></i> ABONAR SELECCIONADAS
                </button>
            </div>

            <div class="grupo-facturas">
                ${facturasHTML || '<p style="text-align: center; padding: 20px; color: #7f8c8d;">No hay facturas pendientes para este equipo</p>'}
            </div>
        `;

        const contentEl = document.getElementById('detalle-modal-content');
        const modalEl = document.getElementById('detalle-modal');
        if (contentEl) contentEl.innerHTML = modalContent;
        if (modalEl) modalEl.style.display = 'block';
        AppState.currentDetalle = { tipo: 'equipo', data: key };
    },

    toggleInvoiceSelection(invoiceId) {
        if (AppState.selectedInvoicesForPayment.has(invoiceId)) {
            AppState.selectedInvoicesForPayment.delete(invoiceId);
        } else {
            AppState.selectedInvoicesForPayment.add(invoiceId);
        }

        const btn = document.getElementById('pay-selected-btn');
        if (btn) {
            if (AppState.selectedInvoicesForPayment.size > 0) {
                btn.style.display = 'inline-block';
                btn.textContent = `ABONAR (${AppState.selectedInvoicesForPayment.size})`;
            } else {
                btn.style.display = 'none';
            }
        }
    },

    showBulkPaymentModal() {
        if (AppState.selectedInvoicesForPayment.size === 0) return;

        const modal = document.getElementById('bulk-abono-modal');
        const info = document.getElementById('bulk-abono-info');

        if (info) {
            info.innerHTML = `
                <strong>Facturas Seleccionadas:</strong> ${AppState.selectedInvoicesForPayment.size}<br>
                Ingrese el monto total a abonar. Se distribuirá entre las facturas seleccionadas (más antiguas primero).
            `;
        }

        const input = document.getElementById('monto-bulk-abono');
        if (input) input.value = '';
        if (modal) modal.style.display = 'block';

        const processBtn = document.getElementById('process-bulk-abono-btn');
        if (processBtn) {
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
                    if (modal) modal.style.display = 'none';
                    const detalleModal = document.getElementById('detalle-modal');
                    if (detalleModal) detalleModal.style.display = 'none';
                    AppState.selectedInvoicesForPayment.clear();

                } catch (error) {
                    UIService.showStatus("Error: " + error.message, "error");
                } finally {
                    UIService.showLoading(false);
                    processBtn.disabled = false;
                }
            };
        }
    },

    showGroupPaymentModal(grupoId) {
        const grupo = this.grupos.get(grupoId);
        if (!grupo) return;

        const modal = document.getElementById('bulk-abono-modal');
        const info = document.getElementById('bulk-abono-info');

        if (info) {
            info.innerHTML = `
                <strong>Abonar a Grupo:</strong> ${grupo.nombre}<br>
                <strong>Total Pendiente del Grupo:</strong> $${grupo.total.toFixed(2)}<br>
                Ingrese el monto total a abonar. Se distribuirá entre las facturas más antiguas del grupo.
            `;
        }

        const input = document.getElementById('monto-bulk-abono');
        if (input) input.value = '';
        if (modal) modal.style.display = 'block';

        const processBtn = document.getElementById('process-bulk-abono-btn');
        if (processBtn) {
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
                    await SalesService.processGroupAbono(grupoId, monto);

                    UIService.showStatus(`Abono de $${monto.toFixed(2)} aplicado al grupo correctamente`, "success");
                    if (modal) modal.style.display = 'none';

                } catch (error) {
                    UIService.showStatus("Error: " + error.message, "error");
                } finally {
                    UIService.showLoading(false);
                    processBtn.disabled = false;
                }
            };
        }
    },

    showGroupPaymentModalSelector() {
        const gruposActivos = Array.from(this.grupos.values()).filter(g => g.activo && g.total > 0);

        if (gruposActivos.length === 0) {
            UIService.showStatus("No hay grupos con saldo pendiente", "info");
            return;
        }

        let options = gruposActivos.map(g => `<option value="${g.id}">${g.nombre} ($${g.total.toFixed(2)})</option>`).join('');

        const modalContent = `
            <h3 style="text-align: center; margin-bottom: 15px;">Seleccionar Grupo</h3>
            <div class="form-group">
                <label>Grupo:</label>
                <select id="grupo-selector-abono" style="width: 100%; padding: 8px;">
                    ${options}
                </select>
            </div>
            <div style="margin-top: 15px;">
                <button class="btn btn-success" style="width: 100%;" id="continue-group-abono">CONTINUAR</button>
            </div>
         `;

        UIService.showInvoiceModal(modalContent);

        const continueBtn = document.getElementById('continue-group-abono');
        if (continueBtn) {
            continueBtn.onclick = () => {
                const grupoId = document.getElementById('grupo-selector-abono').value;
                ModalService.closeInvoiceModal();
                this.showGroupPaymentModal(grupoId);
            };
        }
    },

    mostrarDetalleGrupoCompleto(grupoId) {
        const grupo = this.grupos.get(grupoId);
        if (!grupo) return;

        this.currentGrupoDetalle = grupo;

        let equiposHTML = '';
        let totalGeneral = 0;
        let totalPendiente = 0;
        let cantidadFacturas = 0;
        let tieneAbonos = false;

        for (const equipoNum of grupo.equipos) {
            let equipoEncontrado = null;
            this.equiposPendientes.forEach((equipo, key) => {
                if (equipo.numero === equipoNum && equipo.total > 0) {
                    equipoEncontrado = equipo;
                }
            });

            if (equipoEncontrado) {
                totalGeneral += equipoEncontrado.total;
                cantidadFacturas += equipoEncontrado.facturas.length;

                let facturasHTML = '';
                equipoEncontrado.facturas.forEach(factura => {
                    const saldoPendiente = factura.saldoPendiente !== undefined ? factura.saldoPendiente : factura.total;
                    totalPendiente += saldoPendiente;

                    if (factura.abonos && factura.abonos.length > 0) {
                        tieneAbonos = true;
                    }

                    let productosHTML = '';
                    if (factura.products && factura.products.length > 0) {
                        factura.products.forEach(producto => {
                            productosHTML += `
                                <div class="producto-item">
                                    <div>${producto.descripcion} x${producto.cantidad}</div>
                                    <div>$${(producto.precio * producto.cantidad).toFixed(2)}</div>
                                </div>
                            `;
                        });
                    }

                    facturasHTML += `
                        <div class="grupo-detalle-factura">
                            <div><strong>Factura:</strong> ${factura.invoiceNumber}</div>
                            <div><strong>Fecha:</strong> ${new Date(factura.timestamp.toDate ? factura.timestamp.toDate() : factura.timestamp).toLocaleDateString('es-ES')}</div>
                            <div><strong>Total:</strong> $${factura.total.toFixed(2)}</div>
                            ${factura.abonos && factura.abonos.length > 0 ? `<div><strong>Saldo Pendiente:</strong> $${saldoPendiente.toFixed(2)}</div>` : ''}
                            <div><strong>Productos:</strong></div>
                            ${productosHTML}
                        </div>
                    `;
                });

                equiposHTML += `
                    <div class="grupo-detalle-equipo">
                        <h4>Equipo ${equipoEncontrado.numero} - ${equipoEncontrado.cliente}</h4>
                        <div><strong>Total:</strong> $${equipoEncontrado.total.toFixed(2)}</div>
                        <div><strong>Facturas:</strong> ${equipoEncontrado.facturas.length}</div>
                        ${facturasHTML}
                    </div>
                `;
            }
        }

        const modalContent = `
            <h3 style="margin-bottom: 15px; text-align: center;">${grupo.nombre} - Detalles Completos</h3>
            <div class="grupo-resumen">
                <div><strong>Total del Grupo:</strong> $${totalGeneral.toFixed(2)}</div>
                ${tieneAbonos ? `<div><strong>Saldo Pendiente:</strong> $${totalPendiente.toFixed(2)}</div>` : ''}
                <div><strong>Número de Equipos:</strong> ${grupo.equipos.length}</div>
                <div><strong>Total de Facturas:</strong> ${cantidadFacturas}</div>
            </div>
            <div class="grupo-facturas">
                <h4>Detalles por Equipo:</h4>
                ${equiposHTML || '<p>No hay equipos con facturas pendientes en este grupo</p>'}
            </div>
        `;

        const contentEl = document.getElementById('grupo-detalle-modal-content');
        const modalEl = document.getElementById('grupo-detalle-modal');
        if (contentEl) contentEl.innerHTML = modalContent;
        if (modalEl) modalEl.style.display = 'block';
    },

    imprimirGrupoCompleto() {
        const grupo = this.currentGrupoDetalle;
        if (!grupo) return;

        for (const equipoNum of grupo.equipos) {
            let equipoEncontrado = null;
            this.equiposPendientes.forEach((equipo, key) => {
                if (equipo.numero === equipoNum && equipo.total > 0) {
                    equipoEncontrado = equipo;
                }
            });

            if (equipoEncontrado) {
                equipoEncontrado.facturas.forEach(factura => {
                    PrintService.printTicket(factura); // Usamos PrintService en lugar de this.imprimirTicketFactura
                });
            }
        }
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

    generarGridEquipos(modalType = 'crear') {
        const grid = document.getElementById(modalType === 'crear' ? 'all-equipos-grid' : 'editar-all-equipos-grid');
        if (!grid) return;

        const equiposEnGrupos = this.getEquiposEnGrupos();
        const selectedSet = modalType === 'crear' ? AppState.equiposSeleccionados : AppState.equiposEditSeleccionados;

        let html = '';

        for (let i = 1; i <= 130; i++) {
            const equipoNum = i.toString();
            let equipoEncontrado = null;
            this.equiposPendientes.forEach((equipo, key) => {
                if (equipo.numero === equipoNum && equipo.total > 0) {
                    equipoEncontrado = equipo;
                }
            });

            const tieneFacturas = equipoEncontrado && equipoEncontrado.facturas.length > 0;
            const estaSeleccionado = selectedSet.has(equipoNum);
            const estaEnOtroGrupo = equiposEnGrupos.has(equipoNum) &&
                (modalType === 'crear' ||
                    (modalType === 'editar' && this.currentEditingGroup &&
                        !this.currentEditingGroup.equipos.includes(equipoNum)));

            let estilo = '';
            if (estaEnOtroGrupo) {
                estilo = 'equipo-en-grupo';
            } else if (tieneFacturas) {
                estilo = 'has-facturas';
            }

            html += `
                <div class="all-equipo-item ${estilo} ${estaSeleccionado ? 'selected' : ''}" 
                     onclick="${estaEnOtroGrupo ? '' : `toggleEquipoGrid('${equipoNum}', '${modalType}')`}"
                     style="${tieneFacturas && !estaEnOtroGrupo ? 'border-color: #27ae60; background: #f0fff0;' : ''}${estaEnOtroGrupo ? 'border-color: #e74c3c; background: #f8d7da; color: #721c24; cursor: not-allowed;' : 'border-color: #ccc; background: #f5f5f5;'}">
                    ${equipoNum}
                    ${tieneFacturas ? '<br><small style="color: #27ae60;">$' + equipoEncontrado.total.toFixed(2) + '</small>' : '<br><small style="color: #999;">$0.00</small>'}
                    ${estaEnOtroGrupo ? '<br><small style="color: #e74c3c; font-size: 0.6rem;">EN GRUPO</small>' : ''}
                </div>
            `;
        }

        grid.innerHTML = html;
    },

    actualizarListaSeleccionados(modalType = 'crear') {
        const selectedList = document.getElementById(modalType === 'crear' ? 'selected-equipos-list' : 'editar-selected-equipos-list');
        const contador = document.getElementById(modalType === 'crear' ? 'contador-equipos' : 'editar-contador-equipos');
        const selectedSet = modalType === 'crear' ? AppState.equiposSeleccionados : AppState.equiposEditSeleccionados;

        if (contador) contador.textContent = selectedSet.size;

        if (selectedList) {
            if (selectedSet.size === 0) {
                selectedList.innerHTML = '<div style="color: #999; text-align: center; font-size: 0.8rem;">No hay equipos seleccionados</div>';
            } else {
                let badgesHTML = '';
                const equiposOrdenados = Array.from(selectedSet).sort((a, b) => parseInt(a) - parseInt(b));

                equiposOrdenados.forEach(num => {
                    let equipoEncontrado = null;
                    this.equiposPendientes.forEach((equipo, key) => {
                        if (equipo.numero === num && equipo.total > 0) {
                            equipoEncontrado = equipo;
                        }
                    });

                    if (equipoEncontrado) {
                        badgesHTML += `<span class="selected-equipo-badge">${num} ($${equipoEncontrado.total.toFixed(2)})</span>`;
                    } else {
                        badgesHTML += `<span class="selected-equipo-badge" style="background: #95a5a6;">${num} ($0.00)</span>`;
                    }
                });
                selectedList.innerHTML = badgesHTML;
            }
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

        const nombreInput = document.getElementById('editar-nombre-grupo');
        if (nombreInput) nombreInput.value = grupo.nombre;

        this.generarGridEquipos('editar');
        this.actualizarListaSeleccionados('editar');

        const modal = document.getElementById('editar-grupo-modal');
        if (modal) modal.style.display = 'block';
    },

    async actualizarGrupoDesdeModal() {
        const grupo = this.currentEditingGroup;
        if (!grupo) {
            UIService.showStatus("No hay grupo seleccionado para editar", "error");
            return;
        }

        const nombreInput = document.getElementById('editar-nombre-grupo');
        const nombre = nombreInput ? nombreInput.value.trim() : '';

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

            const modal = document.getElementById('editar-grupo-modal');
            if (modal) modal.style.display = 'none';

            this.currentEditingGroup = null;
            AppState.equiposEditSeleccionados.clear();
        } catch (error) {
            UIService.showStatus("Error al actualizar grupo: " + error.message, "error");
        }
    }
};
