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

        document.getElementById('fecha-venta').addEventListener('change', function () {
            SalesService.setTodayDate();
        });

        document.getElementById('contado-btn').addEventListener('click', () => SalesService.processSale('contado'));
        document.getElementById('pendiente-btn').addEventListener('click', () => SalesService.processSale('pendiente'));
        document.getElementById('print-historial-btn').addEventListener('click', () => SalesService.printCurrentHistorial());

        document.getElementById('filter-historial').addEventListener('input', (e) => {
            const filter = e.target.value.trim();
            if (filter === '') { UIService.applyCurrentFilter(); return; }
            const filtered = AppState.historial.filter(movimiento => {
                if (movimiento.tipo === 'venta') {
                    const equipo = (movimiento.equipoNumber || '').trim();
                    return equipo === filter;
                }
                return false;
            });
            const historialBody = document.getElementById('historial-body');
            if (filtered.length === 0) {
                historialBody.innerHTML = `<tr><td colspan="6" class="empty-cart">No hay movimientos para el equipo ${filter}</td></tr>`;
            } else {
                AppState.filteredHistorial = filtered;
                HistorialService.renderHistorial();
            }
        });

        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                AppState.currentFilter = e.target.dataset.filter;
                UIService.updateFilterButtons();
                UIService.applyCurrentFilter();
            });
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
