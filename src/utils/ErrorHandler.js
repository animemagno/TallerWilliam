export const ErrorHandler = {
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
        for (let i = 0; i < maxRetries; i++) {
            try {
                return await promiseFn();
            } catch (error) {
                lastError = error;
                console.warn(`Intento ${i + 1}/${maxRetries} fallido para ${operationName}:`, error);
                if (i < maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
                }
            }
        }
        throw lastError;
    }
};
