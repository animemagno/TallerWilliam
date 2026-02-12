const ModalService = {
    closeAbonoModal() {
        document.getElementById('abono-modal').style.display = 'none';
        AppState.currentAbonoInvoice = null;
    },

    closeRetiroModal() {
        document.getElementById('retiro-modal').style.display = 'none';
    },

    closeIngresoModal() {
        document.getElementById('ingreso-modal').style.display = 'none';
    },

    closeEditarRetiroModal() {
        document.getElementById('editar-retiro-modal').style.display = 'none';
    },

    closeEditarIngresoModal() {
        document.getElementById('editar-ingreso-modal').style.display = 'none';
    },

    closeInvoiceModal() {
        document.getElementById('invoice-modal').style.display = 'none';
    },

    closeDetalleModal() {
        document.getElementById('detalle-modal').style.display = 'none';
        AppState.currentDetalle = null;
    },

    closeGrupoDetalleModal() {
        document.getElementById('grupo-detalle-modal').style.display = 'none';
        GrupoManager.currentGrupoDetalle = null;
    },

    closeCrearGrupoModal() {
        document.getElementById('crear-grupo-modal').style.display = 'none';
        AppState.equiposSeleccionados.clear();
    },

    closeEditarGrupoModal() {
        document.getElementById('editar-grupo-modal').style.display = 'none';
        GrupoManager.currentEditingGroup = null;
        AppState.equiposEditSeleccionados.clear();
    },

    closeConfirmacionAbonoModal() {
        document.getElementById('confirmacion-abono-modal').style.display = 'none';
        delete AppState.datosVentaPendiente;
    },

    closeAbonoInicialModal() {
        document.getElementById('abono-inicial-modal').style.display = 'none';
        delete AppState.datosVentaPendiente;
    }
};
