# ÍNDICE MAESTRO Y GUÍA DE FUNCIONAMIENTO - TALLER WILLIAM

Este documento es el mapa oficial del sistema y la bitácora de cambios del taller. Contiene el propósito, flujo de trabajo, campos de datos, pestañas y archivos vinculados de cada pantalla del proyecto, además de su registro histórico de modificaciones.

> **Regla de uso obligatorio:** En cada nueva sesión de trabajo, el Agente debe leer este archivo junto a `REGLAS.md` y `task.md` antes de realizar cualquier cambio, para comprender el funcionamiento real del taller, ubicar fallas rápidamente y no alterar la lógica compartida.

---

## 🗺️ 1. Mapa Resumen del Flujo de Información

El sistema opera en torno a la caja, el inventario y los servicios del taller:

```
                  ┌──────────────────────────────┐
                  │          index.html          │
                  │   (Menú Principal de Acceso) │
                  └──────────────┬───────────────┘
                                 │
         ┌───────────────────────┼────────────────────────┐
         ▼                       ▼                        ▼
 ┌───────────────┐       ┌───────────────┐        ┌───────────────┐
 │inventario.html│       │  ventas.html  │        │control entrega│
 │(Stock base +  │       │(PC - Carrito, │        │(Mototaxis,    │
 │auditoría mes) │       │ cuentas, caja)│        │ cuotas y días)│
 └───────┬───────┘       └───────┬───────┘        └───────────────┘
         │                       │
         │          ┌────────────┴────────────┐
         │          ▼                         ▼
         │  ┌───────────────┐         ┌───────────────┐
         │  │ventas_movil   │         │analisis_finan │
         │  │(POS Celular)  │         │(Ganancias MO  │
         │  └───────────────┘         │ vs Repuestos) │
         │                            └───────────────┘
         │                                    ▲
         └──────── Auditoría de Fin de Mes ───┘
```

---

## 📄 2. Detalle de Pantallas y Funciones

---

### 1. `ventas.html` (Punto de Venta Central en PC)

* **Propósito:**
  Es el panel principal de ventas, facturación y cobro en la computadora del taller. Permite armar carritos de repuestos, asignar cobros de contado o a crédito (pendientes), organizar clientes en grupos, registrar movimientos de caja y generar tickets de impresión.

* **Flujo de Trabajo / Mecánica de Uso:**
  1. **Armar la Venta (Columna Derecha):**
     * Se coloca el **# de Equipo** (hasta 4 dígitos) o se selecciona un **Grupo**.
     * Se busca el producto en la barra de búsqueda por nombre o código (o formato rápido: ej. *3 pernos $5*). Al seleccionarlo se agrega al carrito.
     * Si la venta se cancela en el acto, se presiona **CONTADO**; si el cliente se lleva el repuesto y paga después, se presiona **PENDIENTE**.
  2. **Gestión de Pestañas (Columna Izquierda):**
     * **Carrito:** Muestra los productos cargados, cantidad, precio, subtotal y total a cobrar. Permite modificar cantidades o quitar ítems.
     * **Facturas:** Muestra todas las ventas pendientes organizadas por número de equipo. Incluye el botón **IMPRIMIR SALDOS** para ver lo adeudado.
     * **Grupos:** Organiza mototaxis o clientes asociados a una cuenta común. Permite ver el saldo global del grupo y presionar **ABONAR A GRUPO** para aplicar abonos masivos o parciales.
     * **Historial:** Muestra las ventas del día, resumen de dinero en caja (contados, abonos, retiros), buscador global de ventas y botón **REPORTE**.
  3. **Control de Caja y Utilidades (Encabezado):**
     * **INGRESO:** Registra entradas manuales de dinero en caja.
     * **RETIRO:** Registra salidas o gastos tomados del efectivo del taller.
     * **RESPALDO:** Descarga una copia de seguridad de la información.
     * **Selector de Impresora:** Alterna entre formato de ticket de 57mm y 80mm.
     * Enlaces directos a `servicios_editor.html` (para mano de obra) y `analisis_financiero.html`.

