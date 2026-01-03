/**
 * HISTORIAL MANAGER
 * Gestión completa del historial de ventas con filtros y búsqueda
 */

const HistorialManager = {
    allSales: [], // Almacena todas las ventas cargadas
    filteredSales: [], // Ventas después de aplicar filtros
    currentFilter: 'hoy', // Filtro activo: 'todo', 'hoy', 'fecha'
    currentDate: null, // Fecha seleccionada para filtro
    currentEquipoFilter: '', // Filtro de equipo actual

    /**
     * Carga todas las ventas desde Firestore
     */
    async loadAll() {
        try {
            console.log('🔄 Cargando historial completo desde Firestore...');
            console.log('🔍 Consultando colección "ventas"...');

            // Usar AppState.db (es donde ventas_refactor.html guarda Firebase)
            const database = (window.AppState && window.AppState.db) || window.db || db;
            if (!database) {
                throw new Error('Firebase no está inicializado');
            }

            // Obtener TODAS las ventas SIN orderBy para evitar problemas de índices
            const snapshot = await database.collection('ventas').get();

            console.log(`📦 Documentos recibidos de Firestore: ${snapshot.size}`);

            this.allSales = [];
            snapshot.forEach(doc => {
                this.allSales.push({
                    id: doc.id,
                    ...doc.data()
                });
            });

            // Ordenar en memoria por timestamp (descendente)
            this.allSales.sort((a, b) => {
                const dateA = a.timestamp.toDate ? a.timestamp.toDate() : new Date(a.timestamp);
                const dateB = b.timestamp.toDate ? b.timestamp.toDate() : new Date(b.timestamp);
                return dateB - dateA; // Más reciente primero
            });

            console.log(`✅ Historial cargado exitosamente: ${this.allSales.length} ventas`);

            // Mostrar rango de fechas para debug
            if (this.allSales.length > 0) {
                const oldest = this.allSales[this.allSales.length - 1].timestamp.toDate ?
                    this.allSales[this.allSales.length - 1].timestamp.toDate() :
                    new Date(this.allSales[this.allSales.length - 1].timestamp);
                const newest = this.allSales[0].timestamp.toDate ?
                    this.allSales[0].timestamp.toDate() :
                    new Date(this.allSales[0].timestamp);

                console.log(`📅 Venta más antigua: ${oldest.toLocaleDateString('es-ES')}`);
                console.log(`📅 Venta más reciente: ${newest.toLocaleDateString('es-ES')}`);
            }

            // Aplicar filtro inicial (hoy)
            this.applyCurrentFilter();

        } catch (error) {
            console.error('❌ Error cargando historial:', error);
            console.error('Detalles del error:', error.message);
            if (typeof UIService !== 'undefined') {
                UIService.showStatus('Error al cargar historial: ' + error.message, 'error');
            }
        }
    },

    /**
     * Aplica el filtro actual a las ventas
     */
    applyCurrentFilter() {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        if (this.currentFilter === 'todo') {
            // Mostrar TODAS las ventas
            this.filteredSales = [...this.allSales];
        } else if (this.currentFilter === 'hoy') {
            // Mostrar solo ventas de hoy
            this.filteredSales = this.allSales.filter(sale => {
                const saleDate = sale.timestamp.toDate ? sale.timestamp.toDate() : new Date(sale.timestamp);
                return saleDate >= todayStart;
            });
        } else if (this.currentFilter === 'fecha' && this.currentDate) {
            // Mostrar ventas de la fecha específica
            const selectedDate = new Date(this.currentDate);
            const selectedStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
            const selectedEnd = new Date(selectedStart);
            selectedEnd.setDate(selectedEnd.getDate() + 1);

            this.filteredSales = this.allSales.filter(sale => {
                const saleDate = sale.timestamp.toDate ? sale.timestamp.toDate() : new Date(sale.timestamp);
                return saleDate >= selectedStart && saleDate < selectedEnd;
            });
        }

        // Aplicar filtro de equipo si existe
        if (this.currentEquipoFilter && this.currentEquipoFilter.trim() !== '') {
            const filterText = this.currentEquipoFilter.trim().toLowerCase();
            this.filteredSales = this.filteredSales.filter(sale =>
                (sale.equipoNumber && sale.equipoNumber.toString().toLowerCase().includes(filterText)) ||
                (sale.clientName && sale.clientName.toLowerCase().includes(filterText))
            );
        }

        this.render();
        this.updateSummary();
    },

    /**
     * Cambia el filtro activo
     */
    setFilter(filterType) {
        this.currentFilter = filterType;
        this.currentDate = null;

        // Actualizar botones de filtro
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.getAttribute('data-filter') === filterType) {
                btn.classList.add('active');
            }
        });

        this.applyCurrentFilter();
    },

    /**
     * Filtra por fecha específica
     */
    filterByDate(dateString) {
        if (!dateString) {
            alert('Por favor selecciona una fecha');
            return;
        }

        this.currentFilter = 'fecha';
        this.currentDate = dateString;

        // Desactivar botones de filtro
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        this.applyCurrentFilter();
    },

    /**
     * Filtra por número de equipo
     */
    filterByEquipo(equipoText) {
        this.currentEquipoFilter = equipoText;
        this.applyCurrentFilter();
    },

    /**
     * Renderiza la tabla del historial
     */
    render() {
        const tbody = document.getElementById('historial-body');
        if (!tbody) return;

        if (this.filteredSales.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty-cart">No hay ventas para mostrar</td></tr>';
            return;
        }

        let html = '';
        this.filteredSales.forEach(sale => {
            const fecha = sale.timestamp.toDate ?
                sale.timestamp.toDate().toLocaleDateString('es-ES', {
                    day: '2-digit',
                    month: '2-digit',
                    year: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                }) :
                new Date(sale.timestamp).toLocaleDateString('es-ES');

            const estado = sale.paymentType === 'pendiente' ? 'Pendiente' : 'Pagado';
            const estadoClass = sale.paymentType === 'pendiente' ? 'status-pendiente' : 'status-pagado';
            const saldo = sale.saldoPendiente !== undefined ? sale.saldoPendiente : (sale.paymentType === 'pendiente' ? sale.total : 0);

            html += `
                <tr>
                    <td>${sale.invoiceNumber || 'N/A'}</td>
                    <td>${sale.equipoNumber || 'N/A'}</td>
                    <td>$${(sale.total || 0).toFixed(2)}</td>
                    <td>
                        <span class="${estadoClass}">${estado}</span>
                        ${saldo > 0 ? `<br><small style="color: #e74c3c;">Saldo: $${saldo.toFixed(2)}</small>` : ''}
                    </td>
                    <td>${fecha}</td>
                    <td>
                        <button class="btn btn-sm btn-info" onclick="reprintInvoice('${sale.id}')" title="Reimprimir">
                            <i class="fas fa-print"></i>
                        </button>
                        ${sale.paymentType === 'pendiente' && saldo > 0 ? `
                            <button class="btn btn-sm btn-success" onclick="registrarAbono('${sale.id}')" title="Registrar abono">
                                <i class="fas fa-dollar-sign"></i>
                            </button>
                        ` : ''}
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
    },

    /**
     * Actualiza el resumen diario
     */
    updateSummary() {
        const summaryContainer = document.getElementById('daily-summary-container');
        const summaryContent = document.getElementById('daily-summary-content');
        const cashSummary = document.getElementById('daily-cash-summary');

        if (!summaryContainer || !summaryContent || !cashSummary) return;

        // Solo mostrar resumen si está viendo "hoy"
        if (this.currentFilter !== 'hoy' || this.filteredSales.length === 0) {
            summaryContainer.style.display = 'none';
            return;
        }

        summaryContainer.style.display = 'block';

        // Calcular totales
        let totalContado = 0;
        let totalPendiente = 0;
        let totalAbonos = 0;
        const productCounts = {};

        this.filteredSales.forEach(sale => {
            if (sale.paymentType === 'contado') {
                totalContado += sale.total || 0;
            } else if (sale.paymentType === 'pendiente') {
                totalPendiente += sale.total || 0;
            }

            // Contar productos
            if (sale.products && Array.isArray(sale.products)) {
                sale.products.forEach(product => {
                    const key = product.descripcion || product.name || 'Sin nombre';
                    if (!productCounts[key]) {
                        productCounts[key] = { cantidad: 0, total: 0 };
                    }
                    productCounts[key].cantidad += product.cantidad || 1;
                    productCounts[key].total += (product.precio || 0) * (product.cantidad || 1);
                });
            }

            // Contar abonos
            if (sale.abonos && Array.isArray(sale.abonos)) {
                sale.abonos.forEach(abono => {
                    totalAbonos += abono.monto || 0;
                });
            }
        });

        // Renderizar resumen de productos
        let productsHTML = '';
        Object.keys(productCounts).forEach(productName => {
            const data = productCounts[productName];
            productsHTML += `
                <div style="background: white; padding: 6px; border-radius: 4px; font-size: 0.85rem;">
                    <strong>${productName}</strong><br>
                    <span style="color: #3498db;">Cant: ${data.cantidad}</span> | 
                    <span style="color: #27ae60;">$${data.total.toFixed(2)}</span>
                </div>
            `;
        });

        summaryContent.innerHTML = productsHTML || '<div>No hay productos</div>';

        // Renderizar resumen de efectivo
        cashSummary.innerHTML = `
            <div style="color: #27ae60;">
                <i class="fas fa-money-bill-wave"></i> Contado: $${totalContado.toFixed(2)}
            </div>
            <div style="color: #e67e22;">
                <i class="fas fa-clock"></i> Pendiente: $${totalPendiente.toFixed(2)}
            </div>
            <div style="color: #3498db;">
                <i class="fas fa-hand-holding-usd"></i> Abonos: $${totalAbonos.toFixed(2)}
            </div>
            <div style="color: #34495e; font-size: 1.1rem;">
                <i class="fas fa-calculator"></i> Total: $${(totalContado + totalAbonos).toFixed(2)}
            </div>
        `;
    },

    /**
     * Imprime el historial actual
     */
    async printCurrent() {
        if (this.filteredSales.length === 0) {
            alert('No hay ventas para imprimir');
            return;
        }

        let titulo = 'HISTORIAL DE VENTAS';
        if (this.currentFilter === 'hoy') {
            titulo = 'HISTORIAL DEL DÍA';
        } else if (this.currentFilter === 'fecha' && this.currentDate) {
            titulo = `HISTORIAL - ${this.currentDate}`;
        }

        if (typeof printHistorialReport === 'function') {
            printHistorialReport(this.filteredSales, titulo);
        } else {
            console.error('Función printHistorialReport no encontrada');
            alert('Error: Función de impresión no disponible');
        }
    }
};

// Inicialización automática
document.addEventListener('DOMContentLoaded', function () {
    console.log('📱 historialManager.js cargado');

    // Función para esperar a que Firebase esté listo
    function waitForFirebase(callback, maxAttempts = 20) {
        let attempts = 0;
        const interval = setInterval(() => {
            attempts++;
            const dbAvailable = (window.AppState && window.AppState.db) ||
                typeof window.db !== 'undefined' ||
                typeof db !== 'undefined';

            console.log(`🔍 Intento ${attempts}/${maxAttempts} - Firebase:`, dbAvailable ? '✅ Listo' : '❌ No disponible');

            if (dbAvailable) {
                clearInterval(interval);
                console.log('⏰ Iniciando carga del historial...');
                callback();
            } else if (attempts >= maxAttempts) {
                clearInterval(interval);
                console.error('❌ Firebase no se inicializó después de', maxAttempts, 'intentos');
                console.error('💡 Verifica que AppState.db esté disponible');
            }
        }, 500); // Intentar cada 500ms
    }

    // Esperar a Firebase y luego cargar
    waitForFirebase(() => {
        HistorialManager.loadAll();
    });

    // Event listeners para filtros
    const filterButtons = document.querySelectorAll('.filter-btn');
    filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const filterType = btn.getAttribute('data-filter');
            HistorialManager.setFilter(filterType);
        });
    });

    // Event listener para filtro de equipo
    const equipoFilter = document.getElementById('filter-historial');
    if (equipoFilter) {
        equipoFilter.addEventListener('input', (e) => {
            HistorialManager.filterByEquipo(e.target.value);
        });
    }

    // Event listener para botón de imprimir
    const printBtn = document.getElementById('print-historial-btn');
    if (printBtn) {
        printBtn.addEventListener('click', () => {
            HistorialManager.printCurrent();
        });
    }
});

// Funciones globales para compatibilidad con UIService
function filterHistoryByDate() {
    const dateInput = document.getElementById('history-date-filter');
    if (dateInput && dateInput.value) {
        HistorialManager.filterByDate(dateInput.value);
    }
}

// Alias para SalesService.loadHistorial (compatibilidad)
if (typeof window.SalesService === 'undefined') {
    window.SalesService = {};
}
if (!window.SalesService.loadHistorial) {
    window.SalesService.loadHistorial = function () {
        return HistorialManager.loadAll();
    };
}
