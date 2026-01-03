
document.addEventListener('DOMContentLoaded', function () {
    console.log("FIX_SEARCH: Iniciando script de reparación UI, Búsqueda y Límites...");

    // 1. Restaurar Listeners de Búsqueda
    function restoreSearchListeners() {
        const inputFilter = document.getElementById('filter-historial');
        if (inputFilter) {
            const newFilter = inputFilter.cloneNode(true);
            inputFilter.parentNode.replaceChild(newFilter, inputFilter);

            newFilter.addEventListener('input', (e) => {
                const filter = e.target.value.trim();
                const filterLower = filter.toLowerCase();

                if (!filter) { // Restaurar todo
                    if (window.UIService && typeof UIService.applyCurrentFilter === 'function') {
                        UIService.applyCurrentFilter();
                    }
                    return;
                }

                if (!window.AppState || !AppState.historial) return;

                const filtered = AppState.historial.filter(m => {
                    const equipo = String(m.equipoNumber || m.equipo || '').trim();
                    const factura = String(m.numeroFactura || m.id || '').toLowerCase();
                    const grupo = String(m.cliente || m.grupo || '').toLowerCase();

                    return equipo.includes(filter) ||
                        factura.includes(filterLower) ||
                        grupo.includes(filterLower);
                });

                const tb = document.getElementById('historial-body');
                if (tb) {
                    if (filtered.length === 0) {
                        tb.innerHTML = `<tr><td colspan="6" class="empty-cart">No hay resultados para "${filter}"</td></tr>`;
                    } else {
                        AppState.filteredHistorial = filtered;
                        if (window.UIService && typeof UIService.renderHistorial === 'function') {
                            UIService.renderHistorial();
                        }
                    }
                }
            });
            console.log("FIX_SEARCH: Búsqueda flexible activada.");
        }

        document.querySelectorAll('.filter-btn').forEach(btn => {
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            newBtn.addEventListener('click', (e) => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                const target = e.target.closest('.filter-btn');
                if (target) target.classList.add('active');
                if (window.AppState) AppState.currentFilter = target.dataset.filter;
                if (window.UIService) UIService.applyCurrentFilter();
            });
        });
    }

    // 2. CSS Fix
    function applyCSSFixes() {
        const dashboardSection = document.querySelector('.dashboard-section');
        if (dashboardSection && !dashboardSection.classList.contains('panel-tabs')) {
            dashboardSection.classList.add('panel-tabs');
        }
    }

    // 3. Extend Data Limits (2000 -> 5000)
    // Se ejecuta inmediatamente para interceptar llamadas tempranas
    function extendDataLimits() {
        if (window.DataService) {
            // Override loadSales
            const originalLoadSales = DataService.loadSales;
            DataService.loadSales = async function (limit = 5000) { // Default cambiado a 5000
                console.log(`FIX_SEARCH: loadSales llamado con limit=${limit}`);
                return originalLoadSales.call(this, limit);
            };

            // Override loadRetiros
            const originalLoadRetiros = DataService.loadRetiros;
            DataService.loadRetiros = async function (limit = 5000) {
                console.log(`FIX_SEARCH: loadRetiros llamado con limit=${limit}`);
                return originalLoadRetiros.call(this, limit);
            };

            // Override loadIngresos
            const originalLoadIngresos = DataService.loadIngresos;
            DataService.loadIngresos = async function (limit = 5000) {
                console.log(`FIX_SEARCH: loadIngresos llamado con limit=${limit}`);
                return originalLoadIngresos.call(this, limit);
            };

            console.log("FIX_SEARCH: Límites de datos extendidos a 5000.");
        } else {
            // Si DataService aun no existe, reintentar en breve
            setTimeout(extendDataLimits, 100);
        }
    }

    restoreSearchListeners();
    applyCSSFixes();
    extendDataLimits();
});