* **Archivos Vinculados:**
  * Vista: [ventas.html](file:///c:/Users/Esteban/Documents/TallerWillian/TallerWilliam/ventas.html)
  * Estilos: `css/ventas_styles.css`
  * Lógica y Controladores en `/js`:
    * [App.js](file:///c:/Users/Esteban/Documents/TallerWillian/TallerWilliam/js/App.js): Inicialización del sistema y conexión.
    * [SalesService.js](file:///c:/Users/Esteban/Documents/TallerWillian/TallerWilliam/js/SalesService.js): Control del carrito, cobros y guardado de facturas.
    * [DataService.js](file:///c:/Users/Esteban/Documents/TallerWillian/TallerWilliam/js/DataService.js): Conexión directa y consultas con Firebase Firestore.
    * [GrupoManager.js](file:///c:/Users/Esteban/Documents/TallerWillian/TallerWilliam/js/GrupoManager.js): Creación, abonos y saldos de grupos.
    * [FacturasTabManager.js](file:///c:/Users/Esteban/Documents/TallerWillian/TallerWilliam/js/FacturasTabManager.js): Control de la pestaña de facturas pendientes.
    * [GruposTabManager.js](file:///c:/Users/Esteban/Documents/TallerWillian/TallerWilliam/js/GruposTabManager.js): Control de la pestaña de grupos.
    * [HistorialService.js](file:///c:/Users/Esteban/Documents/TallerWillian/TallerWilliam/js/HistorialService.js): Resumen del día y búsqueda histórica.
    * [PrintingService.js](file:///c:/Users/Esteban/Documents/TallerWillian/TallerWilliam/js/PrintingService.js): Generación de tickets térmicos y comprobantes.
    * [UIService.js](file:///c:/Users/Esteban/Documents/TallerWillian/TallerWilliam/js/UIService.js): Ventanas modales, alertas y cambio de vista.
  * Base de Datos (Firestore): Colecciones `VENTAS`, `GRUPOS`, `INVENTARIO`, `CAJA`.

---

### 2. `ventas_movil.html` (Punto de Venta Táctil para Celulares)

* **Propósito:**
  Permite al personal registrar pedidos o ventas directamente desde su teléfono celular en el patio del taller, con interfaz táctil y modo oscuro.

* **Flujo de Trabajo / Mecánica de Uso:**
  1. Se elige el vendedor en el selector superior (Ventas, Marcos, Elmer).
  2. **Pestaña Venta:** Se escribe el # de Equipo y el Grupo (si aplica). Se busca el producto en la lista y se toca para agregarlo. Al tocarlo se abre un teclado numérico táctil para ingresar cantidad y precio especial.
  3. **Pestaña Carrito:** Muestra los productos seleccionados y el total. El vendedor presiona **ENVIAR PEDIDO** para mandarlo a la caja principal.
  4. **Pestaña Mis Envíos / Historial:** Lista los pedidos enviados durante la jornada y cuenta con una lupa para consultar el historial de cualquier equipo por su número.

* **Archivos Vinculados:**
  * Vista: [ventas_movil.html](file:///c:/Users/Esteban/Documents/TallerWillian/TallerWilliam/ventas_movil.html)
  * Lógica: Integrada en el archivo con Firebase SDK y caché de productos.
  * Base de Datos: Lee `INVENTARIO` y escribe en `VENTAS`.

---

### 3. `inventario.html` (Control de Inventario y Auditoría de Stock)

* **Propósito:**
  Administrar el catálogo de productos y existencias físicas del taller, garantizando que el stock nunca se desajuste por facturaciones intermedias.

* **Flujo de Trabajo / Reglas de Inventario:**
  1. **Existencias Congeladas:** En la base de datos oficial (`INVENTARIO`), el stock físico no cambia con cada venta individual diaria.
  2. **Stock Simulado:** La pantalla consulta las ventas acumuladas del mes (`RESUMEN_SALIDAS_MES`) y resta automáticamente esas unidades en tiempo real, mostrando al usuario el stock real disponible.
  3. **Conciliación Inteligente:** Asistente por pasos para comparar listas de Excel contra la base de datos, identificando productos nuevos, coincidencias y diferencias de precios.
  4. **Auditoría de Fin de Mes:**
     * Al finalizar el mes, el encargado entra a la opción de auditoría.
     * El sistema resta de manera definitiva todas las salidas mensuales del inventario físico oficial.
     * Reinicia el acumulador mensual a cero para arrancar el nuevo mes limpio y cuadrado.

* **Archivos Vinculados:**
  * Vista: [inventario.html](file:///c:/Users/Esteban/Documents/TallerWillian/TallerWilliam/inventario.html)
  * Base de Datos (Firestore): `INVENTARIO` y `RESUMEN_SALIDAS_MES`.

---

### 4. `control de entrega.html` (Control de Mototaxis y Cuotas Diarias)

* **Propósito:**
  Módulo especializado para el control de entrega de mototaxis, seguimiento del cumplimiento de cuotas diarias de los conductores y generación de recibos mensuales.

* **Flujo de Trabajo / Pestañas:**
  1. **Pestaña "Registro Rápido":**
     * Muestra la cuadrícula de mototaxis/equipos activos.
     * Al tocar un equipo, se abre su calendario de trabajo para registrar la cuota del día de forma directa con 2 clics.
  2. **Pestaña "Gestionar Equipos":**
     * Alta, edición y desactivación de mototaxis y choferes con su tarifa asignada.
  3. **Pestaña "Depósitos por Equipo":**
     * Resumen de dinero entregado y saldo acumulado por cada vehículo.
  4. **Pestaña "Calendario Mensual":**
     * Visualización con colores: Verde (cuota entregada), Rojo (día pasado sin entrega), Gris (día de descanso/domingo).
     * Permite emitir e imprimir el recibo mensual en hoja completa con firma del conductor y del taller.

* **Archivos Vinculados:**
  * Vista: [control de entrega.html](file:///c:/Users/Esteban/Documents/TallerWillian/TallerWilliam/control%20de%20entrega.html)
  * Base de Datos (Firestore): Registros de períodos, entregas diarias y mototaxis.

---

### 5. `analisis_financiero.html` (Análisis de Ganancias y Contabilidad)

* **Propósito:**
  Dashboard de control contable para visualizar ingresos totales y desglosar con precisión la ganancia real separando repuestos vendidos de mano de obra cobrada.

* **Flujo de Trabajo:**
  1. **Tarjetas de Resumen:** Muestra Total Facturado, Total en Mano de Obra (MO) y Total en Materiales/Repuestos (Mat).
  2. **Filtro de Fechas:** Menú desplegable para fijar fecha inicial y final de análisis.
  3. **Vista de Lista:** Listado detallado de todas las facturas del período con etiquetas identificadoras (`tag-prod`, `tag-serv`, `tag-mix`).
  4. **Vista de Calendario:** Cuadrícula del mes con el monto total recaudado día a día.
  5. **Gráficos Semanales:** Curvas comparativas de ingresos por períodos.

* **Archivos Vinculados:**
  * Vista: [analisis_financiero.html](file:///c:/Users/Esteban/Documents/TallerWillian/TallerWilliam/analisis_financiero.html)
  * Librería: Chart.js para gráficas.
  * Versión móvil complementaria: [movil_analisis.html](file:///c:/Users/Esteban/Documents/TallerWillian/TallerWilliam/movil_analisis.html).

---

### 6. Pantallas de Soporte y Herramientas

* **`index.html`:** Portal de entrada con accesos directos a todos los módulos.
* **`servicios_editor.html`:** Catálogo rápido para definir precios estándar de servicios y mano de obra frecuente (cambios de aceite, frenos, ajustes).
* **`generar_qr.html`:** Generador de códigos QR para que los mecánicos escaneen con el celular y abran la versión móvil rápidamente.
* **`movil.html`:** Panel móvil de monitoreo de movimientos y cuentas por cobrar.

---

## 🛠️ 3. Guía de Diagnóstico Rápido de Fallas

Si se presenta un error en el taller, revisar en este orden:

| Síntoma de Falla | Dónde Revisar Primero | Archivo Responsable |
| :--- | :--- | :--- |
| **No cargan productos en ventas** | Verificar conexión Firebase y caché local | [ProductCache.js](file:///c:/Users/Esteban/Documents/TallerWillian/TallerWilliam/js/ProductCache.js) / [DataService.js](file:///c:/Users/Esteban/Documents/TallerWillian/TallerWilliam/js/DataService.js) |
| **El ticket no se imprime o sale blanco** | Revisar tamaño configurado (57mm/80mm) y bloqueo de ventanas emergentes | [PrintingService.js](file:///c:/Users/Esteban/Documents/TallerWillian/TallerWilliam/js/PrintingService.js) |
| **El saldo de un grupo no actualiza tras abonar** | Verificar cálculo de saldos y actualización de estado de factura | [GrupoManager.js](file:///c:/Users/Esteban/Documents/TallerWillian/TallerWilliam/js/GrupoManager.js) / [SalesService.js](file:///c:/Users/Esteban/Documents/TallerWillian/TallerWilliam/js/SalesService.js) |
| **El stock en pantalla no coincide con el inventario** | Confirmar si las ventas del mes están sumándose en `RESUMEN_SALIDAS_MES` | [inventario.html](file:///c:/Users/Esteban/Documents/TallerWillian/TallerWilliam/inventario.html) |
| **Error en fechas al guardar en Firebase** | Revisar formato de `serverTimestamp` | [DateUtils.js](file:///c:/Users/Esteban/Documents/TallerWillian/TallerWilliam/js/DateUtils.js) / [App.js](file:///c:/Users/Esteban/Documents/TallerWillian/TallerWilliam/js/App.js) |

---

## 📋 4. Bitácora de Modificaciones (Historial de Cambios)

> Cada cambio en el proyecto debe asentarse en esta tabla con su fecha, archivo modificado, detalle del cambio y razón.

| Fecha | Archivo / Pantalla | Cambio Realizado | Razón / Motivo |
| :--- | :--- | :--- | :--- |
| **12/10/2026** | `movil.html` | Resaltado de filas de ingreso (contado, abono) con fondo verde y mayor contraste general. | Facilitar la visualización rápida de cobros efectivos en pantallas de celular. |
| **12/10/2026** | `REGLAS.md` | Sincronización y actualización de normas de comunicación, guardado controlado y flujo de trabajo. | Estandarizar la forma de trabajo de la IA y evitar cambios no autorizados. |
| **13/10/2026** | `INDICE_SISTEMA.md` | Creación del índice maestro, guía de pantallas y bitácora del proyecto Taller William. | Proveer contexto completo e inmediato a la IA para diagnóstico rápido de fallas y registro de cambios. |
| **13/10/2026** | `REGLAS.md` | Incorporación de `INDICE_SISTEMA.md` en la lista de lectura obligatoria al iniciar. | Asegurar que cualquier sesión lea el índice antes de realizar modificaciones. |
| **13/10/2026** | `ventas_movil.html` | Implementación de indicador visual e icono personalizado de PIVOT (reconocimiento exclusivo por códigos: AB171021, 24171129, 36AB400A, 36244016, 24171198) en tickets, buscador, carrito e historial por equipo. | Distinguir de inmediato tickets y repuestos de tipo PIVOT sin confundirlos con servicios o mano de obra. |
