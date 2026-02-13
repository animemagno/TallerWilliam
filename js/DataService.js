const DataService = {
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
        // CORRECCIÓN 6: Usar lock para prevenir concurrencia
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

    async loadSales(limit = 10000) {
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

    async searchSalesByEquipo(equipoNumber) {
        try {
            if (AppState.firebaseInitialized) {
                const equipoStr = String(equipoNumber).trim();
                if (!equipoStr) return [];

                let results = [];

                // 1. Búsqueda como String (sin orderBy para evitar requerir índice compuesto)
                // Firestore indexa automáticamente campos individuales
                let snapshot = await AppState.db.collection("VENTAS")
                    .where("equipoNumber", "==", equipoStr)
                    .limit(2000)
                    .get();

                if (!snapshot.empty) {
                    snapshot.forEach(doc => results.push({ id: doc.id, ...doc.data() }));
                }

                // 2. Si no hay resultados y es numérico, intentar búsqueda como Number
                // (Para compatibilidad con registros antiguos que pudieron guardarse como números)
                if (results.length === 0 && !isNaN(equipoStr)) {
                    const equipoNum = Number(equipoStr);
                    snapshot = await AppState.db.collection("VENTAS")
                        .where("equipoNumber", "==", equipoNum)
                        .limit(50)
                        .get();

                    if (!snapshot.empty) {
                        snapshot.forEach(doc => results.push({ id: doc.id, ...doc.data() }));
                    }
                }

                // 3. Ordenar resultados en memoria (más rápido y sin requerir índice complejo)
                results.sort((a, b) => {
                    const timeA = a.timestamp ? (a.timestamp.seconds || 0) : 0;
                    const timeB = b.timestamp ? (b.timestamp.seconds || 0) : 0;
                    return timeB - timeA; // Descendente (más reciente primero)
                });

                return results;
            } else {
                return [];
            }
        } catch (error) {
            console.error("Error buscando ventas por equipo:", error);
            UIService.showStatus("Error buscando equipo: " + error.message, "error");
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

                const nuevoSaldo = (venta.saldoPendiente !== undefined ? venta.saldoPendiente : venta.total) - abonoData.monto;

                if (nuevoSaldo < 0) {
                    throw new Error("El monto del abono no puede ser mayor al saldo pendiente");
                }

                let abonoDateString;
                if (abonoData.fechaString) {
                    const datePart = abonoData.fechaString.split(',')[0].trim();
                    const parts = datePart.split('/');
                    if (parts.length === 3) {
                        const day = parts[0].padStart(2, '0');
                        const month = parts[1].padStart(2, '0');
                        const year = parts[2];
                        abonoDateString = `${year}-${month}-${day}`;
                    } else {
                        abonoDateString = DateUtils.getCurrentDateStringElSalvador();
                    }
                } else {
                    abonoDateString = DateUtils.getCurrentDateStringElSalvador();
                }

                // CORRECCIÓN CRÍTICA: Generar un ID único para poder identificar y eliminar el abono después
                const abonoId = 'abono_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);

                // CORRECCIÓN CRÍTICA: Para el array de abonos, usar Date normal en vez de serverTimestamp()
                // porque Firebase NO permite serverTimestamp() dentro de arrayUnion()
                const abonoParaArray = {
                    _id: abonoId,
                    monto: abonoData.monto,
                    fecha: new Date(),  // Fecha local real, NO serverTimestamp()
                    fechaString: abonoData.fechaString || (new Date()).toLocaleString('es-ES'),
                    savedInIngresos: true
                };

                // 1. Guardar en colección INGRESOS para que aparezca en historial y caja del día
                const ingresoData = {
                    monto: abonoData.monto,
                    concepto: `Abono a EQUIPO ${venta.equipoNumber || '0000'}`,
                    categoria: 'abono',
                    timestamp: DateUtils.getCurrentTimestampElSalvador(), // serverTimestamp() OK aquí (en add/set)
                    date: abonoDateString,
                    invoiceId: invoiceId,
                    invoiceNumber: venta.invoiceNumber,
                    clientName: venta.clientName || 'Cliente',
                    equipoNumber: venta.equipoNumber || '0000',
                    saldoAnterior: venta.saldoPendiente !== undefined ? venta.saldoPendiente : venta.total,
                    nuevoSaldo: nuevoSaldo,
                    abonoId: abonoId  // Referencia cruzada para poder vincular al eliminar
                };

                await AppState.db.collection("INGRESOS").add(ingresoData);

                // 2. Actualizar venta - arrayUnion con datos limpios (sin serverTimestamp)
                await ErrorHandler.withRetry(
                    () => ventaRef.update({
                        abonos: firebase.firestore.FieldValue.arrayUnion(abonoParaArray),
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

    async deleteAbono(abonoId, invoiceId) {
        return await ConcurrencyManager.withLock(async () => {
            if (AppState.firebaseInitialized) {
                // 1. Obtener el ingreso (abono) para saber el monto
                const ingresoDoc = await AppState.db.collection("INGRESOS").doc(abonoId).get();
                if (!ingresoDoc.exists) {
                    throw new Error("No se encontró el abono");
                }

                const ingresoData = ingresoDoc.data();
                const montoAbono = ingresoData.monto;
                const facturaId = ingresoData.invoiceId || invoiceId;
                const abonoRefId = ingresoData.abonoId; // ID único de referencia cruzada

                // 2. Verificar si la venta existe y actualizarla solo si existe
                if (facturaId) {
                    const ventaRef = AppState.db.collection("VENTAS").doc(facturaId);
                    const ventaDoc = await ventaRef.get();

                    if (ventaDoc.exists) {
                        const venta = ventaDoc.data();
                        const abonosActuales = venta.abonos || [];

                        // 3. Buscar el abono a eliminar del array
                        let abonoEncontrado = false;
                        const nuevosAbonos = abonosActuales.filter(abono => {
                            // Primero intentar por _id único (abonos nuevos)
                            if (abonoRefId && abono._id === abonoRefId) {
                                abonoEncontrado = true;
                                return false; // Eliminar este
                            }
                            // Fallback para abonos viejos (sin _id): comparar por monto y buscar el primero que coincida
                            if (!abonoEncontrado && !abonoRefId && abono.monto === montoAbono) {
                                abonoEncontrado = true;
                                return false; // Eliminar el primero que coincida
                            }
                            return true; // Mantener
                        });

                        // 4. Solo ajustar saldo si realmente se eliminó un abono del array
                        if (abonoEncontrado) {
                            const saldoActual = venta.saldoPendiente !== undefined ? venta.saldoPendiente : 0;
                            const nuevoSaldo = saldoActual + montoAbono;

                            await ErrorHandler.withRetry(
                                () => ventaRef.update({
                                    abonos: nuevosAbonos,
                                    saldoPendiente: nuevoSaldo,
                                    paymentType: nuevoSaldo > 0 ? 'pendiente' : 'contado',
                                    status: nuevoSaldo > 0 ? 'pendiente' : 'pagado',
                                    fechaActualizacion: DateUtils.getCurrentTimestampElSalvador()
                                }),
                                3,
                                "Actualización de venta al eliminar abono"
                            );
                        } else {
                            console.warn("No se encontró el abono en el array de la venta. Solo se eliminará el registro de INGRESOS.");
                        }

                        // 5. Actualizar grupos si aplica
                        await GrupoManager.actualizarDesdeVenta({ ...venta, id: facturaId });
                    }
                }

                // 6. Eliminar el ingreso (siempre, incluso si la factura no existe)
                await ErrorHandler.withRetry(
                    () => AppState.db.collection("INGRESOS").doc(abonoId).delete(),
                    3,
                    "Eliminación de abono"
                );

            } else {
                throw new Error("No hay conexión a la base de datos");
            }
        }, "Eliminar abono");
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

    async loadRetiros(limit = 10000) {
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

    async loadIngresos(limit = 10000) {
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

    // --- HISTORIAL EQUIPO ---
    async getHistorialCompletoEquipo(equipoNum) {
        try {
            const snapshot = await AppState.db.collection("VENTAS")
                .where("equipoNumber", "==", equipoNum)
                .get(); // Sin orderBy para evitar requerir indice compuesto

            const ventas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Ordenar en memoria (descendente por fecha)
            return ventas.sort(DateUtils.sortDescByTimestamp);
        } catch (error) {
            console.error("Error cargando historial de equipo:", error);
            throw error;
        }
    },

    async loadAllMovements(limit = 10000) {
        try {
            const results = await Promise.allSettled([
                this.loadSales(limit),
                this.loadRetiros(limit),
                this.loadIngresos(limit)
            ]);

            const ventas = results[0].status === 'fulfilled' ? results[0].value : [];
            const retiros = results[1].status === 'fulfilled' ? results[1].value : [];
            const ingresos = results[2].status === 'fulfilled' ? results[2].value : [];

            if (results[0].status === 'rejected') console.error("Error loading sales:", results[0].reason);
            if (results[1].status === 'rejected') console.error("Error loading retiros:", results[1].reason);
            if (results[2].status === 'rejected') console.error("Error loading ingresos:", results[2].reason);

            // Si todos fallaron, es un error crítico
            if (results.every(r => r.status === 'rejected')) {
                throw new Error("No se pudieron cargar los datos de movimientos (todos fallaron)");
            }

            const allMovements = [
                ...ventas.map(v => ({ ...v, tipo: 'venta' })),
                ...retiros.map(r => ({ ...r, tipo: 'retiro' })),
                ...ingresos.map(i => ({ ...i, tipo: i.categoria === 'abono' ? 'abono' : 'ingreso' }))
            ];

            return allMovements.sort(DateUtils.sortDescByTimestamp).slice(0, limit);
        } catch (error) {
            console.error("Critical error loading all movements:", error);
            throw error; // Lanzar error para evitar limpiar el historial
        }
    },

    async searchProductInHistory(productName, startDate, endDate) {
        try {
            if (!productName) {
                throw new Error("Ingrese un nombre de producto para buscar");
            }

            const searchTerm = productName.trim().toLowerCase();

            // Cargar ventas en el rango de fechas
            const ventasSnapshot = await AppState.db.collection("VENTAS")
                .where("date", ">=", startDate)
                .where("date", "<=", endDate)
                .get();

            let ventas = ventasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Ordenar client-side
            ventas.sort(DateUtils.sortDescByTimestamp);

            // Filtrar ventas que contengan el producto buscado
            const resultados = [];

            ventas.forEach(venta => {
                if (venta.products && venta.products.length > 0) {
                    const productosEncontrados = venta.products.filter(prod =>
                        prod.descripcion && prod.descripcion.toLowerCase().includes(searchTerm)
                    );

                    if (productosEncontrados.length > 0) {
                        // Agregar resultado con detalles de la venta y productos encontrados
                        resultados.push({
                            ...venta,
                            productosEncontrados
                        });
                    }
                }
            });

            return resultados;
        } catch (error) {
            console.error("Error buscando producto:", error);
            throw error;
        }
    },

    async loadMovementsByDate(date = DateUtils.getCurrentDateStringElSalvador(), limit = 500) {
        try {
            if (!AppState.firebaseInitialized) return [];

            // Cargar en paralelo con Promise.allSettled
            const results = await Promise.allSettled([
                AppState.db.collection("VENTAS").where("date", "==", date).get(),
                AppState.db.collection("RETIROS").where("date", "==", date).get(),
                AppState.db.collection("INGRESOS").where("date", "==", date).get()
            ]);

            const ventasSnap = results[0].status === 'fulfilled' ? results[0].value : { docs: [] };
            const retirosSnap = results[1].status === 'fulfilled' ? results[1].value : { docs: [] };
            const ingresosSnap = results[2].status === 'fulfilled' ? results[2].value : { docs: [] };

            if (results[0].status === 'rejected') console.error("Error loading sales by date:", results[0].reason);
            if (results[1].status === 'rejected') console.error("Error loading retiros by date:", results[1].reason);
            if (results[2].status === 'rejected') console.error("Error loading ingresos by date:", results[2].reason);

            const ventas = ventasSnap.docs.map(doc => ({ id: doc.id, ...doc.data(), tipo: 'venta' }));
            const retiros = retirosSnap.docs.map(doc => ({ id: doc.id, ...doc.data(), tipo: 'retiro' }));
            const ingresos = ingresosSnap.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    tipo: data.categoria === 'abono' ? 'abono' : 'ingreso'
                };
            });

            const allMovements = [...ventas, ...retiros, ...ingresos];

            // Ordenar client-side por timestamp descendente
            return allMovements.sort(DateUtils.sortDescByTimestamp).slice(0, limit);
        } catch (error) {
            console.error("Critical error loading movements by date:", error);
            return [];
        }
    },

    async processGroupAbono(grupoId, montoTotal) {
        return await ConcurrencyManager.withLock(async () => {
            if (!AppState.firebaseInitialized) throw new Error("No hay conexión a la base de datos");

            // 1. Obtener todas las facturas pendientes del grupo
            const snapshot = await AppState.db.collection("VENTAS")
                .where("grupo", "==", grupoId)
                .where("paymentType", "==", "pendiente")
                .where("status", "==", "pendiente")
                .get();

            if (snapshot.empty) throw new Error("El grupo no tiene facturas pendientes");

            let facturas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // 2. Ordenar por fecha (más antiguas primero)
            facturas.sort((a, b) => DateUtils.getTimeMs(a) - DateUtils.getTimeMs(b));

            let montoRestante = montoTotal;
            const batch = AppState.db.batch();
            let updatesCount = 0;
            const facturasAfectadas = [];

            // 3. Distribuir el abono
            for (const factura of facturas) {
                if (montoRestante <= 0.009) break; // Margen de error por decimales

                let saldoPendiente = factura.total;
                if (factura.abonos && factura.abonos.length > 0) {
                    const totalAbonado = factura.abonos.reduce((sum, a) => sum + a.monto, 0);
                    saldoPendiente = factura.total - totalAbonado;
                }

                const montoAbonar = Math.min(montoRestante, saldoPendiente);

                if (montoAbonar > 0) {
                    const facturaRef = AppState.db.collection("VENTAS").doc(factura.id);
                    const nuevoSaldo = saldoPendiente - montoAbonar;

                    // ID único para referencia cruzada
                    const abonoId = 'abono_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);

                    // Datos para el array de abonos (sin serverTimestamp)
                    const abonoData = {
                        _id: abonoId,
                        monto: montoAbonar,
                        fecha: new Date(),
                        fechaString: new Date().toLocaleString('es-ES'),
                        tipo: 'abono_grupal',
                        grupoId: grupoId,
                        savedInIngresos: true
                    };

                    // Guardar en INGRESOS (serverTimestamp OK aquí)
                    const ingresoRef = AppState.db.collection("INGRESOS").doc();
                    const ingresoData = {
                        monto: montoAbonar,
                        concepto: `Abono Grupal a EQUIPO ${factura.equipoNumber || '0000'}`,
                        categoria: 'abono',
                        timestamp: DateUtils.getCurrentTimestampElSalvador(),
                        date: DateUtils.getCurrentDateStringElSalvador(),
                        invoiceId: factura.id,
                        invoiceNumber: factura.invoiceNumber,
                        clientName: factura.clientName || 'Cliente',
                        equipoNumber: factura.equipoNumber || '0000',
                        grupoId: grupoId,
                        abonoId: abonoId
                    };
                    batch.set(ingresoRef, ingresoData);

                    const updateData = {
                        abonos: firebase.firestore.FieldValue.arrayUnion(abonoData),
                        saldoPendiente: nuevoSaldo,
                        fechaActualizacion: DateUtils.getCurrentTimestampElSalvador()
                    };

                    if (nuevoSaldo <= 0.009) {
                        updateData.paymentType = 'contado';
                        updateData.status = 'pagado';
                    }

                    batch.update(facturaRef, updateData);
                    updatesCount++;

                    montoRestante -= montoAbonar;
                    facturasAfectadas.push({ ...factura, abono: montoAbonar });
                }
            }

            if (updatesCount > 0) {
                await batch.commit();
                await GrupoManager.loadEquiposPendientes(); // Recargar datos
                return facturasAfectadas;
            } else {
                throw new Error("No se pudo aplicar el abono a ninguna factura");
            }
        }, "Abono Grupal");
    },

    async processMultiAbono(facturasIds, montoTotal) {
        return await ConcurrencyManager.withLock(async () => {
            if (!AppState.firebaseInitialized) throw new Error("No hay conexión a la base de datos");

            // 1. Obtener las facturas
            const facturas = [];
            for (const id of facturasIds) {
                const doc = await AppState.db.collection("VENTAS").doc(id).get();
                if (doc.exists) {
                    facturas.push({ id: doc.id, ...doc.data() });
                }
            }

            if (facturas.length === 0) throw new Error("No se encontraron las facturas seleccionadas");

            // 2. Ordenar por fecha (más antiguas primero)
            facturas.sort((a, b) => DateUtils.getTimeMs(a) - DateUtils.getTimeMs(b));

            let montoRestante = montoTotal;
            const batch = AppState.db.batch();
            let updatesCount = 0;
            const facturasAfectadas = [];

            // 3. Distribuir el abono
            for (const factura of facturas) {
                if (montoRestante <= 0.009) break;

                let saldoPendiente = factura.total;
                if (factura.abonos && factura.abonos.length > 0) {
                    const totalAbonado = factura.abonos.reduce((sum, a) => sum + a.monto, 0);
                    saldoPendiente = factura.total - totalAbonado;
                }

                const montoAbonar = Math.min(montoRestante, saldoPendiente);

                if (montoAbonar > 0) {
                    const facturaRef = AppState.db.collection("VENTAS").doc(factura.id);
                    const nuevoSaldo = saldoPendiente - montoAbonar;

                    // ID único para referencia cruzada
                    const abonoId = 'abono_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);

                    // Datos para el array de abonos (sin serverTimestamp)
                    const abonoData = {
                        _id: abonoId,
                        monto: montoAbonar,
                        fecha: new Date(),
                        fechaString: new Date().toLocaleString('es-ES'),
                        tipo: 'abono_masivo',
                        savedInIngresos: true
                    };

                    // Guardar en INGRESOS (serverTimestamp OK aquí)
                    const ingresoRef = AppState.db.collection("INGRESOS").doc();
                    const ingresoData = {
                        monto: montoAbonar,
                        concepto: `Abono Masivo a Factura #${factura.invoiceNumber}`,
                        categoria: 'abono',
                        timestamp: DateUtils.getCurrentTimestampElSalvador(),
                        date: DateUtils.getCurrentDateStringElSalvador(),
                        invoiceId: factura.id,
                        invoiceNumber: factura.invoiceNumber,
                        clientName: factura.clientName || 'Cliente',
                        equipoNumber: factura.equipoNumber || '0000',
                        abonoId: abonoId
                    };
                    batch.set(ingresoRef, ingresoData);

                    const updateData = {
                        abonos: firebase.firestore.FieldValue.arrayUnion(abonoData),
                        saldoPendiente: nuevoSaldo,
                        fechaActualizacion: DateUtils.getCurrentTimestampElSalvador()
                    };

                    if (nuevoSaldo <= 0.009) {
                        updateData.paymentType = 'contado';
                        updateData.status = 'pagado';
                    }

                    batch.update(facturaRef, updateData);
                    updatesCount++;

                    montoRestante -= montoAbonar;
                    facturasAfectadas.push({ ...factura, abono: montoAbonar });
                }
            }

            if (updatesCount > 0) {
                await batch.commit();
                await GrupoManager.loadEquiposPendientes();
                return facturasAfectadas;
            } else {
                throw new Error("No se pudo aplicar el abono a ninguna factura");
            }
        }, "Abono Masivo");
    },

    async exportBackup() {
        try {
            const ventas = await this.loadSales(10000); // Limit high enough to get all
            const retiros = await this.loadRetiros(10000);
            const grupos = Array.from(GrupoManager.grupos.entries());

            const backupData = {
                version: '1.0',
                timestamp: new Date().toISOString(),
                ventas: ventas,
                retiros: retiros,
                grupos: grupos
            };

            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData));
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", dataStr);
            downloadAnchorNode.setAttribute("download", "taller_willian_backup_" + DateUtils.getCurrentDateStringElSalvador() + ".json");
            document.body.appendChild(downloadAnchorNode); // required for firefox
            downloadAnchorNode.click();
            downloadAnchorNode.remove();

            return true;
        } catch (error) {
            console.error("Error exportando backup:", error);
            throw error;
        }
    },

    async checkConnection() {
        try {
            await AppState.db.collection("COUNTERS").doc("sales").get({ source: 'server' });
            return true;
        } catch (error) {
            return false;
        }
    },

    // HERRAMIENTA DE REPARACIÓN: Recalcular saldos de un equipo específico
    async repararSaldosEquipo(equipoNumber) {
        try {
            console.log(`=== REPARACIÓN DE SALDOS: Equipo ${equipoNumber} ===`);

            // 1. Buscar todas las facturas pendientes del equipo
            const snapshot = await AppState.db.collection("VENTAS")
                .where("equipoNumber", "==", String(equipoNumber))
                .get();

            if (snapshot.empty) {
                console.log("No se encontraron facturas para este equipo.");
                return { reparadas: 0 };
            }

            let reparadas = 0;
            const detalles = [];

            for (const doc of snapshot.docs) {
                const venta = doc.data();

                // Ignorar canceladas
                if (venta.cancelada || venta.status === 'cancelado') continue;

                const total = venta.total || 0;
                const abonos = venta.abonos || [];
                const totalAbonado = abonos.reduce((sum, a) => sum + (a.monto || 0), 0);
                const saldoCorrecto = Math.max(0, total - totalAbonado);
                const saldoActual = venta.saldoPendiente !== undefined ? venta.saldoPendiente : total;

                const diferencia = Math.abs(saldoActual - saldoCorrecto);

                if (diferencia > 0.01) { // Hay discrepancia
                    console.log(`  Factura #${venta.invoiceNumber}: Saldo actual=$${saldoActual.toFixed(2)}, Correcto=$${saldoCorrecto.toFixed(2)} (Total=$${total.toFixed(2)}, Abonos=$${totalAbonado.toFixed(2)}, ${abonos.length} abonos en array)`);

                    // Corregir
                    const updateData = {
                        saldoPendiente: saldoCorrecto,
                        fechaActualizacion: DateUtils.getCurrentTimestampElSalvador()
                    };

                    if (saldoCorrecto <= 0) {
                        updateData.paymentType = 'contado';
                        updateData.status = 'pagado';
                    } else {
                        updateData.paymentType = 'pendiente';
                        updateData.status = 'pendiente';
                    }

                    await doc.ref.update(updateData);
                    reparadas++;
                    detalles.push({
                        factura: venta.invoiceNumber,
                        saldoAnterior: saldoActual,
                        saldoCorregido: saldoCorrecto,
                        abonos: abonos.length,
                        totalAbonado: totalAbonado
                    });
                } else {
                    console.log(`  Factura #${venta.invoiceNumber}: OK (Saldo=$${saldoActual.toFixed(2)})`);
                }
            }

            console.log(`=== REPARACIÓN COMPLETA: ${reparadas} facturas corregidas ===`);

            if (reparadas > 0) {
                // Recargar UI
                await GrupoManager.loadEquiposPendientes(true);
                GrupoManager.updateUI();
                UIService.showStatus(`Saldos del Equipo ${equipoNumber} reparados: ${reparadas} facturas corregidas`, "success");
            } else {
                UIService.showStatus(`Equipo ${equipoNumber}: Todos los saldos están correctos`, "success");
            }

            return { reparadas, detalles };
        } catch (error) {
            console.error("Error reparando saldos:", error);
            UIService.showStatus("Error reparando saldos: " + error.message, "error");
            throw error;
        }
    }
};
