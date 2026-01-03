// Modulo de Inventario - Usa la instancia 'db' y 'inventoryData' global del HTML
console.log("Cargando InventoryApp.js...");
// alert("SISTEMA INVENTARIO CARGADO OK"); // Comentado para no molestar, descomentar si necesario
window.importExcelNew = importExcelNew; // Hacer explícitamente global



// Referencias a elementos del DOM
const inventoryBody = document.getElementById('inventory-body');
const productModal = document.getElementById('product-modal');
const orderModal = document.getElementById('order-modal');
const productForm = document.getElementById('product-form');
const modalTitle = document.getElementById('modal-title');
const searchInput = document.getElementById('search-input');
const sortSelect = document.getElementById('sort-select');
const addProductBtn = document.getElementById('add-product-btn');
const orderBtn = document.getElementById('order-btn');
const cancelBtn = document.getElementById('cancel-btn');
const cancelOrderBtn = document.getElementById('cancel-order-btn');
const saveOrderBtn = document.getElementById('save-order-btn');
const processBulkOrderBtn = document.getElementById('process-bulk-order-btn');
const currentDateSpan = document.getElementById('current-date');
const themeToggle = document.getElementById('theme-toggle');
const orderItemsContainer = document.getElementById('order-items-container');
const totalProductsSpan = document.getElementById('total-products');

// Elementos del formulario de pedido
const orderCodeInput = document.getElementById('order-code');
const orderQuantityInput = document.getElementById('order-quantity');
const orderPriceInput = document.getElementById('order-price');
const currentProductInfo = document.getElementById('current-product-info');
const productFoundInfo = document.getElementById('product-found-info');

// Variables globales
let currentEditingId = null;
let inventoryData = [];
let isDarkMode = false;
let currentOrderItems = [];
let currentProduct = null;
let currentSort = 'description';

// Mostrar fecha actual
const now = new Date();
if (currentDateSpan) currentDateSpan.textContent = now.toLocaleDateString('es-ES');

// Cargar inventario al iniciar
document.addEventListener('DOMContentLoaded', loadInventory);

// Event Listeners
if (addProductBtn) addProductBtn.addEventListener('click', () => openModal());
if (orderBtn) orderBtn.addEventListener('click', () => openOrderModal());
if (cancelBtn) cancelBtn.addEventListener('click', () => closeModal());
if (cancelOrderBtn) cancelOrderBtn.addEventListener('click', () => closeOrderModal());
if (saveOrderBtn) saveOrderBtn.addEventListener('click', saveOrder);
if (processBulkOrderBtn) processBulkOrderBtn.addEventListener('click', processBulkOrder);
if (productForm) productForm.addEventListener('submit', saveProduct);
if (searchInput) searchInput.addEventListener('input', filterInventory);
if (themeToggle) themeToggle.addEventListener('click', toggleTheme);
if (sortSelect) sortSelect.addEventListener('change', (e) => {
    currentSort = e.target.value;
    sortInventory();
});

if (orderCodeInput) orderCodeInput.addEventListener('input', handleCodeInput);
if (orderQuantityInput) orderQuantityInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        orderPriceInput.focus();
    }
});
if (orderPriceInput) orderPriceInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        addToOrder();
    }
});

// Alternar modo oscuro/claro
function toggleTheme() {
    isDarkMode = !isDarkMode;
    document.body.classList.toggle('dark-mode', isDarkMode);

    const icon = themeToggle.querySelector('i');
    if (isDarkMode) {
        icon.classList.remove('fa-moon');
        icon.classList.add('fa-sun');
    } else {
        icon.classList.remove('fa-sun');
        icon.classList.add('fa-moon');
    }
}

// Cargar inventario desde Firebase
function loadInventory() {
    inventoryBody.innerHTML = '<div class="loading">Cargando inventario...</div>';

    db.collection('INVENTARIO').get()
        .then((querySnapshot) => {
            inventoryData = [];
            inventoryBody.innerHTML = '';

            if (querySnapshot.empty) {
                inventoryBody.innerHTML = '<div style="text-align: center; padding: 15px;">No hay productos en el inventario</div>';
                updateTotalProducts();
                return;
            }

            querySnapshot.forEach((doc) => {
                const product = doc.data();
                product.id = doc.id;
                inventoryData.push(product);
            });

            sortInventory();
            updateTotalProducts();
        })
        .catch((error) => {
            console.error("Error al cargar inventario: ", error);
            showFloatingNotification("Error al cargar el inventario", "error");
        });
}

