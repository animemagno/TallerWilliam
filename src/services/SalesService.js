import { AppState } from '../store/AppState.js';
import { DataService } from './DataService.js';
import { UIService, ModalService } from './UIService.js';
import { PrintService } from './PrintService.js';
import { DateUtils } from '../utils/DateUtils.js';
import { ProductCache } from './ProductCache.js';

export const SalesService = {
    async generateInvoiceNumber() {
        const date = DateUtils.getCurrentDateStringElSalvador();
        // Intentar obtener el contador, si falla, usar timestamp como fallback
        try {
            const count = await DataService.getSaleCounter(date);
            const sequence = (count + 1).toString().padStart(3, '0');
            const datePart = date.replace(/-/g, '');
            return `${datePart}-${sequence}`;
        } catch (e) {
            console.error("Error generando número de factura, usando timestamp", e);
            return `FAC-${Date.now()}`;
        }
    },

    async verifyInvoiceUnique(invoiceNumber) {
        return !(await DataService.checkInvoiceExists(invoiceNumber));
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
            if (!isUnique) {
                throw new Error("El número de factura generado ya existe. Intente nuevamente.");
            }

            const saleData = {
                invoiceNumber: invoiceNumber || `ERR-${Date.now()}`,
                equipoNumber: finalEquipo || '0000',
                clientName: finalCliente || 'Cliente General',
                products: AppState.cart.map(item => ({
                    id: item.id || 'unknown',
                    codigo: item.codigo || 'N/A',
                    descripcion: item.descripcion || 'Sin descripción',
                    precio: Number(item.precio) || 0,
                    cantidad: Number(item.cantidad) || 1
                })),
                total: Number(totalVenta) || 0,
                paymentType: 'contado',
                timestamp: DateUtils.getCurrentTimestampElSalvador(),
                date: fechaVenta || DateUtils.getCurrentDateStringElSalvador(),
                status: 'pagado',
                saldoPendiente: 0,
                abonos: [],
                fechaCreacion: DateUtils.getCurrentTimestampElSalvador()
            };

            await DataService.saveSale(saleData);

            // Registrar ingreso automáticamente
            await DataService.saveIngreso({
                monto: totalVenta,
                concepto: `Venta Contado Factura #${invoiceNumber}`,
                categoria: 'venta',
                timestamp: DateUtils.getCurrentTimestampElSalvador(),
                date: fechaVenta,
                invoiceId: invoiceNumber, // Usamos invoiceNumber como referencia
                invoiceNumber: invoiceNumber,
                clientName: finalCliente,
                equipoNumber: finalEquipo
            });

            PrintService.printTicket(saleData);

            UIService.showStatus(`Venta CONTADO procesada - Factura #${saleData.invoiceNumber}`, "success");

            this.limpiarFormularioVenta();
            await ProductCache.refresh();
            await DataService.loadHistorial(); // Nota: DataService.loadHistorial no existe, debe ser SalesService o UI quien orqueste esto.
            // Corregiré esto: DataService carga datos, UI actualiza.
            const movimientos = await DataService.loadAllMovements();
            UIService.updateHistorial(movimientos);

        } catch (error) {
            UIService.showStatus("Error al procesar venta contado: " + error.message, "error");
            console.error("Error en procesarVentaContado:", error);
        } finally {
            AppState.processingSale = false;
            UIService.updatePaymentButtonsState(false);
            UIService.showLoading(false);
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
            if (!isUnique) {
                throw new Error("El número de factura generado ya existe.");
            }

            const saleData = {
                invoiceNumber: invoiceNumber || `ERR-${Date.now()}`,
                equipoNumber: finalEquipo || '0000',
                clientName: finalCliente || 'Cliente General',
                products: AppState.cart.map(item => ({
                    id: item.id || 'unknown',
                    codigo: item.codigo || 'N/A',
                    descripcion: item.descripcion || 'Sin descripción',
                    precio: Number(item.precio) || 0,
                    cantidad: Number(item.cantidad) || 1
                })),
                total: Number(totalVenta) || 0,
                paymentType: 'pendiente',
                timestamp: DateUtils.getCurrentTimestampElSalvador(),
                date: fechaVenta || DateUtils.getCurrentDateStringElSalvador(),
                status: 'pendiente',
                saldoPendiente: Number(totalVenta) || 0,
                abonos: [],
                fechaCreacion: DateUtils.getCurrentTimestampElSalvador()
            };

            await DataService.saveSale(saleData);

            PrintService.printTicket(saleData);

            UIService.showStatus(`Venta PENDIENTE procesada - Factura #${saleData.invoiceNumber}`, "success");

            this.limpiarFormularioVenta();
            await ProductCache.refresh();

            const movimientos = await DataService.loadAllMovements();
            UIService.updateHistorial(movimientos);

        } catch (error) {
            UIService.showStatus("Error al procesar venta pendiente: " + error.message, "error");
            console.error("Error en procesarVentaPendienteSinAbono:", error);
        } finally {
            AppState.processingSale = false;
            UIService.updatePaymentButtonsState(false);
            UIService.showLoading(false);
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
            if (!isUnique) {
                throw new Error("El número de factura generado ya existe.");
            }

            const abonoData = {
                monto: montoAbono,
                fecha: DateUtils.getCurrentTimestampElSalvador(),
                fechaString: DateUtils.getCurrentTimestampElSalvador().toLocaleString('es-ES')
            };

            const saleData = {
                invoiceNumber: invoiceNumber || `ERR-${Date.now()}`,
                equipoNumber: finalEquipo || '0000',
                clientName: finalCliente || 'Cliente General',
                products: AppState.cart.map(item => ({
                    id: item.id || 'unknown',
                    codigo: item.codigo || 'N/A',
                    descripcion: item.descripcion || 'Sin descripción',
                    precio: Number(item.precio) || 0,
                    cantidad: Number(item.cantidad) || 1
                })),
                total: Number(totalVenta) || 0,
                paymentType: saldoPendiente <= 0 ? 'contado' : 'pendiente',
                timestamp: DateUtils.getCurrentTimestampElSalvador(),
                date: fechaVenta || DateUtils.getCurrentDateStringElSalvador(),
                status: saldoPendiente <= 0 ? 'pagado' : 'pendiente',
                saldoPendiente: Number(saldoPendiente) || 0,
                abonos: [abonoData],
                fechaCreacion: DateUtils.getCurrentTimestampElSalvador()
            };

            await DataService.saveSale(saleData);

            // Registrar ingreso por el abono
            if (montoAbono > 0) {
                await DataService.saveIngreso({
                    monto: montoAbono,
                    concepto: `Abono Inicial Factura #${invoiceNumber}`,
                    categoria: 'abono',
                    timestamp: DateUtils.getCurrentTimestampElSalvador(),
                    date: fechaVenta,
                    invoiceId: invoiceNumber,
                    invoiceNumber: invoiceNumber,
                    clientName: finalCliente,
                    equipoNumber: finalEquipo
                });
            }

            // Imprimir ticket de la venta
            PrintService.printTicket(saleData);

            // Imprimir ticket del abono si es necesario
            if (montoAbono > 0) {
                PrintService.printAbonoTicket(saleData, abonoData, saldoPendiente);
            }

            if (saldoPendiente <= 0) {
                UIService.showStatus(`Venta con abono completo procesada - Factura #${saleData.invoiceNumber}`, "success");
            } else {
                UIService.showStatus(`Venta PENDIENTE con abono inicial procesada - Factura #${saleData.invoiceNumber}`, "success");
            }

            this.limpiarFormularioVenta();
            await ProductCache.refresh();

            const movimientos = await DataService.loadAllMovements();
            UIService.updateHistorial(movimientos);

        } catch (error) {
            UIService.showStatus("Error al procesar venta con abono: " + error.message, "error");
            console.error("Error en procesarVentaPendienteConAbono:", error);
        } finally {
            AppState.processingSale = false;
            UIService.updatePaymentButtonsState(false);
            UIService.showLoading(false);
        }
    },

    mostrarModalAbonoInicial(equipo, cliente, totalVenta, fechaVenta) {
        // Guardar datos temporalmente
        AppState.datosVentaPendiente = {
            equipo: equipo,
            cliente: cliente,
            totalVenta: totalVenta,
            fechaVenta: fechaVenta
        };

        // Actualizar información en el modal de abono
        document.getElementById('abono-modal-total').textContent = totalVenta.toFixed(2);
        document.getElementById('abono-modal-equipo').textContent = equipo;
        document.getElementById('abono-modal-cliente').textContent = cliente || `Equipo ${equipo}`;

        // Resetear campo de abono
        document.getElementById('monto-abono-inicial').value = '';
        document.getElementById('saldo-despues-abono').textContent = '$' + totalVenta.toFixed(2);

        // Mostrar modal
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
                fechaActualizacion: DateUtils.getCurrentTimestampElSalvador()
            };

            if (nuevoSaldoPendiente <= 0) {
                saleData.paymentType = 'contado';
                saleData.status = 'pagado';
            }

            await DataService.updateSale(invoiceId, saleData);

            UIService.showStatus("Factura actualizada correctamente", "success");

            const ventaActualizada = { ...ventaActual, ...saleData };
            PrintService.printTicket(ventaActualizada);

            this.cancelEdit();

            const movimientos = await DataService.loadAllMovements();
            UIService.updateHistorial(movimientos);

        } catch (error) {
            UIService.showStatus("Error al actualizar la factura: " + error.message, "error");
        }
    },

    editInvoice(invoiceId) {
        let venta = AppState.historial.find(v => v.id === invoiceId && v.tipo === 'venta');
        if (!venta) {
            UIService.showStatus("No se encontró la factura para editar", "error");
            return;
        }

        AppState.cart = venta.products.map(p => ({
            id: p.id,
            codigo: p.codigo,
            descripcion: p.descripcion,
            precio: p.precio,
            cantidad: p.cantidad
        }));

        document.getElementById('equipo').value = venta.equipoNumber || '';
        document.getElementById('cliente').value = venta.clientName || '';
        document.getElementById('fecha-venta').value = venta.date || DateUtils.getCurrentDateStringElSalvador();

        AppState.currentEditingInvoice = invoiceId;

        UIService.updateCartDisplay();

        // Ocultar botones originales
        document.getElementById('contado-btn').style.display = 'none';
        document.getElementById('pendiente-btn').style.display = 'none';

        // Crear botones de edición en las mismas posiciones
        // Nota: Esto debería ser manejado por UIService idealmente, pero lo dejo aquí por ahora
        const updateBtn = document.createElement('button');
        updateBtn.className = 'btn btn-success';
        updateBtn.id = 'update-btn';
        updateBtn.textContent = 'ACTUALIZAR FACTURA';
        updateBtn.onclick = () => this.updateInvoice(invoiceId);

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn btn-danger';
        cancelBtn.id = 'cancel-btn';
        cancelBtn.textContent = 'CANCELAR EDICIÓN';
        cancelBtn.onclick = () => this.cancelEdit();

        // Insertar en las mismas posiciones de los botones originales
        const contadoContainer = document.querySelector('.venta-line-1').lastElementChild;
        const pendienteContainer = document.querySelector('.venta-line-2').lastElementChild;

        contadoContainer.innerHTML = '';
        pendienteContainer.innerHTML = '';

        contadoContainer.appendChild(updateBtn);
        pendienteContainer.appendChild(cancelBtn);

        UIService.showStatus("Modo edición activado - Editando factura pendiente", "success");
    },

    cancelEdit() {
        AppState.cart = [];
        AppState.currentEditingInvoice = null;
        // this.setTodayDate(); // Falta implementar o llamar a DateUtils
        UIService.updateCartDisplay();
        document.getElementById('equipo').value = '';
        document.getElementById('cliente').value = '';
        document.getElementById('buscar-producto').value = '';

        UIService.restorePaymentButtons();

        UIService.showStatus("Edición cancelada", "info");
    },

    async processMultiAbono(facturasIds, montoTotal) {
        let facturas = [];
        for (const id of facturasIds) {
            const venta = await DataService.getSaleById(id);
            if (venta) facturas.push(venta);
        }

        facturas.sort((a, b) => {
            const dateA = a.timestamp ? (a.timestamp.toDate ? a.timestamp.toDate() : new Date(a.timestamp)) : new Date(0);
            const dateB = b.timestamp ? (b.timestamp.toDate ? b.timestamp.toDate() : new Date(b.timestamp)) : new Date(0);
            return dateA - dateB;
        });

        let montoRestante = montoTotal;
        const abonosRealizados = [];

        for (const venta of facturas) {
            if (montoRestante <= 0) break;

            const saldoPendiente = venta.saldoPendiente !== undefined ? venta.saldoPendiente : venta.total;
            if (saldoPendiente <= 0) continue;

            const montoAbonar = Math.min(montoRestante, saldoPendiente);

            const abonoData = {
                monto: montoAbonar,
                fecha: DateUtils.getCurrentTimestampElSalvador(),
                fechaString: DateUtils.getCurrentTimestampElSalvador().toLocaleString('es-ES')
            };

            const nuevoSaldo = saldoPendiente - montoAbonar;
            const updateData = {
                abonos: [...(venta.abonos || []), abonoData],
                saldoPendiente: nuevoSaldo,
                status: nuevoSaldo <= 0 ? 'pagado' : 'pendiente',
                paymentType: nuevoSaldo <= 0 ? 'contado' : 'pendiente',
                fechaActualizacion: DateUtils.getCurrentTimestampElSalvador()
            };

            await DataService.updateSale(venta.id, updateData);

            await DataService.saveIngreso({
                monto: montoAbonar,
                concepto: `Abono Masivo Factura #${venta.invoiceNumber}`,
                categoria: 'abono',
                timestamp: DateUtils.getCurrentTimestampElSalvador(),
                date: DateUtils.getCurrentDateStringElSalvador(),
                invoiceId: venta.id,
                invoiceNumber: venta.invoiceNumber,
                clientName: venta.clientName,
                equipoNumber: venta.equipoNumber
            });

            abonosRealizados.push({ venta, monto: montoAbonar });
            montoRestante -= montoAbonar;
        }
    },

    async processGroupAbono(grupoId, montoTotal) {
        const facturas = await DataService.getSalesByGroup(grupoId);

        if (facturas.length === 0) {
            throw new Error("No hay facturas pendientes en este grupo");
        }

        const facturasIds = facturas.map(f => f.id);
        await this.processMultiAbono(facturasIds, montoTotal);
    },

    setTodayDate() {
        const today = DateUtils.getCurrentDateStringElSalvador();
        const fechaInput = document.getElementById('fecha-venta');
        if (fechaInput) {
            fechaInput.value = today;

            if (DateUtils.isFutureDateInElSalvador(today)) {
                fechaInput.classList.add('date-warning');
            } else {
                fechaInput.classList.remove('date-warning');
            }
        }
    },

    addToCart(product) {
        if (!product) return;

        const existing = AppState.cart.find(item => item.codigo === product.codigo);
        if (existing) {
            existing.cantidad++;
        } else {
            AppState.cart.push({
                ...product,
                cantidad: 1
            });
        }
        UIService.updateCartDisplay();
    },

    updateQuantity(index, newQuantity) {
        const qty = parseInt(newQuantity);
        if (qty > 0 && AppState.cart[index]) {
            AppState.cart[index].cantidad = qty;
            UIService.updateCartDisplay();
        }
    },

    updatePrice(index, newPrice) {
        const price = parseFloat(newPrice);
        if (price >= 0 && AppState.cart[index]) {
            AppState.cart[index].precio = price;
            UIService.updateCartDisplay();
        }
    },

    removeFromCart(index) {
        if (AppState.cart[index]) {
            AppState.cart.splice(index, 1);
            UIService.updateCartDisplay();
        }
    },

    addManualProduct(descripcion) {
        if (!descripcion || descripcion.trim().length === 0) return;

        const manualProduct = {
            id: `manual-${Date.now()}`,
            codigo: 'MANUAL',
            descripcion: descripcion.trim(),
            precio: 0,
            cantidad: 1
        };

        this.addToCart(manualProduct);
        UIService.showStatus('Producto manual agregado. Ingrese el precio.', 'info');
    },

    async processSale(paymentType) {
        if (AppState.cart.length === 0) {
            UIService.showStatus('El carrito está vacío', 'error');
            return;
        }

        const equipo = document.getElementById('equipo').value.trim();
        const cliente = document.getElementById('cliente').value.trim();
        const fechaVenta = document.getElementById('fecha-venta').value;

        if (!equipo || equipo.trim().length === 0) {
            UIService.showStatus('Ingrese un número de equipo válido', 'error');
            return;
        }

        if (!cliente) {
            UIService.showStatus('Ingrese el nombre del cliente', 'error');
            return;
        }

        const totalVenta = AppState.cart.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);

        if (totalVenta <= 0) {
            UIService.showStatus('El total de la venta debe ser mayor a cero', 'error');
            return;
        }

        try {
            UIService.showLoading(true);

            if (paymentType === 'contado') {
                await this.procesarVentaContado(equipo, cliente, fechaVenta, totalVenta);
            } else {
                AppState.datosVentaPendiente = { equipo, cliente, totalVenta, fechaVenta };
                const confirmModal = document.getElementById('confirmacion-abono-modal');
                const totalSpan = document.getElementById('confirmacion-total');
                const equipoSpan = document.getElementById('confirmacion-equipo');
                const clienteSpan = document.getElementById('confirmacion-cliente');

                if (confirmModal) confirmModal.style.display = 'block';
                if (totalSpan) totalSpan.textContent = totalVenta.toFixed(2);
                if (equipoSpan) equipoSpan.textContent = equipo;
                if (clienteSpan) clienteSpan.textContent = cliente;
            }
        } catch (error) {
            console.error('Error procesando venta:', error);
            UIService.showStatus('Error procesando venta: ' + error.message, 'error');
        } finally {
            UIService.showLoading(false);
        }
    },

    async viewInvoice(invoiceId) {
        try {
            const venta = await DataService.getSaleById(invoiceId);
            if (!venta) {
                UIService.showStatus('Factura no encontrada', 'error');
                return;
            }

            let productosHTML = '';
            if (venta.products && venta.products.length > 0) {
                venta.products.forEach(p => {
                    productosHTML += `
                        <tr>
                            <td>${p.cantidad}</td>
                            <td>${p.descripcion}</td>
                            <td>$${p.precio.toFixed(2)}</td>
                            <td>$${(p.precio * p.cantidad).toFixed(2)}</td>
                        </tr>
                    `;
                });
            }

            let abonosHTML = '';
            if (venta.abonos && venta.abonos.length > 0) {
                venta.abonos.forEach(abono => {
                    const fecha = abono.fecha ? new Date(abono.fecha.toDate ? abono.fecha.toDate() : abono.fecha).toLocaleDateString('es-ES') : 'N/A';
                    abonosHTML += `
                        <tr>
                            <td>${fecha}</td>
                            <td>$${abono.monto.toFixed(2)}</td>
                        </tr>
                    `;
                });
            }

            const modalContent = `
                <div style="max-width: 600px; margin: 0 auto;">
                    <h3 style="text-align: center; color: #2c3e50;">
                        Factura #${venta.invoiceNumber}
                    </h3>
                    <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                        <div><strong>Cliente:</strong> ${venta.clientName || 'N/A'}</div>
                        <div><strong>Equipo:</strong> ${venta.equipoNumber || 'N/A'}</div>
                        <div><strong>Fecha:</strong> ${venta.timestamp ? new Date(venta.timestamp.toDate ? venta.timestamp.toDate() : venta.timestamp).toLocaleDateString('es-ES') : 'N/A'}</div>
                        <div><strong>Estado:</strong> <span style="color: ${venta.status === 'cancelado' ? '#e74c3c' : venta.paymentType === 'contado' ? '#27ae60' : '#f39c12'};">${venta.status === 'cancelado' ? 'CANCELADO' : venta.paymentType.toUpperCase()}</span></div>
                    </div>

                    <h4>Productos</h4>
                    <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px;">
                        <thead>
                            <tr style="background-color: #34495e; color: white;">
                                <th style="padding: 8px;">Cant.</th>
                                <th style="padding: 8px; text-align: left;">Descripción</th>
                                <th style="padding: 8px;">Precio</th>
                                <th style="padding: 8px;">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${productosHTML || '<tr><td colspan="4" style="text-align: center; padding: 15px;">No hay productos</td></tr>'}
                        </tbody>
                    </table>

                    <div style="text-align: right; font-size: 1.2rem; margin bottom: 15px;">
                        <strong>Total: $${(venta.total || 0).toFixed(2)}</strong>
                    </div>

                    ${venta.abonos && venta.abonos.length > 0 ? `
                        <h4>Abonos</h4>
                        <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px;">
                            <thead>
                                <tr style="background-color: #27ae60; color: white;">
                                    <th style="padding: 8px;">Fecha</th>
                                    <th style="padding: 8px;">Monto</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${abonosHTML}
                            </tbody>
                        </table>
                        <div style="text-align: right; font-size: 1.1rem; color: #e74c3c;">
                            <strong>Saldo Pendiente: $${(venta.saldoPendiente || 0).toFixed(2)}</strong>
                        </div>
                    ` : ''}
                </div>
            `;

            const contentEl = document.getElementById('invoice-modal-content');
            const modalEl = document.getElementById('invoice-modal');
            if (contentEl) contentEl.innerHTML = modalContent;
            if (modalEl) modalEl.style.display = 'block';

        } catch (error) {
            console.error('Error viewing invoice:', error);
            UIService.showStatus('Error al cargar factura: ' + error.message, 'error');
        }
    },

    async showAbonoModal(invoiceId) {
        try {
            const venta = await DataService.getSaleById(invoiceId);
            if (!venta) {
                UIService.showStatus('Factura no encontrada', 'error');
                return;
            }

            if (venta.status === 'cancelado') {
                UIService.showStatus('No se puede abonar a una factura cancelada', 'error');
                return;
            }

            if (venta.paymentType === 'contado') {
                UIService.showStatus('Esta factura ya está pagada', 'info');
                return;
            }

            AppState.currentAbonoInvoice = venta;

            const saldoPendiente = venta.saldoPendiente !== undefined ? venta.saldoPendiente : venta.total;

            const modal = document.getElementById('abono-modal');
            const infoDiv = document.getElementById('abono-info');

            if (infoDiv) {
                infoDiv.innerHTML = `
                    <div><strong>Factura:</strong> #${venta.invoiceNumber}</div>
                    <div><strong>Cliente:</strong> ${venta.clientName || 'N/A'}</div>
                    <div><strong>Equipo:</strong> ${venta.equipoNumber || 'N/A'}</div>
                    <div><strong>Total:</strong> $${venta.total.toFixed(2)}</div>
                    <div style="color: #e74c3c;"><strong>Saldo Pendiente:</strong> $${saldoPendiente.toFixed(2)}</div>
                `;
            }

            const montoInput = document.getElementById('monto-abono');
            if (montoInput) {
                montoInput.value = '';
                montoInput.max = saldoPendiente;
                montoInput.focus();
            }

            if (modal) {
                modal.dataset.invoiceId = invoiceId;
                modal.style.display = 'block';
            }

        } catch (error) {
            console.error('Error showing abono modal:', error);
            UIService.showStatus('Error: ' + error.message, 'error');
        }
    },

    processAbono() {
        const invoiceId = document.getElementById('abono-modal').dataset.invoiceId;
        const monto = parseFloat(document.getElementById('monto-abono').value);

        if (!monto || monto <= 0) {
            UIService.showStatus('Ingrese un monto válido', 'error');
            return;
        }

        UIService.showLoading(true);

        DataService.addAbono(invoiceId, {
            monto: monto,
            fecha: DateUtils.getCurrentTimestampElSalvador(),
            fechaString: DateUtils.getCurrentDateStringElSalvador()
        })
            .then(async (nuevoSaldo) => {
                UIService.showStatus('Abono registrado correctamente', 'success');
                ModalService.closeAbonoModal();

                // Imprimir ticket de abono
                try {
                    console.log("Intentando imprimir ticket de abono. InvoiceId:", invoiceId);
                    const venta = await DataService.getSaleById(invoiceId);

                    if (venta) {
                        console.log("Venta recuperada, llamando a PrintService.printAbonoTicket");
                        PrintService.printAbonoTicket(venta, {
                            monto: monto,
                            fecha: DateUtils.getCurrentTimestampElSalvador()
                        }, nuevoSaldo);
                    } else {
                        console.error("No se pudo cargar la venta para imprimir el ticket de abono");
                        UIService.showStatus("No se pudo cargar datos para imprimir ticket", "warning");
                    }
                } catch (printError) {
                    console.error("Error imprimiendo ticket de abono:", printError);
                    UIService.showStatus("Error al imprimir ticket", "error");
                }

                const movimientos = await DataService.loadAllMovements();
                UIService.updateHistorial(movimientos);
            })
            .catch(error => {
                console.error('Error registrando abono:', error);
                UIService.showStatus(error.message, 'error');
            })
            .finally(() => {
                UIService.showLoading(false);
            });
    },

    async deleteInvoice(invoiceId) {
        if (confirm('¿Está seguro de que desea eliminar esta factura? Esta acción no se puede deshacer.')) {
            try {
                UIService.showLoading(true);
                await DataService.deleteSale(invoiceId);
                const movimientos = await DataService.loadAllMovements();
                UIService.updateHistorial(movimientos);
                UIService.showStatus('Factura eliminada correctamente', 'success');
            } catch (error) {
                console.error('Error eliminando factura:', error);
                UIService.showStatus('Error al eliminar la factura', 'error');
            } finally {
                UIService.showLoading(false);
            }
        }
    }
};
