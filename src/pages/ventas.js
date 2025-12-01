import { firebaseConfig } from '../config/firebase.js';
import { AppState } from '../store/AppState.js';
import { DataService } from '../services/DataService.js';
import { SalesService } from '../services/SalesService.js';
import { GrupoManager } from '../modules/GrupoManager.js';
import { ProductCache } from '../services/ProductCache.js';
import { UIService, ModalService } from '../services/UIService.js';
import { PrintService } from '../services/PrintService.js';
import { DateUtils } from '../utils/DateUtils.js';
import { ConnectionManager } from '../utils/ConnectionManager.js';

console.log('✅ Módulo ventas.js cargado correctamente');
console.log('📋 Verificando imports:', {
    firebaseConfig: !!firebaseConfig,
    AppState: !!AppState,
    DataService: !!DataService,
    SalesService: !!SalesService,
    GrupoManager: !!GrupoManager,
    ProductCache: !!ProductCache,
    UIService: !!UIService,
    ModalService: !!ModalService,
    PrintService: !!PrintService,
    DateUtils: !!DateUtils,
    ConnectionManager: !!ConnectionManager
});

// Inicialización
async function init() {
    console.log('🚀 Iniciando sistema...');

    try {
        console.log('📦 Inicializando Firebase...');
        // Firebase init
        if (firebase.apps.length === 0) {
            firebase.initializeApp(firebaseConfig);
            console.log('✅ Firebase inicializado');
        } else {
            console.log('ℹ️ Firebase ya estaba inicializado');
        }
        const db = firebase.firestore();

        // Persistencia
        try {
            await db.enablePersistence().catch(err => {
                if (err.code == 'failed-precondition') {
                    console.warn("⚠️ Persistencia falló: Múltiples pestañas abiertas");
                } else if (err.code == 'unimplemented') {
                    console.warn("⚠️ Persistencia no soportada por el navegador");
                }
            });
        } catch (e) {
            console.warn("⚠️ Error habilitando persistencia:", e);
        }

        console.log('🔧 Inicializando AppState...');
        AppState.initialize(db);
        console.log('✅ AppState inicializado');

        // Exponer globales
        window.SalesService = SalesService;
        window.GrupoManager = GrupoManager;
        window.UIService = UIService;
        window.ModalService = ModalService;
        window.DataService = DataService;
        window.AppState = AppState;
        window.PrintService = PrintService;
        window.DateUtils = DateUtils;
        window.ConnectionManager = ConnectionManager;
        console.log('✅ Servicios expuestos globalmente');

        // Inicializar servicios
        console.log('📦 Inicializando ProductCache...');
        await ProductCache.initialize();
        console.log('✅ ProductCache inicializado');

        console.log('📊 Obteniendo contador de ventas...');
        AppState.saleCounter = await DataService.getSaleCounter();
        console.log('✅ Contador de ventas:', AppState.saleCounter);

        console.log('👥 Inicializando GrupoManager...');
        await GrupoManager.initialize();
        console.log('✅ GrupoManager inicializado');

        console.log('🌐 Inicializando ConnectionManager...');
        ConnectionManager.initialize();
        console.log('✅ ConnectionManager inicializado');

        // Cargar historial inicial
        // Cargar historial inicial
        console.log('📜 Cargando historial...');
        try {
            const movimientos = await DataService.loadAllMovements();
            console.log('✅ Movimientos cargados:', movimientos.length);
            UIService.updateHistorial(movimientos);
            console.log('✅ Historial actualizado en UI');
        } catch (error) {
            console.error("❌ Error cargando historial inicial:", error);
            UIService.updateHistorial([]); // Limpiar "Cargando..."
        }

        setupUI();
        console.log('✅ UI configurada');

        setupEventListeners();
        console.log('✅ Event listeners configurados');

        UIService.showStatus("Sistema de Ventas Listo", "success");
        console.log('🎉 Sistema completamente inicializado');
    } catch (error) {
        console.error("❌ Error en inicialización:", error);
        console.error("Stack trace:", error.stack);
        UIService.showStatus("Error al inicializar: " + error.message, "error");
    }
}

