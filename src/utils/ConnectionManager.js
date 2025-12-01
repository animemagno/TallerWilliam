import { AppState } from '../store/AppState.js';
import { ErrorHandler } from './ErrorHandler.js';
import { UIService } from '../services/UIService.js';

export const ConnectionManager = {
    isOnline: true,

    initialize() {
        this.checkConnection();
        setInterval(() => this.checkConnection(), 30000);

        window.addEventListener('online', () => this.handleOnline());
        window.addEventListener('offline', () => this.handleOffline());
    },

    async checkConnection() {
        try {
            if (AppState.firebaseInitialized && AppState.db) {
                await ErrorHandler.withTimeout(
                    AppState.db.collection("VENTAS").limit(1).get(),
                    10000,
                    "Verificación de conexión"
                );
                this.handleOnline();
            } else {
                // Si no está inicializado, intentamos verificar si hay red
                if (navigator.onLine) {
                    // Podríamos intentar reconectar firebase aquí si fuera necesario
                } else {
                    this.handleOffline();
                }
            }
        } catch (error) {
            console.warn("Error de conexión:", error);
            this.handleOffline();
        }
    },

    handleOnline() {
        if (!this.isOnline) {
            this.isOnline = true;
            this.updateUI();
            UIService.showStatus("Conexión restaurada", "success");
        } else {
            // Actualizar UI de todas formas para asegurar estado correcto al inicio
            this.updateUI();
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
        if (!statusElement) return;

        if (this.isOnline) {
            statusElement.textContent = "🟢 CONECTADO";
            statusElement.className = "connection-status online";
        } else {
            statusElement.innerHTML = `
        🔴 SIN CONEXIÓN 
        <button id="reconnect-btn" style="margin-left: 10px; padding: 2px 8px; font-size: 0.8rem; cursor: pointer; background: #fff; border: 1px solid #ccc; border-radius: 4px; color: #333;">
            <i class="fas fa-sync-alt"></i> Reconectar
        </button>
    `;
            statusElement.className = "connection-status offline";

            const btn = document.getElementById('reconnect-btn');
            if (btn) {
                btn.addEventListener('click', () => this.checkConnection());
            }
        }
        statusElement.style.display = 'block';
    }
};
