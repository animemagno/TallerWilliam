import { AppState } from '../store/AppState.js';
import { ErrorHandler } from '../utils/ErrorHandler.js';
import { DateUtils } from '../utils/DateUtils.js';
import { ConcurrencyManager } from '../utils/ConcurrencyManager.js';
import { ProductCache } from './ProductCache.js';
import { UIService, ModalService } from './UIService.js';

import { GrupoManager } from '../modules/GrupoManager.js';

export const DataService = {
    async searchProducts(query) {
        if (!AppState.firebaseInitialized) {
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
        return await ConcurrencyManager.withLock(async () => {
            if (AppState.firebaseInitialized) {
                const existingInvoice = await this.checkInvoiceExists(saleData.invoiceNumber);
                if (existingInvoice) {
                    throw new Error(`La factura ${saleData.invoiceNumber} ya existe`);
                }

                const docRef = await ErrorHandler.withRetry(
                    () => AppState.db.collection("VENTAS").add(saleData),
                    3,
                    "Guardado de venta"
                );

                await this.updateSaleCounter(saleData.date);

                if (saleData.paymentType === 'pendiente') {
                    await GrupoManager.actualizarDesdeVenta(saleData);
                }

                return docRef.id;
            } else {
                throw new Error("No hay conexión a la base de datos");
            }
        }, "Guardar venta");
    },

    async checkInvoiceExists(invoiceNumber) {
        try {
            const exists = await ErrorHandler.withTimeout(
                AppState.db.collection("VENTAS")
                    .where("invoiceNumber", "==", invoiceNumber)
                    .limit(1)
                    .get(),
                5000,
                "Verificación de factura única"
            );
            return !exists.empty;
        } catch (error) {
            console.error("Error verificando factura duplicada:", error);
            return false;
        }
    },



    async updateSaleCounter(date = DateUtils.getCurrentDateStringElSalvador()) {
        try {
            const counterRef = AppState.db.collection("COUNTERS").doc("sales");
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
            const counterRef = AppState.db.collection("COUNTERS").doc("sales");
            const doc = await counterRef.get();

            if (doc.exists) {
                return doc.data()[date] || 0;
            }
            return 0;
        } catch (error) {
            console.error("Error obteniendo contador, usando fallback:", error);
            const snapshot = await AppState.db.collection("VENTAS")
                .where("date", "==", date)
                .get();
            return snapshot.size;
        }
    },

    async updateSale(saleId, saleData) {
        return await ConcurrencyManager.withLock(async () => {
            if (AppState.firebaseInitialized) {
                await ErrorHandler.withRetry(
                    () => AppState.db.collection("VENTAS").doc(saleId).update(saleData),
                    3,
                    "Actualización de venta"
                );

                if (saleData.paymentType === 'pendiente') {
                    await GrupoManager.actualizarDesdeVenta({ ...saleData, id: saleId });
                }
            } else {
                throw new Error("No hay conexión a la base de datos");
            }
        }, "Actualizar venta");
    },

    async deleteSale(saleId) {
        return await ConcurrencyManager.withLock(async () => {
            if (AppState.firebaseInitialized) {
                await ErrorHandler.withRetry(
                    () => AppState.db.collection("VENTAS").doc(saleId).delete(),
                    3,
                    "Eliminación de venta"
                );
            } else {
                throw new Error("No hay conexión a la base de datos");
            }
        }, "Eliminar venta");
    },

    async loadSales(limit = 500) {
        try {
            if (AppState.firebaseInitialized) {
                const snapshot = await ErrorHandler.withTimeout(
                    AppState.db.collection("VENTAS")
                        .orderBy("timestamp", "desc")
                        .limit(limit)
                        .get(),
                    10000,
                    "Carga de ventas"
                );

                return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            } else {
                return [];
            }
        } catch (error) {
            console.error("Error cargando ventas:", error);
            return [];
        }
    },

    async loadSalesByDate(date = DateUtils.getCurrentDateStringElSalvador(), limit = 500) {
        try {
            if (AppState.firebaseInitialized) {
                const snapshot = await ErrorHandler.withTimeout(
                    AppState.db.collection("VENTAS")
                        .where("date", "==", date)
                        .orderBy("timestamp", "desc")
                        .limit(limit)
                        .get(),
                    10000,
                    "Carga de ventas por fecha"
                );

                return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            } else {
                return [];
            }
        } catch (error) {
            console.error("Error cargando ventas por fecha:", error);
            return [];
        }
    },

    async addAbono(invoiceId, abonoData) {
        return await ConcurrencyManager.withLock(async () => {
            if (AppState.firebaseInitialized) {
                const ventaRef = AppState.db.collection("VENTAS").doc(invoiceId);

                const ventaDoc = await ventaRef.get();
                if (!ventaDoc.exists) {
                    throw new Error("No se encontró la venta");
                }

                const venta = ventaDoc.data();

                const nuevoSaldo = (venta.saldoPendiente || venta.total) - abonoData.monto;

                if (nuevoSaldo < 0) {
                    throw new Error("El monto del abono no puede ser mayor al saldo pendiente");
                }

                const abonoDateString = abonoData.fechaString ? abonoData.fechaString.split(',')[0].trim().split('/').reverse().join('-') : DateUtils.getCurrentDateStringElSalvador();

                // 1. Guardar en colección INGRESOS
                const ingresoData = {
                    monto: abonoData.monto,
                    concepto: `Abono a Factura #${venta.invoiceNumber}`,
                    categoria: 'abono',
                    timestamp: abonoData.fecha || DateUtils.getCurrentTimestampElSalvador(),
                    date: abonoDateString,
                    invoiceId: invoiceId,
                    invoiceNumber: venta.invoiceNumber,
                    clientName: venta.clientName || 'Cliente',
                    equipoNumber: venta.equipoNumber || '0000'
                };

                await AppState.db.collection("INGRESOS").add(ingresoData);

                // 2. Actualizar venta
                await ErrorHandler.withRetry(
                    () => ventaRef.update({
                        abonos: firebase.firestore.FieldValue.arrayUnion({
                            ...abonoData,
                            savedInIngresos: true
                        }),
                        saldoPendiente: nuevoSaldo,
                        fechaActualizacion: DateUtils.getCurrentTimestampElSalvador()
                    }),
                    3,
                    "Registro de abono"
                );

                if (nuevoSaldo <= 0) {
                    await ventaRef.update({
                        paymentType: 'contado',
                        status: 'pagado'
                    });
                }

                await GrupoManager.actualizarDesdeVenta(venta);
            } else {
                throw new Error("No hay conexión a la base de datos");
            }
        }, "Registrar abono");
    },

    async getSaleById(invoiceId) {
        try {
            if (AppState.firebaseInitialized) {
                const doc = await ErrorHandler.withTimeout(
                    AppState.db.collection("VENTAS").doc(invoiceId).get(),
                    5000,
                    "Carga de venta por ID"
                );
                if (doc.exists) {
                    return { id: doc.id, ...doc.data() };
                }
                return null;
            } else {
                throw new Error("No hay conexión a la base de datos");
            }
        } catch (error) {
            console.error("Error obteniendo venta por ID:", error);
            return null;
        }
    },

    async processRetiro() {
        const concepto = document.getElementById('concepto-retiro').value.trim();
        const monto = parseFloat(document.getElementById('monto-retiro').value);
        const categoria = document.getElementById('categoria-retiro').value;

        if (!concepto) {
            UIService.showStatus("Por favor ingresa un concepto", "warning");
            return;
        }
        if (!monto || monto <= 0) {
            UIService.showStatus("Por favor ingresa un monto válido", "warning");
            return;
        }

        try {
            UIService.showLoading(true);
            await this.saveRetiro({
                concepto,
                monto,
                categoria,
                timestamp: new Date(),
                date: DateUtils.getCurrentDateStringElSalvador()
            });

            ModalService.closeRetiroModal();
            UIService.showStatus("Retiro registrado correctamente", "success");

            // Recargar historial si es necesario (se implementará en el controlador de la vista)
        } catch (error) {
            UIService.showStatus("Error al registrar retiro: " + error.message, "error");
        } finally {
            UIService.showLoading(false);
        }
    },

    async cancelInvoice(invoiceId) {
        return await ConcurrencyManager.withLock(async () => {
            if (AppState.firebaseInitialized) {
                const ventaRef = AppState.db.collection("VENTAS").doc(invoiceId);

                await ErrorHandler.withRetry(
                    () => ventaRef.update({
                        paymentType: 'contado',
                        status: 'pagado',
                        saldoPendiente: 0,
                        cancelada: true,
                        fechaCancelacion: new Date(),
                        fechaActualizacion: DateUtils.getCurrentTimestampElSalvador()
                    }),
                    3,
                    "Cancelación de factura"
                );

                const venta = await this.getSaleById(invoiceId);
                if (venta) {
                    await GrupoManager.actualizarDesdeVenta(venta);
                }
            } else {
                throw new Error("No hay conexión a la base de datos");
            }
        }, "Cancelar factura");
    },

    async saveRetiro(retiroData) {
        return await ConcurrencyManager.withLock(async () => {
            if (AppState.firebaseInitialized) {
                const docRef = await ErrorHandler.withRetry(
                    () => AppState.db.collection("RETIROS").add(retiroData),
                    3,
                    "Guardado de retiro"
                );
                return docRef.id;
            } else {
                throw new Error("No hay conexión a la base de datos");
            }
        }, "Guardar retiro");
    },

    async loadRetiros(limit = 500) {
        try {
            if (AppState.firebaseInitialized) {
                const snapshot = await ErrorHandler.withTimeout(
                    AppState.db.collection("RETIROS")
                        .orderBy("timestamp", "desc")
                        .limit(limit)
                        .get(),
                    10000,
                    "Carga de retiros"
                );

                return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            } else {
                return [];
            }
        } catch (error) {
            console.error("Error cargando retiros:", error);
            return [];
        }
    },

    async loadRetirosByDate(date = DateUtils.getCurrentDateStringElSalvador(), limit = 500) {
        try {
            if (AppState.firebaseInitialized) {
                const snapshot = await ErrorHandler.withTimeout(
                    AppState.db.collection("RETIROS")
                        .where("date", "==", date)
                        .orderBy("timestamp", "desc")
                        .limit(limit)
                        .get(),
                    10000,
                    "Carga de retiros por fecha"
                );

                return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            } else {
                return [];
            }
        } catch (error) {
            console.error("Error cargando retiros por fecha:", error);
            return [];
        }
    },

    async saveIngreso(ingresoData) {
        return await ConcurrencyManager.withLock(async () => {
            if (AppState.firebaseInitialized) {
                const docRef = await ErrorHandler.withRetry(
                    () => AppState.db.collection("INGRESOS").add(ingresoData),
                    3,
                    "Guardado de ingreso"
                );
                return docRef.id;
            } else {
                throw new Error("No hay conexión a la base de datos");
            }
        }, "Guardar ingreso");
    },

    async loadIngresos(limit = 500) {
        try {
            if (AppState.firebaseInitialized) {
                const snapshot = await ErrorHandler.withTimeout(
                    AppState.db.collection("INGRESOS")
                        .orderBy("timestamp", "desc")
                        .limit(limit)
                        .get(),
                    10000,
                    "Carga de ingresos"
                );

                return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            } else {
                return [];
            }
        } catch (error) {
            console.error("Error cargando ingresos:", error);
            return [];
        }
    },

    async loadIngresosByDate(date = DateUtils.getCurrentDateStringElSalvador(), limit = 500) {
        try {
            if (AppState.firebaseInitialized) {
                const snapshot = await ErrorHandler.withTimeout(
                    AppState.db.collection("INGRESOS")
                        .where("date", "==", date)
                        .orderBy("timestamp", "desc")
                        .limit(limit)
                        .get(),
                    10000,
                    "Carga de ingresos por fecha"
                );

                return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            } else {
                return [];
            }
        } catch (error) {
            console.error("Error cargando ingresos por fecha:", error);
            return [];
        }
    },

    async loadAllMovements(limit = 500) {
        try {
            const [ventas, retiros, ingresos] = await Promise.all([
                this.loadSales(limit),
                this.loadRetiros(limit),
                this.loadIngresos(limit)
            ]);

            const allMovements = [
                ...ventas.map(v => ({ ...v, tipo: 'venta' })),
                ...retiros.map(r => ({ ...r, tipo: 'retiro' })),
                ...ingresos.map(i => ({ ...i, tipo: 'ingreso' }))
            ];

            return allMovements.sort((a, b) => {
                const dateA = a.timestamp?.toDate ? a.timestamp.toDate() : a.timestamp;
                const dateB = b.timestamp?.toDate ? b.timestamp.toDate() : b.timestamp;
                return dateB - dateA;
            }).slice(0, limit);
        } catch (error) {
            console.error("Error cargando todos los movimientos:", error);
            return [];
        }
    },
    async getSalesByGroup(grupoId) {
        try {
            if (AppState.firebaseInitialized) {
                const snapshot = await ErrorHandler.withTimeout(
                    AppState.db.collection("VENTAS")
                        .where("grupo", "==", grupoId)
                        .where("paymentType", "==", "pendiente")
                        .where("status", "==", "pendiente")
                        .get(),
                    10000,
                    "Carga de ventas por grupo"
                );
                return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            }
            return [];
        } catch (error) {
            console.error("Error cargando ventas por grupo:", error);
            return [];
        }
    }
};
