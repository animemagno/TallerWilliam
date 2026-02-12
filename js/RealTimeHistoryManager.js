// CORRECCIÓN 10: Gestor de Historial en Tiempo Real
const RealTimeHistoryManager = {
    unsubscribes: [],

    init() {
        console.log("Inicializando RealTimeHistoryManager...");
        this.stop(); // Limpiar previos

        // Asegurar que historial esté inicializado
        if (!AppState.historial) AppState.historial = [];

        const today = DateUtils.getCurrentDateStringElSalvador();

        if (!AppState.firebaseInitialized) return;

        const db = AppState.db;

        // Escuchar Ventas de Hoy
        this.unsubscribes.push(
            db.collection("VENTAS")
                .where("date", "==", today)
                .onSnapshot(snapshot => this.handleUpdate(snapshot, 'venta'),
                    err => console.error("Error en listener ventas:", err))
        );

        // Escuchar Ingresos de Hoy (incluye Abonos)
        this.unsubscribes.push(
            db.collection("INGRESOS")
                .where("date", "==", today)
                .onSnapshot(snapshot => this.handleUpdate(snapshot, 'ingreso'),
                    err => console.error("Error en listener ingresos:", err))
        );

        // Escuchar Retiros de Hoy
        this.unsubscribes.push(
            db.collection("RETIROS")
                .where("date", "==", today)
                .onSnapshot(snapshot => this.handleUpdate(snapshot, 'retiro'),
                    err => console.error("Error en listener retiros:", err))
        );
    },

    handleUpdate(snapshot, type) {
        try {
            let hasChanges = false;

            snapshot.docChanges().forEach(change => {
                const docData = { id: change.doc.id, ...change.doc.data() };

                // Normalizar tipo
                if (type === 'ingreso') {
                    docData.tipo = docData.categoria === 'abono' ? 'abono' : 'ingreso';
                } else {
                    docData.tipo = type;
                }

                // Si el timestamp está pendiente (serverTimestamp aún no resuelto),
                // usar la hora local como temporal
                if (!docData.timestamp || (docData.timestamp && !docData.timestamp.toDate && !docData.timestamp.seconds)) {
                    docData._localTimestamp = Date.now();
                }

                if (change.type === 'added' || change.type === 'modified') {
                    hasChanges = true;
                    // Buscar si ya existe
                    const index = AppState.historial.findIndex(h => h.id === docData.id);
                    if (index >= 0) {
                        AppState.historial[index] = docData;
                    } else {
                        // Agregar al principio
                        AppState.historial.unshift(docData);
                    }
                } else if (change.type === 'removed') {
                    hasChanges = true;
                    AppState.historial = AppState.historial.filter(h => h.id !== docData.id);
                }
            });

            if (hasChanges) {
                // Ordenar por fecha cronológica (más nuevo primero para el historial visual)
                AppState.historial.sort((a, b) => {
                    const dateA = a.timestamp ? (a.timestamp.toDate ? a.timestamp.toDate() : new Date(a.timestamp)) : new Date(0);
                    const dateB = b.timestamp ? (b.timestamp.toDate ? b.timestamp.toDate() : new Date(b.timestamp)) : new Date(0);
                    return dateB - dateA;
                });

                // Actualizar UI
                HistorialService.updateHistorial(AppState.historial);
            }
            // Resetear contador de errores en actualizaciones exitosas
            this._errorCount = 0;
        } catch (error) {
            console.error("Error en handleUpdate:", error);
            // NO propagar el error para no romper el listener
        }
    },

    stop() {
        this.unsubscribes.forEach(u => u());
        this.unsubscribes = [];
    }
};

