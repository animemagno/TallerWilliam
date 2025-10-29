// Servicio de Interfaz de Usuario
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

    updateHistorial(movimientos) {
        const historialBody = document.getElementById('historial-body');
        AppState.historial = movimientos;
        AppState.filteredHistorial = movimientos;
        
        this.applyCurrentFilter();
    },

    applyCurrentFilter() {
        let filtered = AppState.historial;
        
        switch (AppState.currentFilter) {
            case 'hoy':
                const today = DateUtils.getCurrentDateStringElSalvador();
                filtered = filtered.filter(mov => mov.date === today);
                break;
            case 'ventas':
                filtered = filtered.filter(mov => 
                    mov.tipo === 'venta' && 
                    (mov.paymentType === 'contado' || 
                    (mov.paymentType === 'pendiente' && (mov.saldoPendiente || mov.total) <= 0))
                );
                break;
            case 'abonos':
                filtered = filtered.filter(mov => 
                    mov.tipo === 'venta' && 
                    mov.paymentType === 'pendiente' && 
                    mov.abonos && 
                    mov.abonos.length > 0 && 
                    (mov.saldoPendiente || mov.total) > 0
                );
                break;
            case 'retiros':
                filtered = filtered.filter(mov => mov.tipo === 'retiro');
                break;
            case 'pendientes':
                filtered = filtered.filter(mov => 
                    mov.tipo === 'venta' && 
                    mov.paymentType === 'pendiente' && 
                    (mov.saldoPendiente || mov.total) > 0
                );
                break;
        }
        
        AppState.filteredHistorial = filtered;
        this.renderHistorial();
    },

    renderHistorial() {
        const historialBody = document.getElementById('historial-body');
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
            if (movimiento.tipo === 'retiro') {
                const fecha = movimiento.timestamp ? new Date(movimiento.timestamp.toDate ? movimiento.timestamp.toDate() : movimiento.timestamp).toLocaleDateString('es-ES') : 'N/A';
                
                historialHTML += `
                    <tr>
                        <td><strong>RET-${movimiento.id.substring(0, 8)}</strong></td>
                        <td>
                            <div class="cliente-equipo">-</div>
                            <div class="cliente-nombre">${movimiento.concepto || 'Sin concepto'}</div>
                        </td>
                        <td>
                            <div class="saldo-pendiente-rojo">-$${movimiento.monto.toFixed(2)}</div>
                        </td>
                        <td><span class="retiro-badge">RETIRO</span></td>
                        <td>${fecha}</td>
                        <td>
                            <div class="action-buttons historial-actions-container">
                                <button class="icon-btn btn-view" onclick="SalesService.viewRetiro('${movimiento.id}')" title="Ver retiro">
                                    <i class="fas fa-eye"></i>
                                </button>
                                <button class="icon-btn btn-delete" onclick="SalesService.deleteRetiro('${movimiento.id}')" title="Eliminar">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
            } else {
                const venta = movimiento;
                const fecha = venta.timestamp ? new Date(venta.timestamp.toDate ? venta.timestamp.toDate() : venta.timestamp).toLocaleDateString('es-ES') : 'N/A';
                
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
                        tipoTexto = 'CONTADO';
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
                
                let botonesHTML = '';
                
                if (estadoReal === 'contado') {
                    botonesHTML = `
                        <button class="icon-btn btn-view" onclick="SalesService.viewInvoice('${venta.id}')" title="Ver factura">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="icon-btn btn-reprint" onclick="SalesService.reprintInvoice('${venta.id}')" title="Reimprimir">
                            <i class="fas fa-print"></i>
                        </button>
                        <button class="icon-btn btn-delete" onclick="SalesService.deleteInvoice('${venta.id}')" title="Eliminar">
                            <i class="fas fa-trash"></i>
                        </button>
                    `;
                } else {
                    botonesHTML = `
                        <button class="icon-btn btn-view" onclick="SalesService.viewInvoice('${venta.id}')" title="Ver factura">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="icon-btn btn-reprint" onclick="SalesService.reprintInvoice('${venta.id}')" title="Reimprimir">
                            <i class="fas fa-print"></i>
                        </button>
                        <button class="icon-btn btn-edit" onclick="SalesService.editInvoice('${venta.id}')" title="Editar">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="icon-btn btn-abono" onclick="SalesService.registrarAbono('${venta.id}')" title="Registrar abono">
                            <i class="fas fa-money-bill-wave"></i>
                        </button>
                        <button class="icon-btn btn-delete" onclick="SalesService.deleteInvoice('${venta.id}')" title="Eliminar">
                            <i class="fas fa-trash"></i>
                        </button>
                        <button class="icon-btn btn-cancel" onclick="SalesService.cancelInvoice('${venta.id}')" title="Cancelar factura">
                            <i class="fas fa-ban"></i>
                        </button>
                    `;
                }
                
                historialHTML += `
                    <tr>
                        <td><strong>${venta.invoiceNumber || 'N/A'}</strong></td>
                        <td>
                            <div class="cliente-equipo">${venta.equipoNumber || 'N/A'}</div>
                            <div class="cliente-nombre">${venta.clientName || 'Sin nombre'}</div>
                        </td>
                        <td>
                            <div class="${claseMonto}">$${montoMostrar.toFixed(2)}</div>
                        </td>
                        <td><span class="${tipoClass}">${tipoTexto}</span></td>
                        <td>${fecha}</td>
                        <td>
                            <div class="action-buttons historial-actions-container">
                                ${botonesHTML}
                            </div>
                        </td>
                    </tr>
                `;
            }
        });
        
        historialBody.innerHTML = historialHTML;
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
        const paymentButtons = document.querySelector('.venta-buttons');
        paymentButtons.innerHTML = `
            <button class="btn btn-success" id="contado-btn">
                CONTADO
            </button>
            <button class="btn btn-warning" id="pendiente-btn">
                PENDIENTE
            </button>
        `;
        
        // Re-asignar event listeners después de restaurar
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
    },

    // NUEVA FUNCIÓN: Crear botones de edición
    createEditButtons(invoiceId) {
        const updateBtn = document.createElement('button');
        updateBtn.className = 'btn btn-success btn-full';
        updateBtn.id = 'update-btn';
        updateBtn.textContent = 'ACTUALIZAR FACTURA';
        updateBtn.onclick = () => SalesService.updateInvoice(invoiceId);
        
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn btn-danger';
        cancelBtn.style.marginTop = '10px';
        cancelBtn.textContent = 'CANCELAR EDICIÓN';
        cancelBtn.onclick = () => SalesService.cancelEdit();
        
        return { updateBtn, cancelBtn };
    }
};

// Servicio de Ventas
const SalesService = {
    addToCart(product) {
        const cartItem = {
            id: product.id,
            codigo: product.codigo || 'MANUAL',
            descripcion: product.descripcion || 'Sin descripción',
            precio: product.precio || 0,
            cantidad: 1
        };
        
        AppState.cart.push(cartItem);
        UIService.updateCartDisplay();
        UIService.showStatus("Producto agregado al carrito", "success");
    },

    addManualProduct(descripcion) {
        if (!descripcion.trim()) {
            UIService.showStatus("Ingrese una descripción para el producto", "error");
            return;
        }
        
        this.addToCart({
            id: 'manual-' + Date.now(),
            codigo: 'MANUAL',
            descripcion: descripcion,
            precio: 0,
            cantidad: 1
        });
    },

    removeFromCart(index) {
        AppState.cart.splice(index, 1);
        UIService.updateCartDisplay();
        UIService.showStatus("Producto eliminado del carrito", "info");
    },

    updateQuantity(index, newQuantity) {
        const quantity = parseInt(newQuantity) || 1;
        if (quantity < 1) {
            UIService.showStatus("La cantidad debe ser al menos 1", "error");
            AppState.cart[index].cantidad = 1;
        } else {
            AppState.cart[index].cantidad = quantity;
        }
        UIService.updateCartDisplay();
    },

    updatePrice(index, newPrice) {
        const price = parseFloat(newPrice) || 0;
        if (price < 0) {
            UIService.showStatus("El precio no puede ser negativo", "error");
            AppState.cart[index].precio = 0;
        } else {
            AppState.cart[index].precio = price;
        }
        UIService.updateCartDisplay();
    },

    async generateInvoiceNumber() {
        const fechaVenta = document.getElementById('fecha-venta').value;
        const date = fechaVenta || DateUtils.getCurrentDateStringElSalvador();
        const datePart = date.replace(/-/g, '').substring(2);
        
        try {
            const currentCounter = await DataService.getSaleCounter(date);
            const counterPart = (currentCounter + 1).toString().padStart(4, '0');
            
            const invoiceNumber = datePart + counterPart;
            
            AppState.currentInvoiceNumber = invoiceNumber;
            return invoiceNumber;
        } catch (error) {
            const fallback = datePart + Date.now().toString().substr(-4);
            console.error("Error generando factura, usando fallback:", fallback);
            AppState.currentInvoiceNumber = fallback;
            return fallback;
        }
    },

    async regenerateInvoiceNumber() {
        try {
            const newInvoiceNumber = await this.generateInvoiceNumber();
            UIService.showStatus(`Nueva factura generada: ${newInvoiceNumber}`, "success");
            return newInvoiceNumber;
        } catch (error) {
            UIService.showStatus("Error generando nueva factura", "error");
            throw error;
        }
    },

    async verifyInvoiceUnique(invoiceNumber) {
        try {
            const exists = await DataService.checkInvoiceExists(invoiceNumber);
            if (exists) {
                UIService.showDuplicateWarning(invoiceNumber);
                return false;
            }
            return true;
        } catch (error) {
            console.error("Error verificando factura única:", error);
            return true;
        }
    },

    validateSaleData(equipo, cliente, fechaVenta) {
        if (!equipo.trim()) {
            throw new Error("El número de equipo es obligatorio");
        }
        
        if (!/^\d+$/.test(equipo.trim())) {
            throw new Error("El número de equipo debe contener solo números");
        }
        
        if (!fechaVenta) {
            throw new Error("Seleccione una fecha para la venta");
        }
        
        if (DateUtils.isFutureDateInElSalvador(fechaVenta)) {
            throw new Error("No puede seleccionar una fecha futura");
        }
        
        const productosConPrecioCero = AppState.cart.filter(item => item.precio === 0);
        if (productosConPrecioCero.length > 0) {
            throw new Error("Hay productos con precio $0.00. Modifique los precios antes de guardar.");
        }
        
        return true;
    },

    async processSale(paymentType) {
        if (AppState.processingSale) {
            UIService.showStatus("Ya hay una venta en proceso", "error");
            return;
        }

        if (AppState.cart.length === 0) {
            UIService.showStatus("El carrito está vacío", "error");
            return;
        }
        
        const equipo = document.getElementById('equipo').value.trim();
        const cliente = document.getElementById('cliente').value.trim();
        const fechaVenta = document.getElementById('fecha-venta').value;
        
        try {
            this.validateSaleData(equipo, cliente, fechaVenta);
            
            const finalCliente = cliente || `Equipo ${equipo}`;
            const finalEquipo = equipo || '0000';
            
            const totalVenta = AppState.cart.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
            if (totalVenta > 1000) {
                const confirmacion = confirm(`¿Está seguro de guardar esta venta por $${totalVenta.toFixed(2)}?`);
                if (!confirmacion) {
                    return;
                }
            }
            
            AppState.processingSale = true;
            UIService.updatePaymentButtonsState(true);
            
            const invoiceNumber = await this.generateInvoiceNumber();
            
            const isUnique = await this.verifyInvoiceUnique(invoiceNumber);
            if (!isUnique) {
                AppState.processingSale = false;
                UIService.updatePaymentButtonsState(false);
                return;
            }
            
            const saleData = {
                invoiceNumber: invoiceNumber,
                equipoNumber: finalEquipo,
                clientName: finalCliente,
                products: AppState.cart.map(item => ({
                    id: item.id,
                    codigo: item.codigo,
                    descripcion: item.descripcion,
                    precio: item.precio,
                    cantidad: item.cantidad
                })),
                total: totalVenta,
                paymentType: paymentType,
                timestamp: DateUtils.getCurrentTimestampElSalvador(),
                date: fechaVenta,
                status: paymentType === 'contado' ? 'pagado' : 'pendiente'
            };

            if (paymentType === 'pendiente') {
                saleData.saldoPendiente = saleData.total;
                saleData.abonos = [];
            }
            
            await DataService.saveSale(saleData);
            
            this.printTicket(saleData);
            
            UIService.showStatus(`Venta ${paymentType === 'contado' ? 'CONTADO' : 'PENDIENTE'} procesada - Factura #${saleData.invoiceNumber}`, "success");
            
            AppState.cart = [];
            UIService.updateCartDisplay();
            document.getElementById('equipo').value = '';
            document.getElementById('cliente').value = '';
            document.getElementById('buscar-producto').value = '';
            
            await ProductCache.refresh();
            
            await this.loadHistorial();
            
        } catch (error) {
            UIService.showStatus("Error al procesar la venta: " + error.message, "error");
            console.error("Error en processSale:", error);
        } finally {
            AppState.processingSale = false;
            UIService.updatePaymentButtonsState(false);
        }
    },

    async updateInvoice(invoiceId) {
        if (AppState.cart.length === 0) {
            UIService.showStatus("El carrito está vacío", "error");
            return;
        }
        
        try {
            const ventaActual = await DataService.getSaleById(invoiceId);
            if (!ventaActual) {
                throw new Error("No se encontró la factura a actualizar");
            }

            const productosConPrecioCero = AppState.cart.filter(item => item.precio === 0);
            if (productosConPrecioCero.length > 0) {
                throw new Error("Hay productos con precio $0.00. Modifique los precios antes de actualizar.");
            }

            const nuevoTotal = AppState.cart.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
            
            let nuevoSaldoPendiente = nuevoTotal;
            if (ventaActual.abonos && ventaActual.abonos.length > 0) {
                const totalAbonado = ventaActual.abonos.reduce((sum, abono) => sum + abono.monto, 0);
                nuevoSaldoPendiente = nuevoTotal - totalAbonado;
            }
            
            const saleData = {
                products: AppState.cart.map(item => ({
                    id: item.id,
                    codigo: item.codigo,
                    descripcion: item.descripcion,
                    precio: item.precio,
                    cantidad: item.cantidad
                })),
                total: nuevoTotal,
                saldoPendiente: nuevoSaldoPendiente,
                timestamp: DateUtils.getCurrentTimestampElSalvador()
            };
            
            if (nuevoSaldoPendiente <= 0) {
                saleData.paymentType = 'contado';
                saleData.status = 'pagado';
            }
            
            await DataService.updateSale(invoiceId, saleData);
            
            UIService.showStatus("Factura actualizada correctamente", "success");
            
            const ventaActualizada = { ...ventaActual, ...saleData };
            this.printTicket(ventaActualizada);
            
            this.cancelEdit();
            
            await this.loadHistorial();
            
        } catch (error) {
            UIService.showStatus("Error al actualizar la factura: " + error.message, "error");
        }
    },

    async loadHistorial() {
        try {
            const movimientos = await DataService.loadAllMovements(500);
            UIService.updateHistorial(movimientos);
        } catch (error) {
            UIService.showStatus("Error al cargar historial: " + error.message, "error");
        }
    },

    async viewInvoice(invoiceId) {
        let venta;
        try {
            venta = await DataService.getSaleById(invoiceId);
        } catch (error) {
            venta = AppState.historial.find(v => v.id === invoiceId && v.tipo === 'venta');
        }
        
        if (!venta) return;
        
        let productsHTML = '';
        if (venta.products && venta.products.length > 0) {
            venta.products.forEach(product => {
                productsHTML += `
                    <div style="display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #eee;">
                        <div>${product.descripcion} (x${product.cantidad})</div>
                        <div>$${(product.precio * product.cantidad).toFixed(2)}</div>
                </div>
                `;
            });
        }

        let abonosHTML = '';
        if (venta.abonos && venta.abonos.length > 0) {
            abonosHTML += `<div class="abono-section">
                <h4>Historial de Abonos:</h4>`;
            venta.abonos.forEach(abono => {
                const fechaAbono = abono.fecha ? new Date(abono.fecha.toDate ? abono.fecha.toDate() : abono.fecha).toLocaleString('es-ES') : 'N/A';
                abonosHTML += `
                    <div class="abono-item">
                        <div>${fechaAbono}</div>
                        <div>$${abono.monto.toFixed(2)}</div>
                    </div>
                `;
            });
            abonosHTML += `</div>`;
        }

        const saldoPendiente = venta.saldoPendiente !== undefined ? venta.saldoPendiente : venta.total;
        const saldoInfo = venta.paymentType === 'pendiente' && saldoPendiente > 0 ? 
            `<div class="saldo-info">
                Saldo Pendiente: $${saldoPendiente.toFixed(2)}
            </div>` : '';
        
        const fecha = venta.timestamp ? new Date(venta.timestamp.toDate ? venta.timestamp.toDate() : venta.timestamp).toLocaleString('es-ES') : 'N/A';
        
        let estadoMostrar = venta.paymentType;
        if (venta.paymentType === 'pendiente' && saldoPendiente <= 0) {
            estadoMostrar = 'contado';
        }
        const tipo = estadoMostrar === 'contado' ? 'CONTADO' : 'PENDIENTE';
        
        const modalContent = `
            <h3 style="margin-bottom: 15px; text-align: center;">Factura #${venta.invoiceNumber}</h3>
            <div class="invoice-details">
                <strong>Grupo:</strong> ${venta.clientName || 'N/A'}<br>
                <strong>Equipo:</strong> ${venta.equipoNumber || 'N/A'}<br>
                <strong>Tipo:</strong> ${tipo}<br>
                <strong>Fecha:</strong> ${fecha}<br>
                <strong>Total:</strong> $${(venta.total || 0).toFixed(2)}
            </div>
            ${saldoInfo}
            <h4 style="margin: 15px 0 10px 0;">Productos:</h4>
            ${productsHTML || '<p>No hay productos</p>'}
            ${abonosHTML}
        `;
        
        UIService.showInvoiceModal(modalContent);
    },

    async viewRetiro(retiroId) {
        let retiro;
        try {
            if (AppState.firebaseInitialized) {
                const doc = await AppState.db.collection("RETIROS").doc(retiroId).get();
                if (doc.exists) {
                    retiro = { id: doc.id, ...doc.data() };
                }
            } else {
                retiro = AppState.historial.find(r => r.id === retiroId && r.tipo === 'retiro');
            }
        } catch (error) {
            retiro = AppState.historial.find(r => r.id === retiroId && r.tipo === 'retiro');
        }
        
        if (!retiro) return;
        
        const fecha = retiro.timestamp ? new Date(retiro.timestamp.toDate ? retiro.timestamp.toDate() : retiro.timestamp).toLocaleString('es-ES') : 'N/A';
        const categoriaText = {
            'compra': 'Compra de materiales',
            'gastos': 'Gastos operativos',
            'herramientas': 'Herramientas',
            'otros': 'Otros'
        }[retiro.categoria] || retiro.categoria;
        
        const modalContent = `
            <h3 style="margin-bottom: 15px; text-align: center;">Retiro de Fondos</h3>
            <div class="invoice-details">
                <strong>Concepto:</strong> ${retiro.concepto || 'Sin concepto'}<br>
                <strong>Categoría:</strong> ${categoriaText}<br>
                <strong>Fecha:</strong> ${fecha}<br>
                <strong>Monto:</strong> $${(retiro.monto || 0).toFixed(2)}
            </div>
        `;
        
        UIService.showInvoiceModal(modalContent);
    },

    // FUNCIÓN CORREGIDA: Editar factura
    async editInvoice(invoiceId) {
        console.log("Iniciando edición de factura:", invoiceId);
        
        let venta = AppState.historial.find(v => v.id === invoiceId && v.tipo === 'venta');
        if (!venta) {
            UIService.showStatus("No se encontró la factura para editar", "error");
            return;
        }
        
        console.log("Factura encontrada:", venta);
        
        // Cargar productos en el carrito
        AppState.cart = venta.products.map(p => ({
            id: p.id,
            codigo: p.codigo,
            descripcion: p.descripcion,
            precio: p.precio,
            cantidad: p.cantidad
        }));
        
        // Llenar campos del formulario
        document.getElementById('equipo').value = venta.equipoNumber || '';
        document.getElementById('cliente').value = venta.clientName || '';
        document.getElementById('fecha-venta').value = venta.date || DateUtils.getCurrentDateStringElSalvador();
        
        AppState.currentEditingInvoice = invoiceId;
        
        // Actualizar interfaz
        UIService.updateCartDisplay();
        
        // Obtener contenedor de botones
        const paymentButtons = document.querySelector('.venta-buttons');
        console.log("Contenedor de botones encontrado:", paymentButtons);
        
        // Limpiar botones existentes
        paymentButtons.innerHTML = '';
        
        // Crear nuevos botones de edición
        const { updateBtn, cancelBtn } = UIService.createEditButtons(invoiceId);
        
        // Agregar botones al contenedor
        paymentButtons.appendChild(updateBtn);
        paymentButtons.appendChild(cancelBtn);
        
        console.log("Botones de edición agregados correctamente");
        
        UIService.showStatus("Modo edición activado - Editando factura pendiente", "success");
    },

    cancelEdit() {
        console.log("Cancelando edición");
        
        AppState.cart = [];
        AppState.currentEditingInvoice = null;
        this.setTodayDate();
        UIService.updateCartDisplay();
        document.getElementById('equipo').value = '';
        document.getElementById('cliente').value = '';
        document.getElementById('buscar-producto').value = '';
        
        UIService.restorePaymentButtons();
        
        UIService.showStatus("Edición cancelada", "info");
    },

    async deleteInvoice(invoiceId) {
        if (!confirm("¿Está seguro de eliminar esta factura? Esta acción no se puede deshacer.")) return;
        
        try {
            await DataService.deleteSale(invoiceId);
            UIService.showStatus("Factura eliminada correctamente", "success");
            await this.loadHistorial();
        } catch (error) {
            UIService.showStatus("Error al eliminar factura: " + error.message, "error");
        }
    },

    async deleteRetiro(retiroId) {
        if (!confirm("¿Está seguro de eliminar este retiro? Esta acción no se puede deshacer.")) return;
        
        try {
            if (AppState.firebaseInitialized) {
                await AppState.db.collection("RETIROS").doc(retiroId).delete();
                UIService.showStatus("Retiro eliminado correctamente", "success");
                await this.loadHistorial();
            } else {
                throw new Error("No hay conexión a la base de datos");
            }
        } catch (error) {
            UIService.showStatus("Error al eliminar retiro: " + error.message, "error");
        }
    },

    async cancelInvoice(invoiceId) {
        if (!confirm("¿Está seguro de cancelar esta factura? Se cambiará el estado a CONTADO.")) return;
        
        try {
            await DataService.cancelInvoice(invoiceId);
            UIService.showStatus("Factura cancelada correctamente", "success");
            await this.loadHistorial();
        } catch (error) {
            UIService.showStatus("Error al cancelar factura: " + error.message, "error");
        }
    },

    async reprintInvoice(invoiceId) {
        let venta;
        try {
            venta = await DataService.getSaleById(invoiceId);
        } catch (error) {
            venta = AppState.historial.find(v => v.id === invoiceId && v.tipo === 'venta');
        }
        
        if (venta) {
            this.printTicket(venta);
            UIService.showStatus("Ticket reimpreso", "success");
        }
    },

    async registrarAbono(invoiceId) {
        let venta;
        try {
            venta = await DataService.getSaleById(invoiceId);
        } catch (error) {
            venta = AppState.historial.find(v => v.id === invoiceId && v.tipo === 'venta');
        }
        
        if (!venta) return;
        
        AppState.currentAbonoInvoice = venta;
        
        const saldoPendiente = venta.saldoPendiente !== undefined ? venta.saldoPendiente : venta.total;
        
        const modalContent = `
            <div class="invoice-details">
                <strong>Factura:</strong> ${venta.invoiceNumber}<br>
                <strong>Grupo:</strong> ${venta.clientName}<br>
                <strong>Total:</strong> $${venta.total.toFixed(2)}<br>
                <strong>Saldo Pendiente:</strong> $${saldoPendiente.toFixed(2)}
            </div>
        `;
        
        UIService.showAbonoModal(modalContent);
    },

    async processAbono() {
        const montoInput = document.getElementById('monto-abono');
        const monto = parseFloat(montoInput.value);
        
        if (!monto || monto <= 0) {
            UIService.showStatus("Ingrese un monto válido", "error");
            return;
        }
        
        const venta = AppState.currentAbonoInvoice;
        if (!venta) {
            UIService.showStatus("No hay factura seleccionada para el abono", "error");
            return;
        }
        
        const saldoPendiente = venta.saldoPendiente !== undefined ? venta.saldoPendiente : venta.total;
        
        if (monto > saldoPendiente) {
            UIService.showStatus("El monto del abono no puede ser mayor al saldo pendiente", "error");
            return;
        }
        
        try {
            const abonoData = {
                monto: monto,
                fecha: DateUtils.getCurrentTimestampElSalvador(),
                fechaString: DateUtils.getCurrentTimestampElSalvador().toLocaleString('es-ES')
            };
            
            await DataService.addAbono(venta.id, abonoData);
            
            this.printAbonoTicket(venta, abonoData, saldoPendiente - monto);
            
            UIService.showStatus(`Abono de $${monto.toFixed(2)} registrado correctamente`, "success");
            
            closeAbonoModal();
            
            const ventaActualizada = await DataService.getSaleById(venta.id);
            if (ventaActualizada) {
                const indexHistorial = AppState.historial.findIndex(v => v.id === venta.id);
                if (indexHistorial !== -1) {
                    AppState.historial[indexHistorial] = { ...ventaActualizada, tipo: 'venta' };
                }
                
                UIService.updateHistorial(AppState.historial);
            }
            
        } catch (error) {
            UIService.showStatus("Error al procesar abono: " + error.message, "error");
        }
    },

    async processRetiro() {
        const montoInput = document.getElementById('monto-retiro');
        const conceptoInput = document.getElementById('concepto-retiro');
        const categoriaInput = document.getElementById('categoria-retiro');
        
        const monto = parseFloat(montoInput.value);
        const concepto = conceptoInput.value.trim();
        const categoria = categoriaInput.value;
        
        if (!monto || monto <= 0) {
            UIService.showStatus("Ingrese un monto válido", "error");
            return;
        }
        
        if (!concepto) {
            UIService.showStatus("Ingrese un concepto para el retiro", "error");
            return;
        }
        
        try {
            const retiroData = {
                monto: monto,
                concepto: concepto,
                categoria: categoria,
                timestamp: DateUtils.getCurrentTimestampElSalvador(),
                date: DateUtils.getCurrentDateStringElSalvador()
            };
            
            await DataService.saveRetiro(retiroData);
            
            this.printRetiroTicket(retiroData);
            
            UIService.showStatus(`Retiro de $${monto.toFixed(2)} registrado correctamente`, "success");
            
            closeRetiroModal();
            
            await this.loadHistorial();
            
        } catch (error) {
            UIService.showStatus("Error al procesar retiro: " + error.message, "error");
        }
    },

    async printCurrentHistorial() {
        const movimientos = AppState.filteredHistorial;
        
        if (movimientos.length === 0) {
            UIService.showStatus("No hay movimientos para imprimir", "warning");
            return;
        }
        
        this.printHistorialReport(movimientos, 'HISTORIAL ACTUAL');
    },

    printHistorialReport(movimientos, titulo) {
        const printWindow = window.open('', '_blank');
        
        let totalContado = 0;
        let totalPendiente = 0;
        let totalAbonos = 0;
        let totalRetiros = 0;
        let ventasContado = 0;
        let ventasPendiente = 0;
        let ventasConAbonos = 0;
        let cantidadRetiros = 0;
        
        movimientos.forEach(movimiento => {
            if (movimiento.tipo === 'retiro') {
                totalRetiros += movimiento.monto || 0;
                cantidadRetiros++;
            } else {
                if (movimiento.paymentType === 'contado') {
                    totalContado += movimiento.total || 0;
                    ventasContado++;
                } else {
                    totalPendiente += movimiento.total || 0;
                    ventasPendiente++;
                    
                    if (movimiento.abonos && movimiento.abonos.length > 0) {
                        ventasConAbonos++;
                        movimiento.abonos.forEach(abono => {
                            totalAbonos += abono.monto;
                        });
                    }
                }
            }
        });
        
        const fechaActual = DateUtils.getCurrentTimestampElSalvador().toLocaleDateString('es-ES');
        
        let reportHTML = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>${titulo}</title>
                <style>
                    body { 
                        font-family: 'Arial', sans-serif; 
                        font-size: 12px; 
                        margin: 0;
                        padding: 15px;
                        color: #000;
                    }
                    .header { 
                        text-align: center; 
                        margin-bottom: 20px;
                        border-bottom: 2px solid #333;
                        padding-bottom: 10px;
                    }
                    .header h1 {
                        font-size: 24px;
                        margin: 10px 0;
                        color: #2c3e50;
                    }
                    .header h2 {
                        font-size: 18px;
                        margin: 8px 0;
                        color: #34495e;
                    }
                    .header h3 {
                        font-size: 14px;
                        margin: 5px 0;
                        color: #7f8c8d;
                    }
                    .table-container {
                        width: 100%;
                        margin-bottom: 20px;
                    }
                    .ventas-table {
                        width: 100%;
                        border-collapse: collapse;
                        margin: 15px 0;
                        font-size: 11px;
                    }
                    .ventas-table th {
                        background: #2c3e50;
                        color: white;
                        padding: 10px 8px;
                        text-align: left;
                        font-weight: bold;
                        border: 1px solid #34495e;
                    }
                    .ventas-table td {
                        padding: 8px;
                        border: 1px solid #ddd;
                        vertical-align: top;
                    }
                    .ventas-table tr:nth-child(even) {
                        background: #f8f9fa;
                    }
                    .producto-item {
                        padding: 2px 0;
                        font-size: 10px;
                    }
                    .contado-badge {
                        background: #27ae60;
                        color: white;
                        padding: 3px 6px;
                        border-radius: 3px;
                        font-size: 9px;
                        font-weight: bold;
                    }
                    .pendiente-badge {
                        background: #f39c12;
                        color: white;
                        padding: 3px 6px;
                        border-radius: 3px;
                        font-size: 9px;
                        font-weight: bold;
                    }
                    .retiro-badge {
                        background: #e74c3c;
                        color: white;
                        padding: 3px 6px;
                        border-radius: 3px;
                        font-size: 9px;
                        font-weight: bold;
                    }
                    .resumen-section {
                        margin-top: 25px;
                        padding: 15px;
                        background: #e8f4fd;
                        border-radius: 8px;
                        border: 1px solid #b8daff;
                    }
                    .resumen-grid {
                        display: grid;
                        grid-template-columns: 1fr 1fr 1fr 1fr;
                        gap: 15px;
                        margin-top: 10px;
                    }
                    .resumen-item {
                        text-align: center;
                        padding: 10px;
                        background: white;
                        border-radius: 6px;
                        border: 1px solid #dee2e6;
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
                        size: A4 landscape;
                        margin: 1cm;
                    }
                    .footer {
                        text-align: center;
                        margin-top: 20px;
                        padding-top: 10px;
                        border-top: 1px solid #ddd;
                        font-size: 10px;
                        color: #7f8c8d;
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>TALLER WILIAN</h1>
                    <h2>HISTORIAL DE MOVIMIENTOS ${fechaActual}</h2>
                </div>
        `;
        
        reportHTML += `
            <div class="table-container">
                <table class="ventas-table">
                    <thead>
                        <tr>
                            <th width="40%">Descripción</th>
                            <th width="10%">Factura/Retiro</th>
                            <th width="8%">Equipo</th>
                            <th width="10%">Monto</th>
                            <th width="8%">Estado</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        movimientos.forEach((movimiento, index) => {
            if (index > 0 && index % 20 === 0) {
                reportHTML += `</tbody></table></div><div class="page-break"></div><div class="table-container"><table class="ventas-table"><thead><tr><th width="40%">Descripción</th><th width="10%">Factura/Retiro</th><th width="8%">Equipo</th><th width="10%">Monto</th><th width="8%">Estado</th></tr></thead><tbody>`;
            }
            
            if (movimiento.tipo === 'retiro') {
                const tipoBadge = 'retiro-badge';
                const tipoText = 'RETIRO';
                
                reportHTML += `
                    <tr>
                        <td>${movimiento.concepto || 'Sin concepto'}</td>
                        <td><strong>RET-${movimiento.id.substring(0, 8)}</strong></td>
                        <td>-</td>
                        <td style="color: #e74c3c;">-$${movimiento.monto.toFixed(2)}</td>
                        <td><span class="${tipoBadge}">${tipoText}</span></td>
                    </tr>
                `;
            } else {
                const venta = movimiento;
                const tipoBadge = venta.paymentType === 'contado' ? 'contado-badge' : 'pendiente-badge';
                const tipoText = venta.paymentType === 'contado' ? 'CONTADO' : 'PENDIENTE';
                
                let productosHTML = '';
                if (venta.products && venta.products.length > 0) {
                    venta.products.forEach(producto => {
                        productosHTML += `
                            <div class="producto-item">
                                • ${producto.descripcion} x${producto.cantidad} - $${(producto.precio * producto.cantidad).toFixed(2)}
                            </div>
                        `;
                    });
                }
                
                reportHTML += `
                    <tr>
                        <td>${productosHTML || 'Sin productos'}</td>
                        <td><strong>${venta.invoiceNumber || 'N/A'}</strong></td>
                        <td>${venta.equipoNumber || 'N/A'}</td>
                        <td>$${(venta.total || 0).toFixed(2)}</td>
                        <td><span class="${tipoBadge}">${tipoText}</span></td>
                    </tr>
                `;
            }
        });
        
        reportHTML += `</tbody></table></div>`;
        
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
                        <div>VENTAS PENDIENTES</div>
                        <div class="resumen-valor">$${totalPendiente.toFixed(2)}</div>
                        <div style="font-size: 10px; color: #666;">${ventasPendiente} ventas</div>
                    </div>
                    <div class="resumen-item">
                        <div>RETIROS</div>
                        <div class="resumen-valor" style="color: #e74c3c;">-$${totalRetiros.toFixed(2)}</div>
                        <div style="font-size: 10px; color: #666;">${cantidadRetiros} retiros</div>
                    </div>
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

    printTicket(saleData) {
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
                        <div style="font-size: 20px;">• ${descripcion}</div>
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
                    <strong>Grupo:</strong> ${saleData.clientName}<br>
                    <strong>Equipo:</strong> ${saleData.equipoNumber}
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

                ${saleData.paymentType === 'pendiente' && saldoPendiente > 0 ? `
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
        const printWindow = window.open('', '_blank');
        const fechaAbono = abonoData.fecha ? new Date(abonoData.fecha.toDate ? abonoData.fecha.toDate() : abonoData.fecha) : DateUtils.getCurrentTimestampElSalvador();
        const fechaFormateada = fechaAbono.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' });
        
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Abono #${venta.invoiceNumber}</title>
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
                    <div class="small-text">COMPROBANTE DE ABONO</div>
                    <div class="small-text">${fechaFormateada}</div>
                </div>
                
                <div class="line"></div>
                
                <div class="medium-text">
                    <strong>Factura:</strong> ${venta.invoiceNumber}<br>
                    <strong>Grupo:</strong> ${venta.clientName}<br>
                    <strong>Equipo:</strong> ${venta.equipoNumber}
                </div>
                
                <div class="line"></div>
                
                <div class="abono-detail">
                    <div style="text-align: center; font-size: 24px; margin: 10px 0;">
                        MONTO DEL ABONO
                    </div>
                    <div style="text-align: center; font-size: 28px; font-weight: bold;">
                        $${abonoData.monto.toFixed(2)}
                    </div>
                </div>

                <div class="saldo-info">
                    <div>SALDO ANTERIOR: $${(venta.saldoPendiente || venta.total).toFixed(2)}</div>
                    <div>NUEVO SALDO: $${nuevoSaldo.toFixed(2)}</div>
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
                    .large-text { font-size: 26px; }
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
                        MONTO DEL RETIRO
                    </div>
                    <div style="text-align: center; font-size: 28px; font-weight: bold; color: #e74c3c;">
                        -$${retiroData.monto.toFixed(2)}
                    </div>
                </div>
                
                <div class="footer">
                    CONTROL DE FONDOS
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

    setTodayDate() {
        const today = DateUtils.getCurrentDateStringElSalvador();
        document.getElementById('fecha-venta').value = today;
        
        const fechaInput = document.getElementById('fecha-venta');
        const fechaSeleccionada = DateUtils.createDateFromStringElSalvador(fechaInput.value);
        const hoy = DateUtils.getCurrentDateElSalvador();
        
        const selectedDateOnly = new Date(fechaSeleccionada.getFullYear(), fechaSeleccionada.getMonth(), fechaSeleccionada.getDate());
        const hoyOnly = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
        
        if (selectedDateOnly > hoyOnly) {
            fechaInput.classList.add('date-warning');
        } else {
            fechaInput.classList.remove('date-warning');
        }
    }
};

// Aplicación Principal
const App = {
    async init() {
        try {
            await this.initializeFirebase();
            this.setupUI();
            await this.loadInitialData();
            this.setupEventListeners();
            ConnectionManager.initialize();
            UIService.showStatus("Sistema optimizado inicializado correctamente", "success");
        } catch (error) {
            console.error("Error en inicialización:", error);
            UIService.showStatus("Error al inicializar: " + error.message, "error");
        }
    },

    async initializeFirebase() {
        try {
            if (firebase.apps.length === 0) {
                firebase.initializeApp(CONFIG.firebase);
            }
            AppState.db = firebase.firestore();
            
            await AppState.db.enablePersistence()
                .catch((err) => {
                    if (err.code == 'failed-precondition') {
                        console.log("Persistencia offline no disponible - Múltiples pestañas abiertas");
                    } else if (err.code == 'unimplemented') {
                        console.log("Persistencia offline no disponible - Navegador no compatible");
                    }
                });
            
            AppState.firebaseInitialized = true;
        } catch (error) {
            console.error("Error inicializando Firebase:", error);
            AppState.firebaseInitialized = false;
            UIService.showStatus("Modo offline activado", "warning");
        }
    },

    setupUI() {
        SalesService.setTodayDate();
        UIService.setupTabs();
    },

    async loadInitialData() {
        try {
            await ProductCache.initialize();
            AppState.saleCounter = await DataService.getSaleCounter();
            await SalesService.loadHistorial();
            await GrupoManager.initialize();
        } catch (error) {
            console.error("Error cargando datos iniciales:", error);
        }
    },

    setupEventListeners() {
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.search-container')) {
                document.getElementById('search-dropdown').style.display = 'none';
            }
        });

        const searchInput = document.getElementById('buscar-producto');
        let searchTimeout;
        
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            const query = e.target.value.trim();
            
            if (query.length < 2) {
                document.getElementById('search-dropdown').style.display = 'none';
                return;
            }
            
            searchTimeout = setTimeout(async () => {
                try {
                    AppState.searchResults = await DataService.searchProducts(query);
                    UIService.showSearchResults(AppState.searchResults);
                } catch (error) {
                    document.getElementById('search-dropdown').style.display = 'none';
                }
            }, 500);
        });

        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const query = searchInput.value.trim();
                if (query) {
                    SalesService.addManualProduct(query);
                    searchInput.value = '';
                }
                document.getElementById('search-dropdown').style.display = 'none';
            }
        });

        document.getElementById('equipo').addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/[^0-9]/g, '');
            if (e.target.value.length > 4) {
                e.target.value = e.target.value.substring(0, 4);
            }
        });

        document.getElementById('fecha-venta').addEventListener('change', function() {
            SalesService.setTodayDate();
        });

        document.getElementById('contado-btn').addEventListener('click', () => {
            SalesService.processSale('contado');
        });

        document.getElementById('pendiente-btn').addEventListener('click', () => {
            SalesService.processSale('pendiente');
        });

        document.getElementById('retirar-btn').addEventListener('click', () => {
            UIService.showRetiroModal();
        });

        document.getElementById('filter-historial').addEventListener('input', (e) => {
            const filter = e.target.value;
            if (filter === '') {
                UIService.applyCurrentFilter();
                return;
            }
            
            const filtered = AppState.historial.filter(movimiento => {
                if (movimiento.tipo === 'venta') {
                    const equipo = movimiento.equipoNumber || '';
                    return equipo.includes(filter);
                }
                return false;
            });
            
            const historialBody = document.getElementById('historial-body');
            
            if (filtered.length === 0) {
                historialBody.innerHTML = `
                    <tr>
                        <td colspan="6" class="empty-cart">No hay movimientos para el equipo ${filter}</td>
                    </tr>
                `;
            } else {
                AppState.filteredHistorial = filtered;
                UIService.renderHistorial();
            }
        });

        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                AppState.currentFilter = e.target.dataset.filter;
                UIService.updateFilterButtons();
                UIService.applyCurrentFilter();
            });
        });

        document.getElementById('print-historial-btn').addEventListener('click', () => {
            SalesService.printCurrentHistorial();
        });

        document.getElementById('close-invoice-modal').addEventListener('click', () => {
            document.getElementById('invoice-modal').style.display = 'none';
        });

        document.getElementById('process-abono-btn').addEventListener('click', () => {
            SalesService.processAbono();
        });

        document.getElementById('close-abono-modal').addEventListener('click', () => {
            document.getElementById('abono-modal').style.display = 'none';
            AppState.currentAbonoInvoice = null;
        });

        document.getElementById('process-retiro-btn').addEventListener('click', () => {
            SalesService.processRetiro();
        });

        document.getElementById('close-retiro-modal').addEventListener('click', () => {
            document.getElementById('retiro-modal').style.display = 'none';
        });

        document.getElementById('close-detalle-modal').addEventListener('click', () => {
            document.getElementById('detalle-modal').style.display = 'none';
        });

        document.getElementById('imprimir-detalle-modal').addEventListener('click', () => {
            const detalle = AppState.currentDetalle;
            if (detalle && detalle.tipo === 'equipo') {
                const equipo = GrupoManager.equiposPendientes.get(detalle.data);
                if (equipo) {
                    equipo.facturas.forEach(factura => {
                        GrupoManager.imprimirTicketFactura(factura, equipo);
                    });
                }
            }
        });

        document.getElementById('close-grupo-detalle-modal').addEventListener('click', () => {
            document.getElementById('grupo-detalle-modal').style.display = 'none';
            GrupoManager.currentGrupoDetalle = null;
        });

        document.getElementById('imprimir-grupo-detalle-modal').addEventListener('click', () => {
            GrupoManager.imprimirGrupoCompleto();
        });

        document.getElementById('crear-grupo-btn').addEventListener('click', () => {
            document.getElementById('crear-grupo-modal').style.display = 'block';
            AppState.equiposSeleccionados.clear();
            GrupoManager.generarGridEquipos('crear');
            GrupoManager.actualizarListaSeleccionados('crear');
            document.getElementById('nombre-grupo').value = '';
        });

        document.getElementById('guardar-grupo-btn').addEventListener('click', async () => {
            const nombre = document.getElementById('nombre-grupo').value.trim();
            if (!nombre) {
                UIService.showStatus("Ingrese un nombre para el grupo", "error");
                return;
            }

            if (AppState.equiposSeleccionados.size === 0) {
                UIService.showStatus("Seleccione al menos un equipo", "error");
                return;
            }

            try {
                const equiposArray = Array.from(AppState.equiposSeleccionados);
                await GrupoManager.crearGrupo(nombre, equiposArray);
                UIService.showStatus(`Grupo "${nombre}" creado correctamente`, "success");
                document.getElementById('crear-grupo-modal').style.display = 'none';
                AppState.equiposSeleccionados.clear();
            } catch (error) {
                UIService.showStatus("Error al crear grupo: " + error.message, "error");
            }
        });

        document.getElementById('cancelar-grupo-btn').addEventListener('click', () => {
            document.getElementById('crear-grupo-modal').style.display = 'none';
            AppState.equiposSeleccionados.clear();
        });

        document.getElementById('actualizar-grupo-btn').addEventListener('click', () => {
            GrupoManager.actualizarGrupoDesdeModal();
        });

        document.getElementById('cancelar-editar-grupo-btn').addEventListener('click', () => {
            document.getElementById('editar-grupo-modal').style.display = 'none';
            GrupoManager.currentEditingGroup = null;
            AppState.equiposEditSeleccionados.clear();
        });
    }
};

// Funciones Globales Auxiliares
function toggleEquipoGrid(equipoNum, modalType = 'crear') {
    const selectedSet = modalType === 'crear' ? AppState.equiposSeleccionados : AppState.equiposEditSeleccionados;
    
    if (selectedSet.has(equipoNum)) {
        selectedSet.delete(equipoNum);
    } else {
        if (selectedSet.size >= 130) {
            UIService.showStatus("Máximo 130 equipos permitidos", "error");
            return;
        }
        selectedSet.add(equipoNum);
    }
    
    GrupoManager.actualizarListaSeleccionados(modalType);
    
    const selector = modalType === 'crear' ? '.all-equipo-item' : '#editar-all-equipos-grid .all-equipo-item';
    document.querySelectorAll(selector).forEach(item => {
        const num = item.textContent.split('\n')[0].trim();
        if (selectedSet.has(num)) {
            item.classList.add('selected');
        } else {
            item.classList.remove('selected');
        }
    });
}

function eliminarGrupo(grupoId) {
    if (!confirm("¿Está seguro de eliminar este grupo? Los equipos volverán a estar disponibles individualmente y se eliminarán las asociaciones de grupo.")) {
        return;
    }

    try {
        GrupoManager.eliminarGrupo(grupoId);
        UIService.showStatus("Grupo eliminado correctamente", "success");
        GrupoManager.updateUI();
    } catch (error) {
        UIService.showStatus("Error al eliminar grupo: " + error.message, "error");
    }
}

function closeInvoiceModal() {
    document.getElementById('invoice-modal').style.display = 'none';
}

function closeAbonoModal() {
    document.getElementById('abono-modal').style.display = 'none';
    AppState.currentAbonoInvoice = null;
}

function closeRetiroModal() {
    document.getElementById('retiro-modal').style.display = 'none';
}

// Inicializar la aplicación cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', function() {
    App.init();
});
