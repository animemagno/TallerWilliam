const ProductCache = {
    data: new Map(),
    lastUpdate: null,
    ttl: 10 * 60 * 1000, // 10 minutos
    unsubscribe: null,

    isExpired() {
        return !this.lastUpdate || (Date.now() - this.lastUpdate) > this.ttl;
    },

    async initialize() {
        if (this.isExpired() || this.data.size === 0) {
            await this.refresh();
        }
        this.setupRealTimeListener();
    },

    // CORRECCIÓN 7: Listener en tiempo real para cache automático
    setupRealTimeListener() {
        if (!AppState.firebaseInitialized) return;

        // Escuchar ambas colecciones
        const inventarioUnsubscribe = AppState.db.collection("INVENTARIO")
            .onSnapshot((snapshot) => {
                snapshot.docChanges().forEach((change) => {
                    if (change.type === 'added' || change.type === 'modified') {
                        this.data.set(change.doc.id, { id: change.doc.id, ...change.doc.data() });
                    } else if (change.type === 'removed') {
                        this.data.delete(change.doc.id);
                    }
                });
                this.lastUpdate = Date.now();
            }, (error) => {
                console.error("Error en listener de inventario:", error);
            });

        const provisionalUnsubscribe = AppState.db.collection("INVENTARIO_PROVICIONAL")
            .onSnapshot((snapshot) => {
                snapshot.docChanges().forEach((change) => {
                    if (change.type === 'added' || change.type === 'modified') {
                        this.data.set(change.doc.id, { id: change.doc.id, ...change.doc.data() });
                    } else if (change.type === 'removed') {
                        this.data.delete(change.doc.id);
                    }
                });
                this.lastUpdate = Date.now();
            }, (error) => {
                console.error("Error en listener de inventario provisional:", error);
            });

        const serviciosUnsubscribe = AppState.db.collection("SERVICIOS")
            .onSnapshot((snapshot) => {
                snapshot.docChanges().forEach((change) => {
                    if (change.type === 'added' || change.type === 'modified') {
                        this.data.set(change.doc.id, { id: change.doc.id, ...change.doc.data(), tipo: 'servicio' });
                    } else if (change.type === 'removed') {
                        this.data.delete(change.doc.id);
                    }
                });
                this.lastUpdate = Date.now();
            }, (error) => {
                console.error("Error en listener de servicios:", error);
            });

        this.unsubscribe = () => {
            inventarioUnsubscribe();
            provisionalUnsubscribe();
            serviciosUnsubscribe();
        };
    },

    async refresh() {
        try {
            if (!AppState.firebaseInitialized) return;

            // Cargar colecciones
            const [inventarioSnap, provisionalSnap, serviciosSnap] = await Promise.all([
                ErrorHandler.withRetry(() => AppState.db.collection("INVENTARIO").get(), 3, "Carga de inventario"),
                ErrorHandler.withRetry(() => AppState.db.collection("INVENTARIO_PROVICIONAL").get(), 3, "Carga de inventario provisional"),
                ErrorHandler.withRetry(() => AppState.db.collection("SERVICIOS").get(), 3, "Carga de servicios")
            ]);

            this.data.clear();

            inventarioSnap.forEach(doc => {
                this.data.set(doc.id, { id: doc.id, ...doc.data() });
            });

            provisionalSnap.forEach(doc => {
                this.data.set(doc.id, { id: doc.id, ...doc.data() });
            });

            serviciosSnap.forEach(doc => {
                this.data.set(doc.id, { id: doc.id, ...doc.data(), tipo: 'servicio' });
            });

            this.lastUpdate = Date.now();
            MemoryManager.cleanupIfNeeded(this.data);
        } catch (error) {
            console.error("Error actualizando cache:", error);
        }
    },

    search(query) {
        const results = [];
        const searchTerm = query.toLowerCase().trim();

        if (!searchTerm) return results;

        this.data.forEach(product => {
            const codigo = (product.codigo || '').toLowerCase();
            const descripcion = (product.descripcion || '').toLowerCase();

            if (codigo.includes(searchTerm) || descripcion.includes(searchTerm)) {
                results.push(product);
            }
        });

        return results.slice(0, 10);
    },

    getByCode(codigo) {
        let found = null;
        this.data.forEach(product => {
            if (product.codigo === codigo) {
                found = product;
            }
        });
        return found;
    },

    cleanup() {
        if (this.unsubscribe) {
            this.unsubscribe();
        }
    }
};
