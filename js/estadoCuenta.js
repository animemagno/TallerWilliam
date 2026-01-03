/**
 * Sistema de Estado de Cuenta
 * Genera reportes consolidados de deuda por equipo o grupo
 */

const EstadoCuentaService = {
    /**
     * Obtiene el estado de cuenta de un equipo individual
     * @param {string} equipoNumber - Número del equipo
     * @returns {Promise<Object>} Estado de cuenta
     */
    async obtenerEstadoCuentaEquipo(equipoNumber) {
        try {
            // Obtener todas las facturas pendientes del equipo
            const facturasSnapshot = await db.collection('ventas')
                .where('equipoNumber', '==', equipoNumber)
                .where('paymentType', '==', 'pendiente')
                .orderBy('timestamp', 'desc')
                .get();

            const facturas = [];
            let totalAdeudado = 0;

            facturasSnapshot.forEach(doc => {
                const data = doc.data();
                const saldo = data.saldoPendiente !== undefined ? data.saldoPendiente : data.total;

                if (saldo > 0) {
                    facturas.push({
                        id: doc.id,
                        invoiceNumber: data.invoiceNumber,
                        fecha: data.timestamp,
                        total: data.total,
                        saldo: saldo,
                        abonos: data.abonos || []
                    });
                    totalAdeudado += saldo;
                }
            });

            // Obtener todos los abonos realizados
            const abonos = [];
            facturas.forEach(factura => {
                if (factura.abonos && factura.abonos.length > 0) {
                    factura.abonos.forEach(abono => {
                        abonos.push({
                            fecha: abono.fecha,
                            monto: abono.monto,
                            facturaRef: factura.invoiceNumber
                        });
                    });
                }
            });

            // Ordenar abonos por fecha
            abonos.sort((a, b) => {
                const fechaA = a.fecha.toDate ? a.fecha.toDate() : new Date(a.fecha);
                const fechaB = b.fecha.toDate ? b.fecha.toDate() : new Date(b.fecha);
                return fechaB - fechaA;
            });

            return {
                tipo: 'equipo',
                equipoNumber: equipoNumber,
                facturas: facturas,
                totalAdeudado: totalAdeudado,
                abonos: abonos,
                cantidadFacturas: facturas.length,
                totalAbonado: abonos.reduce((sum, a) => sum + a.monto, 0)
            };

        } catch (error) {
            console.error('Error obteniendo estado de cuenta:', error);
            throw error;
        }
    },

    /**
     * Obtiene el estado de cuenta de un grupo
     * @param {string} groupName - Nombre del grupo
     * @returns {Promise<Object>} Estado de cuenta del grupo
     */
    async obtenerEstadoCuentaGrupo(groupName) {
        try {
            // Obtener facturas del grupo
            const facturasSnapshot = await db.collection('ventas')
                .where('clientName', '==', groupName)
                .where('paymentType', '==', 'pendiente')
                .orderBy('timestamp', 'desc')
                .get();

            const equipos = {};
            let totalAdeudado = 0;

            facturasSnapshot.forEach(doc => {
                const data = doc.data();
                const saldo = data.saldoPendiente !== undefined ? data.saldoPendiente : data.total;

                if (saldo > 0) {
                    const equipoNum = data.equipoNumber;

                    if (!equipos[equipoNum]) {
                        equipos[equipoNum] = {
                            equipoNumber: equipoNum,
                            facturas: [],
                            saldo: 0
                        };
                    }

                    equipos[equipoNum].facturas.push({
                        id: doc.id,
                        invoiceNumber: data.invoiceNumber,
                        fecha: data.timestamp,
                        total: data.total,
                        saldo: saldo,
                        abonos: data.abonos || []
                    });

                    equipos[equipoNum].saldo += saldo;
                    totalAdeudado += saldo;
                }
            });

            // Obtener abonos del grupo
            const abonos = [];
            Object.values(equipos).forEach(equipo => {
                equipo.facturas.forEach(factura => {
                    if (factura.abonos && factura.abonos.length > 0) {
                        factura.abonos.forEach(abono => {
                            abonos.push({
                                fecha: abono.fecha,
                                monto: abono.monto,
                                equipoRef: equipo.equipoNumber,
                                facturaRef: factura.invoiceNumber
                            });
                        });
                    }
                });
            });

            // Ordenar abonos por fecha
            abonos.sort((a, b) => {
                const fechaA = a.fecha.toDate ? a.fecha.toDate() : new Date(a.fecha);
                const fechaB = b.fecha.toDate ? b.fecha.toDate() : new Date(b.fecha);
                return fechaB - fechaA;
            });

            return {
                tipo: 'grupo',
                groupName: groupName,
                equipos: Object.values(equipos).sort((a, b) =>
                    a.equipoNumber.localeCompare(b.equipoNumber)
                ),
                totalAdeudado: totalAdeudado,
                abonos: abonos,
                cantidadEquipos: Object.keys(equipos).length,
                totalAbonado: abonos.reduce((sum, a) => sum + a.monto, 0)
            };

        } catch (error) {
            console.error('Error obteniendo estado de cuenta del grupo:', error);
            throw error;
        }
    },

    /**
     * Muestra el modal con el estado de cuenta
     * @param {Object} estadoCuenta - Datos del estado de cuenta
     */
    mostrarModal(estadoCuenta) {
        const modal = document.getElementById('estado-cuenta-modal');
        const contenido = document.getElementById('estado-cuenta-contenido');

        if (!modal || !contenido) {
            console.error('Modal de estado de cuenta no encontrado');
            return;
        }

        // Generar HTML según el tipo
        let html = '';

        if (estadoCuenta.tipo === 'equipo') {
            html = this.generarHTMLEquipo(estadoCuenta);
        } else {
            html = this.generarHTMLGrupo(estadoCuenta);
        }

        contenido.innerHTML = html;
        modal.style.display = 'flex';

        // Configurar botón de imprimir
        const btnImprimir = document.getElementById('btn-imprimir-estado-cuenta');
        if (btnImprimir) {
            btnImprimir.onclick = () => this.imprimirEstadoCuenta(estadoCuenta);
        }
    },

    /**
     * Genera HTML para estado de cuenta de equipo individual
     */
    generarHTMLEquipo(estadoCuenta) {
        const fechaActual = new Date().toLocaleDateString('es-ES', {
            day: '2-digit',
            month: '2-digit',
            year: '2-digit'
        });

        let html = `
            <div class="estado-cuenta-header">
                <h3>ESTADO DE CUENTA</h3>
                <div class="equipo-titulo">EQUIPO: ${estadoCuenta.equipoNumber}</div>
                <div class="fecha-reporte">Fecha: ${fechaActual}</div>
            </div>

            <div class="divider"></div>

            <div class="facturas-section">
                <h4>FACTURAS PENDIENTES (${estadoCuenta.cantidadFacturas})</h4>
                <div class="facturas-lista">
        `;

        estadoCuenta.facturas.forEach(factura => {
            const fechaFactura = factura.fecha.toDate ?
                factura.fecha.toDate().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }) :
                new Date(factura.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });

            html += `
                <div class="factura-item">
                    <span>Factura #${factura.invoiceNumber} (${fechaFactura})</span>
                    <span class="monto">$${factura.saldo.toFixed(2)}</span>
                </div>
            `;
        });

        html += `
                </div>
            </div>

            <div class="divider"></div>

            <div class="total-section">
                <div class="total-item destacado">
                    <span>TOTAL ADEUDADO:</span>
                    <span class="monto-grande">$${estadoCuenta.totalAdeudado.toFixed(2)}</span>
                </div>
            </div>
        `;

        if (estadoCuenta.abonos.length > 0) {
            html += `
                <div class="divider"></div>
                <div class="abonos-section">
                    <h4>ABONOS REALIZADOS</h4>
                    <div class="abonos-lista">
            `;

            estadoCuenta.abonos.forEach(abono => {
                const fechaAbono = abono.fecha.toDate ?
                    abono.fecha.toDate().toLocaleDateString('es-ES') :
                    new Date(abono.fecha).toLocaleDateString('es-ES');

                html += `
                    <div class="abono-item">
                        <span>${fechaAbono}</span>
                        <span class="monto">$${abono.monto.toFixed(2)}</span>
                    </div>
                `;
            });

            html += `
                    </div>
                </div>
                <div class="divider"></div>
                <div class="total-section">
                    <div class="total-item">
                        <span>TOTAL ABONADO:</span>
                        <span class="monto">$${estadoCuenta.totalAbonado.toFixed(2)}</span>
                    </div>
                    <div class="total-item destacado">
                        <span>SALDO ACTUAL:</span>
                        <span class="monto-grande">$${(estadoCuenta.totalAdeudado - estadoCuenta.totalAbonado).toFixed(2)}</span>
                    </div>
                </div>
            `;
        }

        html += '</div>';
        return html;
    },

    /**
     * Genera HTML para estado de cuenta de grupo
     */
    generarHTMLGrupo(estadoCuenta) {
        const fechaActual = new Date().toLocaleDateString('es-ES', {
            day: '2-digit',
            month: '2-digit',
            year: '2-digit'
        });

        let html = `
            <div class="estado-cuenta-header">
                <h3>ESTADO DE CUENTA - GRUPO</h3>
                <div class="grupo-titulo">${estadoCuenta.groupName}</div>
                <div class="fecha-reporte">Fecha: ${fechaActual}</div>
            </div>

            <div class="divider"></div>

            <div class="equipos-section">
                <h4>EQUIPOS DEL GRUPO (${estadoCuenta.cantidadEquipos})</h4>
                <div class="equipos-lista">
        `;

        estadoCuenta.equipos.forEach(equipo => {
            html += `
                <div class="equipo-item">
                    <span>Equipo ${equipo.equipoNumber} (${equipo.facturas.length} facturas)</span>
                    <span class="monto">$${equipo.saldo.toFixed(2)}</span>
                </div>
            `;
        });

        html += `
                </div>
            </div>

            <div class="divider"></div>

            <div class="total-section">
                <div class="total-item destacado">
                    <span>TOTAL ADEUDADO:</span>
                    <span class="monto-grande">$${estadoCuenta.totalAdeudado.toFixed(2)}</span>
                </div>
            </div>
        `;

        if (estadoCuenta.abonos.length > 0) {
            html += `
                <div class="divider"></div>
                <div class="abonos-section">
                    <h4>ABONOS GRUPALES</h4>
                    <div class="abonos-lista">
            `;

            estadoCuenta.abonos.forEach(abono => {
                const fechaAbono = abono.fecha.toDate ?
                    abono.fecha.toDate().toLocaleDateString('es-ES') :
                    new Date(abono.fecha).toLocaleDateString('es-ES');

                html += `
                    <div class="abono-item">
                        <span>${fechaAbono} (Eq. ${abono.equipoRef})</span>
                        <span class="monto">$${abono.monto.toFixed(2)}</span>
                    </div>
                `;
            });

            html += `
                    </div>
                </div>
                <div class="divider"></div>
                <div class="total-section">
                    <div class="total-item">
                        <span>TOTAL ABONADO:</span>
                        <span class="monto">$${estadoCuenta.totalAbonado.toFixed(2)}</span>
                    </div>
                    <div class="total-item destacado">
                        <span>SALDO ACTUAL:</span>
                        <span class="monto-grande">$${(estadoCuenta.totalAdeudado - estadoCuenta.totalAbonado).toFixed(2)}</span>
                    </div>
                </div>
            `;
        }

        return html;
    },

    /**
     * Imprime el estado de cuenta
     */
    imprimirEstadoCuenta(estadoCuenta) {
        const printWindow = window.open('', '_blank', 'width=300,height=600');
        const fechaActual = new Date().toLocaleDateString('es-ES', {
            day: '2-digit',
            month: '2-digit',
            year: '2-digit'
        });

        let contenido = '';

        if (estadoCuenta.tipo === 'equipo') {
            contenido = this.generarTicketEquipo(estadoCuenta, fechaActual);
        } else {
            contenido = this.generarTicketGrupo(estadoCuenta, fechaActual);
        }

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
     * Genera ticket de impresión para equipo
     */
    generarTicketEquipo(estadoCuenta, fechaActual) {
        let facturasHTML = '';
        estadoCuenta.facturas.forEach(factura => {
            facturasHTML += `
                <div style="display: flex; justify-content: space-between; margin: 2px 0;">
                    <div>#${factura.invoiceNumber}</div>
                    <div>$${factura.saldo.toFixed(2)}</div>
                </div>
            `;
        });

        let abonosHTML = '';
        if (estadoCuenta.abonos.length > 0) {
            estadoCuenta.abonos.forEach(abono => {
                const fechaAbono = abono.fecha.toDate ?
                    abono.fecha.toDate().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }) :
                    new Date(abono.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' });

                abonosHTML += `
                    <div style="display: flex; justify-content: space-between; margin: 2px 0;">
                        <div>${fechaAbono}</div>
                        <div>$${abono.monto.toFixed(2)}</div>
                    </div>
                `;
            });
        }

        const saldoActual = estadoCuenta.totalAdeudado - estadoCuenta.totalAbonado;

        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Estado de Cuenta - Equipo ${estadoCuenta.equipoNumber}</title>
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
                .equipo-text { font-size: 32px; font-weight: 900; margin: 5px 0; text-align: center; }
                .section-title { font-size: 18px; margin: 8px 0 4px 0; }
                .small-text { font-size: 18px; }
                .total { font-weight: bold; text-align: center; margin-top: 12px; font-size: 24px; }
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
                <div class="small-text">ESTADO DE CUENTA</div>
                <div class="small-text">${fechaActual}</div>
            </div>
            
            <div class="line"></div>
            
            <div class="equipo-text">${estadoCuenta.equipoNumber}</div>
            
            <div class="line"></div>
            
            <div class="section-title">FACTURAS PENDIENTES:</div>
            ${facturasHTML}
            
            <div class="line"></div>
            
            <div class="total">
                TOTAL: $${estadoCuenta.totalAdeudado.toFixed(2)}
            </div>

            ${estadoCuenta.abonos.length > 0 ? `
                <div class="line"></div>
                <div class="section-title">ABONOS:</div>
                ${abonosHTML}
                
                <div class="saldo-info">
                    <div>SALDO ACTUAL:</div>
                    <div style="font-size: 26px;">$${saldoActual.toFixed(2)}</div>
                </div>
            ` : ''}
            
            <div style="text-align: center; margin-top: 15px; font-size: 20px;">
                GRACIAS POR PREFERIRNOS
            </div>
        </body>
        </html>
        `;
    },

    /**
     * Genera ticket de impresión para grupo
     */
    generarTicketGrupo(estadoCuenta, fechaActual) {
        let equiposHTML = '';
        estadoCuenta.equipos.forEach(equipo => {
            equiposHTML += `
                <div style="display: flex; justify-content: space-between; margin: 2px 0;">
                    <div>Eq. ${equipo.equipoNumber}</div>
                    <div>$${equipo.saldo.toFixed(2)}</div>
                </div>
            `;
        });

        let abonosHTML = '';
        if (estadoCuenta.abonos.length > 0) {
            estadoCuenta.abonos.forEach(abono => {
                const fechaAbono = abono.fecha.toDate ?
                    abono.fecha.toDate().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }) :
                    new Date(abono.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' });

                abonosHTML += `
                    <div style="display: flex; justify-content: space-between; margin: 2px 0;">
                        <div>${fechaAbono}</div>
                        <div>$${abono.monto.toFixed(2)}</div>
                    </div>
                `;
            });
        }

        const saldoActual = estadoCuenta.totalAdeudado - estadoCuenta.totalAbonado;

        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Estado de Cuenta - ${estadoCuenta.groupName}</title>
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
                .grupo-text { font-size: 24px; font-weight: 900; margin: 5px 0; text-align: center; }
                .section-title { font-size: 18px; margin: 8px 0 4px 0; }
                .small-text { font-size: 18px; }
                .total { font-weight: bold; text-align: center; margin-top: 12px; font-size: 24px; }
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
                <div class="small-text">ESTADO DE CUENTA - GRUPO</div>
                <div class="small-text">${fechaActual}</div>
            </div>
            
            <div class="line"></div>
            
            <div class="grupo-text">${estadoCuenta.groupName}</div>
            
            <div class="line"></div>
            
            <div class="section-title">EQUIPOS:</div>
            ${equiposHTML}
            
            <div class="line"></div>
            
            <div class="total">
                TOTAL: $${estadoCuenta.totalAdeudado.toFixed(2)}
            </div>

            ${estadoCuenta.abonos.length > 0 ? `
                <div class="line"></div>
                <div class="section-title">ABONOS GRUPALES:</div>
                ${abonosHTML}
                
                <div class="saldo-info">
                    <div>SALDO ACTUAL:</div>
                    <div style="font-size: 26px;">$${saldoActual.toFixed(2)}</div>
                </div>
            ` : ''}
            
            <div style="text-align: center; margin-top: 15px; font-size: 20px;">
                GRACIAS POR PREFERIRNOS
            </div>
        </body>
        </html>
        `;
    },

    /**
     * Cierra el modal
     */
    cerrarModal() {
        const modal = document.getElementById('estado-cuenta-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    }
};

// Funciones globales para acceso desde HTML
async function mostrarEstadoCuentaEquipo(equipoNumber) {
    try {
        const estadoCuenta = await EstadoCuentaService.obtenerEstadoCuentaEquipo(equipoNumber);
        EstadoCuentaService.mostrarModal(estadoCuenta);
    } catch (error) {
        alert('Error al generar estado de cuenta: ' + error.message);
    }
}

async function mostrarEstadoCuentaGrupo(groupName) {
    try {
        const estadoCuenta = await EstadoCuentaService.obtenerEstadoCuentaGrupo(groupName);
        EstadoCuentaService.mostrarModal(estadoCuenta);
    } catch (error) {
        alert('Error al generar estado de cuenta del grupo: ' + error.message);
    }
}

function cerrarEstadoCuentaModal() {
    EstadoCuentaService.cerrarModal();
}