// Ordenar inventario
function sortInventory() {
    const sortedData = [...inventoryData];

    switch (currentSort) {
        case 'description':
            sortedData.sort((a, b) => (a.descripcion || '').localeCompare(b.descripcion || ''));
            break;
        case 'description-desc':
            sortedData.sort((a, b) => (b.descripcion || '').localeCompare(a.descripcion || ''));
            break;
        case 'code':
            sortedData.sort((a, b) => (a.codigo || '').localeCompare(b.codigo || ''));
            break;
        case 'stock':
            sortedData.sort((a, b) => (b.cantidad || 0) - (a.cantidad || 0));
            break;
    }

    renderInventory(sortedData);
}

// Renderizar inventario
function renderInventory(data) {
    inventoryBody.innerHTML = '';

    if (data.length === 0) {
        inventoryBody.innerHTML = '<div style="text-align: center; padding: 15px;">No hay productos en el inventario</div>';
        return;
    }

    data.forEach(product => {
        const listItem = document.createElement('div');
        listItem.className = 'list-item';
        listItem.ondblclick = () => editProduct(product.id);
        listItem.title = "Doble clic para editar detalles";
        listItem.style.cursor = "pointer";

        const minStock = product.minStock || 10;
        const isLowStock = product.cantidad <= minStock;

        if (isLowStock) {
            listItem.classList.add('low-stock-row');
        }

        listItem.innerHTML = `
            <div style="font-weight: bold; color: var(--dark-gray);">${product.codigo || 'N/A'}</div>
            <div style="font-weight: 500;">${product.descripcion}</div>
            <div style="color: #666; font-size: 0.9em;">${product.descripcionTaller || '-'}</div>
            <div style="text-align: center;">
                <span style="font-weight: bold; font-size: 1.1em; ${isLowStock ? 'color: var(--danger-color);' : 'color: var(--dark-gray);'}">
                    ${product.cantidad}
                </span>
            </div>
            <div style="text-align: right; font-family: monospace; font-size: 1em;">
                $${(product.costo || 0).toFixed(2)}
            </div>
            <div style="text-align: right; font-family: monospace; font-size: 1em; font-weight: bold; color: var(--success-color);">
                $${(product.precio || 0).toFixed(2)}
            </div>
        `;

        inventoryBody.appendChild(listItem);
    });
}

// Actualizar contador de productos
function updateTotalProducts() {
    if (totalProductsSpan) totalProductsSpan.textContent = inventoryData.length;
}

// Abrir modal para agregar/editar producto
function openModal(productId = null) {
    currentEditingId = productId;

    if (productId) {
        modalTitle.textContent = 'Editar Producto';
        const product = inventoryData.find(p => p.id === productId);
        document.getElementById('product-code').value = product.codigo || '';
        document.getElementById('product-description').value = product.descripcion || '';
        document.getElementById('product-workshop-description').value = product.descripcionTaller || '';
        document.getElementById('product-quantity').value = product.cantidad || 0;
        document.getElementById('product-min-stock').value = product.minStock || 10;
        document.getElementById('product-cost').value = product.costo || 0;
        document.getElementById('product-price').value = product.precio || 0;
        document.getElementById('product-credit-fiscal').value = product.creditoFiscal ? 'true' : 'false';
    } else {
        modalTitle.textContent = 'Agregar Producto';
        productForm.reset();
    }

    productModal.style.display = 'flex';
}

function closeModal() {
    productModal.style.display = 'none';
    currentEditingId = null;
}

function saveProduct(e) {
    e.preventDefault();

    const productData = {
        codigo: document.getElementById('product-code').value,
        marca: document.getElementById('product-brand') ? document.getElementById('product-brand').value : '',
        descripcion: document.getElementById('product-description').value,
        descripcionTaller: document.getElementById('product-workshop-description').value,
        cantidad: parseInt(document.getElementById('product-quantity').value),
        minStock: parseInt(document.getElementById('product-min-stock').value),
        costo: parseFloat(document.getElementById('product-cost').value) || 0,
        precio: parseFloat(document.getElementById('product-price').value) || 0,
        creditoFiscal: document.getElementById('product-credit-fiscal').value === 'true'
    };

    if (currentEditingId) {
        db.collection('INVENTARIO').doc(currentEditingId).update(productData)
            .then(() => {
                showFloatingNotification("Producto actualizado correctamente", "success");
                closeModal();
                loadInventory();
            })
            .catch((error) => {
                console.error("Error al actualizar producto: ", error);
                showFloatingNotification("Error al actualizar producto", "error");
            });
    } else {
        db.collection('INVENTARIO').add(productData)
            .then(() => {
                showFloatingNotification("Producto agregado correctamente", "success");
                closeModal();
                loadInventory();
            })
            .catch((error) => {
                console.error("Error al agregar producto: ", error);
                showFloatingNotification("Error al agregar producto", "error");
            });
    }
}

