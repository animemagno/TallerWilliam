/**
 * FACTURAS MANAGER
 * Gestión de equipos y grupos con impresión directa de estados de cuenta
 */

const FacturasManager = {
    /**
     * Carga y renderiza todos los equipos con facturas pendientes
     */
    async cargarEquiposPendientes() {
        try {
            const container = document.getElementById('equipos-individuales');
            const emptyState = document.getElementById('empty-equipos');

            if (!container) return;

            // Consultar ventas pendientes
            const ventasSnapshot = await db.collection('ventas')
                .where('paymentType', '==', 'pendiente')
                .orderBy('timestamp', 'desc')
                .get();

            // Agrupar por equipo
            const equipos = {};

            ventasSnapshot.forEach(doc => {
                const venta = doc.data();
                const equipoNum = venta.equipoNumber;
                const saldo = venta.saldoPendiente !== undefined ? venta.saldoPendiente : venta.total;

                if (saldo > 0) {
                    if (!equipos[equipoNum]) {
                        equipos[equipoNum] = {
                            number: equipoNum,
                            clientName: venta.clientName,
                            facturas: [],
                            saldoTotal: 0,
                            ultimoMovimiento: venta.timestamp
                        };
                    }

                    equipos[equipoNum].facturas.push({
                        id: doc.id,
                        ...venta,
                        saldo: saldo
                    });
                    equipos[equipoNum].saldoTotal += saldo;
                }
            });

            const equiposArray = Object.values(equipos);

            if (equiposArray.length === 0) {
                container.style.display = 'none';
                emptyState.style.display = 'block';
                return;
            }

            container.style.display = 'grid';
            emptyState.style.display = 'none';

            // Renderizar equipos
            container.innerHTML = equiposArray.map(equipo => this.renderEquipoCard(equipo)).join('');

        } catch (error) {
            console.error('Error cargando equipos:', error);
            if (typeof UIService !== 'undefined') {
                UIService.showStatus('Error al cargar facturas pendientes', 'error');
            }
        }
    },

    /**
     * Renderiza la tarjeta de un equipo
     */
    renderEquipoCard(equipo) {
        const ultimaFecha = equipo.ultimoMovimiento ?
            new Date(equipo.ultimoMovimiento.toDate()).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }) :
            'N/A';

        return `
            <div class="equipo-card" data-equipo="${equipo.number}">
                <div class="equipo-header">
                    <div>
                        <strong style="font-size: 1.2rem;">EQUIPO ${equipo.number}</strong>
                        <div style="font-size: 0.8rem; color: #666; margin-top: 4px;">
                            ${equipo.clientName !== equipo.number ? equipo.clientName : ''}
                        </div>
                    </div>
                    <div class="saldo-badge" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 8px 12px; border-radius: 8px; font-weight: bold;">
                        $${equipo.saldoTotal.toFixed(2)}
                    </div>
                </div>
                
                <div style="padding: 12px; border-top: 1px solid #eee;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 0.9rem;">
                        <span style="color: #666;">Facturas:</span>
                        <strong>${equipo.facturas.length}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 0.9rem;">
                        <span style="color: #666;">Última factura:</span>
                        <strong>${ultimaFecha}</strong>
                    </div>
                </div>

                <div class="equipo-actions" style="display: flex; gap: 6px; padding: 12px; border-top: 1px solid #eee; flex-wrap: wrap;">
                    <button 
                        class="btn btn-info btn-sm" 
                        onclick="FacturasManager.imprimirEstadoCuentaEquipo('${equipo.number}')"
                        title="Imprimir estado de cuenta"
                        style="flex: 1; min-width: 120px;">
                        <i class="fas fa-print"></i> Imprimir
                    </button>
                    <button 
                        class="btn btn-success btn-sm" 
                        onclick="FacturasManager.abonarEquipo('${equipo.number}')"
                        title="Realizar abono"
                        style="flex: 1; min-width: 120px;">
                        <i class="fas fa-dollar-sign"></i> Abonar
                    </button>
                </div>
            </div>
        `;
    },

    /**
     * Imprime el estado de cuenta de un equipo directamente
     */
    async imprimirEstadoCuentaEquipo(equipoNumber) {
        try {
            if (typeof UIService !== 'undefined') UIService.showLoading(true);

            const estadoCuenta = await EstadoCuentaService.obtenerEstadoCuentaEquipo(equipoNumber);
            EstadoCuentaService.imprimirEstadoCuenta(estadoCuenta);

            if (typeof UIService !== 'undefined') UIService.showLoading(false);
        } catch (error) {
            console.error('Error:', error);
            if (typeof UIService !== 'undefined') {
                UIService.showLoading(false);
                UIService.showStatus('Error al imprimir estado de cuenta: ' + error.message, 'error');
            } else {
                alert('Error al imprimir estado de cuenta: ' + error.message);
            }
        }
    },

    /**
     * Función para abonar a un equipo (placeholder)
     */
    abonarEquipo(equipoNumber) {
        alert(`Función de abono para equipo ${equipoNumber} - Por implementar`);
        // TODO: Integrar con tu lógica de abonos existente
    }
};

