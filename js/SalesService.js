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
        if (!equipo.trim()) throw new Error("El número de equipo es obligatorio");
        if (!/^\d+$/.test(equipo.trim())) throw new Error("El número de equipo debe contener solo números");
        if (!fechaVenta) throw new Error("Seleccione una fecha para la venta");
        if (DateUtils.isFutureDateInElSalvador(fechaVenta)) {
            const confirmacion = confirm("La fecha seleccionada es futura. ¿Está seguro de continuar?");
            if (!confirmacion) throw new Error("Fecha futura no confirmada");
        }
        const productosConPrecioCero = AppState.cart.filter(item => item.precio === 0);
        if (productosConPrecioCero.length > 0) throw new Error("Hay productos con precio $0.00. Modifique los precios antes de guardar.");
        const productosConPrecioInvalido = AppState.cart.filter(item => item.precio < 0 || isNaN(item.precio) || !isFinite(item.precio));
        if (productosConPrecioInvalido.length > 0) throw new Error("Hay productos con precios inválidos. Verifique los montos.");
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
                if (!confirmacion) return;
            }
            AppState.processingSale = true;
            UIService.updatePaymentButtonsState(true);
            UIService.showLoading(true);
            const contadoBtn = document.getElementById('contado-btn');
            const pendienteBtn = document.getElementById('pendiente-btn');
            if (contadoBtn) contadoBtn.disabled = true;
            if (pendienteBtn) pendienteBtn.disabled = true;
            if (paymentType === 'contado') {
                await this.procesarVentaContado(equipo, cliente, fechaVenta, totalVenta);
                return;
            }
            if (paymentType === 'pendiente') {
                this.mostrarConfirmacionAbono(equipo, cliente, totalVenta, fechaVenta);
                return;
            }
        } catch (error) {
            UIService.showStatus("Error al procesar la venta: " + error.message, "error");
            console.error("Error en processSale:", error);
        } finally {
            AppState.processingSale = false;
            UIService.updatePaymentButtonsState(false);
            UIService.showLoading(false);
            const contadoBtn = document.getElementById('contado-btn');
            const pendienteBtn = document.getElementById('pendiente-btn');
            if (contadoBtn) contadoBtn.disabled = false;
            if (pendienteBtn) pendienteBtn.disabled = false;
        }
    },

    mostrarConfirmacionAbono(equipo, cliente, totalVenta, fechaVenta) {
        AppState.datosVentaPendiente = { equipo, cliente, totalVenta, fechaVenta };
        document.getElementById('confirmacion-total').textContent = totalVenta.toFixed(2);
        document.getElementById('confirmacion-equipo').textContent = equipo;
        document.getElementById('confirmacion-cliente').textContent = cliente || `Equipo ${equipo}`;
        document.getElementById('confirmacion-abono-modal').style.display = 'block';
    },

    promptHistorialEquipo() {
        const equipo = prompt("Ingrese el número de equipo para ver su historial:");
        if (equipo && equipo.trim()) this.loadAndShowTeamHistory(equipo.trim());
    },

    async loadAndShowTeamHistory(equipo) {
        const modal = document.getElementById('historial-equipo-modal');
        const content = document.getElementById('historial-equipo-content');
        const title = document.getElementById('historial-equipo-titulo');
        title.textContent = equipo;
        content.innerHTML = '<div style="text-align:center; padding:20px;"><i class="fas fa-spinner fa-spin fa-2x"></i><p>Cargando historial...</p></div>';
        modal.style.display = 'block';
        try {
            const historial = await DataService.getHistorialCompletoEquipo(equipo);
            this.renderHistorialEquipo(historial, equipo);
        } catch (error) {
            content.innerHTML = `<div class="empty-state" style="color:red"><i class="fas fa-exclamation-triangle"></i> Error: ${error.message}</div>`;
        }
    },

    renderHistorialEquipo(historial, equipo) {
        const content = document.getElementById('historial-equipo-content');
        if (historial.length === 0) {
            content.innerHTML = `<div class="empty-state"><i class="fas fa-history"></i><div>No hay registros previos para el equipo ${equipo}</div></div>`;
            return;
        }
        let html = '<div style="display: flex; flex-direction: column; gap: 8px;">';
        historial.forEach(venta => {
            const fecha = venta.timestamp ? new Date(venta.timestamp.toDate ? venta.timestamp.toDate() : venta.timestamp).toLocaleString() : 'N/A';
            const total = venta.total || 0;
            let tieneCaja = false, tieneAceite = false;
            if (venta.products) {
                const matchStr = venta.products.map(p => p.descripcion).join(' ').toLowerCase();
                if (matchStr.includes('caja') || matchStr.includes('transmision') || matchStr.includes('transmisión')) tieneCaja = true;
                if (matchStr.includes('aceite') || matchStr.includes('motor')) tieneAceite = true;
            }
            let cardStyle = "border-left: 5px solid #bdc3c7;";
            let icon = "fas fa-wrench";
            if (tieneCaja) { cardStyle = "border-left: 5px solid #e74c3c; background-color: #fadbd8;"; icon = "fas fa-cogs"; }
            else if (tieneAceite) { cardStyle = "border-left: 5px solid #27ae60; background-color: #d5f5e3;"; icon = "fas fa-oil-can"; }
            let productosHTML = '<ul style="margin: 5px 0; padding-left: 20px; font-size: 0.9rem; color: #555;">';
            if (venta.products && venta.products.length > 0) {
                venta.products.forEach(p => { productosHTML += `<li>${p.cantidad}x ${p.descripcion}</li>`; });
            } else { productosHTML += '<li>Sin detalles</li>'; }
            productosHTML += '</ul>';
            const detailId = `detail-${venta.id}`;
            html += `
                <div onclick="document.getElementById('${detailId}').style.display = document.getElementById('${detailId}').style.display === 'none' ? 'block' : 'none'" 
                     style="border: 1px solid #ddd; ${cardStyle} border-radius: 4px; padding: 10px; cursor: pointer; transition: transform 0.1s; box-shadow: 0 1px 2px rgba(0,0,0,0.1);">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div style="font-weight: bold; color: #2c3e50; display:flex; align-items:center; gap:8px"><i class="${icon}"></i> ${fecha}</div>
                        <div style="font-size: 0.8rem; color: #7f8c8d;">#${venta.invoiceNumber} <i class="fas fa-chevron-down"></i></div>
                    </div>
                    <div id="${detailId}" style="display: none; margin-top: 10px; border-top: 1px dashed #ccc; padding-top: 8px;">
                        <div style="font-weight:600; font-size: 0.85rem; color: #34495e; margin-bottom:4px">Trabajos Realizados:</div>
                        ${productosHTML}
                        <div style="text-align: right; font-weight: bold; font-size: 0.9rem; margin-top: 5px;">Total: $${total.toFixed(2)}</div>
                    </div>
                </div>`;
        });
        html += '</div>';
        content.innerHTML = html;
    },

    async procesarVentaContado(equipo, cliente, fechaVenta, totalVenta) {
        AppState.processingSale = true;
        UIService.updatePaymentButtonsState(true);
        UIService.showLoading(true);
        try {
            const finalCliente = cliente || `Equipo ${equipo}`;
            const finalEquipo = equipo || '0000';
            const invoiceNumber = await this.generateInvoiceNumber();
            const isUnique = await this.verifyInvoiceUnique(invoiceNumber);
            if (!isUnique) { AppState.processingSale = false; UIService.updatePaymentButtonsState(false); UIService.showLoading(false); return; }
            const saleData = {
                invoiceNumber, equipoNumber: finalEquipo, clientName: finalCliente,
                products: AppState.cart.map(item => ({ id: item.id, codigo: item.codigo, descripcion: item.descripcion, precio: item.precio, cantidad: item.cantidad })),
                total: totalVenta, paymentType: 'contado', timestamp: DateUtils.getCurrentTimestampElSalvador(),
                date: fechaVenta, status: 'pagado', fechaCreacion: DateUtils.getCurrentTimestampElSalvador(), printed: true
            };
            await DataService.saveSale(saleData);
            PrintingService.printTicket(saleData);
            UIService.showStatus(`Venta CONTADO procesada - Factura #${saleData.invoiceNumber}`, "success");
            this.limpiarFormularioVenta();
            await ProductCache.refresh();
            // Nota: El historial se actualizará automáticamente vía RealTimeHistoryManager
        } catch (error) {
            UIService.showStatus("Error al procesar venta contado: " + error.message, "error");
            console.error("Error en procesarVentaContado:", error);
        } finally {
            AppState.processingSale = false; UIService.updatePaymentButtonsState(false); UIService.showLoading(false);
        }
    },

    async procesarVentaPendienteSinAbono(equipo, cliente, fechaVenta, totalVenta) {
        AppState.processingSale = true;
        UIService.updatePaymentButtonsState(true);
        UIService.showLoading(true);
        try {
            const finalCliente = cliente || `Equipo ${equipo}`;
            const finalEquipo = equipo || '0000';
            const invoiceNumber = await this.generateInvoiceNumber();
            const isUnique = await this.verifyInvoiceUnique(invoiceNumber);
            if (!isUnique) { AppState.processingSale = false; UIService.updatePaymentButtonsState(false); UIService.showLoading(false); return; }
            const saleData = {
                invoiceNumber, equipoNumber: finalEquipo, clientName: finalCliente,
                products: AppState.cart.map(item => ({ id: item.id, codigo: item.codigo, descripcion: item.descripcion, precio: item.precio, cantidad: item.cantidad })),
                total: totalVenta, paymentType: 'pendiente', timestamp: DateUtils.getCurrentTimestampElSalvador(),
                date: fechaVenta, status: 'pendiente', saldoPendiente: totalVenta, abonos: [],
                fechaCreacion: DateUtils.getCurrentTimestampElSalvador(), printed: true
            };
            await DataService.saveSale(saleData);
            PrintingService.printTicket(saleData);
            UIService.showStatus(`Venta PENDIENTE procesada - Factura #${saleData.invoiceNumber}`, "success");
            this.limpiarFormularioVenta();
            await ProductCache.refresh();
            // El historial se actualizará automáticamente vía RealTimeHistoryManager
        } catch (error) {
            UIService.showStatus("Error al procesar venta pendiente: " + error.message, "error");
            console.error("Error en procesarVentaPendienteSinAbono:", error);
        } finally {
            AppState.processingSale = false; UIService.updatePaymentButtonsState(false); UIService.showLoading(false);
        }
    },

    async procesarVentaPendienteConAbono(equipo, cliente, fechaVenta, totalVenta, montoAbono) {
        AppState.processingSale = true;
        UIService.updatePaymentButtonsState(true);
        UIService.showLoading(true);
        try {
            const finalCliente = cliente || `Equipo ${equipo}`;
            const finalEquipo = equipo || '0000';
            const saldoPendiente = totalVenta - montoAbono;
            const invoiceNumber = await this.generateInvoiceNumber();
            const isUnique = await this.verifyInvoiceUnique(invoiceNumber);
            if (!isUnique) { AppState.processingSale = false; UIService.updatePaymentButtonsState(false); UIService.showLoading(false); return; }
            const abonoData = {
                monto: montoAbono,
                fecha: new Date(), // CORRECCIÓN: NO usar serverTimestamp() dentro de arrays 
                fechaString: new Date().toLocaleString('es-ES'),
                _id: 'abono_inicial_' + Date.now()
            };
            const saleData = {
                invoiceNumber, equipoNumber: finalEquipo, clientName: finalCliente,
                products: AppState.cart.map(item => ({ id: item.id, codigo: item.codigo, descripcion: item.descripcion, precio: item.precio, cantidad: item.cantidad })),
                total: totalVenta, paymentType: saldoPendiente <= 0 ? 'contado' : 'pendiente',
                timestamp: DateUtils.getCurrentTimestampElSalvador(), date: fechaVenta,
                status: saldoPendiente <= 0 ? 'pagado' : 'pendiente', saldoPendiente: saldoPendiente,
                abonos: [abonoData], fechaCreacion: DateUtils.getCurrentTimestampElSalvador(), printed: true
            };
            const docId = await DataService.saveSale(saleData);

            // REGISTRO ADICIONAL: Si hay abono inicial, guardarlo en INGRESOS para que aparezca en el resumen diario
            if (montoAbono > 0) {
                const ingresoData = {
                    monto: montoAbono,
                    concepto: `Abono Inicial EQUIPO ${finalEquipo} (Factura #${invoiceNumber})`,
                    categoria: 'abono',
                    timestamp: DateUtils.getCurrentTimestampElSalvador(),
                    date: fechaVenta,
                    invoiceId: docId,
                    invoiceNumber: invoiceNumber,
                    clientName: finalCliente,
                    equipoNumber: finalEquipo,
                    saldoAnterior: totalVenta,
                    nuevoSaldo: saldoPendiente,
                    abonoId: abonoData._id
                };
                await AppState.db.collection("INGRESOS").add(ingresoData);
            }

            // IMPRESIÓN COMBINADA: Un solo popup para evitar bloqueos del navegador
            if (montoAbono > 0) {
                PrintingService.printSaleAndAbono(saleData, abonoData, saldoPendiente);
            } else {
                PrintingService.printTicket(saleData);
            }

            if (saldoPendiente <= 0) UIService.showStatus(`Venta con abono completo procesada - Factura #${saleData.invoiceNumber}`, "success");
            else UIService.showStatus(`Venta PENDIENTE con abono inicial procesada - Factura #${saleData.invoiceNumber}`, "success");
            this.limpiarFormularioVenta();
            await ProductCache.refresh();
            // El historial se actualizará automáticamente vía RealTimeHistoryManager
        } catch (error) {
            UIService.showStatus("Error al procesar venta con abono: " + error.message, "error");
            console.error("Error en procesarVentaPendienteConAbono:", error);
        } finally {
            AppState.processingSale = false; UIService.updatePaymentButtonsState(false); UIService.showLoading(false);
        }
    },

    mostrarModalAbonoInicial(equipo, cliente, totalVenta, fechaVenta) {
        AppState.datosVentaPendiente = { equipo, cliente, totalVenta, fechaVenta };
        document.getElementById('abono-modal-total').textContent = totalVenta.toFixed(2);
        document.getElementById('abono-modal-equipo').textContent = equipo;
        document.getElementById('abono-modal-cliente').textContent = cliente || `Equipo ${equipo}`;
        document.getElementById('monto-abono-inicial').value = '';
        document.getElementById('saldo-despues-abono').textContent = '$' + totalVenta.toFixed(2);
        document.getElementById('abono-inicial-modal').style.display = 'block';
        document.getElementById('monto-abono-inicial').focus();
    },

    limpiarFormularioVenta() {
        AppState.cart = [];
        UIService.updateCartDisplay();
        document.getElementById('equipo').value = '';
        document.getElementById('cliente').value = '';
        document.getElementById('buscar-producto').value = '';
        delete AppState.datosVentaPendiente;
    },

    async updateInvoice(invoiceId) {
        if (AppState.cart.length === 0) { UIService.showStatus("El carrito está vacío", "error"); return; }
        try {
            const ventaActual = await DataService.getSaleById(invoiceId);
            if (!ventaActual) throw new Error("No se encontró la factura a actualizar");
            const productosConPrecioCero = AppState.cart.filter(item => item.precio === 0);
            if (productosConPrecioCero.length > 0) throw new Error("Hay productos con precio $0.00. Modifique los precios antes de actualizar.");
            const nuevoTotal = AppState.cart.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
            let nuevoSaldoPendiente = nuevoTotal;
            if (ventaActual.abonos && ventaActual.abonos.length > 0) {
                const totalAbonado = ventaActual.abonos.reduce((sum, abono) => sum + abono.monto, 0);
                nuevoSaldoPendiente = nuevoTotal - totalAbonado;
            }
            const saleData = {
                products: AppState.cart.map(item => ({ id: item.id, codigo: item.codigo, descripcion: item.descripcion, precio: item.precio, cantidad: item.cantidad })),
                total: nuevoTotal, saldoPendiente: nuevoSaldoPendiente, fechaActualizacion: DateUtils.getCurrentTimestampElSalvador()
            };
            if (nuevoSaldoPendiente <= 0) { saleData.paymentType = 'contado'; saleData.status = 'pagado'; }
            await DataService.updateSale(invoiceId, saleData);
            UIService.showStatus("Factura actualizada correctamente", "success");
            const ventaActualizada = { ...ventaActual, ...saleData };
            PrintingService.printTicket(ventaActualizada);
            this.cancelEdit();
            await this.loadHistorial();
        } catch (error) {
            UIService.showStatus("Error al actualizar la factura: " + error.message, "error");
        }
    },

    async loadHistorial() {
        try {
            UIService.showLoading(true);
            // Cargar solo los movimientos del día actual para evitar timeouts
            const today = DateUtils.getCurrentDateStringElSalvador();
            const movimientos = await DataService.loadMovementsByDate(today);
            HistorialService.updateHistorial(movimientos);
        } catch (error) {
            console.error("Error cargando historial:", error);
            UIService.showStatus("Error al cargar historial: " + error.message, "error");
        } finally {
            UIService.showLoading(false);
        }
    },

    async viewInvoice(invoiceId) {
        let venta;
        try { venta = await DataService.getSaleById(invoiceId); } catch (error) { venta = AppState.historial.find(v => v.id === invoiceId && v.tipo === 'venta'); }
        if (!venta) return;
        let productosList = '';
        if (venta.products && venta.products.length > 0) {
            venta.products.forEach(p => {
                const precioTotal = p.precio * p.cantidad;
                productosList += `<div style="display: flex; justify-content: space-between; font-size: 0.9em; margin-bottom: 5px; border-bottom: 1px dotted #eee; padding-bottom: 2px;"><div style="display: flex; gap: 10px;"><span style="font-weight: bold; min-width: 20px; text-align: center; color: #34495e;">${p.cantidad}</span><span style="color: #2c3e50;">${p.descripcion}</span></div><span style="font-weight: bold; color: #555;">$${precioTotal.toFixed(2)}</span></div>`;
            });
        } else { productosList = '<div style="color: #999; font-style: italic;">Sin productos detallados</div>'; }
        let abonosSection = '';
        if (venta.abonos && venta.abonos.length > 0) {
            abonosSection = `<div style="margin-top: 15px; background: #f9f9f9; padding: 10px; border-radius: 4px; border: 1px solid #eee;"><h5 style="margin-bottom: 8px; color: #34495e; font-size: 0.9em;">Historial de Abonos:</h5>${venta.abonos.map(a => `<div style="display: flex; justify-content: space-between; font-size: 0.85em; color: #666; margin-bottom: 3px;"><span>${a.fecha ? new Date(a.fecha.toDate ? a.fecha.toDate() : a.fecha).toLocaleString('es-ES') : '-'}</span><span style="font-weight: bold; color: #27ae60;">+$${a.monto.toFixed(2)}</span></div>`).join('')}</div>`;
        }
        const saldoPendiente = venta.saldoPendiente !== undefined ? venta.saldoPendiente : venta.total;
        const totalAbonado = venta.total - saldoPendiente;
        const fecha = venta.timestamp ? new Date(venta.timestamp.toDate ? venta.timestamp.toDate() : venta.timestamp).toLocaleString('es-ES') : 'N/A';
        let estadoTexto = 'PENDIENTE', estadoColor = '#e74c3c';
        if (venta.paymentType === 'contado') { estadoTexto = 'CONTADO'; estadoColor = '#27ae60'; }
        else if (saldoPendiente <= 0) { estadoTexto = 'PAGADO'; estadoColor = '#27ae60'; }
        const modalContent = `<div class="invoice-detail-view" style="font-family: 'Segoe UI', sans-serif;"><div style="text-align: center; margin-bottom: 20px;"><h3 style="color: #2c3e50; font-weight: bold; margin-bottom: 5px;"><i class="fas fa-tools"></i> Equipo ${venta.equipoNumber || 'N/A'}</h3></div><div style="background: #f8f9fa; padding: 15px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border: 1px solid #e9ecef; flex-wrap: wrap; gap: 10px;"><div style="text-align: center; flex: 1;"><div style="color: #7f8c8d; font-size: 0.85em; font-weight: bold; text-transform: uppercase;">CLIENTE</div><div style="font-weight: bold; color: #2c3e50;">${venta.clientName || 'Cliente General'}</div></div><div style="height: 30px; width: 1px; background: #ddd;"></div><div style="text-align: center; flex: 1;"><div style="color: #7f8c8d; font-size: 0.85em; font-weight: bold; text-transform: uppercase;">ESTADO</div><div style="font-weight: bold; color: ${estadoColor};">${estadoTexto}</div></div><div style="height: 30px; width: 1px; background: #ddd;"></div><div style="text-align: center; flex: 1;"><div style="color: #7f8c8d; font-size: 0.85em; font-weight: bold; text-transform: uppercase;">TOTAL ${estadoTexto === 'PENDIENTE' ? 'PENDIENTE' : 'PAGADO'}</div><div style="font-weight: bold; color: ${estadoColor}; font-size: 1.1em;">$${saldoPendiente.toFixed(2)}</div></div></div><div style="overflow-x: auto;"><table style="width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid #dfe6e9; border-radius: 6px; overflow: hidden;"><thead style="background-color: #34495e; color: white;"><tr><th style="padding: 12px; text-align: left; font-weight: 500;">Factura</th><th style="padding: 12px; text-align: left; font-weight: 500;">Productos</th><th style="padding: 12px; text-align: right; font-weight: 500;">Total</th><th style="padding: 12px; text-align: right; font-weight: 500;">Abonos</th><th style="padding: 12px; text-align: right; font-weight: 500;">Saldo</th></tr></thead><tbody><tr style="background-color: white;"><td style="padding: 15px; vertical-align: top; border-bottom: 1px solid #eee;"><div style="font-weight: bold; color: #2c3e50; font-size: 1.1em;">#${venta.invoiceNumber}</div><div style="font-size: 0.85em; color: #95a5a6; margin-top: 4px;">${fecha}</div></td><td style="padding: 15px; vertical-align: top; border-bottom: 1px solid #eee; width: 40%;">${productosList}</td><td style="padding: 15px; text-align: right; vertical-align: top; border-bottom: 1px solid #eee;"><div style="font-weight: bold; font-size: 1.1em;">$${venta.total.toFixed(2)}</div></td><td style="padding: 15px; text-align: right; vertical-align: top; border-bottom: 1px solid #eee;"><div style="color: #636e72;">${totalAbonado > 0 ? '$' + totalAbonado.toFixed(2) : '-'}</div></td><td style="padding: 15px; text-align: right; vertical-align: top; border-bottom: 1px solid #eee;"><div style="font-weight: bold; font-size: 1.2em; color: ${estadoColor};">$${saldoPendiente.toFixed(2)}</div></td></tr></tbody></table></div>${abonosSection}<div style="display: flex; gap: 10px; margin-top: 20px;">${saldoPendiente > 0 ? `<button onclick="SalesService.registrarAbono('${venta.id}'); ModalService.closeInvoiceModal();" style="flex: 1; padding: 12px; background-color: #f39c12; color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer; transition: background 0.2s;"><i class="fas fa-money-bill-wave"></i> ABONAR</button>` : ''}<button onclick="SalesService.reprintInvoice('${venta.id}')" style="flex: 1; padding: 12px; background-color: #27ae60; color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer; transition: background 0.2s;"><i class="fas fa-print"></i> IMPRIMIR</button></div></div>`;
        UIService.showInvoiceModal(modalContent);
    },

    async editInvoice(invoiceId) {
        let venta = AppState.historial.find(v => v.id === invoiceId && v.tipo === 'venta');
        if (!venta) { UIService.showStatus("No se encontró la factura para editar", "error"); return; }
        AppState.cart = venta.products.map(p => ({ id: p.id, codigo: p.codigo, descripcion: p.descripcion, precio: p.precio, cantidad: p.cantidad }));
        document.getElementById('equipo').value = venta.equipoNumber || '';
        document.getElementById('cliente').value = venta.clientName || '';
        document.getElementById('fecha-venta').value = venta.date || DateUtils.getCurrentDateStringElSalvador();
        AppState.currentEditingInvoice = invoiceId;
        UIService.updateCartDisplay();
        document.getElementById('contado-btn').style.display = 'none';
        document.getElementById('pendiente-btn').style.display = 'none';
        const updateBtn = document.createElement('button');
        updateBtn.className = 'btn btn-success'; updateBtn.id = 'update-btn'; updateBtn.textContent = 'ACTUALIZAR FACTURA';
        updateBtn.onclick = () => this.updateInvoice(invoiceId);
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn btn-danger'; cancelBtn.id = 'cancel-btn'; cancelBtn.textContent = 'CANCELAR EDICIÓN';
        cancelBtn.onclick = () => this.cancelEdit();
        const contadoContainer = document.querySelector('.venta-line-1').lastElementChild;
        const pendienteContainer = document.querySelector('.venta-line-2').lastElementChild;
        contadoContainer.innerHTML = ''; pendienteContainer.innerHTML = '';
        contadoContainer.appendChild(updateBtn); pendienteContainer.appendChild(cancelBtn);
        UIService.showStatus("Modo edición activado - Editando factura pendiente", "success");
    },

    cancelEdit() {
        AppState.cart = []; AppState.currentEditingInvoice = null;
        this.setTodayDate(); UIService.updateCartDisplay();
        document.getElementById('equipo').value = ''; document.getElementById('cliente').value = '';
        document.getElementById('buscar-producto').value = '';
        UIService.restorePaymentButtons();
        UIService.showStatus("Edición cancelada", "info");
    },

    async deleteInvoice(invoiceId) {
        if (!confirm("¿Está seguro de eliminar esta factura? Esta acción no se puede deshacer.")) return;
        try { UIService.showLoading(true); await DataService.deleteSale(invoiceId); UIService.showStatus("Factura eliminada correctamente", "success"); await this.loadHistorial(); }
        catch (error) { UIService.showStatus("Error al eliminar factura: " + error.message, "error"); }
        finally { UIService.showLoading(false); }
    },

    async viewRetiro(retiroId) {
        let retiro;
        try {
            if (AppState.firebaseInitialized) {
                const doc = await AppState.db.collection("RETIROS").doc(retiroId).get();
                if (doc.exists) retiro = { id: doc.id, ...doc.data() };
            }
            if (!retiro) retiro = AppState.historial.find(r => r.id === retiroId && r.tipo === 'retiro');
        } catch (error) {
            console.error("Error buscando retiro:", error);
            retiro = AppState.historial.find(r => r.id === retiroId && r.tipo === 'retiro');
        }
        if (!retiro) { UIService.showStatus("No se encontró el retiro", "error"); return; }
        const categoriaText = { 'compra': 'Compra de materiales', 'gastos': 'Gastos operativos', 'herramientas': 'Herramientas', 'otros': 'Otros' }[retiro.categoria] || retiro.categoria;
        const fecha = retiro.timestamp ? new Date(retiro.timestamp.toDate ? retiro.timestamp.toDate() : retiro.timestamp).toLocaleString('es-ES') : 'N/A';
        const modalContent = `<div class="invoice-detail-view" style="font-family: 'Segoe UI', sans-serif;"><div style="text-align: center; margin-bottom: 20px;"><h3 style="color: #c0392b; font-weight: bold; margin: 0;"><i class="fas fa-hand-holding-usd"></i> DETALLE DE RETIRO</h3><div style="color: #7f8c8d; font-size: 0.9em; margin-top: 5px;">${fecha}</div></div><div style="background: #fff5f5; padding: 20px; border-radius: 8px; border: 1px solid #feb2b2;"><div style="margin-bottom: 15px;"><div style="color: #7f8c8d; font-size: 0.8em; font-weight: bold; text-transform: uppercase;">Concepto</div><div style="font-size: 1.1em; color: #2d3748; font-weight: 500;">${retiro.concepto}</div></div><div style="margin-bottom: 15px;"><div style="color: #7f8c8d; font-size: 0.8em; font-weight: bold; text-transform: uppercase;">Categoría</div><div style="font-size: 1.1em; color: #2d3748;">${categoriaText}</div></div><div style="border-top: 1px dashed #fc8181; padding-top: 15px; margin-top: 15px; display: flex; justify-content: space-between; align-items: center;"><div style="color: #c53030; font-weight: bold;">TOTAL RETIRADO</div><div style="font-size: 1.8em; font-weight: bold; color: #c53030;">$${parseFloat(retiro.monto).toFixed(2)}</div></div></div><div style="margin-top: 25px;"><button onclick="ModalService.closeInvoiceModal()" style="width: 100%; padding: 12px; background-color: #718096; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; transition: background 0.2s;">CERRAR</button></div></div>`;
        UIService.showInvoiceModal(modalContent);
    },

    async deleteRetiro(retiroId) {
        if (!confirm("¿Está seguro de eliminar este retiro? Esta acción no se puede deshacer.")) return;
        try { UIService.showLoading(true); if (AppState.firebaseInitialized) { await AppState.db.collection("RETIROS").doc(retiroId).delete(); UIService.showStatus("Retiro eliminado correctamente", "success"); await this.loadHistorial(); } else { throw new Error("No hay conexión a la base de datos"); } }
        catch (error) { UIService.showStatus("Error al eliminar retiro: " + error.message, "error"); }
        finally { UIService.showLoading(false); }
    },

    async viewIngreso(ingresoId) {
        const ingreso = AppState.historial.find(i => i.id === ingresoId && i.tipo === 'ingreso');
        if (!ingreso) { UIService.showStatus("No se encontró el ingreso", "error"); return; }
        const categoriaText = { 'venta': 'Venta', 'abono': 'Abono', 'otro': 'Otro' }[ingreso.categoria] || ingreso.categoria;
        const fecha = ingreso.timestamp ? new Date(ingreso.timestamp.toDate ? ingreso.timestamp.toDate() : ingreso.timestamp).toLocaleString('es-ES') : 'N/A';
        const modalContent = `<div class="invoice-detail-view" style="font-family: 'Segoe UI', sans-serif;"><div style="text-align: center; margin-bottom: 20px;"><h3 style="color: #27ae60; font-weight: bold; margin: 0;"><i class="fas fa-donate"></i> DETALLE DE INGRESO</h3><div style="color: #7f8c8d; font-size: 0.9em; margin-top: 5px;">${fecha}</div></div><div style="background: #f0fff4; padding: 20px; border-radius: 8px; border: 1px solid #9ae6b4;"><div style="margin-bottom: 15px;"><div style="color: #7f8c8d; font-size: 0.8em; font-weight: bold; text-transform: uppercase;">Concepto</div><div style="font-size: 1.1em; color: #2d3748; font-weight: 500;">${ingreso.concepto}</div></div><div style="margin-bottom: 15px;"><div style="color: #7f8c8d; font-size: 0.8em; font-weight: bold; text-transform: uppercase;">Categoría</div><div style="font-size: 1.1em; color: #2d3748;">${categoriaText}</div></div><div style="border-top: 1px dashed #68d391; padding-top: 15px; margin-top: 15px; display: flex; justify-content: space-between; align-items: center;"><div style="color: #2f855a; font-weight: bold;">TOTAL INGRESADO</div><div style="font-size: 1.8em; font-weight: bold; color: #2f855a;">$${ingreso.monto.toFixed(2)}</div></div></div><div style="margin-top: 25px;"><button onclick="ModalService.closeInvoiceModal()" style="width: 100%; padding: 12px; background-color: #718096; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; transition: background 0.2s;">CERRAR</button></div></div>`;
        UIService.showInvoiceModal(modalContent);
    },

    async deleteIngreso(ingresoId) {
        if (!confirm("¿Está seguro de eliminar este ingreso? Esta acción no se puede deshacer.")) return;
        try { UIService.showLoading(true); if (AppState.firebaseInitialized) { await AppState.db.collection("INGRESOS").doc(ingresoId).delete(); UIService.showStatus("Ingreso eliminado correctamente", "success"); await this.loadHistorial(); } else { throw new Error("No hay conexión a la base de datos"); } }
        catch (error) { UIService.showStatus("Error al eliminar ingreso: " + error.message, "error"); }
        finally { UIService.showLoading(false); }
    },

    async editRetiro(retiroId) {
        const retiro = AppState.historial.find(r => r.id === retiroId && r.tipo === 'retiro');
        if (!retiro) { UIService.showStatus("No se encontró el retiro", "error"); return; }
        UIService.showEditarRetiroModal(retiro);
    },

    async editIngreso(ingresoId) {
        const ingreso = AppState.historial.find(i => i.id === ingresoId && i.tipo === 'ingreso');
        if (!ingreso) { UIService.showStatus("No se encontró el ingreso", "error"); return; }
        UIService.showEditarIngresoModal(ingreso);
    },

    async processEditarRetiro() {
        const retiroId = document.getElementById('edit-retiro-id').value;
        const monto = parseFloat(document.getElementById('edit-monto-retiro').value);
        const concepto = document.getElementById('edit-concepto-retiro').value.trim();
        const categoria = document.getElementById('edit-categoria-retiro').value;
        if (!monto || monto <= 0 || isNaN(monto) || !isFinite(monto)) { UIService.showStatus("Ingrese un monto válido mayor a 0", "error"); return; }
        if (!concepto) { UIService.showStatus("Ingrese un concepto para el retiro", "error"); return; }
        try { UIService.showLoading(true); await AppState.db.collection("RETIROS").doc(retiroId).update({ monto, concepto, categoria }); UIService.showStatus("Retiro actualizado correctamente", "success"); ModalService.closeEditarRetiroModal(); await this.loadHistorial(); }
        catch (error) { UIService.showStatus("Error al actualizar retiro: " + error.message, "error"); }
        finally { UIService.showLoading(false); }
    },

    async processEditarIngreso() {
        const ingresoId = document.getElementById('edit-ingreso-id').value;
        const monto = parseFloat(document.getElementById('edit-monto-ingreso').value);
        const concepto = document.getElementById('edit-concepto-ingreso').value.trim();
        const categoria = document.getElementById('edit-categoria-ingreso').value;
        if (!monto || monto <= 0 || isNaN(monto) || !isFinite(monto)) { UIService.showStatus("Ingrese un monto válido mayor a 0", "error"); return; }
        if (!concepto) { UIService.showStatus("Ingrese un concepto para el ingreso", "error"); return; }
        try { UIService.showLoading(true); await AppState.db.collection("INGRESOS").doc(ingresoId).update({ monto, concepto, categoria }); UIService.showStatus("Ingreso actualizado correctamente", "success"); ModalService.closeEditarIngresoModal(); await this.loadHistorial(); }
        catch (error) { UIService.showStatus("Error al actualizar ingreso: " + error.message, "error"); }
        finally { UIService.showLoading(false); }
    },

    async cancelInvoice(invoiceId) {
        if (!confirm("¿Está seguro de cancelar esta factura? Se cambiará el estado a CONTADO.")) return;
        try { UIService.showLoading(true); await DataService.cancelInvoice(invoiceId); UIService.showStatus("Factura cancelada correctamente", "success"); await this.loadHistorial(); }
        catch (error) { UIService.showStatus("Error al cancelar factura: " + error.message, "error"); }
        finally { UIService.showLoading(false); }
    },

    async reprintInvoice(invoiceId) {
        let venta;
        try { venta = await DataService.getSaleById(invoiceId); } catch (error) { venta = AppState.historial.find(v => v.id === invoiceId && v.tipo === 'venta'); }
        if (venta) {
            PrintingService.printTicket(venta);
            if (!venta.printed) { try { await AppState.db.collection('VENTAS').doc(invoiceId).update({ printed: true }); } catch (e) { console.error("Error marcando como impresa", e); } }
            UIService.showStatus("Ticket reimpreso", "success");
        } else { UIService.showStatus("No se encontró la factura", "error"); }
    },

    async registrarAbono(invoiceId) {
        let venta;
        try { venta = await DataService.getSaleById(invoiceId); } catch (error) { venta = AppState.historial.find(v => v.id === invoiceId && v.tipo === 'venta'); }
        if (!venta) return;
        AppState.currentAbonoInvoice = venta;
        const saldoPendiente = venta.saldoPendiente !== undefined ? venta.saldoPendiente : venta.total;
        const modalContent = `<div class="invoice-details"><strong>Factura:</strong> ${venta.invoiceNumber}<br><strong>Grupo:</strong> ${venta.clientName}<br><strong>Total:</strong> $${venta.total.toFixed(2)}<br><strong>Saldo Pendiente:</strong> $${saldoPendiente.toFixed(2)}</div>`;
        UIService.showAbonoModal(modalContent);
    },

    async processAbono() {
        const montoInput = document.getElementById('monto-abono');
        const monto = parseFloat(montoInput.value);
        if (!monto || monto <= 0 || isNaN(monto) || !isFinite(monto)) { UIService.showStatus("Ingrese un monto válido mayor a 0", "error"); return; }
        if (!/^\d+(\.\d{1,2})?$/.test(montoInput.value)) { UIService.showStatus("El monto debe tener máximo 2 decimales", "error"); return; }
        const venta = AppState.currentAbonoInvoice;
        if (!venta) { UIService.showStatus("No hay factura seleccionada para el abono", "error"); return; }
        const saldoPendiente = venta.saldoPendiente !== undefined ? venta.saldoPendiente : venta.total;
        if (monto > saldoPendiente) { UIService.showStatus("El monto del abono no puede ser mayor al saldo pendiente", "error"); return; }
        try {
            UIService.showLoading(true);
            const abonoData = { monto: monto, fechaString: new Date().toLocaleString('es-ES') };
            await DataService.addAbono(venta.id, abonoData);
            PrintingService.printAbonoTicket(venta, abonoData, saldoPendiente - monto);
            UIService.showStatus(`Abono de $${monto.toFixed(2)} registrado correctamente`, "success");
            ModalService.closeAbonoModal();
            await this.loadHistorial();
        } catch (error) { UIService.showStatus("Error al procesar abono: " + error.message, "error"); }
        finally { UIService.showLoading(false); }
    },

    async deleteAbono(abonoId, invoiceId) {
        if (!confirm("¿Está seguro de eliminar este abono? El saldo de la factura aumentará.")) return;
        try { UIService.showLoading(true); await DataService.deleteAbono(abonoId, invoiceId); UIService.showStatus("Abono eliminado correctamente", "success"); await this.loadHistorial(); }
        catch (error) { UIService.showStatus("Error al eliminar abono: " + error.message, "error"); }
        finally { UIService.showLoading(false); }
    },

    async processRetiro() {
        const montoInput = document.getElementById('monto-retiro');
        const monto = parseFloat(montoInput.value);
        const concepto = document.getElementById('concepto-retiro').value.trim();
        const categoria = document.getElementById('categoria-retiro').value;
        if (!monto || monto <= 0 || isNaN(monto) || !isFinite(monto)) { UIService.showStatus("Ingrese un monto válido mayor a 0", "error"); return; }
        if (!/^\d+(\.\d{1,2})?$/.test(montoInput.value)) { UIService.showStatus("El monto debe tener máximo 2 decimales", "error"); return; }
        if (!concepto) { UIService.showStatus("Ingrese un concepto para el retiro", "error"); return; }
        try {
            UIService.showLoading(true);
            const retiroData = { monto, concepto, categoria, timestamp: DateUtils.getCurrentTimestampElSalvador(), date: DateUtils.getCurrentDateStringElSalvador() };
            await DataService.saveRetiro(retiroData);
            PrintingService.printRetiroTicket(retiroData);
            UIService.showStatus(`Retiro de $${monto.toFixed(2)} registrado correctamente`, "success");
            ModalService.closeRetiroModal();
            await this.loadHistorial();
        } catch (error) { UIService.showStatus("Error al procesar retiro: " + error.message, "error"); }
        finally { UIService.showLoading(false); }
    },

    async processIngreso() {
        const montoInput = document.getElementById('monto-ingreso');
        const monto = parseFloat(montoInput.value);
        const concepto = document.getElementById('concepto-ingreso').value.trim();
        const categoria = document.getElementById('categoria-ingreso').value;
        if (!monto || monto <= 0 || isNaN(monto) || !isFinite(monto)) { UIService.showStatus("Ingrese un monto válido mayor a 0", "error"); return; }
        if (!/^\d+(\.\d{1,2})?$/.test(montoInput.value)) { UIService.showStatus("El monto debe tener máximo 2 decimales", "error"); return; }
        if (!concepto) { UIService.showStatus("Ingrese un concepto para el ingreso", "error"); return; }
        try {
            UIService.showLoading(true);
            const ingresoData = { monto, concepto, categoria, timestamp: DateUtils.getCurrentTimestampElSalvador(), date: DateUtils.getCurrentDateStringElSalvador() };
            await DataService.saveIngreso(ingresoData);
            UIService.showStatus(`Ingreso de $${monto.toFixed(2)} registrado correctamente`, "success");
            ModalService.closeIngresoModal();
            await this.loadHistorial();
        } catch (error) { UIService.showStatus("Error al procesar ingreso: " + error.message, "error"); }
        finally { UIService.showLoading(false); }
    },

    async processGroupAbono(grupoId, montoTotal) {
        try { UIService.showLoading(true); const facturasAfectadas = await DataService.processGroupAbono(grupoId, montoTotal); await this.loadHistorial(); return facturasAfectadas; }
        catch (error) { console.error("Error en processGroupAbono:", error); throw error; }
        finally { UIService.showLoading(false); }
    },

    async processMultiAbono(facturasIds, montoTotal) {
        try { UIService.showLoading(true); const facturasAfectadas = await DataService.processMultiAbono(facturasIds, montoTotal); await this.loadHistorial(); return facturasAfectadas; }
        catch (error) { console.error("Error en processMultiAbono:", error); throw error; }
        finally { UIService.showLoading(false); }
    },

    async triggerGlobalSearch() {
        const filterInput = document.getElementById('filter-historial');
        const filter = filterInput.value.trim();

        if (filter !== '') {
            await this.searchGlobal(filter);
        } else {
            // Si está vacío, volver a cargar hoy
            await this.loadHistorial();
        }
    },

    async searchGlobal(equipo) {
        try {
            UIService.showLoading(true);
            const resultados = await DataService.searchSalesByEquipo(equipo);

            if (resultados.length === 0) {
                UIService.showStatus(`No se encontraron ventas para el equipo ${equipo} en todo el historial.`, "info");
                // Restaurar vista vacía
                const historialBody = document.getElementById('historial-body');
                historialBody.innerHTML = `<tr><td colspan="6" class="empty-cart">No se encontraron resultados en el historial global para "${equipo}"</td></tr>`;
            } else {
                UIService.showStatus(`Se encontraron ${resultados.length} registros en el historial.`, "success");
                HistorialService.updateHistorial(resultados);
            }
        } catch (error) {
            console.error("Error en búsqueda global:", error);
            UIService.showStatus("Error buscando: " + error.message, "error");
        } finally {
            UIService.showLoading(false);
        }
    },

    async printCurrentHistorial() {
        const movimientos = AppState.filteredHistorial;
        if (movimientos.length === 0) { UIService.showStatus("No hay movimientos para imprimir", "warning"); return; }
        PrintingService.printCurrentHistorial();
    },

    setTodayDate() {
        const today = DateUtils.getCurrentDateStringElSalvador();
        document.getElementById('fecha-venta').value = today;
        const fechaInput = document.getElementById('fecha-venta');
        if (DateUtils.isFutureDateInElSalvador(today)) fechaInput.classList.add('date-warning');
        else fechaInput.classList.remove('date-warning');
    }
};
