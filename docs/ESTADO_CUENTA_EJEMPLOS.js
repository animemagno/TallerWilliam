/**
 * EJEMPLO DE INTEGRACIÓN - Estado de Cuenta
 * 
 * Este archivo muestra ejemplos de cómo integrar los botones
 * de Estado de Cuenta en tu código existente.
 */

// ========================================
// EJEMPLO 1: Renderizar Equipos con Botón
// ========================================

function renderEquiposConEstadoCuenta(equipos) {
    const container = document.getElementById('equipos-individuales');

    let html = '';
    equipos.forEach(equipo => {
        html += `
            <div class="equipo-card">
                <div class="equipo-header">
                    <h3>EQUIPO ${equipo.number}</h3>
                    <span class="saldo-badge">$${equipo.saldo.toFixed(2)}</span>
                </div>
                
                <div class="equipo-info">
                    <p>Facturas: ${equipo.cantidadFacturas}</p>
                    <p>Último abono: ${equipo.ultimoAbono || 'N/A'}</p>
                </div>
                
                <div class="equipo-actions">
                    <!-- Botón de Estado de Cuenta -->
                    <button 
                        class="btn btn-info btn-sm" 
                        onclick="mostrarEstadoCuentaEquipo('${equipo.number}')"
                        title="Ver estado de cuenta detallado">
                        <i class="fas fa-file-invoice"></i> Estado de Cuenta
                    </button>
                    
                    <!-- Botones existentes -->
                    <button 
                        class="btn btn-success btn-sm" 
                        onclick="abonarEquipo('${equipo.number}')">
                        <i class="fas fa-dollar-sign"></i> Abonar
                    </button>
                    
                    <button 
                        class="btn btn-secondary btn-sm" 
                        onclick="verDetallesEquipo('${equipo.number}')">
                        <i class="fas fa-eye"></i> Ver
                    </button>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// ========================================
// EJEMPLO 2: Renderizar Grupos con Botón
// ========================================

function renderGruposConEstadoCuenta(grupos) {
    const container = document.getElementById('grupos-list');

    let html = '';
    grupos.forEach(grupo => {
        html += `
            <div class="grupo-card">
                <div class="grupo-header">
                    <h3>${grupo.name}</h3>
                    <span class="saldo-badge">$${grupo.saldoTotal.toFixed(2)}</span>
                </div>
                
                <div class="grupo-info">
                    <p>Equipos: ${grupo.equipos.length}</p>
                    <p>Total Facturas: ${grupo.totalFacturas}</p>
                </div>
                
                <div class="grupo-actions">
                    <!-- Botón de Estado de Cuenta -->
                    <button 
                        class="btn btn-info btn-sm" 
                        onclick="mostrarEstadoCuentaGrupo('${grupo.name}')"
                        title="Ver estado de cuenta del grupo">
                        <i class="fas fa-file-invoice-dollar"></i> Estado de Cuenta
                    </button>
                    
                    <!-- Botones existentes -->
                    <button 
                        class="btn btn-success btn-sm" 
                        onclick="GrupoManager.showGroupPaymentModalSelector()">
                        <i class="fas fa-hand-holding-usd"></i> Abonar Grupo
                    </button>
                    
                    <button 
                        class="btn btn-warning btn-sm" 
                        onclick="editarGrupo('${grupo.id}')">
                        <i class="fas fa-edit"></i> Editar
                    </button>
                    
                    <button 
                        class="btn btn-danger btn-sm" 
                        onclick="eliminarGrupo('${grupo.id}')">
                        <i class="fas fa-trash"></i> Eliminar
                    </button>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// ========================================
// EJEMPLO 3: Integración en Tabla
// ========================================

function renderTablaFacturasConEstadoCuenta(facturas) {
    const tbody = document.getElementById('tabla-facturas-body');

    // Agrupar por equipo
    const equipos = {};
    facturas.forEach(factura => {
        if (!equipos[factura.equipoNumber]) {
            equipos[factura.equipoNumber] = [];
        }
        equipos[factura.equipoNumber].push(factura);
    });

    let html = '';
    Object.keys(equipos).forEach(equipoNum => {
        const facturasEquipo = equipos[equipoNum];
        const saldoTotal = facturasEquipo.reduce((sum, f) => sum + (f.saldoPendiente || f.total), 0);

        html += `
            <tr class="equipo-row">
                <td colspan="4">
                    <strong>EQUIPO ${equipoNum}</strong>
                    <button 
                        class="btn btn-info btn-xs float-right" 
                        onclick="mostrarEstadoCuentaEquipo('${equipoNum}')">
                        📊 Estado de Cuenta
                    </button>
                </td>
                <td class="text-right"><strong>$${saldoTotal.toFixed(2)}</strong></td>
            </tr>
        `;

        facturasEquipo.forEach(factura => {
            html += `
                <tr>
                    <td>${factura.invoiceNumber}</td>
                    <td>${factura.fecha}</td>
                    <td>$${factura.total.toFixed(2)}</td>
                    <td>$${(factura.saldoPendiente || 0).toFixed(2)}</td>
                    <td>
                        <button onclick="verFactura('${factura.id}')">Ver</button>
                        <button onclick="abonarFactura('${factura.id}')">Abonar</button>
                    </td>
                </tr>
            `;
        });
    });

    tbody.innerHTML = html;
}

// ========================================
// EJEMPLO 4: Agregar a Contexto de Click Derecho
// ========================================

function agregarMenuContextualEstadoCuenta(equipoNumber) {
    // Crear menú contextual personalizado
    const menu = `
        <div class="context-menu" id="context-menu-${equipoNumber}">
            <ul>
                <li onclick="mostrarEstadoCuentaEquipo('${equipoNumber}')">
                    <i class="fas fa-file-invoice"></i> Estado de Cuenta
                </li>
                <li onclick="abonarEquipo('${equipoNumber}')">
                    <i class="fas fa-dollar-sign"></i> Realizar Abono
                </li>
                <li onclick="verHistorialEquipo('${equipoNumber}')">
                    <i class="fas fa-history"></i> Ver Historial
                </li>
            </ul>
        </div>
    `;

    // Agregar al DOM cuando se haga click derecho
    document.addEventListener('contextmenu', (e) => {
        if (e.target.closest(`.equipo-${equipoNumber}`)) {
            e.preventDefault();
            // Mostrar menú en posición del cursor
            // ... (lógica de posicionamiento)
        }
    });
}

// ========================================
// EJEMPLO 5: Uso Programático (Sin UI)
// ========================================

async function generarYEnviarEstadoCuentaPorEmail(equipoNumber, email) {
    try {
        // Obtener estado de cuenta
        const estadoCuenta = await EstadoCuentaService.obtenerEstadoCuentaEquipo(equipoNumber);

        // Generar HTML del reporte
        const htmlReporte = EstadoCuentaService.generarHTMLEquipo(estadoCuenta);

        // Enviar por email (usando tu servicio de email)
        await enviarEmail({
            to: email,
            subject: `Estado de Cuenta - Equipo ${equipoNumber}`,
            html: htmlReporte
        });

        alert('Estado de cuenta enviado exitosamente');
    } catch (error) {
        console.error('Error:', error);
        alert('Error al enviar estado de cuenta');
    }
}

// ========================================
// EJEMPLO 6: Exportar a PDF (Requiere jsPDF)
// ========================================

async function exportarEstadoCuentaPDF(equipoNumber) {
    try {
        const estadoCuenta = await EstadoCuentaService.obtenerEstadoCuentaEquipo(equipoNumber);

        // Usar jsPDF para convertir el HTML a PDF
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        const htmlContent = EstadoCuentaService.generarHTMLEquipo(estadoCuenta);

        doc.html(htmlContent, {
            callback: function (doc) {
                doc.save(`estado-cuenta-equipo-${equipoNumber}.pdf`);
            },
            x: 10,
            y: 10
        });
    } catch (error) {
        console.error('Error:', error);
        alert('Error al exportar PDF');
    }
}

// ========================================
// EJEMPLO 7: Vista Rápida (Tooltip)
// ========================================

function mostrarVistaRapidaEstadoCuenta(equipoNumber, element) {
    // Crear tooltip con resumen rápido
    EstadoCuentaService.obtenerEstadoCuentaEquipo(equipoNumber)
        .then(estadoCuenta => {
            const tooltip = `
                <div class="quick-view-tooltip">
                    <strong>Equipo ${equipoNumber}</strong>
                    <p>Facturas: ${estadoCuenta.cantidadFacturas}</p>
                    <p>Total: $${estadoCuenta.totalAdeudado.toFixed(2)}</p>
                    <button onclick="mostrarEstadoCuentaEquipo('${equipoNumber}')">
                        Ver Completo
                    </button>
                </div>
            `;

            // Mostrar tooltip cerca del elemento
            showTooltip(element, tooltip);
        });
}

// ========================================
// NOTA: Estos son solo EJEMPLOS
// Adapta el código según tu estructura actual
// ========================================
