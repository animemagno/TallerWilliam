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
            console.log("Iniciando conexión a Firebase...");
            const fb = window.firebase || firebase;

            if (!fb || !fb.apps) {
                throw new Error("Firebase SDK no detectado. Verifique su conexión a internet.");
            }

            if (typeof CONFIG === 'undefined' || !CONFIG.firebase) {
                throw new Error("Configuración de Firebase (CONFIG) no encontrada.");
            }

            if (fb.apps.length === 0) {
                fb.initializeApp(CONFIG.firebase);
            }

            this.db = fb.firestore();
            AppState.db = this.db;

            // Intentar persistencia (multi-tab)
            try {
                await ErrorHandler.withTimeout(
                    this.db.enablePersistence({ synchronizeTabs: true }),
                    3000,
                    "Persistencia Firebase"
                );
                console.log("Persistencia de datos activada correctamente.");
            } catch (err) {
                if (err.code === 'failed-precondition') {
                    console.warn("Múltiples pestañas abiertas, persistencia limitada.");
                } else if (err.code === 'unimplemented') {
                    console.warn("El navegador no soporta persistencia offline.");
                } else {
                    console.warn("Error no crítico en persistencia:", err.message);
                }
            }

            // Test de conexión rápido
            await ErrorHandler.withTimeout(
                this.db.collection("VENTAS").limit(1).get(),
                5000,
                "Prueba de fuego de conexión"
            );

            AppState.firebaseInitialized = true;
            console.log("Firebase inicializado y conectado.");

        } catch (error) {
            console.error("Error FATAL inicializando Firebase:", error);
            AppState.firebaseInitialized = false;
            UIService.showStatus("Error de conexión: " + error.message, "error");
            throw error; // Re-lanzar para que init() lo capture y muestre el modal de error
        }
    },

    setupUI() {
        SalesService.setTodayDate();
        UIService.setupTabs();
        PrintingService.initPrinterButton();
    },

    async loadInitialData() {
        try {
            const bulkAbonoBtn = document.getElementById('process-bulk-abono-btn');
            if (bulkAbonoBtn) {
                const newBtn = bulkAbonoBtn.cloneNode(true);
                bulkAbonoBtn.parentNode.replaceChild(newBtn, bulkAbonoBtn);
            }
            await ProductCache.initialize();
            AppState.saleCounter = await DataService.getSaleCounter();
            await SalesService.loadHistorial();
            RealTimeHistoryManager.init();
            await GrupoManager.initialize();
        } catch (error) {
            console.error("Error cargando datos iniciales:", error);
        }
    },

    setupEventListeners() {
        // === SISTEMA DE PESTAÑAS (Panel Derecho) ===
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetTab = e.currentTarget.dataset.tab;
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                e.currentTarget.classList.add('active');
                document.getElementById(`tab-${targetTab}`).classList.add('active');
            });
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.search-container')) {
                document.getElementById('search-dropdown').style.display = 'none';
            }
            if (!e.target.closest('.action-menu-wrapper')) {
                document.querySelectorAll('.action-dropdown.show').forEach(d => d.classList.remove('show'));
            }
        });

        const searchInput = document.getElementById('buscar-producto');
        const dropdown = document.getElementById('search-dropdown');
        let searchTimeout;
        let currentFocus = -1;

        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            const query = e.target.value.trim();
            if (query.length < 2) {
                dropdown.style.display = 'none';
                return;
            }
            searchTimeout = setTimeout(async () => {
                try {
                    AppState.searchResults = await DataService.searchProducts(query);
                    UIService.showSearchResults(AppState.searchResults);
                    currentFocus = -1; // Restablecer el foco al realizar una nueva búsqueda
                } catch (error) {
                    dropdown.style.display = 'none';
                }
            }, 500);
        });

        searchInput.addEventListener('keydown', (e) => {
            const items = dropdown.getElementsByClassName('search-dropdown-item');
            
            if (dropdown.style.display === 'none' || items.length === 0) {
                if (e.key === 'Enter') {
                    const query = searchInput.value.trim();
                    if (query) {
                        handleProductSelectionOrManual(query);
                    }
                }
                return;
            }

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                currentFocus++;
                addActive(items);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                currentFocus--;
                addActive(items);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (currentFocus > -1 && items[currentFocus]) {
                    items[currentFocus].click();
                } else {
                    const query = searchInput.value.trim();
                    if (query) {
                        handleProductSelectionOrManual(query);
                    } else {
                        dropdown.style.display = 'none';
                    }
                }
            } else if (e.key === 'Escape') {
                dropdown.style.display = 'none';
            }
        });

        function findProductByBarcode(rawQuery) {
            if (!rawQuery) return null;
            const queryClean = rawQuery.trim().toLowerCase();
            
            // 1. Limpiar sufijos extra del código QR/barra (ej. "AN131032'1" -> "AN131032")
            const cleanCode = queryClean.includes("'") ? queryClean.split("'")[0] : queryClean;
            if (!cleanCode) return null;

            console.log("[Escaner] Buscando código:", cleanCode, "(Original:", rawQuery + ")");

            // Función auxiliar para comparar códigos ignorando ceros a la izquierda
            const compareCodes = (code1, code2) => {
                if (code1 === undefined || code1 === null || code2 === undefined || code2 === null) return false;
                const c1 = String(code1).toLowerCase().replace(/^0+/, '').trim();
                const c2 = String(code2).toLowerCase().replace(/^0+/, '').trim();
                return (c1 || "0") === (c2 || "0");
            };

            let matchedProduct = null;

            // 2. Buscar en ProductCache
            if (window.ProductCache && ProductCache.data) {
                console.log("[Escaner] Tamaño de base de datos local:", ProductCache.data.size);
                ProductCache.data.forEach((product, id) => {
                    if (matchedProduct) return;

                    // Convertir códigos y descripciones a String de forma segura para evitar fallas si son números
                    const prodCodigoStr = product.codigo !== undefined && product.codigo !== null ? String(product.codigo).trim() : '';
                    const prodDescStr = product.descripcion !== undefined && product.descripcion !== null ? String(product.descripcion).trim() : '';

                    // Separar códigos por si el producto tiene múltiples códigos cargados
                    const mainCodes = prodCodigoStr ? prodCodigoStr.toLowerCase().split(/[\s,-]+/) : [];
                    
                    const matchMain = mainCodes.some(c => compareCodes(c, cleanCode));
                    const matchDesc = prodDescStr && compareCodes(prodDescStr, cleanCode);
                    
                    // También buscar en aliases y codigosProveedor de forma segura por si existen
                    const aliases = Array.isArray(product.aliases) ? product.aliases : [];
                    const matchAlias = aliases.some(a => compareCodes(a, cleanCode));
                    
                    const codigosProv = Array.isArray(product.codigosProveedor) ? product.codigosProveedor : [];
                    const matchProv = codigosProv.some(c => compareCodes(c, cleanCode));

                    if (matchMain || matchDesc || matchAlias || matchProv) {
                        matchedProduct = product;
                        console.log("[Escaner] Coincidencia encontrada:", product.descripcion, "| Código:", product.codigo);
                    }
                });
            } else {
                console.warn("[Escaner] ProductCache no está inicializado o no contiene datos.");
            }

            if (!matchedProduct) {
                console.log("[Escaner] No se encontró ninguna coincidencia en la base de datos.");
            }

            return matchedProduct;
        }

        function handleProductSelectionOrManual(query) {
            const matchedProduct = findProductByBarcode(query);
            if (matchedProduct) {
                dropdown.style.display = 'none';
                searchInput.value = '';
                
                // Usamos un retraso de 50ms para evitar que el Enter físico del lector
                // se transfiera y envíe automáticamente el prompt de cantidad.
                setTimeout(() => {
                    const cantidadStr = prompt(`Ingrese la cantidad para "${matchedProduct.descripcion || 'este producto'}":`, "1");
                    if (cantidadStr !== null) {
                        const cantidad = parseInt(cantidadStr) || 1;
                        if (cantidad < 1) {
                            UIService.showStatus("La cantidad debe ser al menos 1", "error");
                        } else {
                            SalesService.addToCart(matchedProduct, cantidad);
                        }
                    }
                    searchInput.focus();
                }, 50);
            } else {
                SalesService.addManualProduct(query);
                searchInput.value = '';
                dropdown.style.display = 'none';
            }
        }

        function addActive(items) {
            if (!items) return false;
            removeActive(items);
            if (currentFocus >= items.length) currentFocus = 0;
            if (currentFocus < 0) currentFocus = items.length - 1;
            items[currentFocus].classList.add('focused');
            items[currentFocus].scrollIntoView({ block: 'nearest' });
        }

        function removeActive(items) {
            for (let i = 0; i < items.length; i++) {
                items[i].classList.remove('focused');
            }
        }

        document.getElementById('equipo').addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/[^0-9]/g, '');
            if (e.target.value.length > 4) {
                e.target.value = e.target.value.substring(0, 4);
            }
        });

        document.getElementById('fecha-venta').addEventListener('change', function () {
            SalesService.setTodayDate();
        });

        document.getElementById('contado-btn').addEventListener('click', () => SalesService.processSale('contado'));
        document.getElementById('pendiente-btn').addEventListener('click', () => SalesService.processSale('pendiente'));
        document.getElementById('print-historial-btn').addEventListener('click', () => SalesService.printCurrentHistorial());
        SalesService.initSearchAutocomplete();

        const filterInput = document.getElementById('filter-historial');

        filterInput.addEventListener('input', (e) => {
            const filter = e.target.value.trim();
            if (filter === '') {
                AppState.filteredHistorial = AppState.historial;
                HistorialService.renderHistorial();
                return;
            }

            // Detectar formato "12 - Cliente"
            let equipoFilter = filter;
            let clientFilter = null;
            const dashMatch = filter.match(/^(\d+)\s*-\s*(.+)$/);
            if (dashMatch) {
                equipoFilter = dashMatch[1].trim();
                clientFilter = dashMatch[2].trim().toLowerCase();
            }

            const filtered = AppState.historial.filter(movimiento => {
                if (movimiento.tipo === 'venta') {
                    const equipo = (movimiento.equipoNumber || '').trim();
                    if (!equipo.includes(equipoFilter)) return false;
                    if (clientFilter) {
                        const cliente = (movimiento.clientName || '').toLowerCase();
                        if (!cliente.includes(clientFilter)) return false;
                    }
                    return true;
                }
                return false;
            });

            if (filtered.length === 0) {
                const historialBody = document.getElementById('historial-body');
                historialBody.innerHTML = `
                    <tr>
                        <td colspan="6" class="empty-cart">
                            <div style="padding: 20px;">
                                No se encontró "${filter}" en los registros de hoy.<br>
                                <span style="font-size: 0.9em; color: #3498db; cursor: pointer; text-decoration: underline;" onclick="SalesService.searchGlobal('${filter}')">
                                    <i class="fas fa-search"></i> Haz clic aquí o presiona ENTER para buscar en todo el historial
                                </span>
                            </div>
                        </td>
                    </tr>
                `;
            } else {
                AppState.filteredHistorial = filtered;
                HistorialService.renderHistorial();
            }
        });

        filterInput.addEventListener('keypress', async (e) => {
            if (e.key === 'Enter') {
                const filter = e.target.value.trim();
                if (filter) {
                    await SalesService.searchGlobal(filter);
                }
            }
        });

        document.getElementById('close-invoice-modal').addEventListener('click', () => ModalService.closeInvoiceModal());
        document.getElementById('process-abono-btn').addEventListener('click', () => SalesService.processAbono());
        document.getElementById('close-abono-modal').addEventListener('click', () => ModalService.closeAbonoModal());
        document.getElementById('close-retiro-modal').addEventListener('click', () => ModalService.closeRetiroModal());
        document.getElementById('process-retiro-btn').addEventListener('click', () => SalesService.processRetiro());
        document.getElementById('process-ingreso-btn').addEventListener('click', () => SalesService.processIngreso());
        document.getElementById('close-ingreso-modal').addEventListener('click', () => ModalService.closeIngresoModal());
        document.getElementById('close-detalle-modal').addEventListener('click', () => ModalService.closeDetalleModal());

        document.getElementById('imprimir-detalle-modal').addEventListener('click', () => {
            const detalle = AppState.currentDetalle;
            if (detalle && detalle.tipo === 'equipo') {
                GrupoManager.printBalanceHistory(detalle.data);
            }
        });

        document.getElementById('close-grupo-detalle-modal').addEventListener('click', () => ModalService.closeGrupoDetalleModal());
        document.getElementById('imprimir-grupo-detalle-modal').addEventListener('click', () => GrupoManager.imprimirGrupoCompleto());

        document.getElementById('crear-grupo-btn').addEventListener('click', () => {
            document.getElementById('crear-grupo-modal').style.display = 'block';
            AppState.equiposSeleccionados.clear();
            GrupoManager.generarGridEquipos('crear');
            GrupoManager.actualizarListaSeleccionados('crear');
            document.getElementById('nombre-grupo').value = '';
        });

        document.getElementById('guardar-grupo-btn').addEventListener('click', async () => {
            const nombre = document.getElementById('nombre-grupo').value.trim();
            if (!nombre) { UIService.showStatus("Ingrese un nombre para el grupo", "error"); return; }
            if (AppState.equiposSeleccionados.size === 0) { UIService.showStatus("Seleccione al menos un equipo", "error"); return; }
            try {
                UIService.showLoading(true);
                const equiposArray = Array.from(AppState.equiposSeleccionados);
                await GrupoManager.crearGrupo(nombre, equiposArray);
                UIService.showStatus(`Grupo "${nombre}" creado correctamente`, "success");
                ModalService.closeCrearGrupoModal();
            } catch (error) { UIService.showStatus("Error al crear grupo: " + error.message, "error"); }
            finally { UIService.showLoading(false); }
        });

        document.getElementById('cancelar-grupo-btn').addEventListener('click', () => ModalService.closeCrearGrupoModal());
        document.getElementById('actualizar-grupo-btn').addEventListener('click', () => GrupoManager.actualizarGrupoDesdeModal());
        document.getElementById('cancelar-editar-grupo-btn').addEventListener('click', () => ModalService.closeEditarGrupoModal());

        // Event listeners para modales de abono inicial
        document.getElementById('confirmar-con-abono-btn').addEventListener('click', (e) => {
            if (e.target.disabled) return;
            e.target.disabled = true;
            const datos = AppState.datosVentaPendiente;
            if (datos) {
                document.getElementById('confirmacion-abono-modal').style.display = 'none';
                SalesService.mostrarModalAbonoInicial(datos.equipo, datos.cliente, datos.totalVenta, datos.fechaVenta);
            }
            setTimeout(() => e.target.disabled = false, 1000);
        });

        document.getElementById('continuar-sin-abono-btn').addEventListener('click', async (e) => {
            if (e.target.disabled) return;
            e.target.disabled = true;
            const datos = AppState.datosVentaPendiente;
            if (datos) {
                document.getElementById('confirmacion-abono-modal').style.display = 'none';
                try { await SalesService.procesarVentaPendienteSinAbono(datos.equipo, datos.cliente, datos.fechaVenta, datos.totalVenta); }
                finally { e.target.disabled = false; }
            } else { e.target.disabled = false; }
        });

        document.getElementById('cancelar-confirmacion-btn').addEventListener('click', () => {
            document.getElementById('confirmacion-abono-modal').style.display = 'none';
            document.getElementById('contado-btn').disabled = false;
            document.getElementById('pendiente-btn').disabled = false;
        });

        document.getElementById('monto-abono-inicial').addEventListener('input', (e) => {
            const montoAbono = parseFloat(e.target.value) || 0;
            const totalVenta = AppState.datosVentaPendiente?.totalVenta || 0;
            const saldoDespues = totalVenta - montoAbono;
            document.getElementById('saldo-despues-abono').textContent = '$' + Math.max(0, saldoDespues).toFixed(2);
            if (montoAbono > totalVenta) e.target.classList.add('price-warning');
            else e.target.classList.remove('price-warning');
        });

        document.getElementById('procesar-venta-con-abono-btn').addEventListener('click', async (e) => {
            if (e.target.disabled) return;
            e.target.disabled = true;
            const montoAbono = parseFloat(document.getElementById('monto-abono-inicial').value) || 0;
            const datos = AppState.datosVentaPendiente;
            if (!datos) { UIService.showStatus("Error: No hay datos de venta disponibles", "error"); e.target.disabled = false; return; }
            if (montoAbono <= 0) { UIService.showStatus("Ingrese un monto de abono válido", "error"); e.target.disabled = false; return; }
            if (montoAbono > datos.totalVenta) { UIService.showStatus("El monto del abono no puede ser mayor al total de la venta", "error"); e.target.disabled = false; return; }
            document.getElementById('abono-inicial-modal').style.display = 'none';
            try { await SalesService.procesarVentaPendienteConAbono(datos.equipo, datos.cliente, datos.fechaVenta, datos.totalVenta, montoAbono); }
            finally { e.target.disabled = false; }
        });

        document.getElementById('cancelar-abono-inicial-btn').addEventListener('click', () => {
            document.getElementById('abono-inicial-modal').style.display = 'none';
            document.getElementById('contado-btn').disabled = false;
            document.getElementById('pendiente-btn').disabled = false;
        });

        document.getElementById('close-bulk-abono-modal').addEventListener('click', () => {
            document.getElementById('bulk-abono-modal').style.display = 'none';
        });

        window.addEventListener('beforeunload', () => {
            ProductCache.cleanup();
            if (GrupoManager.unsubscribe) GrupoManager.unsubscribe();
        });

        document.getElementById('backup-btn').addEventListener('click', async () => {
            try { UIService.showLoading(true); await DataService.exportBackup(); UIService.showStatus("Copia de seguridad descargada correctamente", "success"); }
            catch (error) { UIService.showStatus("Error al crear copia de seguridad: " + error.message, "error"); }
            finally { UIService.showLoading(false); }
        });

        document.getElementById('abonar-grupo-btn').addEventListener('click', () => GrupoManager.showGroupPaymentModalSelector());
    }
};

document.addEventListener('DOMContentLoaded', function () {
    App.init();
});
