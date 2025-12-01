import { UIService } from '../services/UIService.js';

// Estado local para el lock, ya que AppState puede no estar disponible inmediatamente
let localLock = false;

export const ConcurrencyManager = {
    async acquireLock(operationName = "Operación") {
        let attempts = 0;
        const maxAttempts = 10;
        const delay = 100;

        while (localLock && attempts < maxAttempts) {
            attempts++;
            await new Promise(resolve => setTimeout(resolve, delay));
        }

        if (localLock) {
            throw new Error(`No se pudo adquirir lock para ${operationName} después de ${maxAttempts} intentos`);
        }

        localLock = true;
        document.body.classList.add('concurrency-lock');
        return true;
    },

    releaseLock() {
        localLock = false;
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
