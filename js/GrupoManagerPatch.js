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

    // Update Info displays
    document.getElementById('bulk-abono-info').style.display = 'none';
    document.getElementById('bulk-abono-left-col').style.display = 'block';
    document.querySelector('.modal-opt2').classList.remove('single-column');

    // Recopilar equipos: solo por clave exacta
    let equiposHTML = '<div style="font-weight: 800; color: #747d8c; margin-bottom: 12px; font-size: 13px; text-transform: uppercase; padding-left: 5px;">Equipos en Grupo</div>';
    let totalGrupoReal = 0;

    for (const equipoKey of grupo.equipos) {
        let equipoEncontrado = this.equiposPendientes.get(equipoKey);

        if (equipoEncontrado && equipoEncontrado.total > 0) {
            totalGrupoReal += equipoEncontrado.total;
            equiposHTML += `
                <div class="opt2-item">
                    <div class="name">${equipoEncontrado.numero} - ${equipoEncontrado.cliente || 'Equipo ' + equipoEncontrado.numero}</div>
                    <div class="amount">$${equipoEncontrado.total.toFixed(2)}</div>
                </div>
            `;
        }
    }

    // Actualizar lista de equipos y total
    document.getElementById('bulk-abono-equipos-list').innerHTML = equiposHTML || '<div style="text-align: center; color: #999;">No hay equipos con saldo</div>';
    document.getElementById('bulk-abono-total').textContent = totalGrupoReal.toFixed(2);

    // Guardar el total REAL en el modal para cálculos
    modal.dataset.totalGrupo = totalGrupoReal;
    modal.dataset.grupoId = grupoId;

    // Limpiar campo de monto y mostrar saldo restante con total completo
    document.getElementById('monto-bulk-abono').value = '';
    document.getElementById('saldo-restante-container').style.display = 'block';
    document.getElementById('saldo-restante').textContent = `$${totalGrupoReal.toFixed(2)}`;
    document.getElementById('saldo-restante').style.color = '#e74c3c';

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

    const saldoRestante = Math.max(0, totalGrupo - monto);
    saldoRestanteElement.textContent = `$${saldoRestante.toFixed(2)}`;
    saldoRestanteElement.style.color = saldoRestante > 0 ? '#e74c3c' : '#27ae60';
    saldoRestanteContainer.style.display = 'block';
};
