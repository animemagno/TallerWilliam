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
            let procesadosVisual = new Set(); // Evitar duplicar tarjetas

            grupo.equipos.forEach(equipoKey => {
                // 1. Buscar por clave exacta
                let equipoEncontrado = GrupoManager.getEquipoData ? GrupoManager.getEquipoData(equipoKey) : GrupoManager.equiposPendientes.get(equipoKey);

                if (equipoEncontrado && equipoEncontrado.total > 0) {
                    if (!procesadosVisual.has(equipoEncontrado)) {
                        procesadosVisual.add(equipoEncontrado);
                        equiposHTML += `
                            <div class="grupo-equipo-item" onclick="GrupoManager.mostrarDetalleEquipo('${equipoKey.replace(/'/g, "\\'")}')">
                                <div class="grupo-equipo-number">${equipoEncontrado.numero}</div>
                                <div class="grupo-equipo-total">$${equipoEncontrado.total.toFixed(2)}</div>
                            </div>
                        `;
                    }
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
                            <div class="grupo-dropdown-item" onclick="GruposTabManager.abrirConfiguracionCambioGrupo('${grupo.id}'); GruposTabManager.closeAllMenus();">
                                <i class="fas fa-oil-can" style="color: #f39c12;"></i> Cambios Aceite/Caja
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
    },

    async abrirConfiguracionCambioGrupo(grupoId) {
        try {
            const grupo = GrupoManager.grupos.get(grupoId);
            if (!grupo) return;
            
            // Registrar ID de grupo activo para refresco si se edita un equipo individual
            if (typeof FacturasTabManager !== 'undefined') {
                FacturasTabManager.activeGroupConfigId = grupoId;
            }
            
            document.getElementById('proximos-cambios-grupo-sub').textContent = `Grupo: ${grupo.nombre}`;
            const listaContainer = document.getElementById('proximos-cambios-grupo-lista');
            listaContainer.innerHTML = '<div style="text-align: center; padding: 20px;"><i class="fas fa-spinner fa-spin fa-2x"></i><br>Cargando información...</div>';
            
            document.getElementById('proximos-cambios-grupo-modal').style.display = 'block';
            
            let html = '';
            
            // Obtener todos los equipos del grupo
            const equipoKeys = grupo.equipos;
            if (equipoKeys.length === 0) {
                listaContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: #7f8c8d;">No hay equipos en este grupo</div>';
                return;
            }
            
            for (const key of equipoKeys) {
                // El número de equipo viene directamente de la clave del mapa
                const num = key;
                const config = await DataService.getEquipmentConfig(num);
                const intervalo = config.intervaloDias || 20;
                const tipo = config.proximoCambioTipo || 'ACEITE';
                const fecha = config.proximoCambioFecha || 'No programado';
                
                const esAceite = tipo === 'ACEITE';
                const icon = esAceite ? '🛢️' : '⚙️';
                const tipoTexto = esAceite ? 'ACEITE' : 'CAJA';
                
                html += `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid #edf2f7; background: #fafafa; border-radius: 8px; margin-bottom: 8px;">
                        <div style="text-align: left;">
                            <div style="font-weight: bold; color: #2d3748; font-size: 1rem;">Equipo ${num}</div>
                            <div style="font-size: 0.8rem; color: #718096; margin-top: 4px; display: flex; align-items: center; gap: 8px;">
                                <span>${icon} Proximo: <strong>${tipoTexto}</strong></span>
                                <span style="background: #edf2f7; padding: 2px 6px; border-radius: 4px; font-weight: 600;">${intervalo} días</span>
                            </div>
                        </div>
                        <div style="text-align: right; display: flex; align-items: center; gap: 15px;">
                            <div style="text-align: right;">
                                <div style="font-weight: 700; color: #2d3748; font-size: 0.9rem;">${fecha}</div>
                                <div style="font-size: 0.75rem; color: #a0aec0;">Fecha programada</div>
                            </div>
                            <button class="btn btn-primary" onclick="event.stopPropagation(); FacturasTabManager.abrirConfiguracionCambio('${num}');" style="padding: 6px 12px; font-size: 0.8rem; height: auto; border-radius: 6px; border: none; background: #3182ce; color: white; cursor: pointer;">
                                <i class="fas fa-cog"></i> Config
                            </button>
                        </div>
                    </div>
                `;
            }
            
            listaContainer.innerHTML = html;
        } catch (error) {
            console.error("Error abriendo cambios de grupo:", error);
            UIService.showStatus("Error cargando los cambios de grupo: " + error.message, "error");
        }
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