function editProduct(productId) {
    openModal(productId);
}

function showFloatingNotification(message, type) {
    const floatingNotification = document.getElementById('floating-notification');
    if (floatingNotification) {
        floatingNotification.textContent = message;
        floatingNotification.className = 'floating-notification ' + type;
        floatingNotification.style.display = 'block';
        setTimeout(() => {
            floatingNotification.style.display = 'none';
        }, 3000);
    } else {
        alert(message);
    }
}

// Importación
async function importExcelNew(input) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    const shouldUpdate = confirm("¿Deseas actualizar los productos existentes que tengan el mismo Código?\n\n[Aceptar] = Sí.\n[Cancelar] = No (saltar).");
    input.value = '';

    const reader = new FileReader();
    reader.onload = async function (e) {
        try {
            const data = e.target.result;
            const workbook = XLSX.read(data, { type: 'binary' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];

            // 1. Leer matriz bruta y buscar encabezados
            const rawMatrix = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            if (!rawMatrix || rawMatrix.length === 0) {
                alert("Archivo vacío."); return;
            }

            let headerIdx = -1;
            let headers = [];
            // Buscar fila con 'codigo' y 'descripcion'
            for (let i = 0; i < rawMatrix.length; i++) {
                const rowStr = JSON.stringify(rawMatrix[i]).toLowerCase();
                if (rowStr.includes('codigo') || rowStr.includes('descripcion')) {
                    headerIdx = i;
                    headers = rawMatrix[i].map(h => String(h).trim());
                    break;
                }
            }

            if (headerIdx === -1) {
                alert("No se detectaron columnas 'Codigo' / 'Descripcion'. Usando primera fila.");
                headerIdx = 0;
                headers = rawMatrix[0].map(h => String(h).trim());
            }

            // 2. Procesar filas de datos
            let products = [];
            const cleanNumber = (val) => {
                if (val === undefined || val === null || val === '') return 0;
                if (typeof val === 'number') return val;
                const s = String(val).replace(/,/g, '').replace(/$/g, '').trim();
                return parseFloat(s) || 0;
            };

            for (let i = headerIdx + 1; i < rawMatrix.length; i++) {
                const rowArr = rawMatrix[i];
                if (!rowArr || rowArr.length === 0) continue;

                // Crear objeto temporal mapa
                let rowObj = {};
                headers.forEach((h, idx) => { if (h) rowObj[h] = rowArr[idx]; });

                // Buscar CÓDIGO
                let codigo = rowObj['Codigo'] || rowObj['codigo'];
                if (!codigo) {
                    const k = Object.keys(rowObj).find(key => key.toLowerCase().includes('cod'));
                    if (k) codigo = rowObj[k];
                }
                if (!codigo) continue;

                // Buscar CANTIDAD (Stock)
                // Prioridad 1: Por nombre
                let qtyVal = undefined;
                const qtyKey = Object.keys(rowObj).find(k => {
                    const kl = k.toLowerCase();
                    return kl.includes('31/12') || (kl.includes('inventario') && !kl.includes('descrip')) || kl.includes('existencia') || kl.includes('stock');
                });
                if (qtyKey) qtyVal = rowObj[qtyKey];

                // Prioridad 2: Fallback FORZOSO a Columna F (Indice 5) si no hay valor
                if (qtyVal === undefined && rowArr.length > 5) {
                    qtyVal = rowArr[5];
                }

                // Costo y Precio
                let costoVal = rowObj['Precio costo'];
                if (!costoVal) {
                    const k = Object.keys(rowObj).find(key => key.toLowerCase().includes('costo') || key.toLowerCase().includes('compra'));
                    if (k) costoVal = rowObj[k];
                }

                let precioVal = rowObj['Precio de venta'];
                if (!precioVal) {
                    const k = Object.keys(rowObj).find(key => key.toLowerCase().includes('precio') || key.toLowerCase().includes('venta'));
                    if (k) precioVal = rowObj[k];
                }

                products.push({
                    codigo: String(codigo).trim(),
                    descripcion: rowObj['Descripcion'] || rowObj['Descripcion según inventario'] || '',
                    descripcionTaller: rowObj['Descripcion según factura'] || '',
                    cantidad: parseInt(cleanNumber(qtyVal)),
                    costo: cleanNumber(costoVal),
                    precio: cleanNumber(precioVal)
                });
            }

            if (products.length === 0) {
                alert("No se encontraron productos válidos."); return;
            }

            // Guardar en Firebase
            const batch = db.batch();
            let count = 0;
            const currentCodes = new Set(inventoryData.map(p => p.codigo));

            products.forEach(p => {
                if (currentCodes.has(p.codigo) && !shouldUpdate) return;
                const ref = db.collection('INVENTARIO').doc(p.codigo);
                batch.set(ref, p, { merge: true });
                count++;
            });

            if (count > 0) await batch.commit();
            showFloatingNotification(`Importación completada. (${count} importados)`, "success");
            loadInventory();

        } catch (error) {
            console.error(error);
            alert("Error: " + error.message);
        }
    };
    reader.readAsBinaryString(file);
}

