window.FacturasTabManager = {
    renderEquiposIndividuales() {
        const container = document.getElementById('equipos-individuales');
        const emptyState = document.getElementById('empty-equipos');
        const equiposSinGrupo = GrupoManager.getEquiposSinGrupo();

        if (equiposSinGrupo.size === 0) {
            emptyState.style.display = 'block';
            container.innerHTML = '';
            return;
        }

        emptyState.style.display = 'none';

        const equiposOrdenados = Array.from(equiposSinGrupo.entries())
            .sort(([a], [b]) => {
                const numA = parseInt(a);
                const numB = parseInt(b);
                return numA - numB;
            });

        let html = '';
        equiposOrdenados.forEach(([key, equipo]) => {
            const mostrarNombre = equipo.cliente && !equipo.cliente.startsWith('Equipo ');

            html += `
                <div class="equipo-card" onclick="GrupoManager.mostrarDetalleEquipo('${key}')" style="position: relative;">
                    <div class="equipo-number">${equipo.numero}</div>
                    ${mostrarNombre ? `<div class="equipo-nombre">${equipo.cliente}</div>` : ''}
                    <div class="equipo-total" style="margin-top: auto;">$${equipo.total.toFixed(2)}</div>
                </div>
            `;
        });

        container.innerHTML = html;
    },

    imprimirSaldosEquipos() {
        // Recopilar todos los equipos con deuda
        const equiposData = [];
        let totalGeneral = 0;
        let totalFacturas = 0;

        GrupoManager.equiposPendientes.forEach((equipo, key) => {
            if (equipo.total > 0) {
                equiposData.push({
                    numero: equipo.numero,
                    cliente: equipo.cliente || '',
                    total: equipo.total,
                    facturas: equipo.facturas.length
                });
                totalGeneral += equipo.total;
                totalFacturas += equipo.facturas.length;
            }
        });

        // Ordenar por número de equipo
        equiposData.sort((a, b) => {
            const numA = parseFloat(a.numero) || 0;
            const numB = parseFloat(b.numero) || 0;
            return numA - numB;
        });

        const fecha = new Date().toLocaleDateString('es-ES', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });

        const hora = new Date().toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit'
        });

        // Generar contenido del ticket
        let equiposHTML = '';
        equiposData.forEach((equipo) => {
            // No mostrar cliente si es igual a "Equipo X" o vacío
            let clienteLabel = '';
            if (equipo.cliente) {
                const esEquipoGenerico = equipo.cliente.toLowerCase() === `equipo ${equipo.numero}`.toLowerCase();
                if (!esEquipoGenerico) {
                    clienteLabel = `  ${equipo.cliente}`;
                }
            }

            equiposHTML += `
                <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px dotted #ccc;">
                    <div>
                        <strong>Equipo ${equipo.numero}${clienteLabel}</strong>
                        <div style="font-size: 10px; color: #888;">${equipo.facturas} factura${equipo.facturas > 1 ? 's' : ''}</div>
                    </div>
                    <div style="text-align: right; font-weight: bold;">
                        $${equipo.total.toFixed(2)}
                    </div>
                </div>
            `;
        });

        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Ticket Saldos - Taller Willian</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { 
                        font-family: 'Courier New', monospace; 
                        width: 80mm;
                        margin: 0 auto;
                        padding: 10px;
                        font-size: 12px;
                    }
                    .header { 
                        text-align: center; 
                        border-bottom: 2px solid #000; 
                        padding-bottom: 8px; 
                        margin-bottom: 10px; 
                    }
                    .header h1 { font-size: 16px; margin-bottom: 4px; }
                    .header .fecha { font-size: 11px; color: #666; }
                    .equipos-list { margin-bottom: 15px; }
                    .total-section {
                        border-top: 2px solid #000;
                        padding-top: 10px;
                        margin-top: 10px;
                    }
                    .total-row {
                        display: flex;
                        justify-content: space-between;
                        padding: 3px 0;
                        font-size: 11px;
                    }
                    .total-final {
                        display: flex;
                        justify-content: space-between;
                        font-size: 16px;
                        font-weight: bold;
                        margin-top: 8px;
                        padding-top: 5px;
                        border-top: 1px dashed #000;
                    }
                    .footer {
                        text-align: center;
                        margin-top: 15px;
                        font-size: 10px;
                        color: #888;
                    }
                    @media print { 
                        body { width: 80mm; margin: 0; padding: 5px; }
                        .no-print { display: none; }
                    }
                    @media screen {
                        body { 
                            border: 1px solid #ccc; 
                            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                            margin-top: 20px;
                        }
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>TALLER WILLIAN</h1>
                    <div>SALDOS PENDIENTES</div>
                    <div class="fecha">${fecha} - ${hora}</div>
                </div>

                <div class="equipos-list">
                    ${equiposHTML}
                </div>

                <div class="total-section">
                    <div class="total-row">
                        <span>Total Equipos:</span>
                        <span>${equiposData.length}</span>
                    </div>
                    <div class="total-row">
                        <span>Total Facturas:</span>
                        <span>${totalFacturas}</span>
                    </div>
                    <div class="total-final">
                        <span>SALDO TOTAL:</span>
                        <span>$${totalGeneral.toFixed(2)}</span>
                    </div>
                </div>

                <div class="footer">
                    --------------------------------
                    <br>Gracias por su preferencia
                </div>

                <div class="no-print" style="text-align: center; margin-top: 20px;">
                    <button onclick="window.print()" style="padding: 10px 20px; font-size: 14px; cursor: pointer; background: #3498db; color: white; border: none; border-radius: 4px;">
                        IMPRIMIR TICKET
                    </button>
                </div>
            </body>
            </html>
        `);
        printWindow.document.close();
    },

    toggleEquipoMenu(equipoKey) {
        const dropdown = document.getElementById(`equipo-dropdown-${equipoKey}`);
        const isOpen = dropdown.style.display === 'block';

        // Cerrar todos los de equipos primero
        this.closeAllMenus();

        // Si no estaba abierto, abrirlo
        if (!isOpen) {
            dropdown.style.display = 'block';
        }
    },

    closeAllMenus() {
        document.querySelectorAll('.equipo-dropdown').forEach(d => {
            d.style.display = 'none';
        });
    },

    async abrirConfiguracionCambio(equipoNumber) {
        try {
            this.activeConfigEquipo = equipoNumber;
            document.getElementById('proximo-cambio-sub').textContent = `Equipo ${equipoNumber}`;
            UIService.showLoading(true);
            
            // Cargar configuración de Firestore
            const config = await DataService.getEquipmentConfig(equipoNumber);
            
            // Llenar campos
            document.getElementById('config-cambio-intervalo').value = config.intervaloDias || 20;
            document.getElementById('config-cambio-tipo').value = config.proximoCambioTipo || 'ACEITE';
            
            if (config.proximoCambioFecha) {
                document.getElementById('config-cambio-fecha').value = config.proximoCambioFecha;
            } else {
                // Autocalcular desde hoy
                const intervalo = config.intervaloDias || 20;
                const baseDate = new Date();
                baseDate.setDate(baseDate.getDate() + intervalo);
                const yyyy = baseDate.getFullYear();
                const mm = String(baseDate.getMonth() + 1).padStart(2, '0');
                const dd = String(baseDate.getDate()).padStart(2, '0');
                document.getElementById('config-cambio-fecha').value = `${yyyy}-${mm}-${dd}`;
            }
            
            UIService.showLoading(false);
            document.getElementById('proximo-cambio-modal').style.display = 'block';
        } catch (error) {
            UIService.showLoading(false);
            console.error("Error abriendo config de cambio:", error);
            UIService.showStatus("Error al cargar la configuración: " + error.message, "error");
        }
    },

    actualizarFechaCalculada() {
        const intervalo = parseInt(document.getElementById('config-cambio-intervalo').value) || 20;
        const baseDate = new Date();
        baseDate.setDate(baseDate.getDate() + intervalo);
        const yyyy = baseDate.getFullYear();
        const mm = String(baseDate.getMonth() + 1).padStart(2, '0');
        const dd = String(baseDate.getDate()).padStart(2, '0');
        document.getElementById('config-cambio-fecha').value = `${yyyy}-${mm}-${dd}`;
    },

    async guardarConfiguracionCambio() {
        try {
            const equipoNumber = this.activeConfigEquipo;
            if (!equipoNumber) return;
            
            const intervalo = parseInt(document.getElementById('config-cambio-intervalo').value) || 20;
            const tipo = document.getElementById('config-cambio-tipo').value;
            const fecha = document.getElementById('config-cambio-fecha').value;
            
            if (!fecha) {
                UIService.showStatus("Seleccione una fecha para el cambio", "error");
                return;
            }
            
            UIService.showLoading(true);
            
            await DataService.saveEquipmentConfig(equipoNumber, {
                intervaloDias: intervalo,
                proximoCambioFecha: fecha,
                proximoCambioTipo: tipo
            });
            
            UIService.showLoading(false);
            document.getElementById('proximo-cambio-modal').style.display = 'none';
            UIService.showStatus(`Configuración guardada para el equipo ${equipoNumber}`, "success");
            
            // Si el modal de grupo está abierto, refrescarlo
            if (this.activeGroupConfigId) {
                if (typeof GruposTabManager !== 'undefined' && GruposTabManager.abrirConfiguracionCambioGrupo) {
                    await GruposTabManager.abrirConfiguracionCambioGrupo(this.activeGroupConfigId);
                }
            }
        } catch (error) {
            UIService.showLoading(false);
            console.error("Error guardando config de cambio:", error);
            UIService.showStatus("Error al guardar: " + error.message, "error");
        }
    }
};

// Cerrar menús al hacer clic fuera
document.addEventListener('click', (e) => {
    if (!e.target.closest('.equipo-menu-wrapper')) {
        if (typeof FacturasTabManager !== 'undefined' && FacturasTabManager.closeAllMenus) {
            FacturasTabManager.closeAllMenus();
        }
    }
});
