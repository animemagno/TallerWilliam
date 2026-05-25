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
        const modalContent = document.querySelector('#invoice-modal .modal-content');
        if (modalContent) {
            modalContent.style.maxWidth = '';
            modalContent.style.width = '';
            modalContent.style.maxHeight = '';
            modalContent.style.height = '';
            modalContent.style.padding = '';
            modalContent.style.display = '';
            modalContent.style.flexDirection = '';
        }
        const contentWrapper = document.getElementById('invoice-modal-content');
        if (contentWrapper) {
            contentWrapper.style.flex = '';
            contentWrapper.style.display = '';
            contentWrapper.style.flexDirection = '';
            contentWrapper.style.minHeight = '';
        }
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
