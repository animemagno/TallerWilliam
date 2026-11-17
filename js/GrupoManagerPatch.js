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

    // Recopilar equipos: con traductor inteligente (getEquipoData)
    let equiposHTML = '<div style="font-weight: 800; color: #747d8c; margin-bottom: 12px; font-size: 13px; text-transform: uppercase; padding-left: 5px;">Equipos en Grupo <span style="font-weight:500; text-transform:none; color:#94a3b8;">(clic para ver facturas)</span></div>';
    let totalGrupoReal = 0;
    const equiposSnapshot = [];

    for (const equipoKey of grupo.equipos) {
        let equipoEncontrado = this.getEquipoData ? this.getEquipoData(equipoKey) : this.equiposPendientes.get(equipoKey);

        if (equipoEncontrado && equipoEncontrado.total > 0) {
            const safeId = String(equipoEncontrado.numero).replace(/[^a-zA-Z0-9_-]/g, '_');
            const facturasEq = (equipoEncontrado.facturas || [])
                .map(f => {
                    const saldoAnt = f.saldoPendiente !== undefined ? f.saldoPendiente : f.total;
                    const timeMs = (typeof DateUtils !== 'undefined' && DateUtils.getTimeMs) ? DateUtils.getTimeMs(f) : 0;
                    const fechaStr = f.timestamp ? new Date(timeMs).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '';
                    return {
                        id: f.id,
                        invoiceNumber: f.invoiceNumber || '',
                        fecha: fechaStr,
                        timeMs,
                        fusionId: f.fusionId || null,
                        saldoAnterior: Number(saldoAnt || 0)
                    };
                })
                .filter(f => f.saldoAnterior > 0.009)
                .sort((a, b) => a.timeMs - b.timeMs);

            if (facturasEq.length === 0) continue;

            const eqTotal = facturasEq.reduce((s, f) => s + f.saldoAnterior, 0);
            totalGrupoReal += eqTotal;
            equiposSnapshot.push({
                numero: equipoEncontrado.numero,
                cliente: equipoEncontrado.cliente || ('Equipo ' + equipoEncontrado.numero),
                facturas: facturasEq
            });

            const invListHTML = facturasEq.map(f => `
                <label class="bulk-inv-row" data-eq="${safeId}" data-fusion="${f.fusionId ? '1' : '0'}" style="display:flex; justify-content:space-between; align-items:center; gap:8px; padding:5px 8px; border-top:1px solid #f1f5f9; font-size:12px; cursor:pointer; color:#334155;">
                    <span style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                        <input type="checkbox" class="bulk-inv-checkbox" data-eq="${safeId}" data-id="${f.id}" data-saldo="${f.saldoAnterior}" data-fusion="${f.fusionId ? '1' : '0'}" checked onchange="GrupoManager.onBulkInvoiceCheckChange('${safeId}')">
                        <strong>#${f.invoiceNumber}</strong>
                        <span style="color:#94a3b8;">(${f.fecha})</span>
                        ${f.fusionId ? '<span style="background:#ede9fe; color:#6d28d9; padding:1px 5px; border-radius:4px; font-size:10px; font-weight:700;">Fusionada</span>' : ''}
                    </span>
                    <span style="font-weight:700; color:#dc2626;">$${f.saldoAnterior.toFixed(2)}</span>
                </label>
            `).join('');

            equiposHTML += `
                <div class="bulk-eq-card" data-eq-card="${safeId}" style="margin-bottom:8px; background:#fff; border-radius:10px; border:1px solid #e2e8f0; overflow:hidden;">
                    <div class="opt2-item" style="margin-bottom:0; cursor:pointer; display:flex; justify-content:space-between; align-items:center; gap:8px;" onclick="if(event.target.type !== 'checkbox') GrupoManager.toggleBulkEquipoExpand('${safeId}')">
                        <div class="name" style="display:flex; align-items:center; gap:8px;">
                            <input type="checkbox" id="bulk-eq-check-${safeId}" checked onclick="event.stopPropagation();" onchange="GrupoManager.toggleBulkEquipoCheck('${safeId}', this.checked)">
                            <span>${equipoEncontrado.numero} - ${equipoEncontrado.cliente || 'Equipo ' + equipoEncontrado.numero}</span>
                            <i class="fas fa-chevron-down" id="bulk-eq-icon-${safeId}" style="font-size:11px; color:#94a3b8;"></i>
                        </div>
                        <div class="amount" id="bulk-eq-amount-${safeId}">$${eqTotal.toFixed(2)}</div>
                    </div>
                    <div id="bulk-eq-invoices-${safeId}" style="display:none; background:#f8fafc; padding:4px 8px 6px 26px;">
                        ${invListHTML}
                    </div>
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

    GrupoManager.setBulkFusionFilter('todas');
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

        const checkedBoxes = Array.from(document.querySelectorAll('#bulk-abono-equipos-list .bulk-inv-checkbox:checked'));
        if (checkedBoxes.length === 0) {
            UIService.showStatus("Seleccione al menos una factura para abonar", "error");
            processBtn.disabled = false;
            return;
        }

        const selectedIds = checkedBoxes.map(cb => cb.dataset.id);
        const saldoSeleccionado = checkedBoxes.reduce((s, cb) => s + (parseFloat(cb.dataset.saldo) || 0), 0);

        if (monto > saldoSeleccionado + 0.009) {
            UIService.showStatus(`El monto ($${monto.toFixed(2)}) no puede ser mayor al saldo pendiente seleccionado ($${saldoSeleccionado.toFixed(2)})`, "error");
            processBtn.disabled = false;
            return;
        }

        try {
            UIService.showLoading(true);

            const facturasAfectadas = await DataService.processMultiAbono(selectedIds, monto);
            const abonoById = {};
            (facturasAfectadas || []).forEach(fa => {
                abonoById[fa.id] = (abonoById[fa.id] || 0) + (Number(fa.abono) || 0);
            });

            const equiposTicket = equiposSnapshot.map(eq => {
                const facturasEqTicket = eq.facturas.map(f => {
                    const ab = abonoById[f.id] || 0;
                    return {
                        invoiceNumber: f.invoiceNumber,
                        fecha: f.fecha,
                        saldoAnterior: f.saldoAnterior,
                        montoAbonado: ab,
                        nuevoSaldo: Math.max(0, f.saldoAnterior - ab)
                    };
                });
                const saldoAnterior = facturasEqTicket.reduce((s, f) => s + f.saldoAnterior, 0);
                const abonoTotal = facturasEqTicket.reduce((s, f) => s + f.montoAbonado, 0);
                const nuevoSaldo = Math.max(0, saldoAnterior - abonoTotal);
                return {
                    equipoNumber: eq.numero,
                    cliente: eq.cliente,
                    facturas: facturasEqTicket,
                    saldoAnterior,
                    abonoTotal,
                    nuevoSaldo
                };
            });

            const saldoTotalAnterior = equiposTicket.reduce((s, e) => s + e.saldoAnterior, 0);
            const abonoTotal = equiposTicket.reduce((s, e) => s + e.abonoTotal, 0);
            const nuevoSaldoTotal = Math.max(0, saldoTotalAnterior - abonoTotal);

            const comprobanteData = {
                tipo: 'grupo',
                grupoNombre: grupo.nombre,
                fechaTicket: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }),
                equipos: equiposTicket,
                saldoTotalAnterior,
                abonoTotal,
                nuevoSaldoTotal
            };

            DataService.saveAbonoComprobante(comprobanteData).catch(e => console.error('Error guardando comprobante:', e));
            PrintingService.printBulkAbonoTicket(comprobanteData, true);

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

            if (typeof GrupoManager.mostrarModalImprimirAbono === 'function') {
                GrupoManager.mostrarModalImprimirAbono(
                    `<strong>Grupo: ${grupo.nombre}</strong><br>Abono aplicado: <strong style="color:#16a34a;">$${abonoTotal.toFixed(2)}</strong><br>Nuevo saldo del grupo: <strong>$${nuevoSaldoTotal.toFixed(2)}</strong>`,
                    () => PrintingService.printBulkAbonoTicket(comprobanteData, false)
                );
            }

        } catch (error) {
            UIService.showStatus("Error: " + error.message, "error");
        } finally {
            UIService.showLoading(false);
            processBtn.disabled = false;
        }
    };
};

GrupoManager.toggleBulkEquipoExpand = function (safeId) {
    const panel = document.getElementById(`bulk-eq-invoices-${safeId}`);
    const icon = document.getElementById(`bulk-eq-icon-${safeId}`);
    if (!panel) return;
    const isHidden = panel.style.display === 'none';
    panel.style.display = isHidden ? 'block' : 'none';
    if (icon) {
        icon.className = isHidden ? 'fas fa-chevron-up' : 'fas fa-chevron-down';
    }
};

GrupoManager.toggleBulkEquipoCheck = function (safeId, checked) {
    document.querySelectorAll(`#bulk-abono-equipos-list .bulk-inv-checkbox[data-eq="${safeId}"]`).forEach(cb => {
        cb.checked = checked;
    });
    GrupoManager.recalculateBulkGroupSelection();
};

