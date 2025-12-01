import { AppState } from '../store/AppState.js';
import { DateUtils } from '../utils/DateUtils.js';

export const ModalService = {
    closeAbonoModal() {
        const modal = document.getElementById('abono-modal');
        if (modal) modal.style.display = 'none';
    },

    closeRetiroModal() {
        const modal = document.getElementById('retiro-modal');
        if (modal) modal.style.display = 'none';
    },

    closeIngresoModal() {
        const modal = document.getElementById('ingreso-modal');
        if (modal) modal.style.display = 'none';
    },

    closeInvoiceModal() {
        const modal = document.getElementById('invoice-modal');
        if (modal) modal.style.display = 'none';
    },

    closeDetalleModal() {
        const modal = document.getElementById('detalle-modal');
        if (modal) modal.style.display = 'none';
    },

    closeGrupoDetalleModal() {
        const modal = document.getElementById('grupo-detalle-modal');
        if (modal) modal.style.display = 'none';
    },

    closeCrearGrupoModal() {
        const modal = document.getElementById('crear-grupo-modal');
        if (modal) modal.style.display = 'none';
    },

    closeEditarGrupoModal() {
        const modal = document.getElementById('editar-grupo-modal');
        if (modal) modal.style.display = 'none';
    },

    closeConfirmacionAbonoModal() {
        const modal = document.getElementById('confirmacion-abono-modal');
        if (modal) modal.style.display = 'none';
    },

    closeAbonoInicialModal() {
        const modal = document.getElementById('abono-inicial-modal');
        if (modal) modal.style.display = 'none';
    }
};