const GruposManager = {
    /**
     * Carga y renderiza todos los grupos
     */
    async cargarGrupos() {
        try {
            const container = document.getElementById('grupos-container');
            if (!container) return;

            // Consultar ventas pendientes agrupadas por clientName
            const ventasSnapshot = await db.collection('ventas')
                .where('paymentType', '==', 'pendiente')
                .orderBy('timestamp', 'desc')
                .get();

            // Agrupar por nombre de cliente (grupo)
            const grupos = {};

            ventasSnapshot.forEach(doc => {
                const venta = doc.data();
                const grupoName = venta.clientName;
                const equipoNum = venta.equipoNumber;
                const saldo = venta.saldoPendiente !== undefined ? venta.saldoPendiente : venta.total;

                // Solo agrupar si clientName !== equipoNumber (es decir, es un grupo real)
                if (saldo > 0 && grupoName !== equipoNum) {
                    if (!grupos[grupoName]) {
                        grupos[grupoName] = {
                            name: grupoName,
                            equipos: new Set(),
                            facturas: [],
                            saldoTotal: 0
                        };
                    }

                    grupos[grupoName].equipos.add(equipoNum);
                    grupos[grupoName].facturas.push({
                        id: doc.id,
                        ...venta,
                        saldo: saldo
                    });
                    grupos[grupoName].saldoTotal += saldo;
                }
            });

            const gruposArray = Object.values(grupos);

            if (gruposArray.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-users"></i>
                        <div>No hay grupos creados</div>
                        <div style="font-size: 0.8rem; margin-top: 5px; color: #999;">
                            Crea tu primer grupo para organizar los equipos
                        </div>
                    </div>
                `;
                return;
            }

            // Renderizar grupos
            container.innerHTML = gruposArray.map(grupo => this.renderGrupoCard(grupo)).join('');

        } catch (error) {
            console.error('Error cargando grupos:', error);
            if (typeof UIService !== 'undefined') {
                UIService.showStatus('Error al cargar grupos', 'error');
            }
        }
    },

    /**
     * Renderiza la tarjeta de un grupo
     */
    renderGrupoCard(grupo) {
        const equiposArray = Array.from(grupo.equipos);

        return `
            <div class="grupo-card" data-grupo="${grupo.name}" style="background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); margin-bottom: 16px;">
                <div class="grupo-header" style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; padding: 16px; border-radius: 12px 12px 0 0; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <strong style="font-size: 1.3rem;">${grupo.name}</strong>
                        <div style="font-size: 0.85rem; margin-top: 4px; opacity: 0.9;">
                            ${equiposArray.length} ${equiposArray.length === 1 ? 'equipo' : 'equipos'}
                        </div>
                    </div>
                    <div style="font-size: 1.5rem; font-weight: 900;">
                        $${grupo.saldoTotal.toFixed(2)}
                    </div>
                </div>
                
                <div style="padding: 12px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 0.9rem;">
                        <span style="color: #666;">Equipos:</span>
                        <strong>${equiposArray.join(', ')}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 0.9rem;">
                        <span style="color: #666;">Total facturas:</span>
                        <strong>${grupo.facturas.length}</strong>
                    </div>
                </div>

                <div class="grupo-actions" style="display: flex; gap: 6px; padding: 12px; border-top: 1px solid #eee; flex-wrap: wrap;">
                    <button 
                        class="btn btn-info btn-sm" 
                        onclick="GruposManager.imprimirEstadoCuentaGrupo('${grupo.name}')"
                        title="Imprimir estado de cuenta del grupo"
                        style="flex: 1; min-width: 120px;">
                        <i class="fas fa-print"></i> Imprimir
                    </button>
                    <button 
                        class="btn btn-success btn-sm" 
                        onclick="GruposManager.abonarGrupo('${grupo.name}')"
                        title="Abonar al grupo"
                        style="flex: 1; min-width: 120px;">
                        <i class="fas fa-hand-holding-usd"></i> Abonar
                    </button>
                </div>
            </div>
        `;
    },

    /**
     * Imprime el estado de cuenta de un grupo directamente
     */
    async imprimirEstadoCuentaGrupo(groupName) {
        try {
            if (typeof UIService !== 'undefined') UIService.showLoading(true);

            const estadoCuenta = await EstadoCuentaService.obtenerEstadoCuentaGrupo(groupName);
            EstadoCuentaService.imprimirEstadoCuenta(estadoCuenta);

            if (typeof UIService !== 'undefined') UIService.showLoading(false);
        } catch (error) {
            console.error('Error:', error);
            if (typeof UIService !== 'undefined') {
                UIService.showLoading(false);
                UIService.showStatus('Error al imprimir estado de cuenta: ' + error.message, 'error');
            } else {
                alert('Error al imprimir estado de cuenta: ' + error.message);
            }
        }
    },

    /**
     * Imprime un resumen consolidado de TODOS los equipos
     * (Función llamada por el botón "IMPRIMIR SALDOS")
     */
    async imprimirSaldosEquipos() {
        try {
            if (typeof UIService !== 'undefined') UIService.showLoading(true);

            // Consultar todas las ventas pendientes
            const ventasSnapshot = await db.collection('ventas')
                .where('paymentType', '==', 'pendiente')
                .orderBy('timestamp', 'desc')
                .get();

            // Agrupar por equipo
            const equipos = {};

            ventasSnapshot.forEach(doc => {
                const venta = doc.data();
                const equipoNum = venta.equipoNumber;
                const saldo = venta.saldoPendiente !== undefined ? venta.saldoPendiente : venta.total;

                if (saldo > 0) {
                    if (!equipos[equipoNum]) {
                        equipos[equipoNum] = {
                            number: equipoNum,
                            facturas: 0,
                            saldo: 0
                        };
                    }

                    equipos[equipoNum].facturas++;
                    equipos[equipoNum].saldo += saldo;
                }
            });

            const equiposArray = Object.values(equipos);

            if (equiposArray.length === 0) {
                if (typeof UIService !== 'undefined') {
                    UIService.showStatus('No hay facturas pendientes para imprimir', 'info');
                    UIService.showLoading(false);
                } else {
                    alert('No hay facturas pendientes para imprimir');
                }
                return;
            }

            // Generar e imprimir ticket
            this.generarTicketConsolidado(equiposArray);

            if (typeof UIService !== 'undefined') UIService.showLoading(false);

        } catch (error) {
            console.error('Error:', error);
            if (typeof UIService !== 'undefined') {
                UIService.showLoading(false);
                UIService.showStatus('Error al imprimir saldos: ' + error.message, 'error');
            } else {
                alert('Error al imprimir saldos: ' + error.message);
            }
        }
    },

    /**
     * Genera el ticket consolidado de todos los equipos
     */
    generarTicketConsolidado(equipos) {
        const printWindow = window.open('', '_blank', 'width=300,height=600');
        const fechaActual = new Date().toLocaleDateString('es-ES', {
            day: '2-digit',
            month: '2-digit',
            year: '2-digit'
        });

        let equiposHTML = '';
        let totalGeneral = 0;

        equipos.forEach(equipo => {
            equiposHTML += `
                <div style="display: flex; justify-content: space-between; margin: 3px 0;">
                    <div>Eq. ${equipo.number} (${equipo.facturas})</div>
                    <div>$${equipo.saldo.toFixed(2)}</div>
                </div>
            `;
            totalGeneral += equipo.saldo;
        });

        const contenido = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Resumen de Saldos</title>
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
                .small-text { font-size: 18px; }
                .saldo-info {
                    background: #f0f0f0;
                    padding: 8px;
                    margin: 8px 0;
                    border-radius: 4px;
                    font-size: 18px;
                    text-align: center;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h3 style="margin: 2px 0; font-size: 26px;">TALLER WILLIAN</h3>
                <div class="small-text">RESUMEN DE SALDOS</div>
                <div class="small-text">${fechaActual}</div>
            </div>
            
            <div class="line"></div>
            
            <div style="margin: 8px 0;">
                <div style="font-size: 18px; margin-bottom: 8px;">EQUIPOS CON SALDO:</div>
                ${equiposHTML}
            </div>
            
            <div class="line"></div>
            
            <div class="saldo-info">
                <div>TOTAL GENERAL:</div>
                <div style="font-size: 26px; margin-top: 4px;">$${totalGeneral.toFixed(2)}</div>
                <div style="font-size: 16px; margin-top: 4px;">${equipos.length} equipos</div>
            </div>
            
            <div style="text-align: center; margin-top: 15px; font-size: 20px;">
                GRACIAS POR PREFERIRNOS
            </div>
        </body>
        </html>
        `;

        printWindow.document.open();
        printWindow.document.write(contenido);
        printWindow.document.close();
        printWindow.focus();

        printWindow.onload = function () {
            setTimeout(() => {
                printWindow.print();
                printWindow.onafterprint = function () {
                    printWindow.close();
                };
            }, 500);
        };

        if (printWindow.document.readyState === 'complete') {
            printWindow.onload();
        }
    },

    /**
     * Función para abonar a un grupo (placeholder)
     */
    abonarGrupo(groupName) {
        alert(`Función de abono para grupo "${groupName}" - Por implementar`);
        // TODO: Integrar con tu lógica de abonos de grupo existente
    }
};

// Inicialización automática de pestañas cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', function () {
    // Sistema de pestañas
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    if (tabButtons.length > 0) {
        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const tabName = button.getAttribute('data-tab');

                // Remover clase active
                tabButtons.forEach(btn => btn.classList.remove('active'));
                tabContents.forEach(content => content.classList.remove('active'));

                // Agregar clase active
                button.classList.add('active');
                const targetTab = document.getElementById(`tab-${tabName}`);
                if (targetTab) {
                    targetTab.classList.add('active');
                }

                // Cargar datos según la pestaña
                if (tabName === 'facturas') {
                    FacturasManager.cargarEquiposPendientes();
                } else if (tabName === 'grupos') {
                    GruposManager.cargarGrupos();
                }
            });
        });
    }
});
