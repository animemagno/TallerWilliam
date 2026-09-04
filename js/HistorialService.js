const HistorialService = {
    _escape(text) {
        if (text === null || text === undefined) return '';
        return String(text)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    },

    updateHistorial(movimientos) {
        AppState.historial = movimientos;

        // Debounce de renderizado para evitar múltiples actualizaciones pesadas en milisegundos
        if (this._renderTimeout) clearTimeout(this._renderTimeout);
        this._renderTimeout = setTimeout(() => {
            AppState.filteredHistorial = AppState.historial;

            // Ocultar resumen diario si estamos viendo historial general
            const dailySummary = document.getElementById('daily-summary-container');
            if (dailySummary) {
                dailySummary.style.display = 'none';
            }
            this.applyCurrentFilter();
        }, 100);
    },

    applyCurrentFilter() {
        let filtered = AppState.historial;
        const filterInput = document.getElementById('filter-historial');
        const filterText = filterInput ? filterInput.value.trim().toLowerCase() : '';

        if (filterText) {
            // Detectar formato "12 - Cliente"
            let equipoFilter = filterText;
            let clientFilter = null;
            const dashMatch = filterText.match(/^(\d+)\s*-\s*(.+)$/);
            if (dashMatch) {
                equipoFilter = dashMatch[1].trim();
                clientFilter = dashMatch[2].trim().toLowerCase();
            }

            filtered = filtered.filter(mov => {
                const equipo = (mov.equipoNumber || '').toString().toLowerCase();
                const cliente = (mov.clientName || '').toLowerCase();
                const concepto = (mov.concepto || '').toLowerCase();
                const factura = (mov.invoiceNumber || '').toString().toLowerCase();

                if (clientFilter) {
                    // Búsqueda con formato "equipo - cliente"
                    return equipo.includes(equipoFilter) && cliente.includes(clientFilter);
                } else {
                    // Búsqueda simple
                    return equipo.includes(filterText) || cliente.includes(filterText) || concepto.includes(filterText) || factura.includes(filterText);
                }
            });
        }

        AppState.filteredHistorial = filtered;
        this.renderHistorial();
    },

    renderHistorial() {
        const historialBody = document.getElementById('historial-body');
        if (!historialBody) return;

        const movimientos = AppState.filteredHistorial;

        if (movimientos.length === 0) {
            historialBody.innerHTML = `
                <tr>
                    <td colspan="6" class="empty-cart">No hay movimientos que coincidan con el filtro</td>
                </tr>
            `;
            return;
        }

        const historialHTML = [];

        movimientos.forEach(movimiento => {
            let fecha = 'N/A';

            // Lógica robusta para obtener la fecha
            try {
                let dateObj = null;

                if (movimiento.timestamp) {
                    if (typeof movimiento.timestamp.toDate === 'function') {
                        dateObj = movimiento.timestamp.toDate();
                    } else if (movimiento.timestamp instanceof Date) {
                        dateObj = movimiento.timestamp;
                    } else if (typeof movimiento.timestamp === 'string') {
                        dateObj = new Date(movimiento.timestamp);
                    }
                }

                // Si el timestamp no generó una fecha válida, intentar con el campo 'date'
                if ((!dateObj || isNaN(dateObj.getTime())) && movimiento.date) {
                    // movimiento.date suele ser YYYY-MM-DD
                    const parts = movimiento.date.split('-');
                    if (parts.length === 3) {
                        dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
                    } else {
                        dateObj = new Date(movimiento.date);
                    }
                }

                // Si aún falla, intentar extraer del número de factura (YYYMMDD o YYYYMMDD)
                if ((!dateObj || isNaN(dateObj.getTime())) && movimiento.invoiceNumber) {
                    // Buscar patrones como 20260208 o 260208
                    const fullDateMatch = String(movimiento.invoiceNumber).match(/(20\d{2})(\d{2})(\d{2})/);
                    if (fullDateMatch) {
                        dateObj = new Date(fullDateMatch[1], fullDateMatch[2] - 1, fullDateMatch[3]);
                    }
                }

                if (dateObj && !isNaN(dateObj.getTime())) {
                    fecha = dateObj.toLocaleDateString('es-ES');
                } else {
                    fecha = 'Fecha Inválida';
                }
            } catch (e) {
                console.warn("Error parseando fecha:", e);
                fecha = 'Error Fecha';
            }

            if (movimiento.tipo === 'retiro') {
                historialHTML.push(`
                    <tr style="background-color: #fff5f5;">
                        <td><strong>RET-${this._escape(movimiento.id.substring(0, 6))}</strong></td>
                        <td>
                            <div class="cliente-equipo">-</div>
                            <div class="cliente-nombre">${this._escape(movimiento.concepto) || 'Sin concepto'}</div>
                        </td>
                        <td>
                            <div class="saldo-pendiente-rojo">-$${Math.abs(movimiento.monto).toFixed(2)}</div>
                        </td>
                        <td><span class="retiro-badge">RETIRO</span></td>
                        <td>${fecha}</td>
                        <td>
                            <div class="historial-actions-container">
                                <button class="icon-btn btn-view" onclick="SalesService.viewRetiro('${this._escape(movimiento.id)}')" title="Ver retiro">
                                    <i class="fas fa-eye"></i>
                                </button>
                                <div class="action-menu-wrapper">
                                    <button class="menu-toggle-btn" onclick="UIService.toggleActionMenu(this)" title="Más acciones">
                                        <i class="fas fa-ellipsis-v"></i>
                                    </button>
                                    <div class="action-dropdown">
                                        <div class="action-dropdown-item" onclick="SalesService.editRetiro('${this._escape(movimiento.id)}')">
                                            <i class="fas fa-edit"></i> Editar
                                        </div>
                                        <div class="action-dropdown-item delete-item" onclick="SalesService.deleteRetiro('${this._escape(movimiento.id)}')">
                                            <i class="fas fa-trash"></i> Eliminar
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </td>
                    </tr>
                `);
            } else if (movimiento.tipo === 'ingreso') {
                historialHTML.push(`
                    <tr style="background-color: #f0fff4;">
                        <td><strong>ING-${this._escape(movimiento.id.substring(0, 6))}</strong></td>
                        <td>
                            <div class="cliente-equipo">-</div>
                            <div class="cliente-nombre">${this._escape(movimiento.concepto) || 'Sin concepto'}</div>
                        </td>
                        <td>
                            <div class="saldo-pendiente-negro" style="color: #27ae60;">+$${Math.abs(movimiento.monto).toFixed(2)}</div>
                        </td>
                        <td><span class="ingreso-badge">INGRESO</span></td>
                        <td>${fecha}</td>
                        <td>
                            <div class="historial-actions-container">
                                <button class="icon-btn btn-view" onclick="SalesService.viewIngreso('${this._escape(movimiento.id)}')" title="Ver ingreso">
                                    <i class="fas fa-eye"></i>
                                </button>
                                <div class="action-menu-wrapper">
                                    <button class="menu-toggle-btn" onclick="UIService.toggleActionMenu(this)" title="Más acciones">
                                        <i class="fas fa-ellipsis-v"></i>
                                    </button>
                                    <div class="action-dropdown">
                                        <div class="action-dropdown-item" onclick="SalesService.editIngreso('${this._escape(movimiento.id)}')">
                                            <i class="fas fa-edit"></i> Editar
                                        </div>
                                        <div class="action-dropdown-item delete-item" onclick="SalesService.deleteIngreso('${this._escape(movimiento.id)}')">
                                            <i class="fas fa-trash"></i> Eliminar
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </td>
                    </tr>
                `);
            } else if (movimiento.tipo === 'abono') {
                historialHTML.push(`
                    <tr style="background-color: #f0fff4;">
                        <td><strong>ABO-${this._escape(movimiento.id.substring(0, 6))}</strong></td>
                        <td>
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <div class="cliente-equipo" style="margin-bottom: 0; font-size: 0.9em; min-width: 30px;">${this._escape(movimiento.equipoNumber) || '-'}</div>
                                <div class="cliente-nombre" style="font-size: 0.85em; margin-bottom: 0;">
                                    Abono <a href="#" onclick="event.preventDefault(); SalesService.viewInvoice('${this._escape(movimiento.invoiceId || movimiento.invoiceNumber)}');" style="color: #7f8c8d; text-decoration: underline;">
                                        #${this._escape(movimiento.invoiceNumber)}
                                    </a>
                                </div>
                            </div>
                        </td>
                        <td>
                            <div class="saldo-pendiente-negro">+$${movimiento.monto.toFixed(2)}</div>
                        </td>
                        <td><span class="contado-badge" style="background-color: #27ae60;">ABONO</span></td>
                        <td>${fecha}</td>
                        <td>
                            <div class="historial-actions-container">
                                <button class="icon-btn btn-view" onclick="SalesService.viewInvoice('${this._escape(movimiento.invoiceNumber)}')" title="Ver factura">
                                    <i class="fas fa-eye"></i>
                                </button>
                                <div class="action-menu-wrapper">
                                    <button class="menu-toggle-btn" onclick="UIService.toggleActionMenu(this)" title="Más acciones">
                                        <i class="fas fa-ellipsis-v"></i>
                                    </button>
                                    <div class="action-dropdown">
                                        <div class="action-dropdown-item delete-item" onclick="SalesService.deleteAbono('${this._escape(movimiento.id)}', '${this._escape(movimiento.invoiceId || '')}')">
                                            <i class="fas fa-trash"></i> Eliminar abono
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </td>
                    </tr>
                `);
            } else {
                // Es una VENTA
                const venta = movimiento;
                let estadoReal = venta.paymentType;
                let tipoClass = 'pendiente-badge';
                let tipoTexto = 'PENDIENTE';
                let saldoPendiente = venta.saldoPendiente !== undefined ? venta.saldoPendiente : venta.total;

                if (venta.paymentType === 'contado') {
                    tipoClass = 'contado-badge';
                    tipoTexto = 'CONTADO';
                } else if (venta.paymentType === 'pendiente') {
                    if (saldoPendiente <= 0) {
                        estadoReal = 'contado';
                        tipoClass = 'contado-badge';
                        tipoTexto = 'PAGADO';
                    }
                }

                let montoMostrar = venta.total || 0;
                let claseMonto = 'saldo-pendiente-negro';

                if (estadoReal === 'pendiente') {
                    montoMostrar = saldoPendiente;
                    if (venta.saldoPendiente < venta.total) {
                        claseMonto = 'saldo-pendiente-rojo';
                    }
                }

                // Detección de aceite para color de fila
                let tieneCaja = false, tieneAceite = false;
                if (venta.products && venta.products.length > 0) {
                    const matchStr = venta.products.map(p => p.descripcion).join(' ').toLowerCase();
                    if (matchStr.includes('caja') || matchStr.includes('transmision')) tieneCaja = true;
                    const frasesAceite = ['cambio de aceite', 'cambio de aceite de caja', 'cambio de aceite de motor y caja', 'cambio de motor', 'cambio de aceite de motor'];
                    if (frasesAceite.some(frase => matchStr.includes(frase))) tieneAceite = true;
                }

                let aceiteStyle = '';
                let aceiteIndicator = '';
                if (tieneCaja) {
                    aceiteStyle = 'border-left: 4px solid #e74c3c; background-color: #fff5f5;';
                    aceiteIndicator = '<span style="background:#e74c3c;color:white;font-size:0.6rem;padding:1px 5px;border-radius:8px;font-weight:600;margin-left:4px;">CAJA</span>';
                } else if (tieneAceite) {
                    aceiteStyle = 'border-left: 4px solid #27ae60; background-color: #f0fff4;';
                    aceiteIndicator = '<span style="background:#27ae60;color:white;font-size:0.6rem;padding:1px 5px;border-radius:8px;font-weight:600;margin-left:4px;">ACEITE</span>';
                }

                let botonesHTML = '';
                const detailRowId = `inline-detail-${this._escape(venta.id)}`;

                if (estadoReal === 'contado' || estadoReal === 'pagado') {
                    botonesHTML = `
                        <button class="icon-btn btn-view" onclick="HistorialService.toggleInlineDetail('${this._escape(venta.id)}')" title="Ver detalles">
                            <i class="fas fa-chevron-down"></i>
                        </button>
                        <div class="action-menu-wrapper">
                            <button class="menu-toggle-btn" onclick="UIService.toggleActionMenu(this)" title="Más acciones">
                                <i class="fas fa-ellipsis-v"></i>
                            </button>
                            <div class="action-dropdown">
                                <div class="action-dropdown-item" onclick="SalesService.reprintInvoice('${this._escape(venta.id)}')">
                                    <i class="fas fa-print"></i> Reimprimir
                                </div>
                                <div class="action-dropdown-item" onclick="SalesService.editInvoice('${this._escape(venta.id)}')">
                                    <i class="fas fa-edit"></i> Editar
                                </div>
                                <div class="action-dropdown-item delete-item" onclick="SalesService.deleteInvoice('${this._escape(venta.id)}')">
                                    <i class="fas fa-trash"></i> Eliminar
                                </div>
                            </div>
                        </div>
                    `;
                } else {
                    botonesHTML = `
                        <button class="icon-btn btn-view" onclick="HistorialService.toggleInlineDetail('${this._escape(venta.id)}')" title="Ver detalles">
                            <i class="fas fa-chevron-down"></i>
                        </button>
                        <div class="action-menu-wrapper">
                            <button class="menu-toggle-btn" onclick="UIService.toggleActionMenu(this)" title="Más acciones">
                                <i class="fas fa-ellipsis-v"></i>
                            </button>
                            <div class="action-dropdown">
                                <div class="action-dropdown-item" onclick="SalesService.reprintInvoice('${this._escape(venta.id)}')">
                                    <i class="fas fa-print"></i> Reimprimir
                                </div>
                                <div class="action-dropdown-item" onclick="SalesService.editInvoice('${this._escape(venta.id)}')">
                                    <i class="fas fa-edit"></i> Editar
                                </div>
                                <div class="action-dropdown-item" onclick="SalesService.registrarAbono('${this._escape(venta.id)}')">
                                    <i class="fas fa-money-bill-wave"></i> Abonar
                                </div>
                                <div class="action-dropdown-item" onclick="SalesService.cancelInvoice('${this._escape(venta.id)}')">
                                    <i class="fas fa-ban"></i> Cancelar
                                </div>
                                <div class="action-dropdown-item delete-item" onclick="SalesService.deleteInvoice('${this._escape(venta.id)}')">
                                    <i class="fas fa-trash"></i> Eliminar
                                </div>
                            </div>
                        </div>
                    `;
                }

                // Generar tabla de productos inline
                let productosInlineHTML = '';
                if (venta.products && venta.products.length > 0) {
                    let filasProductos = '';
                    venta.products.forEach((producto, pIdx) => {
                        filasProductos += `
                            <tr style="background: ${pIdx % 2 === 0 ? '#fafbfc' : 'white'};">
                                <td style="padding: 5px 8px; text-align: center; font-weight: 600; color: #2c3e50; border-bottom: 1px solid #f0f0f0;">${producto.cantidad}</td>
                                <td style="padding: 5px 8px; color: #555; border-bottom: 1px solid #f0f0f0;">
                                    <i class="fas fa-wrench" style="color: #bdc3c7; font-size: 0.65rem; margin-right: 4px;"></i>${this._escape(producto.descripcion)}
                                </td>
                                <td style="padding: 5px 8px; text-align: right; color: #7f8c8d; border-bottom: 1px solid #f0f0f0;">$${(producto.precio || 0).toFixed(2)}</td>
                                <td style="padding: 5px 8px; text-align: right; font-weight: 600; color: #2c3e50; border-bottom: 1px solid #f0f0f0;">$${((producto.precio || 0) * producto.cantidad).toFixed(2)}</td>
                            </tr>
                        `;
                    });
                    productosInlineHTML = `
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

                // Abonos inline
                let abonosInlineHTML = '';
                if (venta.abonos && venta.abonos.length > 0) {
                    const totalAbonado = venta.abonos.reduce((sum, a) => sum + a.monto, 0);
                    let detalleAbonos = venta.abonos.map(a => {
                        const fechaAbono = a.fecha ? new Date(a.fecha.toDate ? a.fecha.toDate() : a.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }) : 'N/A';
                        return `<span style="font-size: 0.75rem; color: #27ae60;">+$${a.monto.toFixed(2)} (${fechaAbono})</span>`;
                    }).join(' · ');
                    abonosInlineHTML = `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: #e8f8f5; border-top: 1px solid #d5f5e3; font-size: 0.8rem; flex-wrap: wrap; gap: 4px;">
                            <div><i class="fas fa-coins" style="color: #27ae60; margin-right: 4px;"></i> Abonado: $${totalAbonado.toFixed(2)} <span style="color: #95a5a6; margin-left: 4px;">${detalleAbonos}</span></div>
                            <span style="font-weight: 700; color: #e74c3c;">Pendiente: $${saldoPendiente.toFixed(2)}</span>
                        </div>
                    `;
                }

                // Botones de acción inline
                let accionesInlineHTML = `
                    <div style="display: flex; gap: 8px; padding: 10px 12px; justify-content: flex-end; border-top: 1px solid #eee;">
                        ${estadoReal === 'pendiente' ? `<button onclick="SalesService.registrarAbono('${this._escape(venta.id)}')" style="padding: 6px 14px; background: linear-gradient(135deg, #f39c12, #e67e22); color: white; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 0.8rem;"><i class="fas fa-money-bill-wave"></i> Abonar</button>` : ''}
                        <button onclick="SalesService.reprintInvoice('${this._escape(venta.id)}')" style="padding: 6px 14px; background: linear-gradient(135deg, #27ae60, #229954); color: white; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 0.8rem;"><i class="fas fa-print"></i> Imprimir</button>
                    </div>
                `;

                // Si printed es explícitamente false, mostrar alerta
                const rowClass = venta.printed === false ? 'blink-alert' : '';

                historialHTML.push(`
                    <tr class="${rowClass}" style="${aceiteStyle} cursor: pointer;" onclick="HistorialService.toggleInlineDetail('${this._escape(venta.id)}')">
                        <td>
                            <span style="color: #2c3e50; font-weight: bold;">
                                #${this._escape(venta.invoiceNumber)}
                                ${venta.printed === false ? ' <i class="fas fa-exclamation-circle" style="color:#e74c3c; font-size: 1.2em;" title="Nueva sin imprimir"></i>' : ''}
                            </span>
                            ${aceiteIndicator}
                        </td>
                        <td>
                            <div class="cliente-equipo">${this._escape(venta.equipoNumber) || '-'}</div>
                            <div class="cliente-nombre">${this._escape(venta.clientName) || 'Cliente General'}</div>
                        </td>
                        <td>
                            <div class="${claseMonto}">$${montoMostrar.toFixed(2)}</div>
                            ${venta.total !== montoMostrar ? `<div style="font-size: 0.7rem; color: #999;">Total: $${venta.total.toFixed(2)}</div>` : ''}
                        </td>
                        <td><span class="${tipoClass}">${tipoTexto}</span></td>
                        <td>${fecha}</td>
                        <td onclick="event.stopPropagation();">
                            <div class="action-buttons historial-actions-container">
                                ${botonesHTML}
                            </div>
                        </td>
                    </tr>
                    <tr id="${detailRowId}" style="display: none;">
                        <td colspan="6" style="padding: 0; border: none;">
                            <div style="background: white; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px; overflow: hidden; margin: 0 4px 8px 4px; box-shadow: 0 2px 6px rgba(0,0,0,0.06);">
                                ${productosInlineHTML}
                                ${abonosInlineHTML}
                                ${accionesInlineHTML}
                            </div>
                        </td>
                    </tr>
                `);
            }
        });

        historialBody.innerHTML = historialHTML.join('');
    },

    toggleInlineDetail(ventaId) {
        const row = document.getElementById(`inline-detail-${ventaId}`);
        if (!row) return;
        const isVisible = row.style.display !== 'none';
        row.style.display = isVisible ? 'none' : 'table-row';

        // Toggle chevron icon
        const mainRow = row.previousElementSibling;
        if (mainRow) {
            const chevron = mainRow.querySelector('.btn-view i');
            if (chevron) {
                chevron.className = isVisible ? 'fas fa-chevron-down' : 'fas fa-chevron-up';
            }
        }
    },

    renderProductSummary(movimientos) {
        const summaryContent = document.getElementById('daily-summary-content');
        const cashSummary = document.getElementById('daily-cash-summary');
        const productsMap = new Map();

        let totalVentas = 0;
        let totalAbonos = 0;
        let totalRetiros = 0;
        let totalIngresos = 0;

        movimientos.forEach(mov => {
            if (mov.cancelada) return;
            if (mov.tipo === 'venta') {
                // Sumar productos
                if (mov.products) {
                    mov.products.forEach(prod => {
                        const current = productsMap.get(prod.descripcion) || { cantidad: 0, total: 0 };
                        productsMap.set(prod.descripcion, {
                            cantidad: current.cantidad + prod.cantidad,
                            total: current.total + (prod.precio * prod.cantidad)
                        });
                    });
                }
                // Sumar al total de ventas (contado + crédito)
                // Para flujo de caja real, sumamos lo que entró hoy
                if (mov.paymentType === 'contado') {
                    totalVentas += mov.total;
                }
            } else if (mov.tipo === 'abono') {
                totalAbonos += mov.monto;
            } else if (mov.tipo === 'retiro') {
                totalRetiros += Math.abs(mov.monto);
            } else if (mov.tipo === 'ingreso') {
                totalIngresos += mov.monto;
            }
        });

        // Renderizar productos en tabla compacta
        if (productsMap.size === 0) {
            summaryContent.innerHTML = '<div style="color: #7f8c8d; font-style: italic;">No hubo ventas de productos este día.</div>';
        } else {
            // Ordenar por cantidad vendida
            const sortedProducts = Array.from(productsMap.entries()).sort((a, b) => b[1].cantidad - a[1].cantidad);

            // Determinar número de columnas basado en cantidad de productos
            const numProducts = sortedProducts.length;
            const numColumns = numProducts <= 12 ? 4 : 6;

            let html = `
                <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
                    <thead>
                        <tr style="background-color: #34495e; color: white;">
                            <th style="padding: 6px 8px; text-align: left; border: 1px solid #ddd;">Cant.</th>
                            <th style="padding: 6px 8px; text-align: left; border: 1px solid #ddd;">Producto</th>
                            <th style="padding: 6px 8px; text-align: right; border: 1px solid #ddd;">Total</th>
            `;

            // Repetir encabezados según número de columnas
            for (let i = 1; i < numColumns; i++) {
                html += `
                            <th style="padding: 6px 8px; text-align: left; border: 1px solid #ddd;">Cant.</th>
                            <th style="padding: 6px 8px; text-align: left; border: 1px solid #ddd;">Producto</th>
                            <th style="padding: 6px 8px; text-align: right; border: 1px solid #ddd;">Total</th>
                `;
            }

            html += `
                        </tr>
                    </thead>
                    <tbody>
            `;

            // Dividir productos en filas
            const productsPerRow = numColumns;
            for (let i = 0; i < sortedProducts.length; i += productsPerRow) {
                html += '<tr>';

                for (let j = 0; j < productsPerRow; j++) {
                    const index = i + j;
                    if (index < sortedProducts.length) {
                        const [nombre, data] = sortedProducts[index];
                        html += `
                            <td style="padding: 5px 6px; border: 1px solid #ddd; text-align: center; font-weight: bold; color: #27ae60; background-color: #f9f9f9;">x${data.cantidad}</td>
                            <td style="padding: 5px 6px; border: 1px solid #ddd; font-weight: 500; color: #2c3e50;">${this._escape(nombre)}</td>
                            <td style="padding: 5px 6px; border: 1px solid #ddd; text-align: right; font-weight: bold; color: #2980b9;">$${data.total.toFixed(2)}</td>
                        `;
                    } else {
                        // Celdas vacías para completar la fila
                        html += `
                            <td style="padding: 5px 6px; border: 1px solid #ddd; background-color: #f5f5f5;"></td>
                            <td style="padding: 5px 6px; border: 1px solid #ddd; background-color: #f5f5f5;"></td>
                            <td style="padding: 5px 6px; border: 1px solid #ddd; background-color: #f5f5f5;"></td>
                        `;
                    }
                }

                html += '</tr>';
            }

            html += `
                    </tbody>
                </table>
            `;

            summaryContent.innerHTML = html;
        }

        // Renderizar resumen de caja
        const saldoFinal = totalVentas + totalAbonos + totalIngresos - totalRetiros;
        cashSummary.innerHTML = `
            <div style="color: #27ae60;">Ventas Contado: $${totalVentas.toFixed(2)}</div>
            <div style="color: #2980b9;">Abonos Recibidos: $${totalAbonos.toFixed(2)}</div>
            <div style="color: #16a085;">Ingresos: +$${totalIngresos.toFixed(2)}</div>
            <div style="color: #c0392b;">Retiros: -$${totalRetiros.toFixed(2)}</div>
            <div style="color: #2c3e50; border-left: 2px solid #bdc3c7; padding-left: 15px;">Flujo Neto: $${saldoFinal.toFixed(2)}</div>
        `;
    },

    generarResumenProductos(movimientos) {
        // Filtrar solo ventas
        const ventas = movimientos.filter(m => !m.tipo || m.tipo === 'venta');
        if (ventas.length === 0) return '';

        const productosMap = {};

        ventas.forEach(venta => {
            if (venta.products && Array.isArray(venta.products)) {
                venta.products.forEach(p => {
                    if (p.codigo && p.codigo.toLowerCase() === 'manual') return;

                    const key = p.codigo || p.descripcion;
                    if (!productosMap[key]) {
                        productosMap[key] = {
                            codigo: p.codigo,
                            descripcion: p.descripcion,
                            cantidad: 0,
                            totalVenta: 0
                        };
                    }
                    productosMap[key].cantidad += (parseFloat(p.cantidad) || 0);
                    // Usar precio * cantidad de la venta para exactitud
                    productosMap[key].totalVenta += (parseFloat(p.precio) * parseFloat(p.cantidad));
                });
            }
        });

        const productos = Object.values(productosMap).sort((a, b) => b.totalVenta - a.totalVenta);

        if (productos.length === 0) return '';

        const totalGeneral = productos.reduce((sum, p) => sum + p.totalVenta, 0);
        const totalCantidad = productos.reduce((sum, p) => sum + p.cantidad, 0);

        let html = `
            <div style="background-color: #f8f9fa; padding: 15px; border-top: 2px solid #ddd; margin-top: 20px;">
                <h4 style="margin-bottom: 10px; color: #2c3e50; text-align: center;">RESUMEN DE PRODUCTOS VENDIDOS</h4>
                <table class="table table-sm table-bordered" style="width: 100%; font-size: 0.9em; background: white;">
                    <thead class="thead-light">
                        <tr>
                            <th>Cód.</th>
                            <th>Descripción</th>
                            <th class="text-center">Cant.</th>
                            <th class="text-right">Total</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        productos.forEach(p => {
            html += `
                <tr>
                    <td>${this._escape(p.codigo) || '-'}</td>
                    <td>${this._escape(p.descripcion)}</td>
                    <td class="text-center"><strong>${p.cantidad}</strong></td>
                    <td class="text-right">$${p.totalVenta.toFixed(2)}</td>
                </tr>
            `;
        });

        html += `
                <tr style="background-color: #e8f4fd; font-weight: bold;">
                    <td colspan="2" class="text-right">TOTALES:</td>
                    <td class="text-center">${totalCantidad}</td>
                    <td class="text-right">$${totalGeneral.toFixed(2)}</td>
                </tr>
            </tbody>
        </table>
    </div>
        `;

        return html;
    },

    showGananciasReport() {
        const movimientos = AppState.filteredHistorial || AppState.historial || [];
        
        // Filtrar estrictamente solo las facturas de venta
        const ventas = movimientos.filter(mov => {
            if (mov.tipo === 'retiro' || mov.tipo === 'ingreso' || mov.tipo === 'abono') return false;
            return (mov.tipo === 'venta' || mov.invoiceNumber || (mov.products && mov.products.length > 0));
        });

        let totalContado = 0;
        let totalPendientes = 0;
        let totalSaldoPendiente = 0;
        let totalAbonos = 0;
        let totalRetiros = 0;
        let totalIngresos = 0;

        movimientos.forEach(mov => {
            if (mov.tipo === 'retiro') {
                totalRetiros += Math.abs(Number(mov.monto) || 0);
            } else if (mov.tipo === 'abono') {
                totalAbonos += (Number(mov.monto) || 0);
            } else if (mov.tipo === 'ingreso') {
                totalIngresos += (Number(mov.monto) || 0);
            } else if (mov.tipo === 'venta' || mov.invoiceNumber || (mov.products && mov.products.length > 0)) {
                const pType = (mov.paymentType || '').toLowerCase();
                const status = (mov.status || '').toLowerCase();
                const saldo = mov.saldoPendiente !== undefined ? Number(mov.saldoPendiente) : Number(mov.total);

                if (pType === 'contado' || status.includes('pagad') || saldo <= 0 || mov.cancelada) {
                    totalContado += (Number(mov.total) || 0);
                } else {
                    totalPendientes += (Number(mov.total) || 0);
                    totalSaldoPendiente += (saldo > 0 ? saldo : 0);
                }
            }
        });

        // Entradas de efectivo del día = Contado puro/Pagadas + Abonos + Ingresos
        const totalEntradas = totalContado + totalAbonos + totalIngresos;
        // Caja Final = Total Entradas - Retiros
        const cajaFinal = totalEntradas - totalRetiros;

        // 1. Filas de la tabla de facturas
        const facturasRowsHTML = ventas.map(venta => {
            const pType = (venta.paymentType || '').toLowerCase();
            const status = (venta.status || '').toLowerCase();
            const saldo = venta.saldoPendiente !== undefined ? Number(venta.saldoPendiente) : Number(venta.total);
            const esPagada = pType === 'contado' || status.includes('pagad') || saldo <= 0 || venta.cancelada;

            const estadoBadge = esPagada 
                ? `<span style="background: #dcfce7; color: #16a34a; padding: 1px 6px; border-radius: 10px; font-size: 0.7rem; font-weight: 700;">${pType === 'contado' ? 'CONTADO' : 'PAGADO'}</span>`
                : '<span style="background: #fef3c7; color: #d97706; padding: 1px 6px; border-radius: 10px; font-size: 0.7rem; font-weight: 700;">PENDIENTE</span>';

            return `
                <tr style="background: #ffffff; border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 4px 10px; font-weight: 700; color: #2c3e50; font-size: 0.82rem;">#${this._escape(venta.invoiceNumber || venta.id)}</td>
                    <td style="padding: 4px 10px; line-height: 1.1;">
                        <span style="font-weight: 600; color: #1e293b; font-size: 0.8rem;">Eq: ${this._escape(venta.equipoNumber || '-')}</span>
                        <span style="font-size: 0.72rem; color: #64748b; margin-left: 6px;">(${this._escape(venta.clientName || 'Cliente General')})</span>
                    </td>
                    <td style="padding: 4px 10px; text-align: center;">${estadoBadge}</td>
                    <td style="padding: 4px 10px; text-align: right; font-weight: 700; color: #2c3e50; font-size: 0.88rem;">$${Number(venta.total || 0).toFixed(2)}</td>
                    <td style="padding: 4px 10px; text-align: right; font-weight: 700; color: ${!esPagada && saldo > 0 ? '#dc2626' : '#16a34a'}; font-size: 0.88rem;">$${saldo.toFixed(2)}</td>
                </tr>
            `;
        }).join('');

        // 2. Consolidar resumen de productos / servicios vendidos
        const productosMap = new Map();
        ventas.forEach(venta => {
            if (venta.products && Array.isArray(venta.products)) {
                venta.products.forEach(prod => {
                    const desc = (prod.descripcion || 'Sin descripción').trim();
                    const cant = Number(prod.cantidad) || 0;
                    const precio = Number(prod.precio) || 0;
                    const subtotal = cant * precio;

                    if (productosMap.has(desc)) {
                        const item = productosMap.get(desc);
                        item.cantidad += cant;
                        item.total += subtotal;
                    } else {
                        productosMap.set(desc, { cantidad: cant, total: subtotal });
                    }
                });
            }
        });

        const productosList = Array.from(productosMap.entries())
            .map(([desc, data]) => ({ descripcion: desc, cantidad: data.cantidad, total: data.total }))
            .sort((a, b) => a.descripcion.localeCompare(b.descripcion, 'es', { sensitivity: 'base' }));

        let productosTableHTML = '';

        if (productosList.length <= 10) {
            // Tabla normal de 3 columnas (Descripción | Cantidad | Total)
            const filas = productosList.map(prod => `
                <tr style="background: #ffffff; border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 4px 10px; color: #1e293b; font-weight: 500; font-size: 0.8rem;">${this._escape(prod.descripcion)}</td>
                    <td style="padding: 4px 10px; text-align: center; font-weight: 700; color: #16a34a; width: 60px; font-size: 0.82rem;">${prod.cantidad}</td>
                    <td style="padding: 4px 10px; text-align: right; font-weight: 700; color: #0284c7; width: 90px; font-size: 0.85rem;">$${prod.total.toFixed(2)}</td>
                </tr>
            `).join('');

            productosTableHTML = `
                <table style="width: 100%; border-collapse: collapse; font-size: 0.8rem; text-align: left;">
                    <thead>
                        <tr style="background: #334155; color: white;">
                            <th style="padding: 5px 10px; font-weight: 600;">Descripción</th>
                            <th style="padding: 5px 10px; font-weight: 600; text-align: center; width: 60px;">Cant.</th>
                            <th style="padding: 5px 10px; font-weight: 600; text-align: right; width: 90px;">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filas || '<tr><td colspan="3" style="padding: 10px; text-align: center; color: #64748b; font-style: italic;">No hay productos registrados</td></tr>'}
                    </tbody>
                </table>
            `;
        } else {
            // Tabla dividida en 6 columnas (2 bloques de 3 columnas)
            let filas = '';
            const mitad = Math.ceil(productosList.length / 2);
            for (let i = 0; i < mitad; i++) {
                const p1 = productosList[i];
                const p2 = productosList[i + mitad];

                filas += `<tr style="background: #ffffff; border-bottom: 1px solid #e2e8f0;">`;
                
                // Bloque 1
                filas += `
                    <td style="padding: 4px 8px; color: #1e293b; font-weight: 500; border-right: 1px solid #f1f5f9; font-size: 0.78rem;">${this._escape(p1.descripcion)}</td>
                    <td style="padding: 4px 8px; text-align: center; font-weight: 700; color: #16a34a; border-right: 1px solid #f1f5f9; width: 45px; font-size: 0.8rem;">${p1.cantidad}</td>
                    <td style="padding: 4px 8px; text-align: right; font-weight: 700; color: #0284c7; border-right: 2px solid #cbd5e1; width: 75px; font-size: 0.82rem;">$${p1.total.toFixed(2)}</td>
                `;

                // Bloque 2
                if (p2) {
                    filas += `
                        <td style="padding: 4px 8px; color: #1e293b; font-weight: 500; border-right: 1px solid #f1f5f9; font-size: 0.78rem;">${this._escape(p2.descripcion)}</td>
                        <td style="padding: 4px 8px; text-align: center; font-weight: 700; color: #16a34a; border-right: 1px solid #f1f5f9; width: 45px; font-size: 0.8rem;">${p2.cantidad}</td>
                        <td style="padding: 4px 8px; text-align: right; font-weight: 700; color: #0284c7; width: 75px; font-size: 0.82rem;">$${p2.total.toFixed(2)}</td>
                    `;
                } else {
                    filas += `
                        <td style="border-right: 1px solid #f1f5f9;"></td>
                        <td style="border-right: 1px solid #f1f5f9;"></td>
                        <td></td>
                    `;
                }

                filas += `</tr>`;
            }

            productosTableHTML = `
                <table style="width: 100%; border-collapse: collapse; font-size: 0.78rem; text-align: left;">
                    <thead>
                        <tr style="background: #334155; color: white;">
                            <th style="padding: 5px 8px; font-weight: 600;">Descripción</th>
                            <th style="padding: 5px 8px; font-weight: 600; text-align: center; width: 45px;">Cant.</th>
                            <th style="padding: 5px 8px; font-weight: 600; text-align: right; width: 75px; border-right: 2px solid #94a3b8;">Total</th>
                            <th style="padding: 5px 8px; font-weight: 600;">Descripción</th>
                            <th style="padding: 5px 8px; font-weight: 600; text-align: center; width: 45px;">Cant.</th>
                            <th style="padding: 5px 8px; font-weight: 600; text-align: right; width: 75px;">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filas}
                    </tbody>
                </table>
            `;
        }

        // Modificar modal a tamaño amplio con scroll libre
        const modalContent = document.querySelector('#invoice-modal .modal-content');
        if (modalContent) {
            modalContent.style.maxWidth = '900px';
            modalContent.style.width = '95%';
            modalContent.style.maxHeight = '90vh';
            modalContent.style.overflowY = 'auto';
            modalContent.style.padding = '15px';
            modalContent.style.display = 'block';
        }

        const numVentas = ventas.length;

        const reportHTML = `
            <div style="font-family: 'Segoe UI', system-ui, sans-serif; color: #2c3e50; padding: 5px;">
                <!-- Header Violeta Premium -->
                <div style="background: linear-gradient(135deg, #8e44ad 0%, #9b59b6 100%); padding: 12px 20px; border-radius: 12px; text-align: center; color: white; margin-bottom: 15px; box-shadow: 0 4px 15px rgba(142, 68, 173, 0.2);">
                    <h2 style="margin: 0; font-size: 1.3rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;"><i class="fas fa-chart-bar" style="margin-right: 8px;"></i>Reporte de Movimientos</h2>
                    <div style="font-size: 0.8rem; opacity: 0.9; margin-top: 3px;">Movimientos del día (${numVentas} Facturas/Tickets)</div>
                </div>

                <!-- Tarjetas de Resumen Financiero -->
                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 15px;">
                    <!-- 1. CAJA FINAL (EFECTIVO) -->
                    <div style="background: #f0fdf4; border: 2px solid #86efac; padding: 8px; border-radius: 10px; text-align: center;">
                        <span style="font-size: 0.68rem; color: #16a34a; font-weight: bold; text-transform: uppercase;">Caja Final (Efectivo)</span>
                        <div style="font-size: 1.25rem; font-weight: 800; color: #15803d; margin-top: 2px;">$${cajaFinal.toFixed(2)}</div>
                        <span style="font-size: 0.62rem; color: #16a34a; opacity: 0.85;">Entradas ($${totalEntradas.toFixed(2)}) - Retiros</span>
                    </div>

                    <!-- 2. ENTRADAS DE DINERO -->
                    <div style="background: #f0f9ff; border: 1px solid #bae6fd; padding: 8px; border-radius: 10px; text-align: center;">
                        <span style="font-size: 0.68rem; color: #0284c7; font-weight: bold; text-transform: uppercase;">Entradas Totales</span>
                        <div style="font-size: 1.25rem; font-weight: 800; color: #0369a1; margin-top: 2px;">$${totalEntradas.toFixed(2)}</div>
                        <span style="font-size: 0.62rem; color: #0284c7; opacity: 0.9;">Abo: $${totalAbonos.toFixed(2)} | Cont: $${totalContado.toFixed(2)}${totalIngresos > 0 ? ` | Ing: $${totalIngresos.toFixed(2)}` : ''}</span>
                    </div>

                    <!-- 3. RETIROS -->
                    <div style="background: #fef2f2; border: 1px solid #fecaca; padding: 8px; border-radius: 10px; text-align: center;">
                        <span style="font-size: 0.68rem; color: #dc2626; font-weight: bold; text-transform: uppercase;">Retiros de Caja</span>
                        <div style="font-size: 1.25rem; font-weight: 800; color: #b91c1c; margin-top: 2px;">-$${totalRetiros.toFixed(2)}</div>
                        <span style="font-size: 0.62rem; color: #dc2626; opacity: 0.85;">Salidas de dinero</span>
                    </div>

                    <!-- 4. POR COBRAR (PENDIENTES) -->
                    <div style="background: #fffbeb; border: 1px solid #fde68a; padding: 8px; border-radius: 10px; text-align: center;">
                        <span style="font-size: 0.68rem; color: #d97706; font-weight: bold; text-transform: uppercase;">Por Cobrar (Pendientes)</span>
                        <div style="font-size: 1.25rem; font-weight: 800; color: #b45309; margin-top: 2px;">$${totalSaldoPendiente.toFixed(2)}</div>
                        <span style="font-size: 0.62rem; color: #d97706; opacity: 0.85;">Facturado a crédito: $${totalPendientes.toFixed(2)}</span>
                    </div>
                </div>

                <!-- TABLA 1: FACTURAS -->
                <div style="border: 1px solid #e2e8f0; border-radius: 8px; background: #fff; overflow: hidden; margin-bottom: 15px;">
                    <div style="background: #f8fafc; padding: 6px 12px; font-weight: 700; color: #334155; font-size: 0.85rem; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; gap: 6px;">
                        <i class="fas fa-file-invoice" style="color: #3b82f6;"></i> Facturas Realizadas (${ventas.length})
                    </div>
                    <table style="width: 100%; border-collapse: collapse; font-size: 0.8rem; text-align: left;">
                        <thead>
                            <tr style="background: #334155; color: white;">
                                <th style="padding: 5px 10px; font-weight: 600;">Factura</th>
                                <th style="padding: 5px 10px; font-weight: 600;">Equipo / Cliente</th>
                                <th style="padding: 5px 10px; font-weight: 600; text-align: center;">Estado</th>
                                <th style="padding: 5px 10px; font-weight: 600; text-align: right;">Total</th>
                                <th style="padding: 5px 10px; font-weight: 600; text-align: right;">Saldo Pend.</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${facturasRowsHTML || '<tr><td colspan="5" style="padding: 10px; text-align: center; color: #64748b; font-style: italic;">No hay facturas registradas.</td></tr>'}
                        </tbody>
                    </table>
                </div>

                <!-- TABLA 2: RESUMEN DE PRODUCTOS Y SERVICIOS VENDIDOS -->
                <div style="border: 1px solid #e2e8f0; border-radius: 8px; background: #fff; overflow: hidden; margin-bottom: 15px;">
                    <div style="background: #f8fafc; padding: 8px 12px; font-weight: 700; color: #334155; font-size: 0.85rem; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; gap: 6px;">
                        <i class="fas fa-boxes" style="color: #10b981;"></i> Resumen de lo Vendido (${productosList.length} artículos)
                    </div>
                    ${productosTableHTML}
                </div>

                <!-- Botón de impresión del reporte dentro del modal -->
                <div style="display: flex; gap: 10px; margin-top: 10px;">
                    <button onclick="HistorialService.printGananciasReport()" style="flex: 1; padding: 10px; background: linear-gradient(135deg, #27ae60 0%, #219653 100%); color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 0.9rem;">
                        <i class="fas fa-print"></i> IMPRIMIR REPORTE
                    </button>
                </div>
            </div>
        `;

        UIService.showInvoiceModal(reportHTML);
    },

    printGananciasReport() {
        const movimientos = AppState.filteredHistorial || AppState.historial || [];
        
        // Filtrar estrictamente solo las facturas de venta no canceladas
        const ventas = movimientos.filter(mov => {
            if (mov.cancelada) return false;
            if (mov.tipo === 'retiro' || mov.tipo === 'ingreso' || mov.tipo === 'abono') return false;
            return (mov.tipo === 'venta' || mov.invoiceNumber || (mov.products && mov.products.length > 0));
        });

        let totalContado = 0;
        let totalPendientes = 0;
        let totalSaldoPendiente = 0;
        let totalAbonos = 0;
        let totalRetiros = 0;
        let totalIngresos = 0;

        movimientos.forEach(mov => {
            if (mov.tipo === 'retiro') {
                totalRetiros += Math.abs(Number(mov.monto) || 0);
            } else if (mov.tipo === 'abono') {
                totalAbonos += (Number(mov.monto) || 0);
            } else if (mov.tipo === 'ingreso') {
                totalIngresos += (Number(mov.monto) || 0);
            } else if (mov.tipo === 'venta' || mov.invoiceNumber || (mov.products && mov.products.length > 0)) {
                const pType = (mov.paymentType || '').toLowerCase();
                const status = (mov.status || '').toLowerCase();
                const saldo = mov.saldoPendiente !== undefined ? Number(mov.saldoPendiente) : Number(mov.total);

                if (pType === 'contado' || status.includes('pagad') || saldo <= 0 || mov.cancelada) {
                    totalContado += (Number(mov.total) || 0);
                } else {
                    totalPendientes += (Number(mov.total) || 0);
                    totalSaldoPendiente += (saldo > 0 ? saldo : 0);
                }
            }
        });

        const totalEntradas = totalContado + totalAbonos + totalIngresos;
        const cajaFinal = totalEntradas - totalRetiros;

        // 1. Filas de Facturas
        const facturasPrintHTML = ventas.map(venta => {
            const pType = (venta.paymentType || '').toLowerCase();
            const status = (venta.status || '').toLowerCase();
            const saldo = venta.saldoPendiente !== undefined ? Number(venta.saldoPendiente) : Number(venta.total);
            const esPagada = pType === 'contado' || status.includes('pagad') || saldo <= 0 || venta.cancelada;
            const estadoTexto = esPagada ? (pType === 'contado' ? 'CONTADO' : 'PAGADO') : 'PENDIENTE';

            return `
                <tr>
                    <td style="border: 1px solid #ddd; padding: 5px; font-weight: bold;">#${venta.invoiceNumber}</td>
                    <td style="border: 1px solid #ddd; padding: 5px;">Eq: ${venta.equipoNumber || '-'} - ${venta.clientName || 'General'}</td>
                    <td style="border: 1px solid #ddd; padding: 5px; text-align: center;">${estadoTexto}</td>
                    <td style="border: 1px solid #ddd; padding: 5px; text-align: right; font-weight: bold;">$${Number(venta.total || 0).toFixed(2)}</td>
                    <td style="border: 1px solid #ddd; padding: 5px; text-align: right; color: ${!esPagada && saldo > 0 ? '#c0392b' : '#27ae60'}; font-weight: bold;">$${saldo.toFixed(2)}</td>
                </tr>
            `;
        }).join('');

        // 2. Resumen de Productos
        const productosMap = new Map();
        ventas.forEach(venta => {
            if (venta.products && Array.isArray(venta.products)) {
                venta.products.forEach(prod => {
                    const desc = (prod.descripcion || 'Sin descripción').trim();
                    const cant = Number(prod.cantidad) || 0;
                    const precio = Number(prod.precio) || 0;
                    const subtotal = cant * precio;

                    if (productosMap.has(desc)) {
                        const item = productosMap.get(desc);
                        item.cantidad += cant;
                        item.total += subtotal;
                    } else {
                        productosMap.set(desc, { cantidad: cant, total: subtotal });
                    }
                });
            }
        });

        const productosList = Array.from(productosMap.entries())
            .map(([desc, data]) => ({ descripcion: desc, cantidad: data.cantidad, total: data.total }))
            .sort((a, b) => a.descripcion.localeCompare(b.descripcion, 'es', { sensitivity: 'base' }));

        let productosPrintTableHTML = '';
        if (productosList.length <= 10) {
            const filas = productosList.map(prod => `
                <tr>
                    <td style="border: 1px solid #ddd; padding: 3px 5px;">${prod.descripcion}</td>
                    <td style="border: 1px solid #ddd; padding: 3px 5px; text-align: center; font-weight: bold; width: 45px;">${prod.cantidad}</td>
                    <td style="border: 1px solid #ddd; padding: 3px 5px; text-align: right; font-weight: bold; width: 80px;">$${prod.total.toFixed(2)}</td>
                </tr>
            `).join('');

            productosPrintTableHTML = `
                <table>
                    <thead>
                        <tr>
                            <th>Descripción</th>
                            <th style="text-align: center; width: 45px;">Cant.</th>
                            <th style="text-align: right; width: 80px;">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filas || '<tr><td colspan="3" style="text-align: center; padding: 6px;">No hay productos registrados</td></tr>'}
                    </tbody>
                </table>
            `;
        } else {
            let filas = '';
            const mitad = Math.ceil(productosList.length / 2);
            for (let i = 0; i < mitad; i++) {
                const p1 = productosList[i];
                const p2 = productosList[i + mitad];

                filas += `<tr>`;
                filas += `
                    <td style="border: 1px solid #ddd; padding: 3px 5px;">${p1.descripcion}</td>
                    <td style="border: 1px solid #ddd; padding: 3px 5px; text-align: center; font-weight: bold; width: 40px;">${p1.cantidad}</td>
                    <td style="border: 1px solid #ddd; padding: 3px 5px; text-align: right; font-weight: bold; width: 70px; border-right: 2px solid #888;">$${p1.total.toFixed(2)}</td>
                `;
                if (p2) {
                    filas += `
                        <td style="border: 1px solid #ddd; padding: 3px 5px;">${p2.descripcion}</td>
                        <td style="border: 1px solid #ddd; padding: 3px 5px; text-align: center; font-weight: bold; width: 40px;">${p2.cantidad}</td>
                        <td style="border: 1px solid #ddd; padding: 3px 5px; text-align: right; font-weight: bold; width: 70px;">$${p2.total.toFixed(2)}</td>
                    `;
                } else {
                    filas += `
                        <td style="border: 1px solid #ddd;"></td>
                        <td style="border: 1px solid #ddd;"></td>
                        <td style="border: 1px solid #ddd;"></td>
                    `;
                }
                filas += `</tr>`;
            }

            productosPrintTableHTML = `
                <table>
                    <thead>
                        <tr>
                            <th>Descripción</th>
                            <th style="text-align: center; width: 40px;">Cant.</th>
                            <th style="text-align: right; width: 70px; border-right: 2px solid #888;">Total</th>
                            <th>Descripción</th>
                            <th style="text-align: center; width: 40px;">Cant.</th>
                            <th style="text-align: right; width: 70px;">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filas}
                    </tbody>
                </table>
            `;
        }

        const printWindow = window.open('', '_blank', 'width=800,height=600');
        if (!printWindow) {
            alert("Por favor permita las ventanas emergentes para imprimir.");
            return;
        }

        const content = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Reporte de Ventas y Movimientos - Taller Willian</title>
                <style>
                    @page { size: letter; margin: 10mm; }
                    body { font-family: 'Arial', sans-serif; margin: 10px; font-size: 11px; color: #2c3e50; }
                    h2 { text-align: center; margin: 0 0 4px 0; color: #2c3e50; }
                    h3 { text-align: center; margin: 0 0 8px 0; color: #7f8c8d; font-size: 13px; }
                    .date { text-align: center; color: #95a5a6; margin-bottom: 12px; font-size: 9px; }
                    .cards-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 12px; }
                    .card { border: 1px solid #ddd; padding: 6px; text-align: center; border-radius: 4px; }
                    .card-title { font-size: 8px; text-transform: uppercase; font-weight: bold; color: #7f8c8d; }
                    .card-val { font-size: 13px; font-weight: bold; margin-top: 2px; }
                    .card-sub { font-size: 7.5px; color: #7f8c8d; margin-top: 2px; }
                    table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
                    th { background-color: #f2f2f2; border: 1px solid #ddd; padding: 5px; font-weight: bold; text-align: left; font-size: 10px; }
                    .sec-title { font-size: 11px; font-weight: bold; margin: 10px 0 4px 0; color: #2c3e50; border-bottom: 1px solid #ddd; padding-bottom: 2px; }
                </style>
            </head>
            <body>
                <h2>TALLER WILLIAN</h2>
                <h3>REPORTE DE VENTAS Y MOVIMIENTOS</h3>
                <div class="date">Generado el: ${new Date().toLocaleString('es-ES')}</div>

                <div class="cards-grid">
                    <div class="card" style="background: #f0fdf4; border-color: #86efac;">
                        <div class="card-title" style="color: #16a34a;">Caja Final (Efectivo)</div>
                        <div class="card-val" style="color: #15803d;">$${cajaFinal.toFixed(2)}</div>
                        <div class="card-sub">Entradas ($${totalEntradas.toFixed(2)}) - Retiros</div>
                    </div>
                    <div class="card" style="background: #f0f9ff; border-color: #bae6fd;">
                        <div class="card-title" style="color: #0284c7;">Entradas Totales</div>
                        <div class="card-val" style="color: #0369a1;">$${totalEntradas.toFixed(2)}</div>
                        <div class="card-sub">Abo: $${totalAbonos.toFixed(2)} | Cont: $${totalContado.toFixed(2)}</div>
                    </div>
                    <div class="card" style="background: #fef2f2; border-color: #fecaca;">
                        <div class="card-title" style="color: #dc2626;">Retiros de Caja</div>
                        <div class="card-val" style="color: #b91c1c;">-$${totalRetiros.toFixed(2)}</div>
                        <div class="card-sub">Salidas de dinero</div>
                    </div>
                    <div class="card" style="background: #fffbeb; border-color: #fde68a;">
                        <div class="card-title" style="color: #d97706;">Por Cobrar (Pendientes)</div>
                        <div class="card-val" style="color: #b45309;">$${totalSaldoPendiente.toFixed(2)}</div>
                        <div class="card-sub">Facturado a crédito: $${totalPendientes.toFixed(2)}</div>
                    </div>
                </div>

                <div class="sec-title">Facturas Realizadas (${ventas.length})</div>
                <table>
                    <thead>
                        <tr>
                            <th>Factura</th>
                            <th>Equipo / Cliente</th>
                            <th style="text-align: center;">Estado</th>
                            <th style="text-align: right;">Total</th>
                            <th style="text-align: right;">Saldo Pend.</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${facturasPrintHTML || '<tr><td colspan="5" style="text-align: center; padding: 6px;">No hay facturas registradas</td></tr>'}
                    </tbody>
                </table>

                <div class="sec-title">Resumen de lo Vendido (${productosList.length} artículos)</div>
                ${productosPrintTableHTML}
            </body>
            </html>
        `;

        printWindow.document.open();
        printWindow.document.write(content);
        printWindow.document.close();

        printWindow.onload = function() {
            printWindow.focus();
            printWindow.print();
            printWindow.close();
        };

        if (printWindow.document.readyState === 'complete') {
            printWindow.onload();
        }
    }
};
