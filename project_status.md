# Estado del Proyecto - Taller William

## 📋 Resumen Técnico
Proyecto web para gestión de taller automotriz/industrial.
- **Frontend:** HTML5, CSS3 (Vanilla), JavaScript (Vanilla).
- **Backend/Datos:** Firebase (Firestore).
- **Enfoque:** Diseño *Mobile-First*, estética moderna (Glassmorphism/Dark Mode).

## 🚀 Funcionalidades Clave
1.  **Inventario (`inventario.html`):** Gestión de productos, entradas y salidas.
2.  **Ventas (`ventas.html`):** Punto de venta, carrito, facturación.
3.  **Movil (`movil.html`):** Interfaz optimizada para celulares, resumen de movimientos y búsqueda rápida.
4.  **Análisis Móvil (`movil_analisis.html`):** Herramientas de análisis y reportes para móvil.

## 🐛 Bugs Conocidos
- [x] Historial de ventas desaparece intermitentemente (FIXED: Implementado Promise.allSettled para carga robusta y eliminado dependencias de índices compuestos en filtros por fecha).
- [ ] Inconsistencias ocasionales en UI de gestión de grupos.
- [ ] Error de timeout en conexiones muy lentas (Mitigado con manejo de errores mejorado, pero requiere monitoreo).

## Mejoras Pendientes
- [ ] Optimización de carga inicial (Lazy loading de historial antiguo).
- [ ] Mejorar feedback visual al eliminar/editar abonos.
- [ ] Implementar caché persistente más agresivo para catálogo de productos.

## 🔧 Deuda Técnica / Mejoras
- Estandarización de clases CSS para el diseño premium.
- Validación de consistencia de datos entre PC y Móvil.
