
document.addEventListener('DOMContentLoaded', function () {
    console.log("FIX_SEARCH: Iniciando script de reparación UI y Búsqueda...");

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

    restoreSearchListeners();
    applyCSSFixes();
});
