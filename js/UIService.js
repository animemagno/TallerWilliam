const UIService = {
    showStatus(message, type = 'info') {
        const statusElement = document.getElementById('status-message');
        statusElement.textContent = message;
        statusElement.className = `status ${type}`;
        statusElement.style.display = 'block';

        setTimeout(() => {
            statusElement.style.display = 'none';
        }, 4000);
    },

    showLoading(show = true) {
        const loadingOverlay = document.getElementById('loading-overlay');
        loadingOverlay.style.display = show ? 'flex' : 'none';
    },

    // Función para intercambiar el layout
    toggleDashboardLayout() {
        const dashboard = document.querySelector('.dashboard');
        dashboard.classList.toggle('reversed');

        // Guardar preferencia (opcional)
        const isReversed = dashboard.classList.contains('reversed');
        localStorage.setItem('dashboardReversed', isReversed);
    },

    // Toggle menú de acciones en historial
    toggleActionMenu(buttonElement) {
        const dropdown = buttonElement.nextElementSibling;
        const isOpen = dropdown.classList.contains('show');

        // Cerrar todos los menús abiertos
        document.querySelectorAll('.action-dropdown.show').forEach(d => d.classList.remove('show'));

        // Toggle actual
        if (!isOpen) {
            dropdown.classList.add('show');
        }
    },

    showRetiroModal() {
        document.getElementById('retiro-modal').style.display = 'flex';
        document.getElementById('concepto-retiro').value = '';
        document.getElementById('monto-retiro').value = '';
        document.getElementById('categoria-retiro').value = 'compra';
        document.getElementById('concepto-retiro').focus();
    },

    showIngresoModal() {
        document.getElementById('ingreso-modal').style.display = 'flex';
        document.getElementById('concepto-ingreso').value = '';
        document.getElementById('monto-ingreso').value = '';
        document.getElementById('categoria-ingreso').value = 'venta';
        document.getElementById('concepto-ingreso').focus();
    },



    showEditarRetiroModal(retiro) {
        document.getElementById('edit-retiro-id').value = retiro.id;
        document.getElementById('edit-concepto-retiro').value = retiro.concepto;
        document.getElementById('edit-monto-retiro').value = retiro.monto;
        document.getElementById('edit-categoria-retiro').value = retiro.categoria;
        document.getElementById('editar-retiro-modal').style.display = 'flex';
    },

    showEditarIngresoModal(ingreso) {
        document.getElementById('edit-ingreso-id').value = ingreso.id;
        document.getElementById('edit-concepto-ingreso').value = ingreso.concepto;
        document.getElementById('edit-monto-ingreso').value = ingreso.monto;
        document.getElementById('edit-categoria-ingreso').value = ingreso.categoria;
        document.getElementById('editar-ingreso-modal').style.display = 'flex';
    },

    updateCartDisplay() {
        const cartItems = document.getElementById('cart-items');
        const totalAmount = document.getElementById('total-amount');

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

        // SCROLL AUTOMÁTICO AL FINAL
        const cartContainer = document.getElementById('cart-items');
        cartContainer.scrollTop = cartContainer.scrollHeight;
    },

    showSearchResults(results) {
        const dropdown = document.getElementById('search-dropdown');
        dropdown.innerHTML = '';

        if (results.length === 0) {
            const item = document.createElement('div');
            item.className = 'search-dropdown-item';
            item.textContent = 'No se encontraron productos - Presione para agregar manualmente';
            item.addEventListener('click', () => {
                const searchInput = document.getElementById('buscar-producto');
                SalesService.addManualProduct(searchInput.value);
                dropdown.style.display = 'none';
                searchInput.value = '';
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
                    SalesService.addToCart(product);
                    dropdown.style.display = 'none';
                    document.getElementById('buscar-producto').value = '';
                });
                dropdown.appendChild(item);
            });
        }

        dropdown.style.display = 'block';
    },



    applyCurrentFilter() {
        HistorialService.applyCurrentFilter();
    },

    async filterHistoryByDate() {
        const dateInput = document.getElementById('history-date-filter');
        const date = dateInput.value;

        if (!date) {
            this.showStatus("Por favor selecciona una fecha", "warning");
            return;
        }

        try {
            this.showLoading(true);
            const movimientos = await DataService.loadMovementsByDate(date);

            if (movimientos.length === 0) {
                this.showStatus(`No hay movimientos para ${date}`, "info");
            } else {
                this.showStatus(`Mostrando ${movimientos.length} movimientos del ${date}`, "success");
            }

            AppState.filteredHistorial = movimientos;
            HistorialService.renderHistorial();
        } catch (error) {
            console.error("Error filterHistoryByDate:", error);
            this.showStatus("Error al filtrar historial: " + error.message, "error");
        } finally {
            this.showLoading(false);
        }
    },





    async searchProductInHistory() {
        const productName = document.getElementById('product-search-input').value.trim();
        const startDate = document.getElementById('product-search-start-date').value;
        const endDate = document.getElementById('product-search-end-date').value;

        if (!productName) {
            this.showStatus("Por favor ingresa el nombre del producto a buscar", "warning");
            return;
        }

        if (!startDate || !endDate) {
            this.showStatus("Por favor selecciona un rango de fechas", "warning");
            return;
        }

        try {
            this.showLoading(true);
            const resultados = await DataService.searchProductInHistory(productName, startDate, endDate);
            this.showProductSearchResults(resultados, productName);
        } catch (error) {
            this.showStatus("Error al buscar producto: " + error.message, "error");
        } finally {
            this.showLoading(false);
        }
    },

    showProductSearchResults(resultados, productName) {
        const historialBody = document.getElementById('historial-body');
        const dailySummary = document.getElementById('daily-summary-container');
        const productResults = document.getElementById('product-search-results');

        // Ocultar resumen diario
        if (dailySummary) {
            dailySummary.style.display = 'none';
        }

        if (resultados.length === 0) {
            productResults.style.display = 'block';
            historialBody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 40px; color: #7f8c8d;">
                        <i class="fas fa-search" style="font-size: 3rem; margin-bottom: 10px; display: block; opacity: 0.3;"></i>
                        <p style="margin: 0;">No se encontraron ventas con el producto "<strong>${productName}</strong>" en el rango seleccionado.</p>
                    </td>
                </tr>
            `;
            return;
        }

        // Mostrar indicador de resultados
        productResults.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-weight: bold; color: #2c3e50;">
                    <i class="fas fa-check-circle" style="color: #27ae60;"></i>
                    ${resultados.length} venta(s) encontrada(s) con "${productName}"
                </span>
                <button class="btn btn-secondary" onclick="SalesService.loadHistorial()" style="padding: 5px 12px; font-size: 0.85rem;">
                    <i class="fas fa-times"></i> Cerrar búsqueda
                </button>
            </div>
        `;
        productResults.style.display = 'block';

        // Renderizar resultados en la tabla de historial
        let historialHTML = '';
        resultados.forEach((venta) => {
            const fecha = venta.timestamp ? new Date(venta.timestamp.toDate ? venta.timestamp.toDate() : venta.timestamp).toLocaleDateString('es-ES') : 'N/A';
            const tipoPago = venta.paymentType === 'contado' ? 'contado-badge' : 'pendiente-badge';
            const tipoTexto = venta.paymentType === 'contado' ? 'CONTADO' : 'CRÉDITO';

            // Construir lista de productos encontrados
            let productosHTML = '';
            venta.productosEncontrados.forEach(prod => {
                productosHTML += `
                    <div style="padding: 4px 0; border-bottom: 1px dashed #ddd; margin-bottom: 4px;">
                        <strong style="color: #2980b9;">${prod.descripcion}</strong><br>
                        <span style="font-size: 0.8rem; color: #666;">
                            Cant: <strong>${prod.cantidad}</strong> | 
                            Precio: $${prod.precio.toFixed(2)} | 
                            Total: <strong>$${(prod.cantidad * prod.precio).toFixed(2)}</strong>
                        </span>
                    </div>
                `;
            });

            historialHTML += `
                <tr style="background-color: #f0f8ff;">
                    <td><strong>#${venta.invoiceNumber}</strong></td>
                    <td>
                        <div class="cliente-equipo">${venta.equipoNumber || '-'}</div>
                        <div class="cliente-nombre">${venta.clientName || 'Cliente General'}</div>
                    </td>
                    <td>
                        <div style="margin-bottom: 8px;">
                            ${productosHTML}
                        </div>
                        <div style="background: #ecf0f1; padding: 5px; border-radius: 3px; text-align: right; font-weight: bold;">
                            Total Venta: $${venta.total.toFixed(2)}
                        </div>
                    </td>
                    <td><span class="${tipoPago}">${tipoTexto}</span></td>
                    <td>${fecha}</td>
                    <td>
                        <div class="action-buttons historial-actions-container">
                            <button class="icon-btn btn-view" onclick="SalesService.viewInvoice('${venta.id}')" title="Ver factura">
                                <i class="fas fa-eye"></i>
                            </button>
                            <button class="icon-btn btn-reprint" onclick="SalesService.reprintInvoice('${venta.id}')" title="Reimprimir">
                                <i class="fas fa-print"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });

        historialBody.innerHTML = historialHTML;
    },

    setProductSearchMonth(type) {
        const today = new Date();
        let startDate, endDate;

        if (type === 'current') {
            // Primer día del mes actual
            startDate = new Date(today.getFullYear(), today.getMonth(), 1);
            // Último día del mes actual
            endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        } else if (type === 'last') {
            // Primer día del mes pasado
            startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            // Último día del mes pasado
            endDate = new Date(today.getFullYear(), today.getMonth(), 0);
        }

        // Formatear fechas a YYYY-MM-DD
        const formatDate = (date) => {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        document.getElementById('product-search-start-date').value = formatDate(startDate);
        document.getElementById('product-search-end-date').value = formatDate(endDate);
    },

    clearProductSearch() {
        document.getElementById('product-search-input').value = '';
        document.getElementById('product-search-start-date').value = '';
        document.getElementById('product-search-end-date').value = '';
        document.getElementById('product-search-results').style.display = 'none';
        // Recargar historial normal
        SalesService.loadHistorial();
    },

    showInvoiceModal(content) {
        document.getElementById('invoice-modal-content').innerHTML = content;
        document.getElementById('invoice-modal').style.display = 'block';
    },

    showAbonoModal(content) {
        document.getElementById('abono-modal-content').innerHTML = content;
        document.getElementById('abono-modal').style.display = 'block';
        document.getElementById('monto-abono').value = '';
        document.getElementById('monto-abono').focus();
    },

    showRetiroModal() {
        document.getElementById('retiro-modal').style.display = 'block';
        document.getElementById('monto-retiro').value = '';
        document.getElementById('concepto-retiro').value = '';
        document.getElementById('categoria-retiro').value = 'compra';
        document.getElementById('monto-retiro').focus();
    },

    restorePaymentButtons() {
        // Restaurar los botones originales en sus contenedores
        const contadoContainer = document.querySelector('.venta-line-1').lastElementChild;
        const pendienteContainer = document.querySelector('.venta-line-2').lastElementChild;

        contadoContainer.innerHTML = '<button class="btn btn-success" id="contado-btn">CONTADO</button>';
        pendienteContainer.innerHTML = '<button class="btn btn-warning" id="pendiente-btn">PENDIENTE</button>';

        // Restaurar event listeners
        document.getElementById('contado-btn').addEventListener('click', () => SalesService.processSale('contado'));
        document.getElementById('pendiente-btn').addEventListener('click', () => SalesService.processSale('pendiente'));
    },

    updateFilterButtons() {
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.filter === AppState.currentFilter) {
                btn.classList.add('active');
            }
        });
    },

    setupTabs() {
        const tabButtons = document.querySelectorAll('.tab-btn');
        const tabContents = document.querySelectorAll('.tab-content');

        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const tabId = button.getAttribute('data-tab');

                tabButtons.forEach(btn => btn.classList.remove('active'));
                tabContents.forEach(content => content.classList.remove('active'));

                button.classList.add('active');
                document.getElementById(`tab-${tabId}`).classList.add('active');
            });
        });
    },

    updatePaymentButtonsState(processing = false) {
        const contadoBtn = document.getElementById('contado-btn');
        const pendienteBtn = document.getElementById('pendiente-btn');

        if (processing) {
            contadoBtn.disabled = true;
            pendienteBtn.disabled = true;
            contadoBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> VERIFICANDO...';
            pendienteBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> VERIFICANDO...';
        } else {
            contadoBtn.disabled = false;
            pendienteBtn.disabled = false;
            contadoBtn.innerHTML = 'CONTADO';
            pendienteBtn.innerHTML = 'PENDIENTE';
        }
    },

    showDuplicateWarning(invoiceNumber) {
        const statusElement = document.getElementById('status-message');
        statusElement.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between;">
                <div>
                    <i class="fas fa-exclamation-triangle"></i>
                    <strong>ADVERTENCIA:</strong> La factura ${invoiceNumber} ya existe
                </div>
                <button onclick="SalesService.regenerateInvoiceNumber()" class="btn btn-warning btn-small" style="margin-left: 10px;">
                    <i class="fas fa-sync"></i> Generar Nueva
                </button>
            </div>
        `;
        statusElement.className = 'status error duplicate-warning';
        statusElement.style.display = 'block';
    }
};