// --- MODAL DE ENTRADA Y LÓGICA ---

function openEntryModal() {
    const modal = document.getElementById('entry-modal');
    if (!modal) {
        console.error("Modal entry-modal no encontrado");
        return;
    }
    modal.style.display = 'flex';
    modal.style.zIndex = '3000';

    // Limpiar
    const tbody = document.getElementById('entry-rows');
    if (tbody) tbody.innerHTML = '';

    const refInput = document.getElementById('entry-reference');
    if (refInput) refInput.value = '';

    const ivaCheck = document.getElementById('entry-has-iva');
    if (ivaCheck) ivaCheck.checked = true;

    addEntryRow();
    calculateEntryTotals();
}

function addEntryRow(data = null) {
    const tbody = document.getElementById('entry-rows');
    if (!tbody) return;

    const row = document.createElement('tr');

    const codigo = data ? (data.codigo || '') : '';
    const desc = data ? (data.descripcion || '') : '';
    const cant = data ? (data.cantidad || '') : '';
    const precio = data ? (data.precio || '') : '';
    row.dataset.productId = data ? (data.id || '') : '';

    row.innerHTML = `
        <td>
            <div style="position: relative;">
                <input type="text" class="entry-input entry-code" value="${codigo}" placeholder="Cod" onkeyup="searchProduct(this, 'code')" autocomplete="off">
                <div class="suggestions-container"></div>
            </div>
        </td>
        <td>
             <div style="position: relative;">
                <input type="text" class="entry-input entry-desc" value="${desc}" placeholder="Descripción" onkeyup="searchProduct(this, 'desc')" autocomplete="off">
                <div class="suggestions-container"></div>
            </div>
        </td>
        <td><input type="number" class="entry-input entry-qty" value="${cant}" min="1" placeholder="0" onchange="calculateEntryTotals()" onkeyup="calculateEntryTotals()"></td>
        <td><input type="number" class="entry-input entry-price" value="${precio}" min="0" step="0.01" placeholder="0.00" onchange="calculateEntryTotals()" onkeyup="calculateEntryTotals()"></td>
        <td style="text-align: right; font-weight: bold;" class="entry-row-total">$0.00</td>
        <td style="text-align: center;">
            <button class="btn-danger" style="border:none; cursor:pointer;" onclick="this.closest('tr').remove(); calculateEntryTotals();"><i class="fas fa-times"></i></button>
        </td>
    `;
    tbody.appendChild(row);

    // Cerrar sugerencias al hacer click fuera
    document.addEventListener('click', function (e) {
        if (!e.target.closest('.suggestions-box') && !e.target.closest('.entry-input')) closeAllSuggestions();
    });
}

