# REGLAS DE TRABAJO - PROYECTO TALLER WILLIAN

Este archivo contiene las normas obligatorias que debe seguir el Agente (IA) durante el desarrollo de este proyecto.

## 1. Comunicación
*   **Lenguaje Sencillo:** No usar palabras técnicas complejas (como "DOM", "Listeners", "Refactorización"). Explicar todo de forma simple y para un usuario no experto.
*   **Concisión:** Resumir las explicaciones de forma entendible y directa. Ir al grano.

## 1.1 Contexto Global (Lectura Obligatoria)
Para entender el estado real del proyecto, **SIEMPRE** debes leer estos archivos al iniciar:
1.  `REGLAS.md`: Estas normas.

## 2. Flujo de Desarrollo
*   **(NUEVO) Diálogo Previo Obligatorio:** Antes de escribir cualquier código, **explicar verbalmente** qué cambios se planean hacer. Usar un lenguaje extremadamente simple (nada de tecnicismos como "array", "función", "clase"). Esperar confirmación del usuario antes de proceder.
*   **Consulta Previa:** Siempre preguntar o comentar "cómo se puede mejorar algo" ANTES de aplicar cambios. No asumir ni actuar por cuenta propia fuera de lo solicitado.
*   **Commit Controlado:** NUNCA hacer un commit sin preguntar antes. El usuario debe autorizar explícitamente cada guardado en el historial.
*   **Guardado Completo post-Pruebas:** Una vez que el usuario confirme que las pruebas funcionan correctamente, proceder INMEDIATAMENTE a realizar un guardado (commit + push) en GitHub que incluya **todos** los archivos del proyecto, para asegurar el estado funcional.
*   **⚠️ IMPORTANTE - Guardado en GitHub:** 
    *   Cuando el usuario dice "guardar", se refiere a **guardar en GitHub** (commit + push), NO solo guardar localmente.
    *   Siempre verificar con `git status` si hay cambios pendientes de subir.
    *   Usar `git push` para sincronizar los commits locales con GitHub.
    *   Confirmar al usuario que los cambios están en la nube, no solo en su computadora.

## 3. Estrategia de Estabilidad ("Punto de Guardado")
Para evitar la degradación del código por errores acumulados:
1.  Trabajar en una funcionalidad hasta que esté **completamente funcional y probada**.
2.  Solicitar autorización para hacer un **COMMIT COMPLETO** (Punto de restauración).
3.  Una vez guardado, recomendar **CERRAR SESIÓN** y abrir un **NUEVO CHAT**.
4.  Continuar el trabajo en el nuevo chat con la memoria limpia.

## 4. Estética y Calidad
*   **Diseño Premium:** Priorizar una estética moderna, limpia y profesional (buenos colores, sombras, espaciado). Nada de diseños "básicos".
*   **Funcionalidad Móvil:** Toda pantalla debe verse y funcionar bien en dispositivos móviles.

## 5. Idioma y Proactividad Técnica
*   **Idioma Oficial:** Todo el trabajo, comentarios, commits y documentación debe realizarse en **ESPAÑOL**.
*   **Proactividad Técnica:** El Agente tiene libertad (y deber) de analizar las tareas implementadas y sugerir mejoras lógicas, arquitectónicas o incluso cambios de lenguaje/herramientas si esto facilita el trabajo o mejora la calidad del producto final. No limitarse solo a lo pedido si existe una solución técnica superior.

## 6. Mapa de Estructura del Proyecto (Referencia Rápida)

### 📂 Archivos Principales (Interfaz)
*   **`ventas.html`**: Panel principal.PC. Maneja carrito, facturas pendientes y grupos.
*   **`ventas_movil.html`**: Versión móvil (light). Venta rápida.
*   **`inventario.html`**: Gestión de productos (altas, bajas, stock).
*   **`analisis_financiero.html`**: Dashboard con gráficas y reportes.
*   **`control de entrega.html`**: Sistema para marcar entregas.

### 🧠 Lógica de Negocio (`/js`)
#### Servicios (Logic Core)
*   **`DataService.js`**: **EL CEREBRO DE DATOS.** Lee/Escribe en Firebase.
*   **`SalesService.js`**: Carrito de compras y checkout.
*   **`PrintingService.js`**: Genera tickets y facturas PDF/HTML.
*   **`UIService.js`**: Controla alertas y modales.

#### Gestores de Módulos
*   **`GrupoManager.js`**: **CRÍTICO.** Lógica de agrupación de facturas.
*   **`FacturasTabManager.js`**: Pestaña "Facturas" (sin grupo).
*   **`GruposTabManager.js`**: Pestaña "Grupos".
*   **`HistorialService.js`**: Lista de últimas ventas.

#### Utilidades
*   **`App.js`**: Inicializa la app y Firebase.
*   **`Config.js`**: Credenciales.
*   **`ErrorHandler.js`**: Manejo de errores.

### 🔥 Base de Datos (Firestore)
*   **`VENTAS`**: Colección principal.
    *   `paymentType`: 'pendiente'/'contado'
    *   `group`: ID del grupo (si aplica)
*   **`GRUPOS`**: Definición de grupos.
*   **`INVENTARIO`**: Catálogo de productos.
