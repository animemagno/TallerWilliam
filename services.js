// Configuración global
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

// Utilidades de Fecha
const DateUtils = {
    getCurrentDateElSalvador() {
        const now = new Date();
        const offset = -6 * 60;
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

    isFutureDateInElSalvador(dateString) {
        const selectedDate = this.createDateFromStringElSalvador(dateString);
        const today = this.getCurrentDateElSalvador();
        const selectedDateOnly = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
        const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        return selectedDateOnly > todayOnly;
    },

    getCurrentTimestampElSalvador() {
        return this.getCurrentDateElSalvador();
    }
};

// Gestor de Conexión
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
                await AppState.db.collection("VENTAS").limit(1).get();
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
            statusElement.textContent = "🔴 SIN CONEXIÓN";
            statusElement.className = "connection-status offline";
        }
        statusElement.style.display = 'block';
    }
};

// Cache de Productos
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
            if (!AppState.firebaseInitialized) return;
            
            const snapshot = await AppState.db.collection("INVENTARIO").get();
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

// Gestor de Grupos
const GrupoManager = {
    grupos: new Map(),
    equiposPendientes: new Map(),
    currentEditingGroup: null,
    currentGrupoDetalle: null,
    unsubscribe: null,
    
    async initialize() {
        await this.loadGrupos();
        await this.loadEquiposPendientes();
        this.setupRealTimeListener();
        this.updateUI();
    },

    setupRealTimeListener() {
        if (!AppState.firebaseInitialized) return;
        
        this.unsubscribe = AppState.db.collection("VENTAS")
            .where("paymentType", "==", "pendiente")
            .where("status", "==", "pendiente")
            .onSnapshot(async (snapshot) => {
                await this.loadEquiposPendientes();
                await this.actualizarTotalesGrupos();
                this.updateUI();
            }, (error) => {
                console.error("Error en listener tiempo real:", error);
            });
    },
    
    async loadGrupos() {
        try {
            if (!AppState.firebaseInitialized) return;
            
            const snapshot = await AppState.db.collection("GRUPOS").get();
            this.grupos.clear();
            snapshot.forEach(doc => {
                this.grupos.set(doc.id, { id: doc.id, ...doc.data() });
            });
            
            await this.actualizarTotalesGrupos();
            
        } catch (error) {
            console.error("Error cargando grupos:", error);
        }
    },
    
    async actualizarTotalesGrupos() {
        try {
            for (const [grupoId, grupo] of this.grupos.entries()) {
                let nuevoTotal = 0;
                
                for (const equipoNum of grupo.equipos) {
                    let equipoEncontrado = null;
                    this.equiposPendientes.forEach((equipo, key) => {
                        if (equipo.numero === equipoNum && equipo.total > 0) {
                            equipoEncontrado = equipo;
                        }
                    });
                    
                    if (equipoEncontrado) {
                        nuevoTotal += equipoEncontrado.total;
                    }
                }
                
                if (grupo.total !== nuevoTotal) {
                    grupo.total = nuevoTotal;
                    
                    if (AppState.firebaseInitialized) {
                        try {
                            await AppState.db.collection("GRUPOS").doc(grupoId).update({
                                total: nuevoTotal,
                                fechaActualizacion: new Date()
                            });
                        } catch (error) {
                            console.error(`Error actualizando grupo ${grupo.nombre}:`, error);
                        }
                    }
                }
            }
            
        } catch (error) {
            console.error("Error actualizando totales de grupos:", error);
        }
    },
    
    async loadEquiposPendientes() {
        try {
            if (!AppState.firebaseInitialized) return;
            
            const snapshot = await AppState.db.collection("VENTAS")
                .where("paymentType", "==", "pendiente")
                .where("status", "==", "pendiente")
                .get();
            
            this.equiposPendientes.clear();
            
            snapshot.forEach(doc => {
                const venta = doc.data();
                const equipo = venta.equipoNumber;
                const cliente = venta.clientName || '';
                
                let saldoPendiente = venta.total || 0;
                if (venta.abonos && venta.abonos.length > 0) {
                    const totalAbonado = venta.abonos.reduce((sum, abono) => sum + abono.monto, 0);
                    saldoPendiente = venta.total - totalAbonado;
                }
                
                if (equipo && saldoPendiente > 0) {
                    const key = `${equipo}-${cliente}`;
                    
                    if (!this.equiposPendientes.has(key)) {
                        this.equiposPendientes.set(key, {
                            numero: equipo,
                            cliente: cliente,
                            total: 0,
                            facturas: []
                        });
                    }
                    
                    const equipoData = this.equiposPendientes.get(key);
                    equipoData.facturas.push({
                        id: doc.id,
                        ...venta,
                        saldoPendiente: saldoPendiente
                    });
                    equipoData.total += saldoPendiente;
                }
            });
            
            await this.actualizarTotalesGrupos();
            
        } catch (error) {
            console.error("Error cargando equipos pendientes:", error);
        }
    },
    
    async crearGrupo(nombre, equiposSeleccionados) {
        try {
            if (!AppState.firebaseInitialized) return;
            
            const equiposConFacturas = equiposSeleccionados.filter(equipoNum => {
                let tieneFacturas = false;
                this.equiposPendientes.forEach((equipo, key) => {
                    if (equipo.numero === equipoNum && equipo.total > 0) {
                        tieneFacturas = true;
                    }
                });
                return tieneFacturas;
            });
            
            if (equiposConFacturas.length === 0) {
                throw new Error("Los equipos seleccionados no tienen facturas pendientes");
            }
            
            let totalGrupo = 0;
            equiposConFacturas.forEach(equipoNum => {
                this.equiposPendientes.forEach((equipo, key) => {
                    if (equipo.numero === equipoNum) {
                        totalGrupo += equipo.total;
                    }
                });
            });
            
            const grupoData = {
                nombre: nombre,
                equipos: equiposConFacturas,
                total: totalGrupo,
                fechaCreacion: new Date(),
                activo: true
            };
            
            const docRef = await AppState.db.collection("GRUPOS").add(grupoData);
            grupoData.id = docRef.id;
            this.grupos.set(docRef.id, grupoData);
            
            for (const equipoNum of equiposConFacturas) {
                this.equiposPendientes.forEach(async (equipo, key) => {
                    if (equipo.numero === equipoNum) {
                        for (const factura of equipo.facturas) {
                            await AppState.db.collection("VENTAS").doc(factura.id).update({
                                grupo: docRef.id,
                                grupoNombre: nombre
                            });
                        }
                    }
                });
            }
            
            await this.loadEquiposPendientes();
            await this.actualizarTotalesGrupos();
            this.updateUI();
            
            return docRef.id;
        } catch (error) {
            console.error("Error creando grupo:", error);
            throw error;
        }
    },

    async actualizarGrupo(grupoId, nombre, equiposSeleccionados) {
        try {
            if (!AppState.firebaseInitialized) return;
            
            const equiposConFacturas = equiposSeleccionados.filter(equipoNum => {
                let tieneFacturas = false;
                this.equiposPendientes.forEach((equipo, key) => {
                    if (equipo.numero === equipoNum && equipo.total > 0) {
                        tieneFacturas = true;
                    }
                });
                return tieneFacturas;
            });
            
            let totalGrupo = 0;
            equiposConFacturas.forEach(equipoNum => {
                this.equiposPendientes.forEach((equipo, key) => {
                    if (equipo.numero === equipoNum) {
                        totalGrupo += equipo.total;
                    }
                });
            });
            
            const grupoData = {
                nombre: nombre,
                equipos: equiposConFacturas,
                total: totalGrupo,
                fechaActualizacion: new Date()
            };
            
            await AppState.db.collection("GRUPOS").doc(grupoId).update(grupoData);
            
            const grupoExistente = this.grupos.get(grupoId);
            if (grupoExistente) {
                Object.assign(grupoExistente, grupoData);
            }
            
            for (const equipoNum of equiposConFacturas) {
                this.equiposPendientes.forEach(async (equipo, key) => {
                    if (equipo.numero === equipoNum) {
                        for (const factura of equipo.facturas) {
                            await AppState.db.collection("VENTAS").doc(factura.id).update({
                                grupo: grupoId,
                                grupoNombre: nombre
                            });
                        }
                    }
                });
            }
            
            const grupoOriginal = this.grupos.get(grupoId);
            if (grupoOriginal) {
                for (const equipoNum of grupoOriginal.equipos) {
                    if (!equiposConFacturas.includes(equipoNum)) {
                        this.equiposPendientes.forEach(async (equipo, key) => {
                            if (equipo.numero === equipoNum) {
                                for (const factura of equipo.facturas) {
                                    await AppState.db.collection("VENTAS").doc(factura.id).update({
                                        grupo: firebase.firestore.FieldValue.delete(),
                                        grupoNombre: firebase.firestore.FieldValue.delete()
                                    });
                                }
                            }
                        });
                    }
                }
            }
            
            await this.loadEquiposPendientes();
            await this.actualizarTotalesGrupos();
            this.updateUI();
            
            return grupoId;
        } catch (error) {
            console.error("Error actualizando grupo:", error);
            throw error;
        }
    },
    
    async eliminarGrupo(grupoId) {
        try {
            if (!AppState.firebaseInitialized) return;
            
            const grupo = this.grupos.get(grupoId);
            if (grupo) {
                for (const equipoNum of grupo.equipos) {
                    this.equiposPendientes.forEach(async (equipo, key) => {
                        if (equipo.numero === equipoNum) {
                            for (const factura of equipo.facturas) {
                                await AppState.db.collection("VENTAS").doc(factura.id).update({
                                    grupo: firebase.firestore.FieldValue.delete(),
                                    grupoNombre: firebase.firestore.FieldValue.delete()
                                });
                            }
                        }
                    });
                }
            }
            
            await AppState.db.collection("GRUPOS").doc(grupoId).delete();
            this.grupos.delete(grupoId);
            
            await this.loadEquiposPendientes();
            await this.actualizarTotalesGrupos();
            this.updateUI();
            
        } catch (error) {
            console.error("Error eliminando grupo:", error);
            throw error;
        }
    },
    
    getEquiposSinGrupo() {
        const equiposSinGrupo = new Map();
        
        this.equiposPendientes.forEach((equipo, key) => {
            let tieneGrupo = false;
            
            this.grupos.forEach(grupo => {
                if (grupo.equipos.includes(equipo.numero)) {
                    tieneGrupo = true;
                }
            });
            
            if (!tieneGrupo && equipo.total > 0) {
                equiposSinGrupo.set(key, equipo);
            }
        });
        
        return equiposSinGrupo;
    },

    getEquiposEnGrupos() {
        const equiposEnGrupos = new Set();
        
        this.grupos.forEach(grupo => {
            grupo.equipos.forEach(equipoNum => {
                equiposEnGrupos.add(equipoNum);
            });
        });
        
        return equiposEnGrupos;
    },
    
    updateUI() {
        this.renderEquiposIndividuales();
        this.renderGruposVisual();
    },
    
    renderEquiposIndividuales() {
        const container = document.getElementById('equipos-individuales');
        const emptyState = document.getElementById('empty-equipos');
        const equiposSinGrupo = this.getEquiposSinGrupo();
        
        if (equiposSinGrupo.size === 0) {
            emptyState.style.display = 'block';
            container.innerHTML = '';
            return;
        }
        
        emptyState.style.display = 'none';
        
        const equiposOrdenados = Array.from(equiposSinGrupo.entries())
            .sort(([a], [b]) => {
                const numA = parseInt(a.split('-')[0]);
                const numB = parseInt(b.split('-')[0]);
                return numA - numB;
            });
        
        let html = '';
        equiposOrdenados.forEach(([key, equipo]) => {
            const mostrarNombre = equipo.cliente && !equipo.cliente.startsWith('Equipo ');
            
            html += `
                <div class="equipo-card" onclick="GrupoManager.mostrarDetalleEquipo('${key}')">
                    <div class="equipo-number">${equipo.numero}</div>
                    ${mostrarNombre ? `<div class="equipo-nombre">${equipo.cliente}</div>` : ''}
                    <div class="equipo-total">$${equipo.total.toFixed(2)}</div>
                </div>
            `;
        });
        
        container.innerHTML = html;
    },
    
    renderGruposVisual() {
        const container = document.getElementById('grupos-container');
        
        if (this.grupos.size === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-users"></i>
                    <div>No hay grupos creados</div>
                    <div style="font-size: 0.8rem; margin-top: 5px; color: #999;">Crea tu primer grupo para organizar los equipos</div>
                </div>
            `;
            return;
        }
        
        const gruposOrdenados = Array.from(this.grupos.values())
            .filter(grupo => grupo.activo)
            .sort((a, b) => a.nombre.localeCompare(b.nombre));
        
        let html = '';
        gruposOrdenados.forEach(grupo => {
            let equiposHTML = '';
            
            grupo.equipos.forEach(equipoNum => {
                let equipoEncontrado = null;
                this.equiposPendientes.forEach((equipo, key) => {
                    if (equipo.numero === equipoNum && equipo.total > 0) {
                        equipoEncontrado = equipo;
                    }
                });
                
                if (equipoEncontrado) {
                    equiposHTML += `
                        <div class="grupo-equipo-item" onclick="GrupoManager.mostrarDetalleEquipo('${equipoEncontrado.numero}-${equipoEncontrado.cliente}')">
                            <div class="grupo-equipo-number">${equipoEncontrado.numero}</div>
                            <div class="grupo-equipo-total">$${equipoEncontrado.total.toFixed(2)}</div>
                        </div>
                    `;
                }
            });
            
            html += `
                <div class="grupo-card">
                    <div class="grupo-actions">
                        <button class="grupo-action-btn btn-detalle-grupo" onclick="GrupoManager.mostrarDetalleGrupoCompleto('${grupo.id}')" title="Ver detalles">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="grupo-action-btn btn-edit-grupo" onclick="GrupoManager.editarGrupo('${grupo.id}')" title="Editar grupo">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="grupo-action-btn btn-delete-grupo" onclick="eliminarGrupo('${grupo.id}')" title="Eliminar grupo">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                    <div class="grupo-header">
                        <div class="grupo-name">${grupo.nombre}</div>
                    </div>
                    <div class="grupo-equipos-grid">
                        ${equiposHTML}
                    </div>
                    <div class="grupo-total">
                        Total: $${grupo.total.toFixed(2)}
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html;
    },
    
    async mostrarDetalleEquipo(key) {
        const equipo = this.equiposPendientes.get(key);
        
        let facturasHTML = '';
        if (equipo) {
            equipo.facturas.forEach(factura => {
                let productosHTML = '';
                if (factura.products && factura.products.length > 0) {
                    factura.products.forEach(producto => {
                        productosHTML += `
                            <div class="producto-item">
                                <div>${producto.descripcion} x${producto.cantidad}</div>
                                <div>$${(producto.precio * producto.cantidad).toFixed(2)}</div>
                            </div>
                        `;
                    });
                }
                
                const saldoPendiente = factura.saldoPendiente !== undefined ? factura.saldoPendiente : factura.total;
                const tieneAbonos = factura.abonos && factura.abonos.length > 0;
                
                let abonosHTML = '';
                if (tieneAbonos) {
                    factura.abonos.forEach(abono => {
                        const fechaAbono = abono.fecha ? new Date(abono.fecha.toDate ? abono.fecha.toDate() : abono.fecha).toLocaleDateString('es-ES') : 'N/A';
                        abonosHTML += `
                            <div style="font-size: 0.7rem; color: #666; margin-left: 10px;">
                                Abono: $${abono.monto.toFixed(2)} (${fechaAbono})
                            </div>
                        `;
                    });
                }
                
                facturasHTML += `
                    <div class="factura-item">
                        <div><strong>Factura:</strong> ${factura.invoiceNumber}</div>
                        <div><strong>Total:</strong> $${factura.total.toFixed(2)}</div>
                        ${tieneAbonos ? `<div><strong>Saldo Pendiente:</strong> $${saldoPendiente.toFixed(2)}</div>` : ''}
                        <div><strong>Productos:</strong></div>
                        ${productosHTML}
                        ${abonosHTML}
                    </div>
                `;
            });
        }
        
        const modalContent = `
            <h3 style="margin-bottom: 15px; text-align: center;">Detalles del Equipo ${equipo.numero}</h3>
            <div class="detalle-equipo">
                <div><strong>Grupo:</strong> ${equipo.cliente}</div>
                <div><strong>Total Pendiente:</strong> $${equipo ? equipo.total.toFixed(2) : '0.00'}</div>
                <div><strong>Número de Facturas:</strong> ${equipo ? equipo.facturas.length : 0}</div>
            </div>
            <div class="grupo-facturas">
                <h4>Facturas Pendientes:</h4>
                ${facturasHTML || '<p>No hay facturas pendientes para este equipo</p>'}
            </div>
        `;
        
        document.getElementById('detalle-modal-content').innerHTML = modalContent;
        document.getElementById('detalle-modal').style.display = 'block';
        AppState.currentDetalle = { tipo: 'equipo', data: key };
    },
    
    async mostrarDetalleGrupoCompleto(grupoId) {
        const grupo = this.grupos.get(grupoId);
        if (!grupo) return;
        
        this.currentGrupoDetalle = grupo;
        
        let equiposHTML = '';
        let totalGeneral = 0;
        let totalPendiente = 0;
        let cantidadFacturas = 0;
        let tieneAbonos = false;
        
        for (const equipoNum of grupo.equipos) {
            let equipoEncontrado = null;
            this.equiposPendientes.forEach((equipo, key) => {
                if (equipo.numero === equipoNum && equipo.total > 0) {
                    equipoEncontrado = equipo;
                }
            });
            
            if (equipoEncontrado) {
                totalGeneral += equipoEncontrado.total;
                cantidadFacturas += equipoEncontrado.facturas.length;
                
                let facturasHTML = '';
                equipoEncontrado.facturas.forEach(factura => {
                    const saldoPendiente = factura.saldoPendiente !== undefined ? factura.saldoPendiente : factura.total;
                    totalPendiente += saldoPendiente;
                    
                    if (factura.abonos && factura.abonos.length > 0) {
                        tieneAbonos = true;
                    }
                    
                    let productosHTML = '';
                    if (factura.products && factura.products.length > 0) {
                        factura.products.forEach(producto => {
                            productosHTML += `
                                <div class="producto-item">
                                    <div>${producto.descripcion} x${producto.cantidad}</div>
                                    <div>$${(producto.precio * producto.cantidad).toFixed(2)}</div>
                                </div>
                            `;
                        });
                    }
                    
                    facturasHTML += `
                        <div class="grupo-detalle-factura">
                            <div><strong>Factura:</strong> ${factura.invoiceNumber}</div>
                            <div><strong>Fecha:</strong> ${new Date(factura.timestamp.toDate ? factura.timestamp.toDate() : factura.timestamp).toLocaleDateString('es-ES')}</div>
                            <div><strong>Total:</strong> $${factura.total.toFixed(2)}</div>
                            ${factura.abonos && factura.abonos.length > 0 ? `<div><strong>Saldo Pendiente:</strong> $${saldoPendiente.toFixed(2)}</div>` : ''}
                            <div><strong>Productos:</strong></div>
                            ${productosHTML}
                        </div>
                    `;
                });
                
                equiposHTML += `
                    <div class="grupo-detalle-equipo">
                        <h4>Equipo ${equipoEncontrado.numero} - ${equipoEncontrado.cliente}</h4>
                        <div><strong>Total:</strong> $${equipoEncontrado.total.toFixed(2)}</div>
                        <div><strong>Facturas:</strong> ${equipoEncontrado.facturas.length}</div>
                        ${facturasHTML}
                    </div>
                `;
            }
        }
        
        const modalContent = `
            <h3 style="margin-bottom: 15px; text-align: center;">${grupo.nombre} - Detalles Completos</h3>
            <div class="grupo-resumen">
                <div><strong>Total del Grupo:</strong> $${totalGeneral.toFixed(2)}</div>
                ${tieneAbonos ? `<div><strong>Saldo Pendiente:</strong> $${totalPendiente.toFixed(2)}</div>` : ''}
                <div><strong>Número de Equipos:</strong> ${grupo.equipos.length}</div>
                <div><strong>Total de Facturas:</strong> ${cantidadFacturas}</div>
            </div>
            <div class="grupo-facturas">
                <h4>Detalles por Equipo:</h4>
                ${equiposHTML || '<p>No hay equipos con facturas pendientes en este grupo</p>'}
            </div>
        `;
        
        document.getElementById('grupo-detalle-modal-content').innerHTML = modalContent;
        document.getElementById('grupo-detalle-modal').style.display = 'block';
    },
    
    async imprimirGrupoCompleto() {
        const grupo = this.currentGrupoDetalle;
        if (!grupo) return;
        
        for (const equipoNum of grupo.equipos) {
            let equipoEncontrado = null;
            this.equiposPendientes.forEach((equipo, key) => {
                if (equipo.numero === equipoNum && equipo.total > 0) {
                    equipoEncontrado = equipo;
                }
            });
            
            if (equipoEncontrado) {
                equipoEncontrado.facturas.forEach(factura => {
                    this.imprimirTicketFactura(factura, equipoEncontrado);
                });
            }
        }
    },

    imprimirTicketFactura(factura, equipo) {
        const printWindow = window.open('', '_blank');
        const fecha = factura.timestamp ? new Date(factura.timestamp.toDate ? factura.timestamp.toDate() : factura.timestamp) : new Date();
        const fechaFormateada = fecha.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' });
        
        const saldoPendiente = factura.saldoPendiente !== undefined ? factura.saldoPendiente : factura.total;
        const tieneAbonos = factura.abonos && factura.abonos.length > 0;
        const tipoPago = tieneAbonos && saldoPendiente > 0 ? 'PENDIENTE' : 'CONTADO';
        
        let abonosHTML = '';
        if (tieneAbonos) {
            factura.abonos.forEach(abono => {
                const fechaAbono = abono.fecha ? new Date(abono.fecha.toDate ? abono.fecha.toDate() : abono.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }) : 'N/A';
                abonosHTML += `
                    <div style="display: flex; justify-content: space-between; font-size: 20px; margin: 2px 0;">
                        <div>ABONO: $${abono.monto.toFixed(2)} (${fechaAbono})</div>
                    </div>
                `;
            });
        }
        
        let productosHTML = '';
        if (factura.products && factura.products.length > 0) {
            factura.products.forEach(producto => {
                const descripcion = producto.descripcion.length > 25 ? producto.descripcion.substring(0, 25) + '...' : producto.descripcion;
                productosHTML += `
                    <div style="margin: 4px 0;">
                        <div style="font-size: 20px;">• ${descripcion}</div>
                        <div style="display: flex; justify-content: space-between; font-size: 18px;">
                            <div>x${producto.cantidad}</div>
                            <div>$${(producto.precio * producto.cantidad).toFixed(2)}</div>
                        </div>
                    </div>
                    <div style="border-bottom: 1px dotted #000; margin: 2px 0;"></div>
                `;
            });
        }
        
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Ticket #${factura.invoiceNumber}</title>
                <style>
                    body { 
                        font-family: 'Courier New', monospace; 
                        font-size: 22px; 
                        margin: 0; 
                        padding: 6px;
                        width: 58mm;
                        font-weight: bold;
                    }
                    .header { text-align: center; margin-bottom: 12px; }
                    .line { border-bottom: 2px dashed #000; margin: 4px 0; }
                    .total { font-weight: bold; text-align: center; margin-top: 12px; font-size: 24px; }
                    .footer { text-align: center; margin-top: 12px; font-size: 18px; font-weight: bold; }
                    .small-text { font-size: 18px; }
                    .medium-text { font-size: 20px; }
                    .large-text { font-size: 26px; }
                    .thank-you { text-align: center; margin-top: 15px; font-weight: bold; font-size: 20px; }
                    .saldo-info {
                        background: #f0f0f0;
                        padding: 8px;
                        margin: 8px 0;
                        border-radius: 4px;
                        font-size: 18px;
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h3 style="margin: 2px 0; font-size: 26px;">TALLER WILIAN</h3>
                    <div class="small-text">Factura: ${factura.invoiceNumber}</div>
                    <div class="small-text">${fechaFormateada}, ${tipoPago}</div>
                </div>
                
                <div class="line"></div>
                
                <div class="medium-text">
                    <strong>Grupo:</strong> ${equipo.cliente}<br>
                    <strong>Equipo:</strong> ${equipo.numero}
                </div>
                
                <div class="line"></div>
                
                <div style="margin: 8px 0;">
                    ${productosHTML}
                </div>
                
                <div class="line"></div>
                
                <div class="total large-text">
                    TOTAL: $${factura.total.toFixed(2)}
                </div>

                ${abonosHTML}

                ${tieneAbonos && saldoPendiente > 0 ? `
                    <div class="saldo-info">
                        <div>SALDO PENDIENTE:</div>
                        <div class="large-text">$${saldoPendiente.toFixed(2)}</div>
                    </div>
                ` : ''}
                
                <div class="thank-you">
                    GRACIAS POR PREFERIRNOS
                </div>
            </body>
            </html>
        `);
        
        printWindow.document.close();
        printWindow.focus();
        
        setTimeout(() => {
            printWindow.print();
            setTimeout(() => {
                printWindow.close();
            }, 500);
        }, 500);
    },
    
    async actualizarDesdeVenta(ventaData) {
        if (ventaData.paymentType === 'pendiente' && ventaData.status === 'pendiente') {
            const equipo = ventaData.equipoNumber;
            if (equipo) {
                await this.loadEquiposPendientes();
                await this.actualizarTotalesGrupos();
                this.updateUI();
            }
        }
    },
    
    generarGridEquipos(modalType = 'crear') {
        const grid = document.getElementById(modalType === 'crear' ? 'all-equipos-grid' : 'editar-all-equipos-grid');
        const equiposEnGrupos = this.getEquiposEnGrupos();
        const selectedSet = modalType === 'crear' ? AppState.equiposSeleccionados : AppState.equiposEditSeleccionados;
        
        let html = '';
        
        for (let i = 1; i <= 130; i++) {
            const equipoNum = i.toString();
            let equipoEncontrado = null;
            this.equiposPendientes.forEach((equipo, key) => {
                if (equipo.numero === equipoNum && equipo.total > 0) {
                    equipoEncontrado = equipo;
                }
            });
            
            const tieneFacturas = equipoEncontrado && equipoEncontrado.facturas.length > 0;
            const estaSeleccionado = selectedSet.has(equipoNum);
            const estaEnOtroGrupo = equiposEnGrupos.has(equipoNum) && 
                (modalType === 'crear' || 
                 (modalType === 'editar' && this.currentEditingGroup && 
                  !this.currentEditingGroup.equipos.includes(equipoNum)));
            
            let estilo = '';
            if (estaEnOtroGrupo) {
                estilo = 'equipo-en-grupo';
            } else if (tieneFacturas) {
                estilo = 'has-facturas';
            }
            
            html += `
                <div class="all-equipo-item ${estilo} ${estaSeleccionado ? 'selected' : ''}" 
                     onclick="${estaEnOtroGrupo ? '' : `toggleEquipoGrid('${equipoNum}', '${modalType}')`}"
                     style="${tieneFacturas && !estaEnOtroGrupo ? 'border-color: #27ae60; background: #f0fff0;' : ''}${estaEnOtroGrupo ? 'border-color: #e74c3c; background: #f8d7da; color: #721c24; cursor: not-allowed;' : 'border-color: #ccc; background: #f5f5f5;'}">
                    ${equipoNum}
                    ${tieneFacturas ? '<br><small style="color: #27ae60;">$' + equipoEncontrado.total.toFixed(2) + '</small>' : '<br><small style="color: #999;">$0.00</small>'}
                    ${estaEnOtroGrupo ? '<br><small style="color: #e74c3c; font-size: 0.6rem;">EN GRUPO</small>' : ''}
                </div>
            `;
        }
        
        grid.innerHTML = html;
    },
    
    actualizarListaSeleccionados(modalType = 'crear') {
        const selectedList = document.getElementById(modalType === 'crear' ? 'selected-equipos-list' : 'editar-selected-equipos-list');
        const contador = document.getElementById(modalType === 'crear' ? 'contador-equipos' : 'editar-contador-equipos');
        const selectedSet = modalType === 'crear' ? AppState.equiposSeleccionados : AppState.equiposEditSeleccionados;
        
        contador.textContent = selectedSet.size;
        
        if (selectedSet.size === 0) {
            selectedList.innerHTML = '<div style="color: #999; text-align: center; font-size: 0.8rem;">No hay equipos seleccionados</div>';
        } else {
            let badgesHTML = '';
            const equiposOrdenados = Array.from(selectedSet).sort((a, b) => parseInt(a) - parseInt(b));
            
            equiposOrdenados.forEach(num => {
                let equipoEncontrado = null;
                this.equiposPendientes.forEach((equipo, key) => {
                    if (equipo.numero === num && equipo.total > 0) {
                        equipoEncontrado = equipo;
                    }
                });
                
                if (equipoEncontrado) {
                    badgesHTML += `<span class="selected-equipo-badge">${num} ($${equipoEncontrado.total.toFixed(2)})</span>`;
                } else {
                    badgesHTML += `<span class="selected-equipo-badge" style="background: #95a5a6;">${num} ($0.00)</span>`;
                }
            });
            selectedList.innerHTML = badgesHTML;
        }
    },

    async editarGrupo(grupoId) {
        const grupo = this.grupos.get(grupoId);
        if (!grupo) {
            UIService.showStatus("No se encontró el grupo para editar", "error");
            return;
        }

        this.currentEditingGroup = grupo;
        
        AppState.equiposEditSeleccionados = new Set(grupo.equipos);
        
        document.getElementById('editar-nombre-grupo').value = grupo.nombre;
        this.generarGridEquipos('editar');
        this.actualizarListaSeleccionados('editar');
        
        document.getElementById('editar-grupo-modal').style.display = 'block';
    },

    async actualizarGrupoDesdeModal() {
        const grupo = this.currentEditingGroup;
        if (!grupo) {
            UIService.showStatus("No hay grupo seleccionado para editar", "error");
            return;
        }

        const nombre = document.getElementById('editar-nombre-grupo').value.trim();
        if (!nombre) {
            UIService.showStatus("Ingrese un nombre para el grupo", "error");
            return;
        }

        if (AppState.equiposEditSeleccionados.size === 0) {
            UIService.showStatus("Seleccione al menos un equipo", "error");
            return;
        }

        try {
            const equiposArray = Array.from(AppState.equiposEditSeleccionados);
            await this.actualizarGrupo(grupo.id, nombre, equiposArray);
            UIService.showStatus(`Grupo "${nombre}" actualizado correctamente`, "success");
            document.getElementById('editar-grupo-modal').style.display = 'none';
            this.currentEditingGroup = null;
            AppState.equiposEditSeleccionados.clear();
        } catch (error) {
            UIService.showStatus("Error al actualizar grupo: " + error.message, "error");
        }
    }
};

// Servicio de Datos
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
        if (AppState.firebaseInitialized) {
            const existingInvoice = await this.checkInvoiceExists(saleData.invoiceNumber);
            if (existingInvoice) {
                throw new Error(`La factura ${saleData.invoiceNumber} ya existe`);
            }
            
            const docRef = await AppState.db.collection("VENTAS").add(saleData);
            
            await this.updateSaleCounter(saleData.date);
            
            if (saleData.paymentType === 'pendiente') {
                await GrupoManager.actualizarDesdeVenta(saleData);
            }
            
            return docRef.id;
        } else {
            throw new Error("No hay conexión a la base de datos");
        }
    },

    async checkInvoiceExists(invoiceNumber) {
        try {
            const snapshot = await AppState.db.collection("VENTAS")
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
        if (AppState.firebaseInitialized) {
            await AppState.db.collection("VENTAS").doc(saleId).update(saleData);
            
            if (saleData.paymentType === 'pendiente') {
                await GrupoManager.actualizarDesdeVenta({...saleData, id: saleId});
            }
        } else {
            throw new Error("No hay conexión a la base de datos");
        }
    },

    async deleteSale(saleId) {
        if (AppState.firebaseInitialized) {
            await AppState.db.collection("VENTAS").doc(saleId).delete();
        } else {
            throw new Error("No hay conexión a la base de datos");
        }
    },

    async loadSales(limit = 500) {
        if (AppState.firebaseInitialized) {
            const snapshot = await AppState.db.collection("VENTAS")
                .orderBy("timestamp", "desc")
                .limit(limit)
                .get();
            
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } else {
            return [];
        }
    },

    async loadSalesByDate(date = DateUtils.getCurrentDateStringElSalvador(), limit = 500) {
        if (AppState.firebaseInitialized) {
            const snapshot = await AppState.db.collection("VENTAS")
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
            
            await ventaRef.update({
                abonos: firebase.firestore.FieldValue.arrayUnion(abonoData),
                saldoPendiente: nuevoSaldo
            });
            
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
    },

    async getSaleById(invoiceId) {
        if (AppState.firebaseInitialized) {
            const doc = await AppState.db.collection("VENTAS").doc(invoiceId).get();
            if (doc.exists) {
                return { id: doc.id, ...doc.data() };
            }
            return null;
        } else {
            throw new Error("No hay conexión a la base de datos");
        }
    },

    async cancelInvoice(invoiceId) {
        if (AppState.firebaseInitialized) {
            const ventaRef = AppState.db.collection("VENTAS").doc(invoiceId);
            
            await ventaRef.update({
                paymentType: 'contado',
                status: 'pagado',
                saldoPendiente: 0,
                cancelada: true,
                fechaCancelacion: new Date()
            });
            
            const venta = await this.getSaleById(invoiceId);
            if (venta) {
                await GrupoManager.actualizarDesdeVenta(venta);
            }
        } else {
            throw new Error("No hay conexión a la base de datos");
        }
    },

    async saveRetiro(retiroData) {
        if (AppState.firebaseInitialized) {
            const docRef = await AppState.db.collection("RETIROS").add(retiroData);
            return docRef.id;
        } else {
            throw new Error("No hay conexión a la base de datos");
        }
    },

    async loadRetiros(limit = 500) {
        if (AppState.firebaseInitialized) {
            const snapshot = await AppState.db.collection("RETIROS")
                .orderBy("timestamp", "desc")
                .limit(limit)
                .get();
            
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } else {
            return [];
        }
    },

    async loadRetirosByDate(date = DateUtils.getCurrentDateStringElSalvador(), limit = 500) {
        if (AppState.firebaseInitialized) {
            const snapshot = await AppState.db.collection("RETIROS")
                .where("date", "==", date)
                .orderBy("timestamp", "desc")
                .limit(limit)
                .get();
            
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } else {
            return [];
        }
    },

    async loadAllMovements(limit = 500) {
        const [ventas, retiros] = await Promise.all([
            this.loadSales(limit),
            this.loadRetiros(limit)
        ]);
        
        const allMovements = [
            ...ventas.map(v => ({ ...v, tipo: 'venta' })),
            ...retiros.map(r => ({ ...r, tipo: 'retiro' }))
        ];
        
        return allMovements.sort((a, b) => {
            const dateA = a.timestamp?.toDate ? a.timestamp.toDate() : a.timestamp;
            const dateB = b.timestamp?.toDate ? b.timestamp.toDate() : b.timestamp;
            return dateB - dateA;
        }).slice(0, limit);
    },

    async loadMovementsByDate(date = DateUtils.getCurrentDateStringElSalvador(), limit = 500) {
        const [ventas, retiros] = await Promise.all([
            this.loadSalesByDate(date, limit),
            this.loadRetirosByDate(date, limit)
        ]);
        
        const allMovements = [
            ...ventas.map(v => ({ ...v, tipo: 'venta' })),
            ...retiros.map(r => ({ ...r, tipo: 'retiro' }))
        ];
        
        return allMovements.sort((a, b) => {
            const dateA = a.timestamp?.toDate ? a.timestamp.toDate() : a.timestamp;
            const dateB = b.timestamp?.toDate ? b.timestamp.toDate() : b.timestamp;
            return dateB - dateA;
        }).slice(0, limit);
    }
};

// Estado Global de la Aplicación
const AppState = {
    firebaseInitialized: false,
    db: null,
    cart: [],
    searchResults: [],
    saleCounter: 0,
    currentEditingInvoice: null,
    historial: [],
    filteredHistorial: [],
    currentFilter: 'hoy',
    currentAbonoInvoice: null,
    currentDetalle: null,
    equiposSeleccionados: new Set(),
    equiposEditSeleccionados: new Set(),
    processingSale: false,
    currentInvoiceNumber: null
};