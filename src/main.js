import { firebaseConfig } from './config/firebase.js';
import { ErrorHandler } from './utils/ErrorHandler.js';
import { DateUtils } from './utils/DateUtils.js';
import { UIService, ModalService } from './services/UIService.js';

console.log('Sistema modular inicializado');

const App = {
    async init() {
        try {
            console.log('Iniciando aplicación...');

            // Inicializar Firebase
            if (firebase.apps.length === 0) {
                firebase.initializeApp(firebaseConfig);
            }

            UIService.showStatus("Sistema modular cargado correctamente", "success");

        } catch (error) {
            console.error("Error en inicialización:", error);
            UIService.showStatus("Error al inicializar: " + error.message, "error");
        }
    }
};

// Exponer App globalmente para pruebas
window.App = App;
window.UIService = UIService;
window.ModalService = ModalService;
window.DateUtils = DateUtils;

document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
