const AppState = {
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
    // CORRECCIÓN 6: Lock para concurrencia
    operationLock: false
};

// CORRECCIÓN 6: Manejo de concurrencia
const ConcurrencyManager = {
    async acquireLock(operationName = "Operación") {
        let attempts = 0;
        const maxAttempts = 10;
        const delay = 100;

        while (AppState.operationLock && attempts < maxAttempts) {
            attempts++;
            await new Promise(resolve => setTimeout(resolve, delay));
        }

        if (AppState.operationLock) {
            throw new Error(`No se pudo adquirir lock para ${operationName} después de ${maxAttempts} intentos`);
        }

        AppState.operationLock = true;
        document.body.classList.add('concurrency-lock');
        return true;
    },

    releaseLock() {
        AppState.operationLock = false;
        document.body.classList.remove('concurrency-lock');
    },

    async withLock(operationFn, operationName = "Operación") {
        await this.acquireLock(operationName);
        try {
            return await operationFn();
        } finally {
            this.releaseLock();
        }
    }
};
