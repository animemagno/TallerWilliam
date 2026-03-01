// Patch para actualizar showGroupPaymentModal y agregar calcularSaldoRestante
GrupoManager.showGroupPaymentModal = function (grupoId) {
    const grupo = this.grupos.get(grupoId);
    if (!grupo) return;

    const modal = document.getElementById('bulk-abono-modal');

    // Actualizar nombre del grupo y fecha
    document.getElementById('bulk-abono-grupo-nombre').textContent = grupo.nombre;
    document.getElementById('bulk-abono-fecha').textContent = new Date().toLocaleDateString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    // Recopilar equipos: primero por clave exacta, luego por número como respaldo
    let equiposHTML = '';
    let totalGrupoReal = 0;
    let contador = 0;

    for (const equipoKey of grupo.equipos) {
        // 1. Buscar por clave exacta (ej: "65-Cedros", "65-Equipo 65")
        let equipoEncontrado = this.equiposPendientes.get(equipoKey);

        if (equipoEncontrado && equipoEncontrado.total > 0) {
            // Encontrado por clave exacta
            totalGrupoReal += equipoEncontrado.total;
            const bgColor = contador % 2 === 0 ? '#f9f9f9' : 'white';
            equiposHTML += `
                <div style="display: flex; justify-content: space-between; padding: 10px; border-bottom: 1px solid #ddd; background: ${bgColor};">
                    <div style="font-weight: bold; color: #2c3e50; font-size: 16px;">${equipoEncontrado.numero} - ${equipoEncontrado.cliente || 'Equipo ' + equipoEncontrado.numero}</div>
                    <div style="font-weight: bold; color: #e74c3c; font-size: 16px;">$${equipoEncontrado.total.toFixed(2)}</div>
                </div>
            `;
            contador++;
        } else if (!equipoEncontrado) {
            // 2. Fallback para grupos antiguos: buscar por número
            this.equiposPendientes.forEach((equipo, key) => {
                if (String(equipo.numero) === String(equipoKey) && equipo.total > 0) {
                    totalGrupoReal += equipo.total;
                    const bgColor = contador % 2 === 0 ? '#f9f9f9' : 'white';
                    equiposHTML += `
                        <div style="display: flex; justify-content: space-between; padding: 10px; border-bottom: 1px solid #ddd; background: ${bgColor};">
                            <div style="font-weight: bold; color: #2c3e50; font-size: 16px;">${equipo.numero} - ${equipo.cliente || 'Equipo ' + equipo.numero}</div>
                            <div style="font-weight: bold; color: #e74c3c; font-size: 16px;">$${equipo.total.toFixed(2)}</div>
                        </div>
                    `;
                    contador++;
                }
            });
        }
    }

    // Actualizar lista de equipos y total
    document.getElementById('bulk-abono-equipos-list').innerHTML = equiposHTML || '<div style="text-align: center; color: #999;">No hay equipos con saldo</div>';
    document.getElementById('bulk-abono-total').textContent = `$${totalGrupoReal.toFixed(2)}`;

    // Guardar el total REAL en el modal para cálculos
    modal.dataset.totalGrupo = totalGrupoReal;
    modal.dataset.grupoId = grupoId;

    // Limpiar campo de monto y ocultar saldo restante
    document.getElementById('monto-bulk-abono').value = '';
    document.getElementById('saldo-restante-container').style.display = 'none';

    modal.style.display = 'block';

    const processBtn = document.getElementById('process-bulk-abono-btn');
    processBtn.onclick = async () => {
        if (processBtn.disabled) return;
        processBtn.disabled = true;

        const monto = parseFloat(document.getElementById('monto-bulk-abono').value);
        if (!monto || monto <= 0) {
            UIService.showStatus("Ingrese un monto válido", "error");
            processBtn.disabled = false;
            return;
        }

        try {
            UIService.showLoading(true);

            // Recopilar TODAS las facturas: primero por clave exacta, luego por número
            const facturas = [];
            for (const equipoKey of grupo.equipos) {
                let equipoExacto = GrupoManager.equiposPendientes.get(equipoKey);

                if (equipoExacto && equipoExacto.facturas) {
                    // Encontrado por clave exacta
                    equipoExacto.facturas.forEach(f => {
                        facturas.push({
                            id: f.id,
                            timestamp: f.timestamp,
                            saldoPendiente: f.saldoPendiente !== undefined ? f.saldoPendiente : f.total
                        });
                    });
                } else if (!equipoExacto) {
                    // Fallback para grupos antiguos: buscar por número
                    GrupoManager.equiposPendientes.forEach((equipo, key) => {
                        if (String(equipo.numero) === String(equipoKey) && equipo.facturas) {
                            equipo.facturas.forEach(f => {
                                facturas.push({
                                    id: f.id,
                                    timestamp: f.timestamp,
                                    saldoPendiente: f.saldoPendiente !== undefined ? f.saldoPendiente : f.total
                                });
                            });
                        }
                    });
                }
            }

            if (facturas.length === 0) {
                throw new Error("El grupo no tiene facturas pendientes");
            }

            // Calcular el saldo pendiente REAL sumando los saldos de cada factura
            const saldoRealTotal = facturas.reduce((sum, f) => sum + f.saldoPendiente, 0);

            if (monto > saldoRealTotal) {
                UIService.showStatus(`El monto ($${monto.toFixed(2)}) no puede ser mayor al saldo pendiente ($${saldoRealTotal.toFixed(2)})`, "error");
                processBtn.disabled = false;
                UIService.showLoading(false);
                return;
            }

            // Ordenar por fecha (más antiguas primero)
            facturas.sort((a, b) => {
                const dateA = a.timestamp ? (a.timestamp.toDate ? a.timestamp.toDate() : new Date(a.timestamp)) : new Date(0);
                const dateB = b.timestamp ? (b.timestamp.toDate ? b.timestamp.toDate() : new Date(b.timestamp)) : new Date(0);
                return dateA - dateB;
            });

            // Distribuir el abono entre las facturas
            let montoRestante = monto;
            const abonoData = {
                fechaString: (new Date()).toLocaleString('es-ES')
            };

            for (const factura of facturas) {
                if (montoRestante <= 0) break;

                const montoAbonar = Math.min(montoRestante, factura.saldoPendiente);

                if (montoAbonar > 0) {
                    await DataService.addAbono(factura.id, {
                        ...abonoData,
                        monto: montoAbonar
                    });
                    montoRestante -= montoAbonar;
                }
            }

            UIService.showStatus(`Abono de $${monto.toFixed(2)} aplicado al grupo correctamente`, "success");
            modal.style.display = 'none';

            // Recargar datos del grupo
            await GrupoManager.loadEquiposPendientes(true);
            await GrupoManager.actualizarTotalesGrupos(true);
            GrupoManager.updateUI();

            // Recargar historial si existe
            if (typeof SalesService !== 'undefined' && SalesService.loadHistorial) {
                await SalesService.loadHistorial();
            }

        } catch (error) {
            UIService.showStatus("Error: " + error.message, "error");
        } finally {
            UIService.showLoading(false);
            processBtn.disabled = false;
        }
    };
};

GrupoManager.calcularSaldoRestante = function () {
    const modal = document.getElementById('bulk-abono-modal');
    const totalGrupo = parseFloat(modal.dataset.totalGrupo) || 0;
    const montoInput = document.getElementById('monto-bulk-abono');
    const monto = parseFloat(montoInput.value) || 0;

    const saldoRestanteContainer = document.getElementById('saldo-restante-container');
    const saldoRestanteElement = document.getElementById('saldo-restante');

    if (monto > 0) {
        const saldoRestante = Math.max(0, totalGrupo - monto);
        saldoRestanteElement.textContent = `$${saldoRestante.toFixed(2)}`;
        saldoRestanteElement.style.color = saldoRestante > 0 ? '#e74c3c' : '#27ae60';
        saldoRestanteContainer.style.display = 'block';
    } else {
        saldoRestanteContainer.style.display = 'none';
    }
};