GrupoManager.onBulkInvoiceCheckChange = function (safeId) {
    const invBoxes = Array.from(document.querySelectorAll(`#bulk-abono-equipos-list .bulk-inv-checkbox[data-eq="${safeId}"]`));
    const eqBox = document.getElementById(`bulk-eq-check-${safeId}`);
    if (eqBox && invBoxes.length > 0) {
        const checkedCount = invBoxes.filter(c => c.checked).length;
        eqBox.checked = checkedCount === invBoxes.length;
        eqBox.indeterminate = checkedCount > 0 && checkedCount < invBoxes.length;
    }
    GrupoManager.recalculateBulkGroupSelection();
};

GrupoManager.recalculateBulkGroupSelection = function () {
    const checkedBoxes = Array.from(document.querySelectorAll('#bulk-abono-equipos-list .bulk-inv-checkbox:checked'));
    const totalSel = checkedBoxes.reduce((s, cb) => s + (parseFloat(cb.dataset.saldo) || 0), 0);

    // Actualizar subtotal visible en cada tarjeta de equipo
    document.querySelectorAll('#bulk-abono-equipos-list .bulk-eq-card').forEach(card => {
        const safeId = card.dataset.eqCard;
        const eqChecked = Array.from(card.querySelectorAll('.bulk-inv-checkbox:checked'));
        const eqSum = eqChecked.reduce((s, cb) => s + (parseFloat(cb.dataset.saldo) || 0), 0);
        const amtEl = document.getElementById(`bulk-eq-amount-${safeId}`);
        if (amtEl) amtEl.textContent = `$${eqSum.toFixed(2)}`;
    });

    const modal = document.getElementById('bulk-abono-modal');
    if (modal) modal.dataset.totalGrupo = totalSel;
    const totalEl = document.getElementById('bulk-abono-total');
    if (totalEl) totalEl.textContent = totalSel.toFixed(2);
    GrupoManager.calcularSaldoRestante();
};

