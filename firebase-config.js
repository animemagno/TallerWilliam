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
            if (typeof UIService !== 'undefined') {
                UIService.showStatus("Conexión restaurada", "success");
            }
        }
    },
    
    handleOffline() {
        if (this.isOnline) {
            this.isOnline = false;
            this.updateUI();
            if (typeof UIService !== 'undefined') {
                UIService.showStatus("Sin conexión - Modo offline", "error");
            }
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
    ttl: 10 * 60 * 1000, // 10 minutos
    
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

    async saveDirectSale(saleData) {
        if (db) {
            const existingInvoice = await this.checkInvoiceExists(saleData.invoiceNumber);
            if (existingInvoice) {
                throw new Error(`La factura ${saleData.invoiceNumber} ya existe`);
            }
            
            const docRef = await db.collection("VENTAS_DIRECTAS").add(saleData);
            
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
                
            if (!snapshot.empty) return true;
            
            // Verificar también en ventas directas
            const directSnapshot = await db.collection("VENTAS_DIRECTAS")
                .where("invoiceNumber", "==", invoiceNumber)
                .limit(1)
                .get();
                
            return !directSnapshot.empty;
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
    },

    async updateSale(saleId, saleData) {
        if (db) {
            await db.collection("VENTAS").doc(saleId).update(saleData);
        } else {
            throw new Error("No hay conexión a la base de datos");
        }
    },

    async updateDirectSale(saleId, saleData) {
        if (db) {
            await db.collection("VENTAS_DIRECTAS").doc(saleId).update(saleData);
        } else {
            throw new Error("No hay conexión a la base de datos");
        }
    },

    async deleteSale(saleId) {
        if (db) {
            await db.collection("VENTAS").doc(saleId).delete();
        } else {
            throw new Error("No hay conexión a la base de datos");
        }
    },

    async deleteDirectSale(saleId) {
        if (db) {
            await db.collection("VENTAS_DIRECTAS").doc(saleId).delete();
        } else {
            throw new Error("No hay conexión a la base de datos");
        }
    },

    async loadSales(limit = 500) {
        if (db) {
            const snapshot = await db.collection("VENTAS")
                .orderBy("timestamp", "desc")
                .limit(limit)
                .get();
            
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } else {
            return [];
        }
    },

    async loadDirectSales(limit = 500) {
        if (db) {
            const snapshot = await db.collection("VENTAS_DIRECTAS")
                .orderBy("timestamp", "desc")
                .limit(limit)
                .get();
            
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } else {
            return [];
        }
    },

    async loadSalesByDate(date = DateUtils.getCurrentDateStringElSalvador(), limit = 500) {
        if (db) {
            const snapshot = await db.collection("VENTAS")
                .where("date", "==", date)
                .orderBy("timestamp", "desc")
                .limit(limit)
                .get();
            
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } else {
            return [];
        }
    },

    async addAbono(invoiceId, abonoData) {
        if (db) {
            const ventaRef = db.collection("VENTAS").doc(invoiceId);
            
            const ventaDoc = await ventaRef.get();
            if (!ventaDoc.exists) {
                throw new Error("No se encontró la venta");
            }
            
            const venta = ventaDoc.data();
            
            const nuevoSaldo = (venta.saldoPendiente || venta.total) - abonoData.monto;
            
            if (nuevoSaldo < 0) {
                throw new Error("El monto del abono no puede ser mayor al saldo pendiente");
            }
            
            await ventaRef.update({
                abonos: db.FieldValue.arrayUnion(abonoData),
                saldoPendiente: nuevoSaldo
            });
            
            if (nuevoSaldo <= 0) {
                await ventaRef.update({
                    paymentType: 'contado',
                    status: 'pagado'
                });
            }
            
            return true;
        } else {
            throw new Error("No hay conexión a la base de datos");
        }
    },

    async getSaleById(invoiceId) {
        if (db) {
            const doc = await db.collection("VENTAS").doc(invoiceId).get();
            if (doc.exists) {
                return { id: doc.id, ...doc.data() };
            }
            return null;
        } else {
            throw new Error("No hay conexión a la base de datos");
        }
    },

    async getDirectSaleById(invoiceId) {
        if (db) {
            const doc = await db.collection("VENTAS_DIRECTAS").doc(invoiceId).get();
            if (doc.exists) {
                return { id: doc.id, ...doc.data() };
            }
            return null;
        } else {
            throw new Error("No hay conexión a la base de datos");
        }
    },

    async cancelInvoice(invoiceId) {
        if (db) {
            const ventaRef = db.collection("VENTAS").doc(invoiceId);
            
            await ventaRef.update({
                paymentType: 'contado',
                status: 'pagado',
                saldoPendiente: 0,
                cancelada: true,
                fechaCancelacion: new Date()
            });
        } else {
            throw new Error("No hay conexión a la base de datos");
        }
    },

    async saveRetiro(retiroData) {
        if (db) {
            const docRef = await db.collection("RETIROS").add(retiroData);
            return docRef.id;
        } else {
            throw new Error("No hay conexión a la base de datos");
        }
    },

    async loadRetiros(limit = 500) {
        if (db) {
            const snapshot = await db.collection("RETIROS")
                .orderBy("timestamp", "desc")
                .limit(limit)
                .get();
            
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } else {
            return [];
        }
    },

    async loadAllMovements(limit = 500) {
        const [ventas, ventasDirectas, retiros] = await Promise.all([
            this.loadSales(limit),
            this.loadDirectSales(limit),
            this.loadRetiros(limit)
        ]);
        
        const allMovements = [
            ...ventas.map(v => ({ ...v, tipo: 'venta', subtipo: 'equipo' })),
            ...ventasDirectas.map(v => ({ ...v, tipo: 'venta', subtipo: 'directa' })),
            ...retiros.map(r => ({ ...r, tipo: 'retiro' }))
        ];
        
        return allMovements.sort((a, b) => {
            const dateA = a.timestamp?.toDate ? a.timestamp.toDate() : a.timestamp;
            const dateB = b.timestamp?.toDate ? b.timestamp.toDate() : b.timestamp;
            return dateB - dateA;
        }).slice(0, limit);
    }
};