function setupUI() {
    SalesService.setTodayDate();
    UIService.setupTabs();
}

function setupEventListeners() {
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-container')) {
            const dropdown = document.getElementById('search-dropdown');
            if (dropdown) dropdown.style.display = 'none';
        }
    });

    const searchInput = document.getElementById('buscar-producto');
    if (searchInput) {
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
    }

    const equipoInput = document.getElementById('equipo');
    if (equipoInput) {
        equipoInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/[^0-9]/g, '');
            if (e.target.value.length > 4) {
                e.target.value = e.target.value.substring(0, 4);
            }
        });
    }

    const fechaInput = document.getElementById('fecha-venta');
    if (fechaInput) {
        fechaInput.addEventListener('change', function () {
            SalesService.setTodayDate();
        });
    }

    const contadoBtn = document.getElementById('contado-btn');
    if (contadoBtn) {
        contadoBtn.addEventListener('click', () => {
            SalesService.processSale('contado');
        });
    }

    const pendienteBtn = document.getElementById('pendiente-btn');
    if (pendienteBtn) {
        pendienteBtn.addEventListener('click', () => {
            SalesService.processSale('pendiente');
        });
    }

    const printHistorialBtn = document.getElementById('print-historial-btn');
    if (printHistorialBtn) {
        printHistorialBtn.addEventListener('click', () => {
            PrintService.printCurrentHistorial();
        });
    }

    const filterHistorial = document.getElementById('filter-historial');
    if (filterHistorial) {
        filterHistorial.addEventListener('input', (e) => {
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
    }

    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            AppState.currentFilter = e.target.dataset.filter;
            UIService.updateFilterButtons();
            UIService.applyCurrentFilter();
        });
    });

    const closeInvoiceModal = document.getElementById('close-invoice-modal');
    if (closeInvoiceModal) {
        closeInvoiceModal.addEventListener('click', () => {
            ModalService.closeInvoiceModal();
        });
    }

    const processAbonoBtn = document.getElementById('process-abono-btn');
    if (processAbonoBtn) {
        processAbonoBtn.addEventListener('click', () => {
            SalesService.processAbono();
        });
    }

    const closeAbonoModal = document.getElementById('close-abono-modal');
    if (closeAbonoModal) {
        closeAbonoModal.addEventListener('click', () => {
            ModalService.closeAbonoModal();
        });
    }

    const closeRetiroModal = document.getElementById('close-retiro-modal');
    if (closeRetiroModal) {
        closeRetiroModal.addEventListener('click', () => {
            ModalService.closeRetiroModal();
        });
    }

    const processIngresoBtn = document.getElementById('process-ingreso-btn');
    if (processIngresoBtn) {
        processIngresoBtn.addEventListener('click', () => {
            SalesService.processIngreso();
        });
    }

    const closeIngresoModal = document.getElementById('close-ingreso-modal');
    if (closeIngresoModal) {
        closeIngresoModal.addEventListener('click', () => {
            UIService.closeIngresoModal();
        });
    }

    const closeDetalleModal = document.getElementById('close-detalle-modal');
    if (closeDetalleModal) {
        closeDetalleModal.addEventListener('click', () => {
            ModalService.closeDetalleModal();
        });
    }

    const imprimirDetalleModal = document.getElementById('imprimir-detalle-modal');
    if (imprimirDetalleModal) {
        imprimirDetalleModal.addEventListener('click', () => {
            const detalle = AppState.currentDetalle;
            if (detalle && detalle.tipo === 'equipo') {
                const equipo = GrupoManager.equiposPendientes.get(detalle.data);
                if (equipo) {
                    equipo.facturas.forEach(factura => {
                        PrintService.printTicket(factura);
                    });
                }
            }
        });
    }

    const closeGrupoDetalleModal = document.getElementById('close-grupo-detalle-modal');
    if (closeGrupoDetalleModal) {
        closeGrupoDetalleModal.addEventListener('click', () => {
            ModalService.closeGrupoDetalleModal();
        });
    }

    const imprimirGrupoDetalleModal = document.getElementById('imprimir-grupo-detalle-modal');
    if (imprimirGrupoDetalleModal) {
        imprimirGrupoDetalleModal.addEventListener('click', () => {
            GrupoManager.imprimirGrupoCompleto();
        });
    }

    const crearGrupoBtn = document.getElementById('crear-grupo-btn');
    if (crearGrupoBtn) {
        crearGrupoBtn.addEventListener('click', () => {
            document.getElementById('crear-grupo-modal').style.display = 'block';
            AppState.equiposSeleccionados.clear();
            GrupoManager.generarGridEquipos('crear');
            GrupoManager.actualizarListaSeleccionados('crear');
            document.getElementById('nombre-grupo').value = '';
        });
    }

    const guardarGrupoBtn = document.getElementById('guardar-grupo-btn');
    if (guardarGrupoBtn) {
        guardarGrupoBtn.addEventListener('click', async () => {
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
                UIService.showLoading(true);
                const equiposArray = Array.from(AppState.equiposSeleccionados);
                await GrupoManager.crearGrupo(nombre, equiposArray);
                UIService.showStatus(`Grupo "${nombre}" creado correctamente`, "success");
                ModalService.closeCrearGrupoModal();
            } catch (error) {
                UIService.showStatus("Error al crear grupo: " + error.message, "error");
            } finally {
                UIService.showLoading(false);
            }
        });
    }

    const cancelarGrupoBtn = document.getElementById('cancelar-grupo-btn');
    if (cancelarGrupoBtn) {
        cancelarGrupoBtn.addEventListener('click', () => {
            ModalService.closeCrearGrupoModal();
        });
    }

    const actualizarGrupoBtn = document.getElementById('actualizar-grupo-btn');
    if (actualizarGrupoBtn) {
        actualizarGrupoBtn.addEventListener('click', () => {
            GrupoManager.actualizarGrupoDesdeModal();
        });
    }

    const cancelarEditarGrupoBtn = document.getElementById('cancelar-editar-grupo-btn');
    if (cancelarEditarGrupoBtn) {
        cancelarEditarGrupoBtn.addEventListener('click', () => {
            ModalService.closeEditarGrupoModal();
        });
    }

    const confirmarConAbonoBtn = document.getElementById('confirmar-con-abono-btn');
    if (confirmarConAbonoBtn) {
        confirmarConAbonoBtn.addEventListener('click', (e) => {
            if (e.target.disabled) return;
            e.target.disabled = true;
            const datos = AppState.datosVentaPendiente;
            if (datos) {
                document.getElementById('confirmacion-abono-modal').style.display = 'none';
                SalesService.mostrarModalAbonoInicial(datos.equipo, datos.cliente, datos.totalVenta, datos.fechaVenta);
            }
            setTimeout(() => e.target.disabled = false, 1000);
        });
    }

    const continuarSinAbonoBtn = document.getElementById('continuar-sin-abono-btn');
    if (continuarSinAbonoBtn) {
        continuarSinAbonoBtn.addEventListener('click', async (e) => {
            if (e.target.disabled) return;
            e.target.disabled = true;
            const datos = AppState.datosVentaPendiente;
            if (datos) {
                document.getElementById('confirmacion-abono-modal').style.display = 'none';
                try {
                    await SalesService.procesarVentaPendienteSinAbono(datos.equipo, datos.cliente, datos.fechaVenta, datos.totalVenta);
                } finally {
                    e.target.disabled = false;
                }
            } else {
                e.target.disabled = false;
            }
        });
    }

    const cancelarConfirmacionBtn = document.getElementById('cancelar-confirmacion-btn');
    if (cancelarConfirmacionBtn) {
        cancelarConfirmacionBtn.addEventListener('click', () => {
            ModalService.closeConfirmacionAbonoModal();
        });
    }

    const montoAbonoInicial = document.getElementById('monto-abono-inicial');
    if (montoAbonoInicial) {
        montoAbonoInicial.addEventListener('input', (e) => {
            const montoAbono = parseFloat(e.target.value) || 0;
            const totalVenta = AppState.datosVentaPendiente?.totalVenta || 0;
            const saldoDespues = totalVenta - montoAbono;

            document.getElementById('saldo-despues-abono').textContent = '$' + Math.max(0, saldoDespues).toFixed(2);

            if (montoAbono > totalVenta) {
                e.target.classList.add('price-warning');
            } else {
                e.target.classList.remove('price-warning');
            }
        });
    }

    const procesarVentaConAbonoBtn = document.getElementById('procesar-venta-con-abono-btn');
    if (procesarVentaConAbonoBtn) {
        procesarVentaConAbonoBtn.addEventListener('click', async (e) => {
            if (e.target.disabled) return;
            e.target.disabled = true;
            const montoAbono = parseFloat(document.getElementById('monto-abono-inicial').value) || 0;
            const datos = AppState.datosVentaPendiente;

            if (!datos) {
                UIService.showStatus("Error: No hay datos de venta disponibles", "error");
                e.target.disabled = false;
                return;
            }

            if (montoAbono <= 0) {
                UIService.showStatus("Ingrese un monto de abono válido", "error");
                e.target.disabled = false;
                return;
            }

            if (montoAbono > datos.totalVenta) {
                UIService.showStatus("El monto del abono no puede ser mayor al total de la venta", "error");
                e.target.disabled = false;
                return;
            }

            document.getElementById('abono-inicial-modal').style.display = 'none';
            try {
                await SalesService.procesarVentaPendienteConAbono(datos.equipo, datos.cliente, datos.fechaVenta, datos.totalVenta, montoAbono);
            } finally {
                e.target.disabled = false;
            }
        });
    }

    const cancelarAbonoInicialBtn = document.getElementById('cancelar-abono-inicial-btn');
    if (cancelarAbonoInicialBtn) {
        cancelarAbonoInicialBtn.addEventListener('click', () => {
            ModalService.closeAbonoInicialModal();
        });
    }

    const closeBulkAbonoModal = document.getElementById('close-bulk-abono-modal');
    if (closeBulkAbonoModal) {
        closeBulkAbonoModal.addEventListener('click', () => {
            document.getElementById('bulk-abono-modal').style.display = 'none';
        });
    }

    window.addEventListener('beforeunload', () => {
        ProductCache.cleanup();
        if (GrupoManager.unsubscribe) {
            GrupoManager.unsubscribe();
        }
    });

    const abonarGrupoBtn = document.getElementById('abonar-grupo-btn');
    if (abonarGrupoBtn) {
        abonarGrupoBtn.addEventListener('click', () => {
            GrupoManager.showGroupPaymentModalSelector();
        });
    }
}

// Funciones globales para onclicks dinámicos
window.toggleEquipoGrid = function (equipoNum, modalType = 'crear') {
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

window.eliminarGrupo = function (grupoId) {
    if (!confirm("¿Está seguro de eliminar este grupo? Los equipos volverán a estar disponibles individualmente y se eliminarán las asociaciones de grupo.")) {
        return;
    }

    try {
        UIService.showLoading(true);
        GrupoManager.eliminarGrupo(grupoId);
        UIService.showStatus("Grupo eliminado correctamente", "success");
        GrupoManager.updateUI();
    } catch (error) {
        UIService.showStatus("Error al eliminar grupo: " + error.message, "error");
    } finally {
        UIService.showLoading(false);
    }
}

document.addEventListener('DOMContentLoaded', init);
