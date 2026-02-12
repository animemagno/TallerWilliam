const ConnectionManager = {
    isOnline: true,

    initialize() {
        this.checkConnection();
        setInterval(() => this.checkConnection(), 30000);

        window.addEventListener('online', () => this.handleOnline());
        window.addEventListener('offline', () => this.handleOffline());
    },

    async checkConnection() {
        try {
            if (AppState.firebaseInitialized) {
                await ErrorHandler.withTimeout(
                    AppState.db.collection("VENTAS").limit(1).get(),
                    10000, // Aumentado a 10s para conexiones lentas
                    "Verificación de conexión"
                );
                this.handleOnline();
            } else {
                this.handleOffline();
            }
        } catch (error) {
            this.handleOffline();
        }
    },

    handleOnline() {
        if (!this.isOnline) {
            this.isOnline = true;
            this.updateUI();
            UIService.showStatus("Conexión restaurada", "success");
        }
    },

    handleOffline() {
        if (this.isOnline) {
            this.isOnline = false;
            this.updateUI();
            UIService.showStatus("Sin conexión - Modo offline", "error");
        }
    },

    updateUI() {
        const statusElement = document.getElementById('connection-status');
        if (this.isOnline) {
            statusElement.textContent = "🟢 CONECTADO";
            statusElement.className = "connection-status online";
        } else {
            statusElement.innerHTML = `
                🔴 SIN CONEXIÓN 
                <button onclick="ConnectionManager.checkConnection()" style="margin-left: 10px; padding: 2px 8px; font-size: 0.8rem; cursor: pointer; background: #fff; border: 1px solid #ccc; border-radius: 4px; color: #333;">
                    <i class="fas fa-sync-alt"></i> Reconectar
                </button>
            `;
            statusElement.className = "connection-status offline";
        }
        statusElement.style.display = 'block';
    }
};

// CORRECCIÓN 8: Mejor gestión de memoria con paginación
const MemoryManager = {
    maxCacheSize: 1000,
    cleanupThreshold: 0.8,

    cleanupIfNeeded(cache) {
        if (cache.size > this.maxCacheSize * this.cleanupThreshold) {
            const entries = Array.from(cache.entries());
            const toRemove = entries.slice(0, Math.floor(entries.length * 0.2));

            toRemove.forEach(([key]) => {
                cache.delete(key);
            });

            console.log(`MemoryManager: Limpiados ${toRemove.length} elementos del cache`);
        }
    },

    paginateData(data, pageSize = 50) {
        const pages = [];
        for (let i = 0; i < data.length; i += pageSize) {
            pages.push(data.slice(i, i + pageSize));
        }
        return pages;
    }
};
