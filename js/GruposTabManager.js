window.GruposTabManager = {
    renderGruposVisual() {
        const container = document.getElementById('grupos-container');

        if (GrupoManager.grupos.size === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-users"></i>
                    <div>No hay grupos creados</div>
                    <div style="font-size: 0.8rem; margin-top: 5px; color: #999;">Crea tu primer grupo para organizar los equipos</div>
                </div>
            `;
            return;
        }

        const gruposOrdenados = Array.from(GrupoManager.grupos.values())
            .filter(grupo => grupo.activo)
            .sort((a, b) => a.nombre.localeCompare(b.nombre));

        let html = '';
        gruposOrdenados.forEach(grupo => {
            let equiposHTML = '';

            grupo.equipos.forEach(equipoNum => {
                let equipoEncontrado = GrupoManager.equiposPendientes.get(equipoNum);

                // FALLBACK VISUAL: Si no se encuentra con clave simple, intentar con la compuesta por defecto
                if (!equipoEncontrado) {
                    equipoEncontrado = GrupoManager.equiposPendientes.get(`${equipoNum}-Equipo ${equipoNum}`);
                }

                if (equipoEncontrado && equipoEncontrado.total > 0) {
                    equiposHTML += `
                        <div class="grupo-equipo-item" onclick="GrupoManager.mostrarDetalleEquipo('${equipoEncontrado.numero}')"> <!-- Usar numero para mantener compatibilidad en click -->
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
                        <button class="grupo-action-btn btn-info" onclick="GrupoManager.showGroupPaymentModal('${grupo.id}')" title="Abonar a Grupo" style="background-color: #17a2b8; color: white;">
                            <i class="fas fa-money-bill-wave"></i>
                        </button>
                        <button class="grupo-action-btn btn-success" onclick="GrupoManager.capturarImagenGrupo('${grupo.id}')" title="Capturar imagen" style="background-color: #28a745; color: white;">
                            <i class="fas fa-camera"></i>
                        </button>
                        <button class="grupo-action-btn btn-delete-grupo" onclick="GrupoManager.solicitarEliminarGrupo('${grupo.id}')" title="Eliminar grupo">
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
    }
};
