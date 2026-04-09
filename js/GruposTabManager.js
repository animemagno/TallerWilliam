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

            grupo.equipos.forEach(equipoKey => {
                // 1. Buscar por clave exacta
                let equipoEncontrado = GrupoManager.equiposPendientes.get(equipoKey);

                if (equipoEncontrado && equipoEncontrado.total > 0) {
                    equiposHTML += `
                        <div class="grupo-equipo-item" onclick="GrupoManager.mostrarDetalleEquipo('${equipoKey.replace(/'/g, "\\'")}')">
                            <div class="grupo-equipo-number">${equipoEncontrado.numero}</div>
                            <div class="grupo-equipo-total">$${equipoEncontrado.total.toFixed(2)}</div>
                        </div>
                    `;
                }
            });

            html += `
                <div class="grupo-card">
                    <div class="grupo-menu-wrapper">
                        <button class="grupo-menu-toggle" onclick="event.stopPropagation(); GruposTabManager.toggleGrupoMenu('${grupo.id}')" title="Opciones">
                            <i class="fas fa-ellipsis-v"></i>
                        </button>
                        <div class="grupo-dropdown" id="grupo-dropdown-${grupo.id}">
                            <div class="grupo-dropdown-item" onclick="GrupoManager.mostrarDetalleGrupoCompleto('${grupo.id}'); GruposTabManager.closeAllMenus();">
                                <i class="fas fa-eye" style="color: #3498db;"></i> Ver Detalles
                            </div>
                            <div class="grupo-dropdown-item" onclick="GrupoManager.editarGrupo('${grupo.id}'); GruposTabManager.closeAllMenus();">
                                <i class="fas fa-edit" style="color: #27ae60;"></i> Editar
                            </div>
                            <div class="grupo-dropdown-item" onclick="GrupoManager.showGroupPaymentModal('${grupo.id}'); GruposTabManager.closeAllMenus();">
                                <i class="fas fa-money-bill-wave" style="color: #17a2b8;"></i> Abonar
                            </div>
                            <div class="grupo-dropdown-item" onclick="GrupoManager.capturarImagenGrupo('${grupo.id}'); GruposTabManager.closeAllMenus();">
                                <i class="fas fa-camera" style="color: #28a745;"></i> Capturar
                            </div>
                            <div class="grupo-dropdown-item delete-item" onclick="GrupoManager.solicitarEliminarGrupo('${grupo.id}'); GruposTabManager.closeAllMenus();">
                                <i class="fas fa-trash"></i> Eliminar
                            </div>
                        </div>
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

    toggleGrupoMenu(grupoId) {
        const dropdown = document.getElementById(`grupo-dropdown-${grupoId}`);
        const isOpen = dropdown.classList.contains('show');

        // Cerrar todos los menús abiertos primero
        this.closeAllMenus();

        // Si no estaba abierto, abrirlo
        if (!isOpen) {
            dropdown.classList.add('show');
        }
    },

    closeAllMenus() {
        document.querySelectorAll('.grupo-dropdown.show').forEach(d => {
            d.classList.remove('show');
        });
    }
};

// Cerrar menús al hacer clic fuera
document.addEventListener('click', (e) => {
    if (!e.target.closest('.grupo-menu-wrapper')) {
        if (typeof GruposTabManager !== 'undefined') {
            GruposTabManager.closeAllMenus();
        }
    }
});
