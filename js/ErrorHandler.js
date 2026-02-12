// CORRECCIÓN 1: Mejor manejo de errores y timeouts
const ErrorHandler = {
    async withTimeout(promise, timeoutMs = 10000, operationName = "Operación") {
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`${operationName} timeout después de ${timeoutMs}ms`)), timeoutMs);
        });

        try {
            return await Promise.race([promise, timeoutPromise]);
        } catch (error) {
            console.error(`Error en ${operationName}:`, error);
            throw error;
        }
    },

    async withRetry(promiseFn, maxRetries = 3, operationName = "Operación") {
        let lastError;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await promiseFn();
            } catch (error) {
                lastError = error;
                console.warn(`Intento ${attempt}/${maxRetries} falló para ${operationName}:`, error);

                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                }
            }
        }

        throw new Error(`${operationName} falló después de ${maxRetries} intentos: ${lastError.message}`);
    }
};
