/**
 * RegistrosApp.js
 * Controla la lógica de la pantalla de Registro de Salidas (Manual y por Excel)
 */

const RegistrosApp = {
    db: null,
    registrosRef: null,
    unsubscribe: null,
    allRegistros: [],

    async init() {
        this.showLoading(true);
        try {
            // Inicializar Firebase
            if (!window.firebase.apps.length) {
                window.firebase.initializeApp(CONFIG.firebase);
            }
            this.db = window.firebase.firestore();
            this.registrosRef = this.db.collection('REGISTROS_SALIDA');
            this.preciosRef = this.db.collection('PRECIOS_REGISTROS');
            this.MAX_FACTURA_ITEMS = 14;
            this.facturaTipo = null;

            this.allRegistros = []; // Todos los registros
            this.facturaItems = []; // Items en la factura (drag & drop)
            
            this.setupUI();
            this.setupEventListeners();
            this.listenToRegistros();

        } catch (error) {
            console.error("Error al iniciar RegistrosApp:", error);
            alert("Error de conexión. Revisa tu internet.");
        } finally {
            this.showLoading(false);
        }
    },

    setupUI() {
        // Poner la fecha de hoy por defecto
        const today = new Date();
        const dateString = today.toISOString().split('T')[0];
        document.getElementById('global-fecha').value = dateString;
        
        // Enfocar en producto al inicio para usar el lector rápido
        document.getElementById('fast-producto').focus();
    },

    setupEventListeners() {
        // Formulario de ingreso rápido
        document.getElementById('fast-entry-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addFastEntryRow();
        });
        // Archivo Excel
        document.getElementById('excel-file').addEventListener('change', (e) => {
            this.handleExcelUpload(e);
        });

        // Filtros
        const searchInput = document.getElementById('search-registro');
        if (searchInput) {
            searchInput.addEventListener('input', () => this.renderTable());
        }
    },

    updateFastEntryTableState() {
        const tbody = document.getElementById('fast-entry-tbody');
        const rows = Array.from(tbody.querySelectorAll('tr')).filter(tr => tr.id !== 'empty-state-row');
        
        let totalItems = 0;
        let resumenMap = {};

        rows.forEach(tr => {
            const qtyCell = tr.querySelector('td:first-child');
            const prodCell = tr.querySelectorAll('td')[1];
            
            if (qtyCell && prodCell) {
                const qty = parseInt(qtyCell.getAttribute('data-val')) || 1;
                const prod = prodCell.getAttribute('data-val');
                totalItems += qty;

                if (resumenMap[prod]) {
                    resumenMap[prod] += qty;
                } else {
                    resumenMap[prod] = qty;
                }
            }
        });
        
        document.getElementById('total-items').innerText = totalItems;
        
        // Handle empty state for main list
        const emptyStateRow = document.getElementById('empty-state-row');
        if (rows.length === 0) {
            if (emptyStateRow) emptyStateRow.style.display = 'table-row';
        } else {
            if (emptyStateRow) emptyStateRow.style.display = 'none';
        }

        // Render Resumen
        const resumenTbody = document.getElementById('resumen-tbody');
        if (Object.keys(resumenMap).length === 0) {
            resumenTbody.innerHTML = `
                <tr id="resumen-empty-state">
                    <td colspan="2">
                        <div class="empty-state">
                            <i class="fas fa-chart-bar"></i>
                            <p>El resumen aparecerá aquí.</p>
                        </div>
                    </td>
                </tr>
            `;
        } else {
            resumenTbody.innerHTML = '';
            for (const prod in resumenMap) {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${prod}</td>
                    <td><strong>${resumenMap[prod]}</strong></td>
                `;
                resumenTbody.appendChild(tr);
            }
        }
    },

    addFastEntryRow() {
        const productoInput = document.getElementById('fast-producto');
        const cantidadInput = document.getElementById('fast-cantidad');
        const cuentaInput = document.getElementById('fast-cuenta');
        const observacionInput = document.getElementById('fast-observacion');

        const producto = productoInput.value.trim();
        const cantidad = cantidadInput.value;
        const cuenta = cuentaInput.value.trim();
        const observacion = observacionInput.value.trim();

        if (!producto) return;

        const tbody = document.getElementById('fast-entry-tbody');
        const tr = document.createElement('tr');
        tr.className = 'flash-success';
        tr.innerHTML = `
            <td data-val="${cantidad}"><strong>${cantidad}</strong></td>
            <td data-val="${producto}">${producto}</td>
            <td data-val="${cuenta}">${cuenta || '-'}</td>
            <td data-val="${observacion}"><span style="font-size:13px; color:#666;">${observacion || '-'}</span></td>
            <td style="text-align: center;">
                <button type="button" class="btn btn-danger" style="padding: 5px; width: 30px; height: 30px; border-radius: 50%;" onclick="this.closest('tr').remove(); RegistrosApp.updateFastEntryTableState();" title="Eliminar fila">
                    <i class="fas fa-times"></i>
                </button>
            </td>
        `;
        
        // Insertar al inicio para que el último escaneado quede arriba
        if (tbody.firstChild) {
            tbody.insertBefore(tr, tbody.firstChild);
        } else {
            tbody.appendChild(tr);
        }

        this.updateFastEntryTableState();

        // Resetear inputs para el siguiente producto
        productoInput.value = '';
        cantidadInput.value = '1';
        observacionInput.value = '';
        
        // Volver a enfocar el producto para escaneo continuo
        productoInput.focus();
    },

    async saveFastEntries() {
        const fecha = document.getElementById('global-fecha').value;
        if (!fecha) {
            alert('Por favor selecciona una fecha global.');
            return;
        }

        const tbody = document.getElementById('fast-entry-tbody');
        const rows = Array.from(tbody.querySelectorAll('tr')).filter(tr => tr.id !== 'empty-state-row');
        
        if (rows.length === 0) {
            alert('No has agregado ningún producto a la tabla.');
            return;
        }

        this.showLoading(true);
        try {
            const batch = this.db.batch();
            let count = 0;

            rows.forEach(tr => {
                const tds = tr.querySelectorAll('td');
                const cantidad = parseInt(tds[0].getAttribute('data-val')) || 1;
                const producto = tds[1].getAttribute('data-val');
                const cuenta = tds[2].getAttribute('data-val');
                const observacion = tds[3].getAttribute('data-val');

                const docRef = this.registrosRef.doc();
                batch.set(docRef, {
                    fecha: fecha,
                    producto: producto,
                    cantidad: cantidad,
                    cuenta: cuenta,
                    observacion: observacion,
                    estado: 'pendiente',
                    origen: 'manual',
                    timestamp: window.firebase.firestore.FieldValue.serverTimestamp()
                });
                count++;
            });

            await batch.commit();

            // Limpiar tabla pero mantener el empty state
            const emptyStateHTML = document.getElementById('empty-state-row') ? document.getElementById('empty-state-row').outerHTML : '';
            tbody.innerHTML = emptyStateHTML || `
                <tr id="empty-state-row">
                    <td colspan="5">
                        <div class="empty-state">
                            <i class="fas fa-box-open"></i>
                            <p>No hay productos en la lista.</p>
                            <p style="font-size: 13px;">Agrega productos desde el formulario para comenzar.</p>
                        </div>
                    </td>
                </tr>
            `;
            
            this.updateFastEntryTableState();
            
            // Opcional: limpiar cuenta global para la siguiente tanda
            document.getElementById('fast-cuenta').value = '';
            document.getElementById('fast-producto').focus();

        } catch (error) {
            console.error("Error guardando entradas:", error);
            alert("Error al guardar. Revisa tu conexión.");
        } finally {
            this.showLoading(false);
        }
    },

    handleExcelUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        this.showLoading(true);
        const reader = new FileReader();

        reader.onload = async (event) => {
            try {
                const data = new Uint8Array(event.target.result);
                // Usar cellDates: true para que la librería maneje las fechas de Excel automáticamente
                const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                
                // Convertir a JSON crudo garantizando que las columnas A, B, C y D siempre existan incluso si están vacías
                const rawData = XLSX.utils.sheet_to_json(worksheet, { header: "A", defval: null });
                
                await this.processExcelData(rawData);
                
                // Limpiar input
                e.target.value = '';
            } catch (error) {
                console.error("Error leyendo Excel:", error);
                alert("Error al leer el archivo Excel. Asegúrate de que el formato sea correcto.");
            } finally {
                this.showLoading(false);
            }
        };

        reader.readAsArrayBuffer(file);
    },

    async processExcelData(rows) {
        let currentExcelDate = null;
        let batch = this.db.batch();
        let operationsCount = 0;
        let totalProcessed = 0;

        // Saltar la primera fila si es el encabezado
        let startIndex = 0;
        if (rows.length > 0 && typeof rows[0].A === 'string' && rows[0].A.toLowerCase().includes('fecha')) {
            startIndex = 1;
        }

        for (let i = startIndex; i < rows.length; i++) {
            const row = rows[i];
            
            // Columna C: Descripción (Producto) - Si no hay producto, saltar la fila
            const producto = row.C ? String(row.C).trim() : '';
            if (!producto) continue;

            // Columna A: Fecha
            let fechaRaw = row.A;
            let newDateDetected = false;
            let tempDateStr = null;

            if (fechaRaw !== undefined && fechaRaw !== null) {
                if (fechaRaw instanceof Date) {
                    if (!isNaN(fechaRaw.getTime())) {
                        tempDateStr = fechaRaw.toISOString().split('T')[0];
                        newDateDetected = true;
                    }
                } else if (typeof fechaRaw === 'string') {
                    const cleanStr = fechaRaw.trim();
                    if (cleanStr.includes('/') || cleanStr.includes('-')) {
                        const parts = cleanStr.includes('/') ? cleanStr.split('/') : cleanStr.split('-');
                        if (parts.length === 3) {
                            if (parts[0].length === 4) {
                                tempDateStr = `${parts[0]}-${parts[1].padStart(2,'0')}-${parts[2].padStart(2,'0')}`;
                            } else {
                                tempDateStr = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
                            }
                            newDateDetected = true;
                        }
                    }
                } else if (typeof fechaRaw === 'number') {
                    // Ignorar números pequeños como 15 o 8
                    if (fechaRaw > 30000) {
                        const excelEpoch = new Date(Date.UTC(1899, 11, 30));
                        const jsDate = new Date(excelEpoch.getTime() + fechaRaw * 86400000);
                        tempDateStr = jsDate.toISOString().split('T')[0];
                        newDateDetected = true;
                    }
                }
            }

            if (newDateDetected && tempDateStr && !tempDateStr.startsWith("1900")) {
                currentExcelDate = tempDateStr;
            }

            if (!currentExcelDate) {
                currentExcelDate = new Date().toISOString().split('T')[0];
            }

            // Columna B: Cantidad
            const cantidad = parseInt(row.B) || 1;

            // Columna D: Cuenta
            const cuenta = row.D ? String(row.D).trim() : '';

            // Fecha final a usar
            const fechaAUsar = currentExcelDate;

            // Crear documento en Firestore
            const docRef = this.registrosRef.doc();
            batch.set(docRef, {
                fecha: fechaAUsar,
                producto: producto,
                cantidad: cantidad,
                cuenta: cuenta,
                estado: 'pendiente',
                origen: 'excel',
                timestamp: window.firebase.firestore.FieldValue.serverTimestamp()
            });

            operationsCount++;
            totalProcessed++;

            // Firestore limits batches to 500 operations
            if (operationsCount >= 450) {
                await batch.commit();
                batch = this.db.batch();
                operationsCount = 0;
            }
        }

        if (operationsCount > 0) {
            await batch.commit();
        }

        alert(`¡Carga exitosa! Se procesaron ${totalProcessed} registros.`);
    },

    currentSelectedDate: null,
    facturaItems: [],

    listenToRegistros() {
        if (this.unsubscribe) this.unsubscribe();

        // Obtener los últimos 2000 registros para asegurar que todo el Excel se muestre
        this.unsubscribe = this.registrosRef
            .orderBy('timestamp', 'desc')
            .limit(2000)
            .onSnapshot(snapshot => {
                this.allRegistros = [];
                snapshot.forEach(doc => {
                    this.allRegistros.push({ id: doc.id, ...doc.data() });
                });
                this.renderDatesList();
                this.renderFacturacionData();
            }, error => {
                console.error("Error al escuchar registros:", error);
            });
    },

    renderFacturacionData() {
        const listadoTbody = document.getElementById('fact-listado-tbody');
        const resumenTbody = document.getElementById('fact-resumen-tbody');
        if (!listadoTbody || !resumenTbody) return;

        const pendientes = this.allRegistros.filter(r => r.estado === 'pendiente');
        pendientes.sort((a, b) => a.fecha.localeCompare(b.fecha));

        // Unificar todo el descuento por producto (sincronización entre tarjetas)
        const facturadoPorProducto = {};
        this.facturaItems.forEach(item => {
            facturadoPorProducto[item.producto] = (facturadoPorProducto[item.producto] || 0) + item.cantidadFacturar;
        });

        // Calcular los totales originales por producto
        let resumenMap = {};
        pendientes.forEach(reg => {
            resumenMap[reg.producto] = (resumenMap[reg.producto] || 0) + reg.cantidad;
        });

        // Copia para ir descontando de la Tarjeta 1 (FIFO)
        const aDescontarTarjeta1 = { ...facturadoPorProducto };

        listadoTbody.innerHTML = '';
        let hasVisible = false;

        // 1. Llenar Tarjeta 1 (Listado Completo)
        pendientes.forEach(reg => {
            let cantidadDisponible = reg.cantidad;
            
            // Descontar usando FIFO (lo más antiguo primero)
            if (aDescontarTarjeta1[reg.producto] > 0) {
                if (aDescontarTarjeta1[reg.producto] >= cantidadDisponible) {
                    aDescontarTarjeta1[reg.producto] -= cantidadDisponible;
                    cantidadDisponible = 0;
                } else {
                    cantidadDisponible -= aDescontarTarjeta1[reg.producto];
                    aDescontarTarjeta1[reg.producto] = 0;
                }
            }

            // Si ya está completamente asignado, no mostrar en Tarjeta 1
            if (cantidadDisponible <= 0) return;

            hasVisible = true;
            const tr = document.createElement('tr');
            tr.setAttribute('draggable', 'true');
            tr.style.cursor = 'grab';
            
            tr.ondragstart = (e) => {
                // Se envía el producto y el máximo original para la factura
                const data = { type: 'summary', producto: reg.producto, max: resumenMap[reg.producto] };
                e.dataTransfer.setData('text/plain', JSON.stringify(data));
                e.dataTransfer.effectAllowed = 'copy';
            };
            
            tr.innerHTML = `
                <td>${this.formatDate(reg.fecha)}</td>
                <td><strong>${cantidadDisponible}</strong></td>
                <td>${reg.producto}</td>
            `;
            listadoTbody.appendChild(tr);
        });

        if (!hasVisible) {
            listadoTbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:20px; color:#999;">Todos los registros fueron asignados a la factura.</td></tr>';
        }

        // 2. Llenar Tarjeta 2 (Resumen Agrupado)
        resumenTbody.innerHTML = '';
        let hasResumen = false;
        
        // Obtener los productos y ordenarlos alfabéticamente
        const sortedProducts = Object.keys(resumenMap).sort((a, b) => a.localeCompare(b));
        
        for (const prod of sortedProducts) {
            const totalOriginal = resumenMap[prod];
            const yaFacturado = facturadoPorProducto[prod] || 0;
            const restante = totalOriginal - yaFacturado;

            if (restante <= 0) continue;

            hasResumen = true;
            const tr = document.createElement('tr');
            tr.setAttribute('draggable', 'true');
            tr.style.cursor = 'grab';
            
            tr.ondragstart = (e) => {
                const data = { type: 'summary', producto: prod, max: totalOriginal };
                e.dataTransfer.setData('text/plain', JSON.stringify(data));
                e.dataTransfer.effectAllowed = 'copy';
            };
            
            tr.innerHTML = `
                <td>${prod}</td>
                <td><strong>${restante}</strong></td>
            `;
            resumenTbody.appendChild(tr);
        }

        if (!hasResumen) {
            resumenTbody.innerHTML = '<tr><td colspan="2" style="text-align:center; padding:20px; color:#999;">Todo fue asignado a la factura.</td></tr>';
        }
    },

    allowDrop(e) {
        if (this.facturaItems.length >= this.MAX_FACTURA_ITEMS) {
            e.dataTransfer.dropEffect = 'none';
            return;
        }
        e.preventDefault();
        document.getElementById('factura-dropzone').style.backgroundColor = '#ecf0f1';
    },

    dragLeave(e) {
        e.currentTarget.style.backgroundColor = '#fafbfc';
        e.currentTarget.style.borderColor = '#bdc3c7';
    },

    dropToFactura(e) {
        e.preventDefault();
        document.getElementById('factura-dropzone').style.backgroundColor = '#fafbfc';
        
        const dataStr = e.dataTransfer.getData('text/plain');
        if (!dataStr) return;
        
        try {
            const data = JSON.parse(dataStr);
            
            // Check if already in factura
            let existingItem = null;
            if (data.type === 'single') {
                existingItem = this.facturaItems.find(item => item.type === 'single' && item.originalId === data.id);
            } else {
                existingItem = this.facturaItems.find(item => item.type === 'summary' && item.producto === data.producto);
            }

            if (!existingItem && this.facturaItems.length >= this.MAX_FACTURA_ITEMS) {
                alert("La factura ha alcanzado el límite de 14 productos.");
                this.renderFactura(); // Restablecer colores
                return;
            }

            if (existingItem) {
                if (existingItem.cantidadFacturar < data.max) {
                    existingItem.cantidadFacturar += 1;
                } else {
                    alert('No puedes agregar más. Límite pendiente alcanzado.');
                }
            } else {
                this.facturaItems.push({
                    id: Date.now().toString(),
                    type: data.type,
                    originalId: data.id || null,
                    producto: data.producto,
                    cantidadFacturar: 1, // Por defecto se agrega 1 al arrastrar
                    max: data.max
                });
            }
            
            this.renderFactura();
            this.renderFacturacionData();
        } catch (err) {
            console.error("Error al soltar:", err);
        }
    },

    renderFactura() {
        const tbody = document.getElementById('factura-tbody');
        const dropzone = document.getElementById('factura-dropzone');
        if (!tbody) return;

        if (this.facturaItems.length >= this.MAX_FACTURA_ITEMS) {
            dropzone.classList.add('factura-full');
        } else {
            dropzone.classList.remove('factura-full');
            dropzone.style.backgroundColor = '#fafbfc'; // Restaurar default
        }

        tbody.innerHTML = '';

        if (this.facturaItems.length === 0) {
            tbody.innerHTML = `
                <tr id="factura-empty-state">
                    <td colspan="3" style="text-align: center; padding: 40px 20px; color: #aaa;">
                        <i class="fas fa-hand-holding-box" style="font-size: 30px; margin-bottom: 10px;"></i>
                        <br>Arrastra los productos aquí para agregarlos a la factura
                    </td>
                </tr>
            `;
            return;
        }

        this.facturaItems.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <input type="number" class="form-control" value="${item.cantidadFacturar}" min="1" max="${item.max}" style="width:60px; padding:2px 5px;" onchange="RegistrosApp.updateFacturaItemQty('${item.id}', this.value, ${item.max})">
                </td>
                <td>
                    ${item.producto}
                    <div style="font-size:11px; color:#888;">Disponible: ${item.max}</div>
                </td>
                <td style="text-align: center;">
                    <button class="btn btn-danger" style="padding: 2px 6px; font-size:12px;" onclick="RegistrosApp.removeFacturaItem('${item.id}')">
                        <i class="fas fa-times"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },

    updateFacturaItemQty(id, newQty, max) {
        const item = this.facturaItems.find(i => i.id === id);
        if (item) {
            let val = parseInt(newQty);
            if (isNaN(val) || val < 1) val = 1;
            if (val > max) {
                alert('La cantidad no puede superar el inventario pendiente (' + max + ')');
                val = max;
            }
            item.cantidadFacturar = val;
            this.renderFactura();
            this.renderFacturacionData();
        }
    },

    removeFacturaItem(id) {
        this.facturaItems = this.facturaItems.filter(i => i.id !== id);
        this.renderFactura();
        this.renderFacturacionData();
    },

    renderDatesList() {
        // Build map of dates and counts
        const dateMap = {};
        this.allRegistros.forEach(reg => {
            if (!dateMap[reg.fecha]) dateMap[reg.fecha] = 0;
            dateMap[reg.fecha]++;
        });

        // Sort dates descending
        const sortedDates = Object.keys(dateMap).sort((a, b) => b.localeCompare(a));

        const listContainer = document.getElementById('dates-list');
        listContainer.innerHTML = '';

        if (sortedDates.length === 0) {
            listContainer.innerHTML = '<p style="color:#999; padding:20px; text-align:center;">No hay datos guardados aún.</p>';
            this.currentSelectedDate = null;
        } else {
            // Select first date if none selected or if selected doesn't exist anymore
            if (!this.currentSelectedDate || !dateMap[this.currentSelectedDate]) {
                this.currentSelectedDate = sortedDates[0];
            }

            sortedDates.forEach(dateStr => {
                const btn = document.createElement('button');
                btn.className = `date-btn ${this.currentSelectedDate === dateStr ? 'active' : ''}`;
                btn.innerHTML = `<span><i class="fas fa-calendar-day"></i> ${this.formatDate(dateStr)}</span> <span class="badge">${dateMap[dateStr]}</span>`;
                btn.onclick = () => {
                    this.currentSelectedDate = dateStr;
                    // Update active classes without full rerender of list
                    document.querySelectorAll('.date-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    this.renderTable();
                };
                listContainer.appendChild(btn);
            });
        }

        this.renderTable();
    },

    renderTable() {
        const tbody = document.getElementById('registros-tbody');
        if (!tbody) return; // Prevent error if called before DOM is fully ready or modified
        
        const searchInput = document.getElementById('search-registro');
        const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
        const titleEl = document.getElementById('selected-date-title');

        if (!this.currentSelectedDate) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#7f8c8d;">Selecciona un día</td></tr>';
            if(titleEl) titleEl.innerHTML = `<i class="fas fa-list"></i> Historial`;
            return;
        }

        if(titleEl) titleEl.innerHTML = `<i class="fas fa-list"></i> Historial del día: <span style="color:var(--accent-color)">${this.formatDate(this.currentSelectedDate)}</span>`;

        tbody.innerHTML = '';

        let filtered = this.allRegistros.filter(reg => {
            if (reg.fecha !== this.currentSelectedDate) return false;
            
            const matchSearch = reg.producto.toLowerCase().includes(searchTerm) || 
                               (reg.cuenta && reg.cuenta.toLowerCase().includes(searchTerm));
            return matchSearch;
        });

        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#7f8c8d;">No hay registros encontrados</td></tr>';
            return;
        }

        // Ordenar: primero los pendientes, luego por fecha descendente
        filtered.sort((a, b) => {
            if (a.estado === 'pendiente' && b.estado !== 'pendiente') return -1;
            if (a.estado !== 'pendiente' && b.estado === 'pendiente') return 1;
            return 0; // Ya están del mismo día, mantenemos orden de inserción/timestamp
        });

        filtered.forEach(reg => {
            const tr = document.createElement('tr');
            
            const statusClass = reg.estado === 'pendiente' ? 'status-pending' : 'status-invoiced';
            const statusText = reg.estado === 'pendiente' ? 'Pendiente' : 'Facturado';

            tr.innerHTML = `
                <td><strong>${reg.cantidad}</strong></td>
                <td>${reg.producto}</td>
                <td>${reg.cuenta || '<span style="color:#ccc;">-</span>'}</td>
                <td><span style="font-size:13px; color:#666;">${reg.observacion || ''}</span></td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td style="text-align: center;">
                    <button class="btn btn-danger" style="padding:5px 10px; font-size:12px;" onclick="RegistrosApp.deleteRegistro('${reg.id}')" title="Eliminar este registro">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },

    async deleteRegistro(id) {
        if (confirm('¿Estás seguro de eliminar este registro?')) {
            try {
                await this.registrosRef.doc(id).delete();
            } catch (error) {
                console.error("Error eliminando:", error);
                alert("No se pudo eliminar.");
            }
        }
    },

    async deleteAllRegistros() {
        if (confirm('⚠️ ¡PELIGRO! ¿Estás seguro de ELIMINAR TODOS los registros de salidas? Esta acción no se puede deshacer.')) {
            this.showLoading(true);
            try {
                const snapshot = await this.registrosRef.get();
                const batch = this.db.batch();
                snapshot.docs.forEach(doc => {
                    batch.delete(doc.ref);
                });
                await batch.commit();
                alert('Todos los registros han sido eliminados.');
            } catch (error) {
                console.error("Error eliminando todo:", error);
                alert("Hubo un problema al intentar eliminar todos los registros.");
            } finally {
                this.showLoading(false);
            }
        }
    },

    formatDate(dateStr) {
        if (!dateStr) return '';
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            return `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
        return dateStr;
    },

    // ==========================================
    // MODAL DE FACTURACIÓN Y PRECIOS
    // ==========================================
    async openProcessModal() {
        if (this.facturaItems.length === 0) {
            alert("Agrega al menos un producto a la factura antes de procesar.");
            return;
        }
        
        this.facturaTipo = null;
        document.getElementById('opt-factura-repuestos').style.borderColor = '#ddd';
        document.getElementById('opt-factura-repuestos').style.backgroundColor = 'transparent';
        document.getElementById('opt-factura-normal').style.borderColor = '#ddd';
        document.getElementById('opt-factura-normal').style.backgroundColor = 'transparent';
        document.getElementById('invoice-prices-section').style.display = 'none';
        
        document.getElementById('modal-procesar-factura').style.display = 'flex';
    },

    async selectInvoiceType(tipo) {
        this.facturaTipo = tipo;
        
        const optR = document.getElementById('opt-factura-repuestos');
        const optN = document.getElementById('opt-factura-normal');
        
        if (tipo === 'repuestos') {
            optR.style.borderColor = 'var(--accent-color)';
            optR.style.backgroundColor = '#fff3e0';
            optN.style.borderColor = '#ddd';
            optN.style.backgroundColor = 'transparent';
        } else {
            optN.style.borderColor = 'var(--primary-color)';
            optN.style.backgroundColor = '#e8f4f8';
            optR.style.borderColor = '#ddd';
            optR.style.backgroundColor = 'transparent';
        }

        document.getElementById('invoice-prices-section').style.display = 'block';
        await this.loadPreciosYRenderizar();
    },

    async loadPreciosYRenderizar() {
        const tbody = document.getElementById('invoice-prices-tbody');
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;"><div class="spinner" style="margin: 20px auto; border-top-color: var(--primary-color);"></div><p>Cargando precios...</p></td></tr>';

        for (let item of this.facturaItems) {
            // Limpiamos el nombre para usarlo como ID en Firebase (evitar barras)
            const safeId = item.producto.replace(/\//g, '-').trim();
            item.precioUnitario = 0;
            item.vinculoId = null;

            try {
                const doc = await this.preciosRef.doc(safeId).get();
                if (doc.exists) {
                    const data = doc.data();
                    item.precioUnitario = this.facturaTipo === 'repuestos' ? (data.precioRepuestos || 0) : (data.precioNormal || 0);
                    if (data.vinculoId) item.vinculoId = data.vinculoId;
                } else if (window.DataService) {
                    // Si no está en memoria local, buscar en DataService (INVENTARIO)
                    const results = await DataService.searchProducts(item.producto);
                    if (results && results.length > 0) {
                        const bestMatch = results[0];
                        // Asumimos un precio base, el usuario puede modificarlo
                        item.precioUnitario = bestMatch.precio || 0;
                        item.vinculoId = bestMatch.id;
                    }
                }
            } catch (e) {
                console.error("Error buscando precio para", item.producto, e);
            }
        }

        this.renderInvoicePrices();
    },

    renderInvoicePrices() {
        const tbody = document.getElementById('invoice-prices-tbody');
        tbody.innerHTML = '';
        
        this.facturaItems.forEach((item, index) => {
            const total = item.cantidadFacturar * item.precioUnitario;
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${item.cantidadFacturar}</strong></td>
                <td style="font-size: 13px; font-weight: 500;">${item.producto}</td>
                <td>
                    <button class="btn" style="background: #eee; color: #555; padding: 5px 10px; font-size: 12px; border: 1px solid #ccc; width: 100%;">
                        <i class="fas fa-link"></i> ${item.vinculoId ? 'Vinculado' : 'Vincular (Próximamente)'}
                    </button>
                </td>
                <td>
                    <input type="number" class="form-control" step="0.01" min="0" value="${item.precioUnitario.toFixed(2)}"
                        onchange="RegistrosApp.updateItemPrice(${index}, this.value)" style="width: 100px; padding: 6px; font-size: 14px;">
                </td>
                <td style="font-weight: bold; font-size: 15px;">$<span id="inv-total-${index}">${total.toFixed(2)}</span></td>
            `;
            tbody.appendChild(tr);
        });

        this.updateInvoiceGrandTotal();
    },

    updateItemPrice(index, newVal) {
        const val = parseFloat(newVal) || 0;
        this.facturaItems[index].precioUnitario = val;
        const total = val * this.facturaItems[index].cantidadFacturar;
        document.getElementById(`inv-total-${index}`).innerText = total.toFixed(2);
        this.updateInvoiceGrandTotal();
    },

    updateInvoiceGrandTotal() {
        const grandTotal = this.facturaItems.reduce((sum, item) => sum + (item.cantidadFacturar * item.precioUnitario), 0);
        document.getElementById('invoice-grand-total').innerText = grandTotal.toFixed(2);
    },

    async finalizeInvoice() {
        try {
            document.getElementById('loading-overlay').style.display = 'flex';
            const batch = this.db.batch();
            
            // Guardar o actualizar la memoria de precios
            this.facturaItems.forEach(item => {
                const safeId = item.producto.replace(/\//g, '-').trim();
                const realDocRef = this.preciosRef.doc(safeId);
                
                const updateData = {};
                if (this.facturaTipo === 'repuestos') {
                    updateData.precioRepuestos = item.precioUnitario;
                } else {
                    updateData.precioNormal = item.precioUnitario;
                }
                if (item.vinculoId) {
                    updateData.vinculoId = item.vinculoId;
                }
                
                batch.set(realDocRef, updateData, { merge: true });
            });

            // AQUÍ: Descontar los registros reales. 
            // Esto tomará los registros pendientes más antiguos y los pasará a estado "facturado"
            // (La lógica de descontado físico en base de datos la agregaremos en el siguiente paso para asegurar precisión).
            
            await batch.commit();

            document.getElementById('loading-overlay').style.display = 'none';
            alert("¡Precios guardados en memoria!");
            
            // Siguiente paso: Confirmar con el usuario cómo se crea la venta
            document.getElementById('modal-procesar-factura').style.display = 'none';
            
        } catch (error) {
            document.getElementById('loading-overlay').style.display = 'none';
            console.error("Error al procesar", error);
            alert("Error al procesar la factura: " + error.message);
        }
    },

    showLoading(show) {
        document.getElementById('loading-overlay').style.display = show ? 'flex' : 'none';
    },

    switchTab(tabId, btnElement) {
        // Hide all tab contents
        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.classList.remove('active');
        });
        // Remove active class from all buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        // Show selected tab
        document.getElementById(tabId).classList.add('active');
        // Set button as active
        if (btnElement) {
            btnElement.classList.add('active');
        }

        // Si se abre la pestaña de registros, renderizamos por si hubo cambios
        if (tabId === 'tab-registros') {
            this.renderTable();
        }
    },

    switchInnerTab(tabId, btnElement) {
        // Ocultar contenidos de las pestañas internas
        document.querySelectorAll('.inner-tab-content').forEach(tab => {
            tab.classList.remove('active');
        });
        // Quitar clase active a los botones internos
        document.querySelectorAll('.inner-tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        // Mostrar la seleccionada
        document.getElementById('inner-tab-' + tabId).classList.add('active');
        // Activar botón
        if (btnElement) {
            btnElement.classList.add('active');
        }
    }
};

// Inicializar cuando el DOM cargue
document.addEventListener('DOMContentLoaded', () => {
    RegistrosApp.init();
});