GrupoManager.setBulkFusionFilter = function (mode) {
    const filter = mode || 'todas';
    document.querySelectorAll('#bulk-abono-fusion-filter .bulk-filter-btn').forEach(btn => {
        const isActive = btn.dataset.filter === filter;
        btn.style.background = isActive ? '#3498db' : '#fff';
        btn.style.color = isActive ? '#fff' : '#475569';
        btn.style.borderColor = isActive ? '#3498db' : '#cbd5e1';
    });

    document.querySelectorAll('#bulk-abono-equipos-list .bulk-inv-row').forEach(row => {
        const isFusion = row.dataset.fusion === '1';
        const matches = filter === 'todas' ||
            (filter === 'fusionadas' && isFusion) ||
            (filter === 'individuales' && !isFusion);
        row.style.display = matches ? 'flex' : 'none';
        const cb = row.querySelector('.bulk-inv-checkbox');
        if (cb) cb.checked = matches;
    });

    // Actualizar checkboxes y visibilidad de tarjetas de equipo
    document.querySelectorAll('#bulk-abono-equipos-list .bulk-eq-card').forEach(card => {
        const safeId = card.dataset.eqCard;
        const allInvs = Array.from(card.querySelectorAll('.bulk-inv-checkbox'));
        const visibleInvs = Array.from(card.querySelectorAll('.bulk-inv-row')).filter(r => r.style.display !== 'none');
        card.style.display = visibleInvs.length > 0 ? 'block' : 'none';

        const eqBox = document.getElementById(`bulk-eq-check-${safeId}`);
        if (eqBox) {
            const checkedCount = allInvs.filter(c => c.checked).length;
            eqBox.checked = visibleInvs.length > 0 && checkedCount === visibleInvs.length;
            eqBox.indeterminate = false;
        }
    });

    GrupoManager.recalculateBulkGroupSelection();
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
