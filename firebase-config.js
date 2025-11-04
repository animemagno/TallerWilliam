// Configuración de Firebase
const CONFIG = {
    firebase: {
        apiKey: "AIzaSyDh074AarXaYCc-Htw-lsCeIc_95QQNSnY",
        authDomain: "tallerwilliam-732b3.firebaseapp.com",
        projectId: "tallerwilliam-732b3",
        storageBucket: "tallerwilliam-732b3.firebasestorage.app",
        messagingSenderId: "822262666247",
        appId: "1:822262666247:web:6680487bbf1108006b86a2"
    }
};

// Inicialización de Firebase
let firebaseApp;
let db;

try {
    if (firebase && firebase.initializeApp) {
        firebaseApp = firebase.initializeApp(CONFIG.firebase);
        db = firebase.firestore();
        
        // Habilitar persistencia offline
        db.enablePersistence()
            .catch((err) => {
                if (err.code == 'failed-precondition') {
                    console.log("Persistencia offline no disponible - Múltiples pestañas abiertas");
                } else if (err.code == 'unimplemented') {
                    console.log("Persistencia offline no disponible - Navegador no compatible");
                }
            });
    }
} catch (error) {
    console.error("Error inicializando Firebase:", error);
}

// Utilidades de fecha para El Salvador
const DateUtils = {
    getCurrentDateElSalvador() {
        const now = new Date();
        const offset = -6 * 60; // UTC-6 para El Salvador
        const localTime = now.getTime();
        const localOffset = now.getTimezoneOffset() * 60000;
        const utc = localTime + localOffset;
        const elSalvadorTime = utc + (offset * 60000);
        return new Date(elSalvadorTime);
    },

    getCurrentDateStringElSalvador() {
        const date = this.getCurrentDateElSalvador();
        return date.toISOString().split('T')[0];
    },

    formatDateToYYYYMMDD(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    },

    createDateFromStringElSalvador(dateString) {
        const [year, month, day] = dateString.split('-').map(Number);
        const date = new Date(year, month - 1, day, 12, 0, 0);
        return this.adjustToElSalvadorTime(date);
    },

    adjustToElSalvadorTime(date) {
        const offset = -6 * 60;
        const localTime = date.getTime();
        const localOffset = date.getTimezoneOffset() * 60000;
        const utc = localTime + localOffset;
        const elSalvadorTime = utc + (offset * 60000);
        return new Date(elSalvadorTime);
    },

    isTodayInElSalvador(dateString) {
        const today = this.getCurrentDateStringElSalvador();
        return dateString === today;
    },

    getCurrentTimestampElSalvador() {
        return this.getCurrentDateElSalvador();
    }
};

// Gestor de conexión
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
            if (db) {
                await db.collection("VENTAS").limit(1).get();
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
        }
    },
    
    handleOffline() {
        if (this.isOnline) {
            this.isOnline = false;
            this.updateUI();
        }
    },
    
    updateUI() {
        const statusElement = document.getElementById('connection-status');
        if (!statusElement) return;
        
        if (this.isOnline) {
            statusElement.textContent = "🟢 CONECTADO";
            statusElement.className = "connection-status online";
        } else {
            statusElement.textContent = "🔴 SIN CONEXIÓN";
            statusElement.className = "connection-status offline";
        }
        statusElement.style.display = 'block';
    }
};

// Cache de productos
const ProductCache = {
    data: new Map(),
    lastUpdate: null,
    ttl: 10 * 60 * 1000,
    
    isExpired() {
        return !this.lastUpdate || (Date.now() - this.lastUpdate) > this.ttl;
    },
    
    async initialize() {
        if (this.isExpired() || this.data.size === 0) {
            await this.refresh();
        }
    },
    
    async refresh() {
        try {
            if (!db) return;
            
            const snapshot = await db.collection("INVENTARIO").get();
            this.data.clear();
            snapshot.forEach(doc => {
                this.data.set(doc.id, { id: doc.id, ...doc.data() });
            });
            this.lastUpdate = Date.now();
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
    }
};

// Servicio de datos
const DataService = {
    async searchProducts(query) {
        if (!db) {
            return [{
                id: 'manual-' + Date.now(),
                codigo: 'MANUAL',
                descripcion: query,
                precio: 0,
                cantidad: 1
            }];
        }

        await ProductCache.initialize();
        let results = ProductCache.search(query);

        if (results.length === 0 && query.trim() !== '') {
            results.push({
                id: 'manual-' + Date.now(),
                codigo: 'MANUAL',
                descripcion: query,
                precio: 0,
                cantidad: 1
            });
        }
        
        return results;
    },

    async saveSale(saleData) {
        if (db) {
            const existingInvoice = await this.checkInvoiceExists(saleData.invoiceNumber);
            if (existingInvoice) {
                throw new Error(`La factura ${saleData.invoiceNumber} ya existe`);
            }
            
            const docRef = await db.collection("VENTAS").add(saleData);
            
            await this.updateSaleCounter(saleData.date);
            
            return docRef.id;
        } else {
            throw new Error("No hay conexión a la base de datos");
        }
    },

    async checkInvoiceExists(invoiceNumber) {
        try {
            if (!db) return false;
            
            const snapshot = await db.collection("VENTAS")
                .where("invoiceNumber", "==", invoiceNumber)
                .limit(1)
                .get();
            return !snapshot.empty;
        } catch (error) {
            console.error("Error verificando factura duplicada:", error);
            return false;
        }
    },

    async updateSaleCounter(date = DateUtils.getCurrentDateStringElSalvador()) {
        try {
            if (!db) return;
            
            const counterRef = db.collection("COUNTERS").doc("sales");
            const counterDoc = await counterRef.get();
            let currentCount = 0;
            
            if (counterDoc.exists) {
                currentCount = counterDoc.data()[date] || 0;
            }
            
            await counterRef.set({
                [date]: currentCount + 1,
                lastUpdate: new Date()
            }, { merge: true });
        } catch (error) {
            console.error("Error actualizando contador:", error);
        }
    },

    async getSaleCounter(date = DateUtils.getCurrentDateStringElSalvador()) {
        try {
            if (!db) return 0;
            
            const counterRef = db.collection("COUNTERS").doc("sales");
            const doc = await counterRef.get();
            
            if (doc.exists) {
                return doc.data()[date] || 0;
            }
            return 0;
        } catch (error) {
            console.error("Error obteniendo contador, usando fallback:", error);
            if (db) {
                const snapshot = await db.collection("VENTAS")
                    .where("date", "==", date)
                    .get();
                return snapshot.size;
            }
            return 0;
        }
    }
};