function calculateEntryTotals() {
    const rows = document.querySelectorAll('#entry-rows tr');
    let subtotal = 0;
    const ivaCheck = document.getElementById('entry-has-iva');
    const includesIva = ivaCheck ? ivaCheck.checked : true;

    rows.forEach(row => {
        const qty = parseFloat(row.querySelector('.entry-qty').value) || 0;
        const price = parseFloat(row.querySelector('.entry-price').value) || 0;
        let rowTotal = qty * price;
        const totalCell = row.querySelector('.entry-row-total');
        if (totalCell) totalCell.textContent = '$' + rowTotal.toFixed(2);
        subtotal += rowTotal;
    });

    let finalSubtotal = 0, finalIVA = 0, finalTotal = 0;

    if (includesIva) {
        finalTotal = subtotal;
        finalSubtotal = finalTotal / 1.13;
        finalIVA = finalTotal - finalSubtotal;
    } else {
        finalSubtotal = subtotal;
        finalIVA = finalSubtotal * 0.13;
        finalTotal = finalSubtotal + finalIVA;
    }

    const elSub = document.getElementById('entry-subtotal');
    const elIva = document.getElementById('entry-iva');
    const elTot = document.getElementById('entry-total');

    if (elSub) elSub.textContent = '$' + finalSubtotal.toFixed(2);
    if (elIva) elIva.textContent = '$' + finalIVA.toFixed(2);
    if (elTot) elTot.textContent = '$' + finalTotal.toFixed(2);
}

function searchProduct(input, type) {
    const query = input.value.trim().toLowerCase();
    const container = input.parentElement.querySelector('.suggestions-container'); // Buscar contenedor hermano
    if (!container) return;

    container.innerHTML = '';
    if (query.length < 2) return;

    const matches = inventoryData.filter(p => {
        const code = (p.codigo || '').toLowerCase();
        const desc = (p.descripcion || '').toLowerCase();
        if (type === 'code') return code.includes(query);
        else return desc.includes(query);
    }).slice(0, 8);

    if (matches.length === 0) return;

    const box = document.createElement('div');
    box.className = 'suggestions-box';
    matches.forEach(product => {
        const item = document.createElement('div');
        item.className = 'suggestion-item';
        item.innerHTML = `
            <div>
                <div class="suggestion-code">${product.codigo || 'S/C'}</div>
                <div class="suggestion-desc">${product.descripcion}</div>
            </div>
            <div class="suggestion-price">$${(product.costo || 0).toFixed(2)}</div>
        `;
        item.onclick = () => selectSuggestion(input, product);
        box.appendChild(item);
    });
    container.appendChild(box);
}

function selectSuggestion(input, product) {
    const row = input.closest('tr');
    if (!row) return;

    row.querySelector('.entry-code').value = product.codigo || '';
    row.querySelector('.entry-desc').value = product.descripcion || '';
    row.querySelector('.entry-price').value = product.costo || '';
    row.dataset.productId = product.id;

    closeAllSuggestions();
    calculateEntryTotals();
}

function closeAllSuggestions() {
    document.querySelectorAll('.suggestions-box').forEach(el => el.remove());
}

async function saveEntry() {
    const rows = document.querySelectorAll('#entry-rows tr');
    if (rows.length === 0) return;

    if (!confirm("¿Confirmar entrada?")) return;

    const submitBtn = document.querySelector('#entry-modal .btn-success');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Guardando..."; }

    try {
        const batch = db.batch();
        const timestamp = firebase.firestore.FieldValue.serverTimestamp();
        const refVal = document.getElementById('entry-reference').value || 'Sin Ref';
        const hasIva = document.getElementById('entry-has-iva').checked;

        let validCount = 0;

        for (const row of rows) {
            const code = row.querySelector('.entry-code').value.trim();
            const qty = parseFloat(row.querySelector('.entry-qty').value);
            const price = parseFloat(row.querySelector('.entry-price').value);

            if (!code || !qty) continue;

            // Buscar ID
            let pid = row.dataset.productId;
            if (!pid) {
                const found = inventoryData.find(p => p.codigo === code);
                if (found) pid = found.id;
                else {
                    // Auto-crear si no existe? Por ahora error.
                    alert("Producto no encontrado: " + code);
                    throw new Error("Producto no existe");
                }
            }

            const costUnit = hasIva ? (price / 1.13) : price;

            const pRef = db.collection('INVENTARIO').doc(pid);
            batch.update(pRef, {
                cantidad: firebase.firestore.FieldValue.increment(qty),
                costo: costUnit
            });

            // Movimiento
            const mRef = db.collection('MOVIMIENTOS_INVENTARIO').doc();
            batch.set(mRef, {
                productId: pid,
                tipo: 'entrada',
                cantidad: qty,
                costo: costUnit,
                referencia: refVal,
                fecha: timestamp
            });
            validCount++;
        }

        if (validCount > 0) {
            await batch.commit();
            showFloatingNotification("Entrada guardada", "success");
            document.getElementById('entry-modal').style.display = 'none';
            loadInventory();
        }

    } catch (e) {
        console.error(e);
        alert("Error: " + e.message);
    } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Guardar Entrada"; }
    }
}


