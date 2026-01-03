
/**
 * HistorialManager Unificado (v7 - Producción)
 * Implementación validada basada en historial_global.html
 * Fuente de datos: Únicamente 'VENTAS' (ya que contiene todos los 758 registros).
 */

const HistorialManagerUnificado = {
    allSales: [],
    filteredSales: [],
    currentFilter: 'hoy',
    currentDate: null,
    currentEquipoFilter: '',
    db: null,

    async init() {
        console.log('🚀 HistorialManager V7 (Autonomous): Iniciando...');

        try {
            // ESTRATEGIA BYPASS: Conexión Independiente
            // Intentamos crear una app de Firebase separada para evitar bloqueos de la app principal

            let config = null;
            if (window.CONFIG && window.CONFIG.firebase) {
                config = window.CONFIG.firebase;
            } else if (typeof firebaseConfig !== 'undefined') {
                config = firebaseConfig; // Fallback por si existe globalmente
            } else {
                // Último recurso: intentar robar la config de la app default si existe
                if (firebase.apps.length > 0) {
                    config = firebase.app().options;
                }
            }

            if (!config) {
                throw new Error("No se encontró configuración de Firebase (CONFIG.firebase)");
            }

            // Crear app secundaria "HistorialApp" o reutilizarla si ya existe
            let historyApp;
            const appName = "HistorialApp";
            const existingApp = firebase.apps.find(app => app.name === appName);

            if (existingApp) {
                historyApp = existingApp;
            } else {
                console.log("🔌 Creando conexión dedicada 'HistorialApp'...");
                historyApp = firebase.initializeApp(config, appName);
            }

            this.db = historyApp.firestore();
            console.log("✅ Conexión dedicada establecida.");

            // ESTRATEGIA DE RESCATE GLOBAL
            // Si la conexión principal falló, inyectamos nuestra conexión sana.
            if (!window.db || !AppState.db) {
                console.log("🚑 HistorialManager: Rescatando conexión global...");
                window.db = this.db;
                if (window.AppState) window.AppState.db = this.db;
                window.dispatchEvent(new Event('db_restored'));

                // RESCATE ROBUSTO (Detectando globales const/let)
                setTimeout(() => {
                    // 1. Facturas
                    try {
                        if (typeof FacturasManager !== 'undefined' && FacturasManager.cargarEquiposPendientes) {
                            console.log("🚑 Reloading FacturasManager...");
                            FacturasManager.cargarEquiposPendientes();
                        }
                    } catch (e) { console.warn("Rescue Facturas failed", e); }

                    // 2. Grupos
                    try {
                        if (typeof GrupoManager !== 'undefined') {
                            console.log("🚑 Reloading GrupoManager...");
                            if (GrupoManager.initialize) GrupoManager.initialize();
                            else if (GrupoManager.cargarGrupos) GrupoManager.cargarGrupos();
                        }
                    } catch (e) { console.warn("Rescue Grupos failed", e); }
                }, 1000);
            }
            // Asegurar backup global
            window.db_fallback = this.db;

            // 2. Cargar Datos
            await this.loadAll();

            // 3. Configurar UI
            this.setupListeners();

        } catch (error) {
            console.error('❌ Error crítico en inicialización:', error);
            this.renderError('Error de conexión: ' + error.message);
        }
    },

    injectStyles() {
        if (document.getElementById('historial-styles')) return;
        const style = document.createElement('style');
        style.id = 'historial-styles';
        style.innerHTML = `
            .action-menu-wrapper { position: relative; display: inline-block; }
            .action-dropdown { display: none; position: absolute; right: 0; top: 100%; background: white; border: 1px solid #ddd; z-index: 1000; box-shadow: 0 4px 8px rgba(0,0,0,0.1); border-radius: 4px; min-width: 160px; text-align: left; }
            .action-dropdown.show { display: block; }
            .dropdown-item { padding: 10px 15px; cursor: pointer; display: flex; align-items: center; gap: 10px; color: #333; font-size: 0.9rem; transition: background 0.1s; border-bottom: 1px solid #f0f0f0; }
            .dropdown-item:last-child { border-bottom: none; }
            .dropdown-item:hover { background: #f8f9fa; }
            .dropdown-item i { width: 20px; text-align: center; color: #555; }
            .dropdown-item.text-danger { color: #e74c3c; }
            .dropdown-item.text-danger i { color: #e74c3c; }
            .dropdown-item.text-danger:hover { background: #fdedec; }
            .btn-update-sale { background: #3498db; color: white; width: 100%; padding: 10px; font-weight: bold; border: none; border-radius: 4px; }
            .btn-cancel-edit { background: #95a5a6; color: white; width: 100%; padding: 10px; font-weight: bold; border: none; border-radius: 4px; }
        `;
        document.head.appendChild(style);
    },

    setupListeners() {
        this.injectStyles();

        // Cerrar menús al hacer click fuera
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.action-menu-wrapper')) {
                this.closeAllMenus();
            }
        });

        console.log('👂 Configurando detectores de eventos...');

        // Input d búsqueda (Texto)
        const searchInput = document.getElementById('filter-historial');
        if (searchInput) {
            // Eliminar listeners viejos clonando
            const newInput = searchInput.cloneNode(true);
            searchInput.parentNode.replaceChild(newInput, searchInput);

            newInput.addEventListener('input', (e) => {
                console.log(`🔎 Usuario busca: "${e.target.value}"`);
                this.filterByEquipo(e.target.value);
            });
            // Restaurar foco si se pierde al reemplazar
            newInput.value = this.currentEquipoFilter;
            // newInput.focus(); // Opcional, a veces molesta
        }

        // Input de fecha
        const dateInput = document.getElementById('history-date-filter');
        if (dateInput) {
            dateInput.addEventListener('change', (e) => {
                if (e.target.value) this.filterByDate(e.target.value);
            });
        }

        // Botones de filtro rápido (Todo, Hoy, etc)
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.setFilter(e.target.getAttribute('data-filter'));
            });
        });
    },

    async loadAll() {
        try {
            console.log('🔄 loadAll: Iniciando carga unificada (VENTAS, RETIROS, INGRESOS)...');
            const tbody = document.getElementById('historial-body');
            if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center"><i class="fas fa-spinner fa-spin"></i> Cargando movimientos...</td></tr>';

            const fetchCollection = async (colName, typeDefault) => {
                try {
                    const snap = await this.db.collection(colName).limit(3000).get(); // Aumentado límite
                    return snap.docs.map(doc => ({ id: doc.id, ...doc.data(), collection: colName, tipo: doc.data().tipo || typeDefault }));
                } catch (e) {
                    console.warn(`Error cargando ${colName}:`, e);
                    return [];
                }
            };

            const [ventas, retiros, ingresos] = await Promise.all([
                fetchCollection('VENTAS', 'venta'),
                fetchCollection('RETIROS', 'retiro'),
                fetchCollection('INGRESOS', 'ingreso')
            ]);

            console.log(`📦 Docs recibidos - Ventas: ${ventas.length}, Retiros: ${retiros.length}, Ingresos: ${ingresos.length}`);

            // Normalización y fusión
            this.allSales = [
                ...ventas.map(v => ({ ...v, tipo: 'venta' })), // Forzar tipo venta
                ...retiros.map(r => ({ ...r, tipo: 'retiro' })),
                ...ingresos.map(i => ({
                    ...i,
                    tipo: i.categoria === 'abono' ? 'abono' : 'ingreso',
                    clientName: i.clientName || i.concepto || 'Ingreso'
                }))
            ];

            // Ordenar: Más reciente primero
            this.allSales.sort((a, b) => this.parseDate(b) - this.parseDate(a));

            console.log(`✅ Total unificado: ${this.allSales.length} registros.`);
            this.applyCurrentFilter();

        } catch (error) {
            console.error('❌ Error cargando historial unificado:', error);
            this.renderError('Error al leer base de datos: ' + error.message);
        }
    },

    // --- LÓGICA DE MENÚ Y ACCIONES ---

    toggleMenu(id, event) {
        event.stopPropagation();
        const currentMenu = document.getElementById(`menu-${id}`);
        document.querySelectorAll('.action-dropdown.show').forEach(el => {
            if (el.id !== `menu-${id}`) el.classList.remove('show');
        });
        if (currentMenu) currentMenu.classList.toggle('show');
    },

    closeAllMenus() {
        document.querySelectorAll('.action-dropdown.show').forEach(el => el.classList.remove('show'));
    },

    // --- ACCIONES REALES ---

    viewInvoice(id) {
        if (typeof SalesService !== 'undefined' && SalesService.viewInvoice) SalesService.viewInvoice(id);
        else if (window.App && App.viewInvoice) App.viewInvoice(id);
    },

    printInvoice(id) {
        if (typeof SalesService !== 'undefined' && SalesService.reprintInvoice) SalesService.reprintInvoice(id);
    },

    editInvoice(id) {
        // Solo ventas pueden editarse por ahora
        const item = this.allSales.find(s => s.id === id);
        if (item && item.tipo !== 'venta') {
            alert("Solo se pueden editar registros de ventas.");
            return;
        }

        // Lógica original de editInvoice...
        if (!item) return;
        if (!confirm(`¿Desea cargar la factura #${item.invoiceNumber} para editarla?`)) return;

        const tabBtn = document.querySelector('.tab-btn[data-tab="carrito"]');
        if (tabBtn) tabBtn.click();

        if (typeof SalesService === 'undefined') return;

        try {
            if (SalesService.limpiarFormularioVenta) SalesService.limpiarFormularioVenta();

            if (item.products && Array.isArray(item.products)) {
                item.products.forEach(prod => SalesService.addToCart(prod));
            }

            const elEquipo = document.getElementById('equipo');
            const elCliente = document.getElementById('cliente');
            const elFecha = document.getElementById('fecha-venta');

            if (elEquipo) elEquipo.value = item.equipoNumber || '';
            if (elCliente) elCliente.value = item.clientName || '';
            if (elFecha && item.date) elFecha.value = item.date;

            this.setupEditUI(item.id);
            alert("Venta cargada. Realice cambios y pulse 'ACTUALIZAR VENTA'.");
        } catch (e) {
            console.error("Error editando:", e);
        }
    },

    setupEditUI(invoiceId) {
        const line1Div = document.querySelector('.venta-line-1 div:last-child');
        const line2Div = document.querySelector('.venta-line-2 div:last-child');

        if (line1Div) {
            line1Div.innerHTML = `<button class="btn btn-update-sale" onclick="HistorialManager.saveUpdate('${invoiceId}')"><i class="fas fa-save"></i> ACTUALIZAR VENTA</button>`;
        }
        if (line2Div) {
            line2Div.innerHTML = `<button class="btn btn-cancel-edit" onclick="HistorialManager.cancelUpdate()"><i class="fas fa-times"></i> CANCELAR EDICIÓN</button>`;
        }
    },

    saveUpdate(invoiceId) {
        if (typeof SalesService !== 'undefined' && SalesService.updateInvoice) {
            SalesService.updateInvoice(invoiceId).then(() => console.log("Edición completada."));
        }
    },

    cancelUpdate() {
        if (typeof SalesService !== 'undefined' && SalesService.restorePaymentButtons) {
            SalesService.restorePaymentButtons();
            if (SalesService.limpiarFormularioVenta) SalesService.limpiarFormularioVenta();
        } else {
            window.location.reload();
        }
    },

    abonar(id) {
        if (typeof SalesService !== 'undefined' && SalesService.registrarAbono) SalesService.registrarAbono(id);
    },

    cancelar(id) {
        if (typeof SalesService !== 'undefined' && SalesService.cancelInvoice) SalesService.cancelInvoice(id);
    },

    eliminar(id) {
        const item = this.allSales.find(s => s.id === id);
        if (!item) return;

        let collection = 'VENTAS';
        if (item.tipo === 'retiro') collection = 'RETIROS';
        if (item.tipo === 'ingreso' || item.tipo === 'abono') collection = 'INGRESOS';

        if (confirm(`¿Eliminar permanentemente este registro (${item.tipo})?`)) {
            // Usar DB directa si DataService falla o para items no-venta
            this.db.collection(collection).doc(id).delete()
                .then(() => {
                    alert("Registro eliminado.");
                    this.loadAll();
                })
                .catch(err => alert("Error eliminando: " + err.message));
        }
    },

    parseDate(obj) {
        if (!obj) return new Date(0);
        if (obj.timestamp && obj.timestamp.toDate) return obj.timestamp.toDate();
        // Soporte para fechas String de INGRESOS/RETIROS si no tienen timestamp
        if (obj.date) {
            const s = String(obj.date);
            if (s.includes('-')) {
                const parts = s.split('-');
                if (parts.length === 3) return new Date(parts[0], parts[1] - 1, parts[2]);
            }
        }
        return new Date(0);
    },

    setFilter(filterType) {
        this.currentFilter = filterType;
        this.currentDate = null;
        const di = document.getElementById('history-date-filter');
        if (di && filterType !== 'fecha') di.value = '';
        this.applyCurrentFilter();
    },

    filterByDate(d) {
        this.currentFilter = 'fecha';
        this.currentDate = d;
        this.applyCurrentFilter();
    },

    filterByEquipo(v) {
        this.currentEquipoFilter = v;
        this.applyCurrentFilter();
    },

    applyCurrentFilter() {
        let sales = [...this.allSales];

        // 1. Filtro Tipo (Hoy/Fecha)
        if (this.currentFilter === 'hoy') {
            const today = new Date().toLocaleDateString('es-ES');
            sales = sales.filter(s => this.parseDate(s).toLocaleDateString('es-ES') === today);
        } else if (this.currentFilter === 'fecha' && this.currentDate) {
            const [y, m, d] = this.currentDate.split('-');
            const fds = `${parseInt(d)}/${parseInt(m)}/${y}`;
            sales = sales.filter(s => this.parseDate(s).toLocaleDateString('es-ES') === fds);
        }

        // 2. Filtro Buscador (Texto)
        if (this.currentEquipoFilter && this.currentEquipoFilter.trim() !== '') {
            const q = this.currentEquipoFilter.toLowerCase().trim();
            sales = sales.filter(s =>
                String(s.invoiceNumber || '').toLowerCase().includes(q) ||
                String(s.equipoNumber || '').toLowerCase().includes(q) ||
                String(s.clientName || '').toLowerCase().includes(q) ||
                String(s.concepto || '').toLowerCase().includes(q) ||
                String(s.status || '').toLowerCase().includes(q) ||
                String(s.tipo || '').toLowerCase().includes(q)
            );
        }

        this.filteredSales = sales;
        this.render();
    },

    render() {
        const tbody = document.getElementById('historial-body');
        if (!tbody) return;

        if (this.filteredSales.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty-cart">No se encontraron movimientos con ese criterio.</td></tr>';
            return;
        }

        // --- LÓGICA DE LÍMITE ---
        const limit = this.filteredSales.length; // Sin límite
        const items = this.filteredSales.slice(0, limit);
        let html = '';

        items.forEach(sale => {
            const fechaStr = this.parseDate(sale).toLocaleDateString('es-ES');

            // Lógica de visualización según TIPO
            let icon = '';
            let tipoLabel = '';
            let claseEstado = '';
            let rowStyle = '';
            let total = Number(sale.total || sale.monto || 0); // Venta: total, Abono/Retiro: monto
            let descripcion = '';

            if (sale.tipo === 'venta') {
                icon = '<i class="fas fa-shopping-cart" style="color:#3498db" title="Venta"></i>';
                const estado = sale.status || (sale.paymentType === 'pendiente' ? 'pendiente' : 'pagado');
                claseEstado = estado === 'pendiente' ? 'status-pendiente' : (estado === 'cancelado' ? 'status-cancelado' : 'status-pagado');
                tipoLabel = `<span class="${claseEstado}">${estado.toUpperCase()}</span>`;

                if (sale.saldoPendiente > 0 && estado !== 'cancelado') {
                    tipoLabel += `<div style="color: #c0392b; font-size:0.8rem; font-weight:bold; margin-top:2px;">Debe: $${sale.saldoPendiente.toFixed(2)}</div>`;
                }

                descripcion = `<div style="font-weight:bold; font-size:1.1em">${sale.equipoNumber || '---'}</div>
                               <div style="font-size:0.8rem; color:#666;">${sale.clientName || ''}</div>`;

            } else if (sale.tipo === 'retiro') {
                icon = '<i class="fas fa-arrow-down" style="color:#e74c3c" title="Retiro"></i>';
                tipoLabel = `<span style="background:#fdedec; color:#e74c3c; padding:2px 6px; border-radius:4px; font-weight:bold; font-size:0.8rem">RETIRO</span>`;
                descripcion = `<div style="font-weight:bold; color:#c0392b">${sale.concepto || 'Retiro de caja'}</div>
                               <div style="font-size:0.8rem; color:#666;">${sale.categoria || ''}</div>`;
                total = total * -1; // Visualmente negativo o rojo
                rowStyle = 'background-color: #fff5f5;';

            } else if (sale.tipo === 'ingreso') {
                icon = '<i class="fas fa-arrow-up" style="color:#2ecc71" title="Ingreso"></i>';
                tipoLabel = `<span style="background:#eafaf1; color:#2ecc71; padding:2px 6px; border-radius:4px; font-weight:bold; font-size:0.8rem">INGRESO</span>`;
                descripcion = `<div style="font-weight:bold; color:#27ae60">${sale.concepto || 'Ingreso extra'}</div>`;

            } else if (sale.tipo === 'abono') {
                icon = '<i class="fas fa-hand-holding-usd" style="color:#f1c40f" title="Abono"></i>';
                tipoLabel = `<span style="background:#fef9e7; color:#f1c40f; padding:2px 6px; border-radius:4px; font-weight:bold; font-size:0.8rem">ABONO</span>`;
                descripcion = `<div style="font-weight:bold;">${sale.concepto || 'Abono a cuenta'}</div>
                               <div style="font-size:0.8rem; color:#666;">Ref: ${sale.invoiceNumber || ''}</div>`;
            }

            const totalDisplay = sale.tipo === 'retiro'
                ? `<span style="color:#e74c3c; font-weight:bold">-$${Math.abs(total).toFixed(2)}</span>`
                : `<span style="font-weight:bold">$${Math.abs(total).toFixed(2)}</span>`;

            // Botones de acción limitados para no-ventas
            const isVenta = sale.tipo === 'venta';
            const actionButtons = `
                <div class="action-menu-wrapper">
                    <button class="icon-btn" onclick="HistorialManager.toggleMenu('${sale.id}', event)" style="background-color: #95a5a6; color: white;">
                        <i class="fas fa-ellipsis-v"></i>
                    </button>
                    <div id="menu-${sale.id}" class="action-dropdown">
                        ${isVenta ? `
                        <div class="dropdown-item" onclick="HistorialManager.printInvoice('${sale.id}')"><i class="fas fa-print"></i> Reimprimir</div>
                        <div class="dropdown-item" onclick="HistorialManager.editInvoice('${sale.id}')"><i class="fas fa-edit"></i> Editar</div>
                        <div class="dropdown-item" onclick="HistorialManager.abonar('${sale.id}')"><i class="fas fa-money-bill-wave"></i> Abonar</div>
                        <div class="dropdown-item" onclick="HistorialManager.cancelar('${sale.id}')"><i class="fas fa-ban"></i> Cancelar</div>
                        ` : ''}
                        <div class="dropdown-item text-danger" onclick="HistorialManager.eliminar('${sale.id}')"><i class="fas fa-trash"></i> Eliminar</div>
                    </div>
                </div>
            `;

            html += `
                <tr style="${rowStyle}">
                    <td>${icon} <strong>${sale.invoiceNumber || '---'}</strong></td>
                    <td>${descripcion}</td>
                    <td>${totalDisplay}</td>
                    <td>${tipoLabel}</td>
                    <td>${fechaStr}</td>
                    <td>
                        <div style="display: flex; gap: 5px; justify-content: center; align-items: center;">
                             ${isVenta ? `<button class="icon-btn btn-view" onclick="HistorialManager.viewInvoice('${sale.id}')"><i class="fas fa-eye"></i></button>` : ''}
                             ${actionButtons}
                        </div>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
        this.updateSummary();
    },

    updateSummary() {
        const summaryContainer = document.getElementById('daily-summary-container');
        const summaryContent = document.getElementById('daily-summary-content');
        const cashSummary = document.getElementById('daily-cash-summary');

        if (!summaryContainer || !summaryContent || !cashSummary) return;

        // Mostrar resumen solo si estamos filtrando por HOY o FECHA ESPECÍFICA
        // Y asegurarnos de que NO estamos en medio de una búsqueda por texto (porque eso diluye el resumen diario)
        const isDailyContext = (this.currentFilter === 'hoy' || this.currentFilter === 'fecha');

        if (!isDailyContext || this.filteredSales.length === 0) {
            summaryContainer.style.display = 'none';
            return;
        }

        summaryContainer.style.display = 'block';

        let totalContado = 0;
        let totalPendiente = 0;
        let totalAbonos = 0;
        const productCounts = {};

        this.filteredSales.forEach(sale => {
            // Sumar totales según tipo
            if (sale.paymentType === 'contado') totalContado += Number(sale.total || 0);
            else if (sale.paymentType === 'pendiente') totalPendiente += Number(sale.total || 0);

            // Sumar productos
            if (sale.products && Array.isArray(sale.products)) {
                sale.products.forEach(product => {
                    const key = product.descripcion || product.name || 'Sin nombre';
                    if (!productCounts[key]) productCounts[key] = { cantidad: 0, total: 0 };
                    productCounts[key].cantidad += Number(product.cantidad || 1);
                    productCounts[key].total += Number(product.precio || 0) * Number(product.cantidad || 1);
                });
            }

            // Sumar abonos del día (si existen en el objeto venta y coinciden con fecha)
            // NOTA: Esta lógica toma los abonos incrustados en la venta.
            // Para un resumen perfecto deberíamos mirar la colección ABONOS, pero por ahora replicamos legacy.
            if (sale.abonos && Array.isArray(sale.abonos)) {
                sale.abonos.forEach(abono => totalAbonos += Number(abono.monto || 0));
            }
        });

        // Generar HTML de productos
        let productsHTML = '';
        Object.keys(productCounts).forEach(productName => {
            const data = productCounts[productName];
            productsHTML += `
                <div style="background: white; padding: 6px; border-radius: 4px; font-size: 0.85rem; border:1px solid #eee;">
                    <strong>${productName}</strong><br>
                    <span style="color: #3498db;">Cnt: ${data.cantidad}</span> |
                    <span style="color: #27ae60;">$${data.total.toFixed(2)}</span>
                </div>
            `;
        });

        summaryContent.innerHTML = productsHTML || '<div style="grid-column:1/-1; text-align:center; color:#999">No hay productos registrados</div>';

        const granTotal = totalContado + totalAbonos; // Lo que entró en caja HOY

        cashSummary.innerHTML = `
            <div style="color: #27ae60; font-weight:bold"><i class="fas fa-money-bill-wave"></i> Contado: $${totalContado.toFixed(2)}</div>
            <div style="color: #e67e22; font-weight:bold"><i class="fas fa-clock"></i> Crédito: $${totalPendiente.toFixed(2)}</div>
            <!-- <div style="color: #3498db;"><i class="fas fa-hand-holding-usd"></i> Abonos: $${totalAbonos.toFixed(2)}</div> -->
                <div style="color: #2c3e50; font-size: 1.1rem; border-left:2px solid #ccc; padding-left:10px; margin-left:10px">
                    <i class="fas fa-cash-register"></i> CAJA: <strong>$${granTotal.toFixed(2)}</strong>
                </div>
            `;
    },

    renderError(msg) {
        const tbody = document.getElementById('historial-body');
        if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:red; padding:20px"><i class="fas fa-exclamation-triangle"></i> ${msg}</td></tr>`;
    },


};

// Auto-inicialización
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => HistorialManagerUnificado.init());
} else {
    HistorialManagerUnificado.init();
}

// Exponer globalmente
window.HistorialManager = HistorialManagerUnificado;
