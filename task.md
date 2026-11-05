# Hoja de Ruta - Taller William

## 🟢 Tareas Activas
- [x] (05/11/2026) `js/GrupoManager.js` y `ventas.html`: Corrección del refresco automático de equipos pendientes (`loadEquiposPendientes`) tras guardar en `EDITAR DATOS`.
- [x] (05/11/2026) `ventas.html`, `js/GrupoManager.js` y `js/SalesService.js`: Adición de botón y ventana "EDITAR DATOS" en la ventana flotante de facturas para modificar Fecha, Número de Equipo y Nombre de Grupo de una factura (además de opción directa para pasar sus productos al carrito).
- [x] (05/11/2026) `js/GrupoManager.js` y `muestra_fusion.html`: Adición de casilla/botón "Seleccionar todas / Desmarcar todas" en la barra de acciones de las facturas del equipo para marcar todas las facturas pendientes de un solo clic.
- [x] (05/11/2026) `ventas.html`, `js/GrupoManager.js` y `js/PrintingService.js`: Ampliación de la altura de la ventana emergente de facturas (al 95% del alto de la pantalla) e impresión detallada de todos los tickets del equipo en `IMPRIMIR HISTORIAL`, o impresión como ticket normal de únicamente las facturas marcadas con casilla.
- [x] (05/11/2026) `ventas.html`, `js/GrupoManager.js` y `muestra_fusion.html`: Ampliación del ancho de la ventana emergente de detalle de facturas y organización fija en exactamente 2 columnas cuando hay 2 o más facturas (y 1 columna cuando solo hay 1), evitando que se generen 3 columnas.
- [x] (05/11/2026) `js/GrupoManager.js`: Implementación de fusión de facturas por equipo con tarjeta contenedora morada, tarjetas individuales internas ordenadas por fecha con marco oscuro, saldos individuales y total fusionado, opción de abonar exclusivamente a la fusión y opción de separar.
- [x] (05/11/2026) Creación de `muestra_fusion.html`: muestra interactiva para visualizar y probar la fusión de facturas de un mismo equipo (con tarjetas individuales internas por fecha, saldos individuales, saldo total de la fusión y abono exclusivo al corte).
- [x] (05/11/2026) Ajuste en `muestra_fusion.html`: marco oscuro de mayor grosor (`2px solid #34495e`) y sombra en cada tarjeta de factura individual para que no se pierdan con el fondo.
- [x] Resaltado de filas de ingreso (contado, abono, ingreso) con fondo verde y mayor contraste en fondo general de `movil.html`.
- [ ] Pruebas de impresión de tickets tras ventas reales/abonos masivos.
- [ ] Monitorear actualización de saldos en `GrupoManager`.

## 🟡 Tareas Pendientes (Backlog)
- [ ] Revisar consistencia en `movil.html`.
- [ ] Optimización de lógica de búsqueda en inventario.
- [ ] Lazy loading para el historial antiguo.

## ✅ Tareas Completadas
- [x] Modularización total de `ventas.html` (repartido en carpetas `/js`).
- [x] Corrección de errores de `serverTimestamp` y lógica de impresión.
- [x] Creación de archivos de gestión (`task.md`, `project_status.md`).
- [x] (12/10/2026) Actualización de `REGLAS.md`: sincronización de reglas de comunicación, flujo de desarrollo, auditoría y control de guardado desde willianworkshop.
- [x] (13/10/2026) Creación de `INDICE_SISTEMA.md` (mapa maestro, guías por pantalla, diagnóstico de fallas y bitácora) y adición como lectura obligatoria en `REGLAS.md`.
- [x] (13/10/2026) `ventas_movil.html`: Creación de icono SVG e indicador de PIVOT para tickets, buscador, carrito e historial reconociendo los 5 códigos de inventario (AB171021, 24171129, 36AB400A, 36244016, 24171198).


