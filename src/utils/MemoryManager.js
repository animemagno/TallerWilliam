export const MemoryManager = {
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
