import { DateUtils } from '../utils/DateUtils.js';
import { UIService } from './UIService.js';

export const PrintService = {
    printCurrentHistorial(movimientos, resumen) {
        const printWindow = window.open('', '_blank');
        const fechaActual = DateUtils.getCurrentDateStringElSalvador().split('-').reverse().join('/');

        const { totalContado, totalAbonos, totalIngresos, totalRetiros, ventasContado, ventasConAbonos, cantidadIngresos, cantidadRetiros } = resumen;

        let reportHTML = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Historial de Movimientos - ${fechaActual}</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        margin: 0;
                        padding: 20px;
                        color: #333;
                    }
                    .header {
                        text-align: center;
                        margin-bottom: 20px;
                        border-bottom: 2px solid #2c3e50;
                        padding-bottom: 10px;
                    }
                    h1 {
                        margin: 0;
                        color: #2c3e50;
                        font-size: 24px;
                    }
                    h2 {
                        margin: 5px 0 0;
                        color: #7f8c8d;
                        font-size: 16px;
                        font-weight: normal;
                    }
                    .resumen-section {
                        margin-top: 30px;
                        background: #f8f9fa;
                        padding: 15px;
                        border-radius: 8px;
                        border: 1px solid #ddd;
                    }
                    .resumen-grid {
                        display: grid;
                        grid-template-columns: repeat(4, 1fr);
                        gap: 15px;
                    }
                    .resumen-item {
                        text-align: center;
                        padding: 10px;
                        background: white;
                        border-radius: 6px;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.05);
                    }
                    .resumen-valor {
                        font-size: 18px;
                        font-weight: bold;
                        color: #2c3e50;
                        margin-top: 5px;
                    }
                    .page-break {
                        page-break-before: always;
                    }
                    @page {
                        size: A4 portrait;
                        margin: 1.5cm 1cm;
                    }
                    .footer {
                        text-align: center;
                        margin-top: 20px;
                        padding-top: 10px;
                        border-top: 1px solid #ddd;
                        font-size: 10px;
                        color: #7f8c8d;
                    }
                    .movimiento-card {
                        margin-bottom: 15px;
                        border: 1px solid #ddd;
                        border-radius: 6px;
                        overflow: hidden;
                        page-break-inside: avoid;
                    }
                    .movimiento-header {
                        background: #f8f9fa;
                        padding: 10px 12px;
                        border-bottom: 1px solid #ddd;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    }
                    .productos-table {
                        width: 100%;
                        border-collapse: collapse;
                        font-size: 10px;
                    }
                    .productos-table th {
                        background: #ecf0f1;
                        padding: 6px 8px;
                        text-align: left;
                        font-weight: bold;
                        border-bottom: 2px solid #bdc3c7;
                    }
                    .productos-table td {
                        padding: 5px 8px;
                        border-bottom: 1px solid #ecf0f1;
                    }
                    .productos-table tr:last-child td {
                        border-bottom: none;
                    }
                    .ventas-table {
                        width: 100%;
                        border-collapse: collapse;
                        font-size: 12px;
                    }
                    .ventas-table th, .ventas-table td {
                        border: 1px solid #ddd;
                        padding: 8px;
                        text-align: left;
                    }
                    .ventas-table th {
                        background-color: #f2f2f2;
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>TALLER WILIAN</h1>
                    <h2>HISTORIAL DE MOVIMIENTOS ${fechaActual}</h2>
                </div>
        `;

        movimientos.forEach((movimiento) => {
            const fecha = movimiento.timestamp ? new Date(movimiento.timestamp.toDate ? movimiento.timestamp.toDate() : movimiento.timestamp).toLocaleString('es-ES') : 'N/A';

            if (movimiento.tipo === 'retiro') {
                const tipoText = 'RETIRO';
                const color = '#e74c3c';

                reportHTML += `
                    <div class="movimiento-card" style="border-left: 4px solid ${color};">
                        <div class="movimiento-header" style="background: white;">
                            <div>
                                <strong>${tipoText}</strong> - ${movimiento.concepto || 'Sin concepto'}
                                <br><span style="font-size: 9px; color: #666;">${fecha}</span>
                            </div>
                            <div style="text-align: right;">
                                <div style="font-size: 14px; font-weight: bold; color: ${color};">
                                    -$${movimiento.monto.toFixed(2)}
                                </div>
                                <span style="background: #e74c3c; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px;">${tipoText}</span>
                            </div>
                        </div>
                    </div>
                `;
            } else if (movimiento.tipo === 'ingreso') {
                const tipoText = 'INGRESO';
                const color = '#27ae60';

                reportHTML += `
                    <div class="movimiento-card" style="border-left: 4px solid ${color};">
                        <div class="movimiento-header" style="background: white;">
                            <div>
                                <strong>${tipoText}</strong> - ${movimiento.concepto || 'Sin concepto'}
                                <br><span style="font-size: 9px; color: #666;">${fecha}</span>
                            </div>
                            <div style="text-align: right;">
                                <div style="font-size: 14px; font-weight: bold; color: ${color};">
                                    +$${movimiento.monto.toFixed(2)}
                                </div>
                                <span style="background: #27ae60; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px;">${tipoText}</span>
                            </div>
                        </div>
                    </div>
                `;
            } else if (movimiento.tipo === 'venta') {
                const venta = movimiento;
                const tipoText = venta.paymentType === 'contado' ? 'CONTADO' : 'PENDIENTE';
                const badgeColor = venta.paymentType === 'contado' ? '#27ae60' : '#f39c12';

                let productosRows = '';
                if (venta.products && venta.products.length > 0) {
                    venta.products.forEach(producto => {
                        productosRows += `
                            <tr>
                                <td width="10%" style="text-align: center;">${producto.cantidad}</td>
                                <td width="50%">${producto.descripcion}</td>
                                <td width="20%" style="text-align: right;">$${producto.precio.toFixed(2)}</td>
                                <td width="20%" style="text-align: right;">$${(producto.precio * producto.cantidad).toFixed(2)}</td>
                            </tr>
                        `;
                    });
                } else {
                    productosRows = '<tr><td colspan="4" style="text-align: center; color: #999;">Sin productos registrados</td></tr>';
                }

                reportHTML += `
                    <div class="movimiento-card">
                        <div class="movimiento-header">
                            <div>
                                <strong>Factura #${venta.invoiceNumber || 'N/A'}</strong> - Equipo: ${venta.equipoNumber || 'N/A'}
                                <br><span style="font-size: 9px; color: #666;">${fecha} - ${venta.clientName || 'Cliente'}</span>
                            </div>
                            <div style="text-align: right;">
                                <div style="font-size: 14px; font-weight: bold;">$${(venta.total || 0).toFixed(2)}</div>
                                <span style="background: ${badgeColor}; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px;">${tipoText}</span>
                            </div>
                        </div>
                        <div style="padding: 5px 10px;">
                            <table class="productos-table">
                                <thead>
                                    <tr>
                                        <th width="10%" style="text-align: center;">Cant.</th>
                                        <th width="50%">Descripción</th>
                                        <th width="20%" style="text-align: right;">Precio</th>
                                        <th width="20%" style="text-align: right;">Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${productosRows}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
            }
        });

        let abonosHTML = '';
        const ventasConAbonosList = movimientos.filter(mov =>
            mov.tipo === 'venta' && mov.abonos && mov.abonos.length > 0
        );

        if (ventasConAbonosList.length > 0) {
            abonosHTML += `
                <div class="page-break"></div>
                <div class="header">
                    <h2>HISTORIAL DE ABONOS ${fechaActual}</h2>
                </div>
                <div class="table-container">
                    <table class="ventas-table">
                        <thead>
                            <tr>
                                <th width="15%">Fecha</th>
                                <th width="10%">Equipo</th>
                                <th width="15%">Total</th>
                                <th width="15%">Abono</th>
                                <th width="15%">Saldo</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            ventasConAbonosList.forEach(venta => {
                const saldoPendiente = venta.saldoPendiente !== undefined ? venta.saldoPendiente : venta.total;
                const totalAbonado = venta.abonos.reduce((sum, abono) => sum + abono.monto, 0);

                abonosHTML += `
                    <tr>
                        <td>${new Date(venta.timestamp.toDate ? venta.timestamp.toDate() : venta.timestamp).toLocaleDateString('es-ES')}</td>
                        <td>${venta.equipoNumber || 'N/A'}</td>
                        <td>$${venta.total.toFixed(2)}</td>
                        <td>$${totalAbonado.toFixed(2)}</td>
                        <td>$${saldoPendiente.toFixed(2)}</td>
                    </tr>
                `;
            });

            abonosHTML += `</tbody></table></div>`;
        }

        reportHTML += abonosHTML;

        const flujoNeto = totalContado + totalAbonos + totalIngresos - totalRetiros;
        reportHTML += `
            <div class="resumen-section">
                <h3 style="margin: 0 0 15px 0; text-align: center; color: #2c3e50;">RESUMEN</h3>
                <div class="resumen-grid">
                    <div class="resumen-item">
                        <div>VENTAS AL CONTADO</div>
                        <div class="resumen-valor">$${totalContado.toFixed(2)}</div>
                        <div style="font-size: 10px; color: #666;">${ventasContado} ventas</div>
                    </div>
                    <div class="resumen-item">
                        <div>ABONOS</div>
                        <div class="resumen-valor">$${totalAbonos.toFixed(2)}</div>
                        <div style="font-size: 10px; color: #666;">${ventasConAbonos} ventas</div>
                    </div>
                    <div class="resumen-item">
                        <div>INGRESOS</div>
                        <div class="resumen-valor" style="color: #27ae60;">+$${totalIngresos.toFixed(2)}</div>
                        <div style="font-size: 10px; color: #666;">${cantidadIngresos} ingresos</div>
                    </div>
                    <div class="resumen-item">
                        <div>RETIROS</div>
                        <div class="resumen-valor" style="color: #e74c3c;">-$${totalRetiros.toFixed(2)}</div>
                        <div style="font-size: 10px; color: #666;">${cantidadRetiros} retiros</div>
                    </div>
                </div>
                <div style="margin-top: 20px; padding: 15px; background: #2c3e50; color: white; border-radius: 6px; text-align: center;">
                    <div style="font-size: 14px; margin-bottom: 5px;">FLUJO NETO DE CAJA</div>
                    <div style="font-size: 24px; font-weight: bold;">${flujoNeto >= 0 ? '+' : ''}$${flujoNeto.toFixed(2)}</div>
                    <div style="font-size: 11px; margin-top: 5px; opacity: 0.8;">Ventas + Abonos + Ingresos - Retiros</div>
                </div>
            </div>
            
            <div class="footer">
                <div>Documento generado automáticamente por el Sistema de Ventas Taller Wilian</div>
                <div>Fecha de impresión: ${DateUtils.getCurrentTimestampElSalvador().toLocaleString('es-ES')}</div>
            </div>
        `;

        reportHTML += `</body></html>`;

        printWindow.document.write(reportHTML);
        printWindow.document.close();
        printWindow.focus();

        setTimeout(() => {
            printWindow.print();
            UIService.showStatus("Historial enviado a impresión", "success");
        }, 500);
    },

    async printTicket(saleDataOrId) {
        let saleData = saleDataOrId;
        if (typeof saleDataOrId === 'string') {
            try {
                const { DataService } = await import('./DataService.js');
                saleData = await DataService.getSaleById(saleDataOrId);
                if (!saleData) {
                    console.error("No se encontró la venta para imprimir");
                    return;
                }
            } catch (e) {
                console.error("Error buscando venta para imprimir", e);
                return;
            }
        }

        const printWindow = window.open('', '_blank');
        const fecha = saleData.timestamp ? new Date(saleData.timestamp.toDate ? saleData.timestamp.toDate() : saleData.timestamp) : DateUtils.getCurrentTimestampElSalvador();
        const fechaFormateada = fecha.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' });

        const saldoPendiente = saleData.saldoPendiente !== undefined ? saleData.saldoPendiente : saleData.total;
        const tieneAbonos = saleData.abonos && saleData.abonos.length > 0;
        const tipoPago = saleData.paymentType === 'pendiente' ? 'PENDIENTE' : 'CONTADO';

        let abonosHTML = '';
        if (tieneAbonos) {
            saleData.abonos.forEach(abono => {
                const fechaAbono = abono.fecha ? new Date(abono.fecha.toDate ? abono.fecha.toDate() : abono.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }) : 'N/A';
                abonosHTML += `
                    <div style="display: flex; justify-content: space-between; font-size: 20px; margin: 2px 0;">
                        <div>ABONO: $${abono.monto.toFixed(2)} (${fechaAbono})</div>
                    </div>
                `;
            });
        }

        let productosHTML = '';
        if (saleData.products && saleData.products.length > 0) {
            saleData.products.forEach(producto => {
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
                <title>Ticket #${saleData.invoiceNumber}</title>
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
                    <h3 style="margin: 2px 0; font-size: 26px;">TALLER WILIAN</h3>
                    <div class="small-text">Factura: ${saleData.invoiceNumber}</div>
                    <div class="small-text">${fechaFormateada}, ${tipoPago}</div>
                </div>
                
                <div class="line"></div>
                
                <div class="medium-text">
                    <strong>Grupo:</strong> ${saleData.clientName}
                </div>
                <div class="equipo-text">
                    Equipo: ${saleData.equipoNumber}
                </div>
                
                <div class="line"></div>
                
                <div style="margin: 8px 0;">
                    ${productosHTML}
                </div>
                
                <div class="line"></div>
                
                <div class="total large-text">
                    TOTAL: $${saleData.total.toFixed(2)}
                </div>

                ${abonosHTML}

                ${saleData.paymentType === 'pendiente' && saldoPendiente > 0 && tieneAbonos ? `
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

    printAbonoTicket(venta, abonoData, nuevoSaldo) {
        try {
            console.log("PrintService: Generando ticket de abono", { venta, abonoData, nuevoSaldo });

            const printWindow = window.open('', '_blank');
            if (!printWindow) {
                console.error("El navegador bloqueó la ventana emergente");
                UIService.showStatus("Permita ventanas emergentes para imprimir", "error");
                return;
            }

            // Funciones auxiliares seguras
            const safeNumber = (num) => {
                const n = Number(num);
                return isNaN(n) ? 0 : n;
            };
            const formatMoney = (num) => safeNumber(num).toFixed(2);

            const fechaAbono = abonoData.fecha ? new Date(abonoData.fecha.toDate ? abonoData.fecha.toDate() : abonoData.fecha) : new Date();
            const fechaFormateada = fechaAbono.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' });

            // Datos seguros
            const invoiceNumber = venta.invoiceNumber || '---';
            const clientName = venta.clientName || 'Cliente General';
            const equipoNumber = venta.equipoNumber || '---';
            const montoAbono = formatMoney(abonoData.monto);
            const saldoAnterior = formatMoney(venta.saldoPendiente !== undefined ? venta.saldoPendiente : venta.total);
            const saldoNuevo = formatMoney(nuevoSaldo);

            printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Abono #${invoiceNumber}</title>
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
                    .abono-detail { 
                        margin: 8px 0;
                        font-size: 20px;
                    }
                    .total { font-weight: bold; text-align: center; margin-top: 12px; font-size: 24px; }
                    .footer { text-align: center; margin-top: 12px; font-size: 18px; font-weight: bold; }
                    .small-text { font-size: 18px; }
                    .medium-text { font-size: 20px; }
                    .large-text { font-size: 26px; }
                    .equipo-text { font-size: 32px; font-weight: 900; margin: 5px 0; }
                    .saldo-info {
                        background: #f0f0f0;
                        padding: 8px;
                        margin: 8px 0;
                        border-radius: 4px;
                        font-size: 18px;
                    }
                    .thank-you { text-align: center; margin-top: 15px; font-weight: bold; font-size: 20px; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h3 style="margin: 2px 0; font-size: 26px;">TALLER WILIAN</h3>
                    <div class="small-text">COMPROBANTE DE ABONO</div>
                    <div class="small-text">${fechaFormateada}</div>
                </div>
                
                <div class="line"></div>
                
                <div class="medium-text">
                    <strong>Factura:</strong> ${invoiceNumber}<br>
                    <strong>Grupo:</strong> ${clientName}
                </div>
                <div class="equipo-text">
                    Equipo: ${equipoNumber}
                </div>
                
                <div class="line"></div>
                
                <div class="abono-detail">
                    <div style="text-align: center; font-size: 24px; margin: 10px 0;">
                        MONTO DEL ABONO
                    </div>
                    <div style="text-align: center; font-size: 28px; font-weight: bold;">
                        $${montoAbono}
                    </div>
                </div>

                <div class="saldo-info">
                    <div>SALDO ANTERIOR: $${saldoAnterior}</div>
                    <div>NUEVO SALDO: $${saldoNuevo}</div>
                </div>
                
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
        } catch (error) {
            console.error("Error generando ticket de abono:", error);
            UIService.showStatus("Error al generar ticket: " + error.message, "error");
        }
    },

    printRetiroTicket(retiroData) {
        const printWindow = window.open('', '_blank');
        const fecha = retiroData.timestamp ? new Date(retiroData.timestamp.toDate ? retiroData.timestamp.toDate() : retiroData.timestamp) : DateUtils.getCurrentTimestampElSalvador();
        const fechaFormateada = fecha.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' });

        const categoriaText = {
            'compra': 'Compra de materiales',
            'gastos': 'Gastos operativos',
            'herramientas': 'Herramientas',
            'otros': 'Otros'
        }[retiroData.categoria] || retiroData.categoria;

        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Retiro de Fondos</title>
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
                    .retiro-detail { 
                        margin: 8px 0;
                        font-size: 20px;
                    }
                    .total { font-weight: bold; text-align: center; margin-top: 12px; font-size: 24px; }
                    .footer { text-align: center; margin-top: 12px; font-size: 18px; font-weight: bold; }
                    .small-text { font-size: 18px; }
                    .medium-text { font-size: 20px; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h3 style="margin: 2px 0; font-size: 26px;">TALLER WILIAN</h3>
                    <div class="small-text">COMPROBANTE DE RETIRO</div>
                    <div class="small-text">${fechaFormateada}</div>
                </div>
                
                <div class="line"></div>
                
                <div class="medium-text">
                    <strong>Concepto:</strong> ${retiroData.concepto}<br>
                    <strong>Categoría:</strong> ${categoriaText}
                </div>
                
                <div class="line"></div>
                
                <div class="retiro-detail">
                    <div style="text-align: center; font-size: 24px; margin: 10px 0;">
                        MONTO RETIRADO
                    </div>
                    <div style="text-align: center; font-size: 28px; font-weight: bold;">
                        $${retiroData.monto.toFixed(2)}
                    </div>
                </div>
                
                <div class="footer">
                    Firma de Responsable
                    <br><br>
                    _____________________
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
    }
};
