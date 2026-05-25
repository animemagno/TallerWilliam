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
        // Filtrar solo las ventas no canceladas
        const ventas = movimientos.filter(mov => (mov.tipo === 'venta' || !mov.tipo) && !mov.cancelada);

        let totalVentas = 0;
        let totalCostos = 0;
        let totalGanancia = 0;

        const filasHTML = [];

        // Modificar modal a tamaño pantalla completa
        const modalContent = document.querySelector('#invoice-modal .modal-content');
        if (modalContent) {
            modalContent.style.maxWidth = '98%';
            modalContent.style.width = '98%';
            modalContent.style.maxHeight = '98vh';
            modalContent.style.height = '98vh';
            modalContent.style.padding = '15px';
            modalContent.style.display = 'flex';
            modalContent.style.flexDirection = 'column';
            
            const contentWrapper = document.getElementById('invoice-modal-content');
            if (contentWrapper) {
                contentWrapper.style.flex = '1';
                contentWrapper.style.display = 'flex';
                contentWrapper.style.flexDirection = 'column';
                contentWrapper.style.minHeight = '0';
            }
        }

        ventas.forEach(venta => {
            let costoVenta = 0;
            const tieneProductos = venta.products && venta.products.length > 0;
            let prodsRowsHTML = '';

            if (tieneProductos) {
                venta.products.forEach(prod => {
                    let costoItem = 0;
                    if (prod.costo !== undefined) {
                        costoItem = Number(prod.costo) || 0;
                    } else if (prod.codigo && prod.codigo !== 'MANUAL' && typeof ProductCache !== 'undefined' && ProductCache.data) {
                        let cacheItem = null;
                        if (prod.id) cacheItem = ProductCache.data.get(prod.id);
                        if (!cacheItem && prod.codigo) cacheItem = ProductCache.getByCode(prod.codigo);
                        
                        if (cacheItem && cacheItem.costo !== undefined) {
                            costoItem = Number(cacheItem.costo) || 0;
                        }
                    }

                    if (prod.tipo === 'servicio') {
                        costoItem = 0;
                    }

                    const cantidad = Number(prod.cantidad) || 0;
                    const precioUnit = Number(prod.precio) || 0;
                    const itemTotalVenta = precioUnit * cantidad;
                    const itemTotalCosto = costoItem * cantidad;
                    const itemGanancia = itemTotalVenta - itemTotalCosto;
                    const itemMargen = itemTotalVenta > 0 ? ((itemGanancia / itemTotalVenta) * 100).toFixed(0) : 0;

                    costoVenta += itemTotalCosto;

                    prodsRowsHTML += `
                        <tr style="border-bottom: 1px solid #f1f2f6;">
                            <td style="padding: 6px 8px; text-align: center; color: #57606f;">${cantidad}</td>
                            <td style="padding: 6px 8px; color: #2c3e50;">${this._escape(prod.descripcion || 'Sin descripción')}</td>
                            <td style="padding: 6px 8px; text-align: right; color: #57606f;">$${precioUnit.toFixed(2)}</td>
                            <td style="padding: 6px 8px; text-align: right; color: #7f8c8d;">$${costoItem.toFixed(2)}</td>
                            <td style="padding: 6px 8px; text-align: right; color: #2c3e50; font-weight: 500;">$${itemTotalVenta.toFixed(2)}</td>
                            <td style="padding: 6px 8px; text-align: right; color: #7f8c8d;">$${itemTotalCosto.toFixed(2)}</td>
                            <td style="padding: 6px 8px; text-align: right; color: #8e44ad; font-weight: bold;">$${itemGanancia.toFixed(2)}</td>
                            <td style="padding: 6px 8px; text-align: center;"><span style="background: #f8effc; color: #9b59b6; padding: 1px 4px; border-radius: 4px; font-size: 0.7rem;">${itemMargen}%</span></td>
                        </tr>
                    `;
                });
            } else {
                prodsRowsHTML = `
                    <tr>
                        <td colspan="8" style="padding: 8px; text-align: center; color: #95a5a6; font-style: italic;">No hay artículos registrados para esta factura.</td>
                    </tr>
                `;
            }

            const gananciaVenta = venta.total - costoVenta;
            totalVentas += venta.total;
            totalCostos += costoVenta;
            totalGanancia += gananciaVenta;

            const margen = venta.total > 0 ? (gananciaVenta / venta.total * 100).toFixed(0) : 0;

            filasHTML.push(`
                <tr style="background: #fdfefe; border-top: 2px solid #e2e8f0;">
                    <td style="padding: 10px 8px; font-weight: bold; color: #2c3e50;">#${this._escape(venta.invoiceNumber)}</td>
                    <td style="padding: 10px 8px;">
                        <div style="font-weight: 600; color: #34495e;">Eq: ${this._escape(venta.equipoNumber || '-')}</div>
                        <div style="font-size: 0.75rem; color: #7f8c8d;">${this._escape(venta.clientName || 'Cliente General')}</div>
                    </td>
                    <td style="padding: 10px 8px; text-align: right; font-weight: bold; color: #2c3e50;">$${venta.total.toFixed(2)}</td>
                    <td style="padding: 10px 8px; text-align: right; color: #7f8c8d;">$${costoVenta.toFixed(2)}</td>
                    <td style="padding: 10px 8px; text-align: right; font-weight: bold; color: #8e44ad;">$${gananciaVenta.toFixed(2)}</td>
                    <td style="padding: 10px 8px; text-align: center;"><span style="background: #f3e5f5; color: #8e44ad; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: bold;">${margen}%</span></td>
                </tr>
                <tr style="background: #fafbfc;">
                    <td colspan="6" style="padding: 6px 12px 12px 12px; border-bottom: 2px solid #e2e8f0;">
                        <div style="margin: 0; padding: 0 5px; border-left: 3px solid #8e44ad;">
                            <table style="width: 100%; border-collapse: collapse; font-size: 0.75rem; background: white; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; box-shadow: inset 0 1px 3px rgba(0,0,0,0.02);">
                                <thead>
                                    <tr style="background: #f8f9fa; color: #7f8c8d; border-bottom: 1px solid #e2e8f0; font-size: 0.7rem; text-transform: uppercase;">
                                        <th style="padding: 5px 8px; font-weight: bold; text-align: center; width: 45px;">Cant</th>
                                        <th style="padding: 5px 8px; font-weight: bold;">Detalle del Producto / Servicio</th>
                                        <th style="padding: 5px 8px; font-weight: bold; text-align: right; width: 75px;">Precio U.</th>
                                        <th style="padding: 5px 8px; font-weight: bold; text-align: right; width: 75px;">Costo U.</th>
                                        <th style="padding: 5px 8px; font-weight: bold; text-align: right; width: 85px;">Total Vta</th>
                                        <th style="padding: 5px 8px; font-weight: bold; text-align: right; width: 85px;">Total Costo</th>
                                        <th style="padding: 5px 8px; font-weight: bold; text-align: right; width: 85px; color: #8e44ad;">Ganancia</th>
                                        <th style="padding: 5px 8px; font-weight: bold; text-align: center; width: 55px;">Margen</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${prodsRowsHTML}
                                </tbody>
                            </table>
                        </div>
                    </td>
                </tr>
            `);
        });

        const numVentas = ventas.length;

        const reportHTML = `
            <div style="font-family: 'Segoe UI', system-ui, sans-serif; color: #2c3e50; display: flex; flex-direction: column; height: 100%; min-height: 0; padding: 5px;">
                <!-- Header Violeta Premium -->
                <div style="background: linear-gradient(135deg, #8e44ad 0%, #9b59b6 100%); padding: 15px 20px; border-radius: 12px; text-align: center; color: white; margin-bottom: 15px; box-shadow: 0 4px 15px rgba(142, 68, 173, 0.2); flex-shrink: 0;">
                    <div style="font-size: 1.8rem; margin-bottom: 5px;"><i class="fas fa-chart-line"></i></div>
                    <h2 style="margin: 0; font-size: 1.4rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;">Reporte de Ganancias</h2>
                    <div style="font-size: 0.85rem; opacity: 0.9; margin-top: 5px;">Movimientos seleccionados (${numVentas} Facturas/Tickets)</div>
                </div>

                <!-- Tarjetas de Resumen Financiero -->
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 15px; flex-shrink: 0;">
                    <div style="background: #f8f9fa; border: 1px solid #e2e8f0; padding: 10px 8px; border-radius: 10px; text-align: center;">
                        <span style="font-size: 0.7rem; color: #7f8c8d; font-weight: bold; text-transform: uppercase;">Total Ventas</span>
                        <div style="font-size: 1.15rem; font-weight: bold; color: #2c3e50; margin-top: 4px;">$${totalVentas.toFixed(2)}</div>
                    </div>
                    <div style="background: #f8f9fa; border: 1px solid #e2e8f0; padding: 10px 8px; border-radius: 10px; text-align: center;">
                        <span style="font-size: 0.7rem; color: #7f8c8d; font-weight: bold; text-transform: uppercase;">Costo Total</span>
                        <div style="font-size: 1.15rem; font-weight: bold; color: #e74c3c; margin-top: 4px;">$${totalCostos.toFixed(2)}</div>
                    </div>
                    <div style="background: #f3e5f5; border: 2px solid #d6b4fc; padding: 10px 8px; border-radius: 10px; text-align: center;">
                        <span style="font-size: 0.7rem; color: #8e44ad; font-weight: bold; text-transform: uppercase;">Ganancia Neta</span>
                        <div style="font-size: 1.25rem; font-weight: 800; color: #8e44ad; margin-top: 4px;">$${totalGanancia.toFixed(2)}</div>
                    </div>
                </div>

                <!-- Tabla Detallada -->
                <div style="flex: 1; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 15px; min-height: 0; background: #fff;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem; text-align: left;">
                        <thead>
                            <tr style="background: #34495e; color: white; position: sticky; top: 0; z-index: 10;">
                                <th style="padding: 10px 8px; font-weight: 600;">Factura</th>
                                <th style="padding: 10px 8px; font-weight: 600;">Equipo / Cliente</th>
                                <th style="padding: 10px 8px; font-weight: 600; text-align: right;">Venta</th>
                                <th style="padding: 10px 8px; font-weight: 600; text-align: right;">Costo</th>
                                <th style="padding: 10px 8px; font-weight: 600; text-align: right;">Ganancia</th>
                                <th style="padding: 10px 8px; font-weight: 600; text-align: center;">Margen</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${filasHTML.length > 0 ? filasHTML.join('') : '<tr><td colspan="6" style="padding: 20px; text-align: center; color: #7f8c8d; font-style: italic;">No hay ventas registradas en la vista actual.</td></tr>'}
                        </tbody>
                    </table>
                </div>

                <!-- Botón de impresión del reporte dentro del modal -->
                <div style="display: flex; gap: 10px; flex-shrink: 0;">
                    <button onclick="HistorialService.printGananciasReport()" style="flex: 1; padding: 12px; background: linear-gradient(135deg, #27ae60 0%, #219653 100%); color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 0.9rem;">
                        <i class="fas fa-print"></i> IMPRIMIR REPORTE
                    </button>
                </div>
            </div>
        `;

        UIService.showInvoiceModal(reportHTML);
    },

    printGananciasReport() {
        const movimientos = AppState.filteredHistorial || AppState.historial || [];
        const ventas = movimientos.filter(mov => (mov.tipo === 'venta' || !mov.tipo) && !mov.cancelada);

        let totalVentas = 0;
        let totalCostos = 0;
        let totalGanancia = 0;

        let filasHTML = '';

        ventas.forEach(venta => {
            let costoVenta = 0;
            const tieneProductos = venta.products && venta.products.length > 0;
            let prodsRowsHTML = '';

            if (tieneProductos) {
                venta.products.forEach(prod => {
                    let costoItem = 0;
                    if (prod.costo !== undefined) {
                        costoItem = Number(prod.costo) || 0;
                    } else if (prod.codigo && prod.codigo !== 'MANUAL' && typeof ProductCache !== 'undefined' && ProductCache.data) {
                        let cacheItem = null;
                        if (prod.id) cacheItem = ProductCache.data.get(prod.id);
                        if (!cacheItem && prod.codigo) cacheItem = ProductCache.getByCode(prod.codigo);
                        
                        if (cacheItem && cacheItem.costo !== undefined) {
                            costoItem = Number(cacheItem.costo) || 0;
                        }
                    }

                    if (prod.tipo === 'servicio') {
                        costoItem = 0;
                    }

                    const cantidad = Number(prod.cantidad) || 0;
                    const precioUnit = Number(prod.precio) || 0;
                    const itemTotalVenta = precioUnit * cantidad;
                    const itemTotalCosto = costoItem * cantidad;
                    const itemGanancia = itemTotalVenta - itemTotalCosto;
                    const itemMargen = itemTotalVenta > 0 ? ((itemGanancia / itemTotalVenta) * 100).toFixed(0) : 0;

                    costoVenta += itemTotalCosto;

                    prodsRowsHTML += `
                        <tr style="border-bottom: 1px solid #ddd;">
                            <td style="padding: 5px; text-align: center; border-right: 1px solid #ddd;">${cantidad}</td>
                            <td style="padding: 5px; border-right: 1px solid #ddd;">${prod.descripcion || 'Sin descripción'}</td>
                            <td style="padding: 5px; text-align: right; border-right: 1px solid #ddd;">$${precioUnit.toFixed(2)}</td>
                            <td style="padding: 5px; text-align: right; border-right: 1px solid #ddd;">$${costoItem.toFixed(2)}</td>
                            <td style="padding: 5px; text-align: right; border-right: 1px solid #ddd;">$${itemTotalVenta.toFixed(2)}</td>
                            <td style="padding: 5px; text-align: right; border-right: 1px solid #ddd;">$${itemTotalCosto.toFixed(2)}</td>
                            <td style="padding: 5px; text-align: right; border-right: 1px solid #ddd; font-weight: bold; color: #8e44ad;">$${itemGanancia.toFixed(2)}</td>
                            <td style="padding: 5px; text-align: center;">${itemMargen}%</td>
                        </tr>
                    `;
                });
            } else {
                prodsRowsHTML = `
                    <tr>
                        <td colspan="8" style="padding: 5px; text-align: center; color: #999; font-style: italic;">No hay artículos registrados para esta factura.</td>
                    </tr>
                `;
            }

            const gananciaVenta = venta.total - costoVenta;
            totalVentas += venta.total;
            totalCostos += costoVenta;
            totalGanancia += gananciaVenta;

            const margen = venta.total > 0 ? (gananciaVenta / venta.total * 100).toFixed(0) : 0;

            filasHTML += `
                <tr style="background-color: #f2f2f2; font-weight: bold;">
                    <td style="border: 1px solid #ddd; padding: 8px;">#${venta.invoiceNumber}</td>
                    <td style="border: 1px solid #ddd; padding: 8px;">Eq: ${venta.equipoNumber || '-'} - ${venta.clientName || 'General'}</td>
                    <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">$${venta.total.toFixed(2)}</td>
                    <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">$${costoVenta.toFixed(2)}</td>
                    <td style="border: 1px solid #ddd; padding: 8px; text-align: right; font-weight: bold; color: #8e44ad;">$${gananciaVenta.toFixed(2)}</td>
                    <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${margen}%</td>
                </tr>
                <tr>
                    <td colspan="6" style="border: 1px solid #ddd; padding: 6px 12px 12px 12px; background-color: #ffffff;">
                        <div style="border-left: 3px solid #8e44ad; padding-left: 8px;">
                            <table style="width: 100%; border-collapse: collapse; font-size: 10px; border: 1px solid #ddd;">
                                <thead>
                                    <tr style="background-color: #f9f9f9; border-bottom: 1px solid #ddd; font-weight: bold;">
                                        <th style="padding: 4px; text-align: center; width: 40px; border-right: 1px solid #ddd;">Cant</th>
                                        <th style="padding: 4px; border-right: 1px solid #ddd;">Descripción</th>
                                        <th style="padding: 4px; text-align: right; width: 70px; border-right: 1px solid #ddd;">Precio U.</th>
                                        <th style="padding: 4px; text-align: right; width: 70px; border-right: 1px solid #ddd;">Costo U.</th>
                                        <th style="padding: 4px; text-align: right; width: 80px; border-right: 1px solid #ddd;">Total Vta</th>
                                        <th style="padding: 4px; text-align: right; width: 80px; border-right: 1px solid #ddd;">Total Costo</th>
                                        <th style="padding: 4px; text-align: right; width: 80px; border-right: 1px solid #ddd; color: #8e44ad;">Ganancia</th>
                                        <th style="padding: 4px; text-align: center; width: 50px;">Margen</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${prodsRowsHTML}
                                </tbody>
                            </table>
                        </div>
                    </td>
                </tr>
            `;
        });

        const printWindow = window.open('', '_blank', 'width=800,height=600');
        if (!printWindow) {
            alert("Por favor permita las ventanas emergentes para imprimir.");
            return;
        }

        const content = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Reporte de Ganancias - Taller Willian</title>
                <style>
                    body { font-family: 'Arial', sans-serif; margin: 20px; font-size: 12px; color: #333; }
                    h2 { color: #2c3e50; text-align: center; margin-bottom: 5px; }
                    .date { text-align: center; color: #7f8c8d; margin-bottom: 20px; font-size: 10px; }
                    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                    th { background-color: #f2f2f2; border: 1px solid #ddd; padding: 10px; font-weight: bold; text-align: left; }
                    .totals-box { display: flex; justify-content: flex-end; gap: 20px; font-size: 14px; margin-top: 20px; border-top: 2px solid #333; padding-top: 10px; }
                    .totals-box div { font-weight: bold; }
                </style>
            </head>
            <body>
                <h2>TALLER WILLIAN</h2>
                <h3 style="text-align: center; margin: 5px 0;">REPORTE DE GANANCIAS</h3>
                <div class="date">Generado el: ${new Date().toLocaleString('es-ES')}</div>

                <table>
                    <thead>
                        <tr>
                            <th>Factura</th>
                            <th>Equipo / Cliente</th>
                            <th style="text-align: right;">Total Venta</th>
                            <th style="text-align: right;">Costo Total</th>
                            <th style="text-align: right;">Ganancia</th>
                            <th style="text-align: center;">Margen</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filasHTML}
                    </tbody>
                </table>

                <div class="totals-box">
                    <div>Total Ventas: $${totalVentas.toFixed(2)}</div>
                    <div style="color: #c0392b;">Costo Total: $${totalCostos.toFixed(2)}</div>
                    <div style="color: #27ae60;">Ganancia Total: $${totalGanancia.toFixed(2)}</div>
                </div>
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