export const UIService = {
    showStatus(message, type = 'info') {
        const statusElement = document.getElementById('status-message');
        if (!statusElement) return;

        statusElement.textContent = message;
        statusElement.className = `status ${type}`;
        statusElement.style.display = 'block';

        setTimeout(() => {
            statusElement.style.display = 'none';
        }, 4000);
    },

    showLoading(show = true) {
        const loadingOverlay = document.getElementById('loading-overlay');
        if (loadingOverlay) {
            loadingOverlay.style.display = show ? 'flex' : 'none';
        }
    },

    showRetiroModal() {
        const modal = document.getElementById('retiro-modal');
        if (modal) {
            modal.style.display = 'flex';
            const concepto = document.getElementById('concepto-retiro');
            const monto = document.getElementById('monto-retiro');
            const categoria = document.getElementById('categoria-retiro');

            if (concepto) {
                concepto.value = '';
                concepto.focus();
            }
            if (monto) monto.value = '';
            if (categoria) categoria.value = 'compra';
        }
    },

    showIngresoModal() {
        const modal = document.getElementById('ingreso-modal');
        if (modal) {
            modal.style.display = 'flex';
            const concepto = document.getElementById('concepto-ingreso');
            const monto = document.getElementById('monto-ingreso');
            const categoria = document.getElementById('categoria-ingreso');

            if (concepto) {
                concepto.value = '';
                concepto.focus();
            }
            if (monto) monto.value = '';
            if (categoria) categoria.value = 'venta';
        }
    },

    closeIngresoModal() {
        ModalService.closeIngresoModal();
    },

    updateHistorial(movimientos) {
        const historialBody = document.getElementById('historial-body');
        if (!historialBody) return;

        AppState.historial = movimientos || [];
        AppState.filteredHistorial = movimientos || [];

        const dailySummary = document.getElementById('daily-summary-container');
        if (dailySummary) {
            dailySummary.style.display = 'none';
        }
        this.applyCurrentFilter();
    },

    applyCurrentFilter() {
        let filtered = AppState.historial;

        switch (AppState.currentFilter) {
            case 'hoy':
                const today = DateUtils.getCurrentDateStringElSalvador();
                filtered = filtered.filter(mov => {
                    return mov.date === today;
                });
                break;
            case 'todo':
                break;
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

        let historialHTML = '';
        movimientos.forEach(movimiento => {
            const fecha = movimiento.timestamp ? new Date(movimiento.timestamp.toDate ? movimiento.timestamp.toDate() : movimiento.timestamp).toLocaleDateString('es-ES') : 'N/A';

            if (movimiento.tipo === 'venta') {
                const statusClass = movimiento.status === 'cancelado' ? 'cancelado' : '';
                const statusBadge = movimiento.status === 'cancelado' ? '<span class="cancelado-badge">CANCELADO</span>' :
                    movimiento.paymentType === 'contado' ? '<span class="contado-badge">CONTADO</span>' :
                        '<span class="pendiente-badge">PENDIENTE</span>';

                const tieneAbonos = movimiento.abonos && movimiento.abonos.length > 0;
                const mostrarSaldo = movimiento.saldoPendiente !== undefined && movimiento.saldoPendiente > 0 && tieneAbonos;

                historialHTML += `
                    <tr class="${statusClass}">
                        <td><strong>${movimiento.invoiceNumber || 'N/A'}</strong></td>
                        <td>
                            <div class="cliente-equipo">${movimiento.equipoNumber || 'N/A'}</div>
                            <div class="cliente-nombre">${movimiento.clientName || 'Sin nombre'}</div>
                        </td>
                        <td>
                            <div class="total-factura">$${(movimiento.total || 0).toFixed(2)}</div>
                            ${mostrarSaldo ? `<div class="saldo-pendiente">Saldo: $${movimiento.saldoPendiente.toFixed(2)}</div>` : ''}
                        </td>
                        <td>${statusBadge}</td>
                        <td>${fecha}</td>
                        <td>
                            <div class="action-buttons historial-actions-container">
                                <button class="icon-btn btn-view" onclick="SalesService.viewInvoice('${movimiento.id}')" title="Ver factura">
                                    <i class="fas fa-eye"></i>
                                </button>
                                ${movimiento.status !== 'cancelado' && movimiento.paymentType !== 'contado' ?
                        `<button class="icon-btn btn-payment" onclick="SalesService.showAbonoModal('${movimiento.id}')" title="Realizar abono">
                                        <i class="fas fa-dollar-sign"></i>
                                    </button>` : ''}
                                ${movimiento.status !== 'cancelado' ?
                        `<button class="icon-btn btn-edit" onclick="SalesService.editInvoice('${movimiento.id}')" title="Editar factura">
                                        <i class="fas fa-edit"></i>
                                    </button>` : ''}
                                <button class="icon-btn btn-print" onclick="PrintService.printTicket('${movimiento.id}')" title="Imprimir">
                                    <i class="fas fa-print"></i>
                                </button>
                                ${movimiento.status !== 'cancelado' ?
                        `<button class="icon-btn btn-delete" onclick="SalesService.deleteInvoice('${movimiento.id}')" title="Eliminar factura">
                                        <i class="fas fa-trash"></i>
                                    </button>` : ''}
                            </div>
                        </td>
                    </tr>
                `;
            }
        });

        historialBody.innerHTML = historialHTML;
    },

    updateFilterButtons() {
        document.querySelectorAll('.filter-btn').forEach(btn => {
            if (btn.dataset.filter === AppState.currentFilter) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    },

    updateCartDisplay() {
        const cartItems = document.getElementById('cart-items');
        const totalAmount = document.getElementById('total-amount');

        if (!cartItems || !totalAmount) return;

        if (AppState.cart.length === 0) {
            cartItems.innerHTML = `
                <div class="empty-cart">
                    <i class="fas fa-shopping-cart" style="font-size: 2rem; margin-bottom: 10px; opacity: 0.5;"></i>
                    <div>No hay productos agregados</div>
                </div>
            `;
            totalAmount.textContent = 'TOTAL: $0.00';
            return;
        }

        let total = 0;
        let itemsHTML = '';

        AppState.cart.forEach((item, index) => {
            const itemTotal = item.precio * item.cantidad;
            total += itemTotal;

            const tienePrecioCero = item.precio === 0;

            itemsHTML += `
                <div class="cart-item">
                    <div>
                        <input type="number" class="quantity-input" value="${item.cantidad}" 
                               min="1" data-index="${index}" onchange="SalesService.updateQuantity(${index}, this.value)">
                    </div>
                    <div class="product-desc">${item.descripcion}</div>
                    <div>
                        <input type="number" class="price-input ${tienePrecioCero ? 'price-warning' : ''}" value="${item.precio.toFixed(2)}" 
                               step="0.01" min="0" data-index="${index}" onchange="SalesService.updatePrice(${index}, this.value)">
                    </div>
                    <div class="subtotal">$${itemTotal.toFixed(2)}</div>
                    <div class="cart-actions">
                        <button class="delete-item-btn" onclick="SalesService.removeFromCart(${index})" title="Eliminar producto">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
        });

        cartItems.innerHTML = itemsHTML;
        totalAmount.textContent = `TOTAL: $${total.toFixed(2)}`;

        const cartContainer = document.getElementById('cart-items');
        if (cartContainer) {
            cartContainer.scrollTop = cartContainer.scrollHeight;
        }
    },

    showSearchResults(results) {
        const dropdown = document.getElementById('search-dropdown');
        if (!dropdown) return;

        dropdown.innerHTML = '';

        if (results.length === 0) {
            const item = document.createElement('div');
            item.className = 'search-dropdown-item';
            item.textContent = 'No se encontraron productos - Presione para agregar manualmente';
            item.addEventListener('click', () => {
                const searchInput = document.getElementById('buscar-producto');
                if (searchInput) {
                    const { SalesService } = window;
                    SalesService.addManualProduct(searchInput.value);
                    dropdown.style.display = 'none';
                    searchInput.value = '';
                }
            });
            dropdown.appendChild(item);
        } else {
            results.forEach(product => {
                const item = document.createElement('div');
                item.className = 'search-dropdown-item';
                const isManual = product.id.startsWith('manual-');
                item.innerHTML = `
                    <strong>${product.descripcion || 'Sin descripción'}</strong>
                    <div style="font-size: 0.7rem; margin-top: 2px;">
                        ${isManual ? 'PRODUCTO MANUAL' : `Cód: ${product.codigo || 'N/A'} | Stock: ${product.cantidad || 0}`} | $${(product.precio || 0).toFixed(2)}
                    </div>
                `;
                item.addEventListener('click', () => {
                    const { SalesService } = window;
                    SalesService.addToCart(product);
                    dropdown.style.display = 'none';
                    const searchInput = document.getElementById('buscar-producto');
                    if (searchInput) {
                        searchInput.value = '';
                    }
                });
                dropdown.appendChild(item);
            });
        }

        dropdown.style.display = 'block';
    },

    updatePaymentButtonsState(disabled) {
        const contadoBtn = document.getElementById('contado-btn');
        const pendienteBtn = document.getElementById('pendiente-btn');
        if (contadoBtn) contadoBtn.disabled = disabled;
        if (pendienteBtn) pendienteBtn.disabled = disabled;
    },

    restorePaymentButtons() {
        const contadoContainer = document.querySelector('.venta-line-1')?.lastElementChild;
        const pendienteContainer = document.querySelector('.venta-line-2')?.lastElementChild;

        if (contadoContainer) {
            contadoContainer.innerHTML = `
                <button class="btn btn-success" id="contado-btn">COBRAR CONTADO</button>
            `;
        }

        if (pendienteContainer) {
            pendienteContainer.innerHTML = `
                <button class="btn btn-warning" id="pendiente-btn">VENTA PENDIENTE</button>
            `;
        }

        // Reconectar event listeners
        const contadoBtn = document.getElementById('contado-btn');
        const pendienteBtn = document.getElementById('pendiente-btn');

        if (contadoBtn) {
            contadoBtn.addEventListener('click', () => {
                const { SalesService } = window;
                SalesService.processSale('contado');
            });
        }

        if (pendienteBtn) {
            pendienteBtn.addEventListener('click', () => {
                const { SalesService } = window;
                SalesService.processSale('pendiente');
            });
        }
    },

    setupTabs() {
        const tabBtns = document.querySelectorAll('.tab-btn');
        const tabContents = document.querySelectorAll('.tab-content');

        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const tabName = btn.dataset.tab;

                tabBtns.forEach(b => b.classList.remove('active'));
                tabContents.forEach(c => c.classList.remove('active'));

                btn.classList.add('active');
                const targetTab = document.getElementById(`tab-${tabName}`);
                if (targetTab) {
                    targetTab.classList.add('active');
                }
            });
        });
    }
};
