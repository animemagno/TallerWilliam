export const AppState = {
    firebaseInitialized: false,
    db: null,
    cart: [],
    searchResults: [],
    saleCounter: 0,
    currentEditingInvoice: null,
    historial: [],
    filteredHistorial: [],
    currentFilter: 'hoy',
    currentAbonoInvoice: null,
    currentDetalle: null,
    equiposSeleccionados: new Set(),
    equiposEditSeleccionados: new Set(),
    processingSale: false,
    currentInvoiceNumber: null,
    datosVentaPendiente: null,
    selectedInvoicesForPayment: new Set(),
    operationLock: false,

    initialize(db) {
        this.db = db;
        this.firebaseInitialized = true;
    }
};
