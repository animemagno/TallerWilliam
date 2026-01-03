# ✅ Sistema de Estado de Cuenta - INSTALACIÓN COMPLETA

## 📁 Archivos Creados

### **Módulos JavaScript:**
1. **`js/estadoCuenta.js`** - Lógica de generación e impresión de estados de cuenta
2. **`js/facturasManager.js`** - Renderizado de equipos/grupos y gestión de impresión
3. **`css/estadoCuenta.css`** - Estilos (opcional, no se usa modal)

### **Documentación:**
- `docs/ESTADO_CUENTA_GUIA.md` - Guía completa de uso
- `docs/ESTADO_CUENTA_EJEMPLOS.js` - Ejemplos de integración

---

## 🎯 Cómo Funciona

### **1. Botón "IMPRIMIR SALDOS" (Pestaña FACTURAS)**

Este botón ya existe en tu HTML (línea 100-103):
```html
<button class="btn btn-info" id="imprimir-saldos-btn"
    onclick="GrupoManager.imprimirSaldosEquipos()">
    <i class="fas fa-print"></i> IMPRIMIR SALDOS
</button>
```

**Al hacer clic:**
- Consulta TODOS los equipos con saldo pendiente
- Genera un ticket consolidado con formato:
  ```
  TALLER WILLIAN
  RESUMEN DE SALDOS
  15/12/25
  ---------------------------
  EQUIPOS CON SALDO:
  
  Eq. 20 (8)      $80.00
  Eq. 15 (3)      $40.00
  Eq. 33 (2)      $15.00
  ---------------------------
  TOTAL GENERAL:  $135.00
  3 equipos
  ```
- Lo envía directo a imprimir (58mm, 22px)

---

### **2. Botón "Imprimir" en cada Equipo**

Cuando haces clic en la pestaña **"FACTURAS"**, se cargan tarjetas de equipos automáticamente.

Cada tarjeta tiene un botón **"Imprimir"** que:
- Genera un ticket detallado con:
  - Lista de facturas pendientes
  - Abonos realizados (si existen)
  - Saldo actual
  
**Ejemplo de salida:**
```
TALLER WILLIAN
ESTADO DE CUENTA
15/12/25
---------------------------
EQUIPO: 20
---------------------------
FACTURAS PENDIENTES:
#001    $10.00
#002    $10.00
...
---------------------------
TOTAL: $80.00

ABONOS:
15/12/2025  $30.00
---------------------------
SALDO ACTUAL: $50.00
```

---

### **3. Botón "Imprimir" en cada Grupo**

Cuando haces clic en la pestaña **"GRUPOS"**, se cargan las tarjetas de grupos.

Cada tarjeta tiene un botón **"Imprimir"** que genera:
```
TALLER WILLIAN
ESTADO DE CUENTA - GRUPO
15/12/25
---------------------------
GRUPO: NOMINA DIC
---------------------------
EQUIPOS:
Eq. 15    $40.00
Eq. 33    $15.00
Eq. 23    $10.00
---------------------------
TOTAL: $65.00

ABONOS GRUPALES:
15/12/2025  $30.00
---------------------------
SALDO ACTUAL: $35.00
```

---

## 🚀 Para Probar

1. **Recarga** `ventas_refactor.html` en el navegador
2. **Verifica la consola** (F12) para asegurarte de que no hay errores
3. **Haz clic** en la pestaña "FACTURAS"
   - Deberías ver tarjetas de equipos con saldo
   - Haz clic en **"Imprimir"** de cualquier equipo
4. **Haz clic** en "IMPRIMIR SALDOS" (arriba a la derecha)
   - Deberá imprimir el resumen consolidado
5. **Haz clic** en la pestaña "GRUPOS"
   - Deberías ver tarjetas de grupos
   - Haz clic en **"Imprimir"** de cualquier grupo

---

## 🔧 Estructura del Código

### `facturasManager.js` contiene:

```javascript
FacturasManager = {
    cargarEquiposPendientes()      // Carga equipos en pestaña Facturas
    renderEquipoCard(equipo)        // Renderiza tarjeta de equipo
    imprimirEstadoCuentaEquipo()    // Imprime estado de un equipo
    abonarEquipo()                  // Placeholder para abonos
}

GruposManager = {
    cargarGrupos()                  // Carga grupos en pestaña Grupos
    renderGrupoCard(grupo)          // Renderiza tarjeta de grupo
    imprimirEstadoCuentaGrupo()     // Imprime estado de un grupo
    imprimirSaldosEquipos()         // ★ IMPRIME RESUMEN CONSOLIDADO
    generarTicketConsolidado()      // Genera HTML del resumen
    abonarGrupo()                   // Placeholder para abonos
}
```

### `estadoCuenta.js` contiene:

```javascript
EstadoCuentaService = {
    obtenerEstadoCuentaEquipo()     // Consulta Firestore para un equipo
    obtenerEstadoCuentaGrupo()      // Consulta Firestore para un grupo
    imprimirEstadoCuenta()          // Genera e imprime el ticket
    generarTicketEquipo()           // HTML para ticket de equipo
    generarTicketGrupo()            // HTML para ticket de grupo
}
```

---

## ⚠️ Notas Importantes

1. **Los botones "Abonar" son placeholders**
   - Mostrarán un `alert()` 
   - Cuando tengas la lógica de abonos lista, edita:
     - `FacturasManager.abonarEquipo()` en `js/facturasManager.js`
     - `GruposManager.abonarGrupo()` en `js/facturasManager.js`

2. **Pestañas automáticas**
   - El sistema detecta cuando haces clic en "FACTURAS" o "GRUPOS"
   - Carga automáticamente los datos de Firestore
   - No necesitas hacer nada manualmente

3. **Formato de impresión**
   - Todos los tickets usan **58mm** de ancho
   - Fuente **22px** (estándar térmico)
   - **Courier New** monoespaciado

---

## 🐛 Solución de Problemas

### "No aparecen equipos/grupos"
- Verifica que Firebase esté conectado
- Revisa la consola (F12) para ver errores
- Asegúrate de tener facturas pendientes en Firestore

### "El botón IMPRIMIR SALDOS no funciona"
- Verifica que `js/facturasManager.js` se haya cargado
- Revisa la consola para errores de JavaScript

### "Los tickets salen en blanco"
- Verifica la configuración de la impresora
- Asegúrate de que es una impresora térmica de 58mm

---

## 📞 Próximos Pasos

1. ✅ **Sistema de impresión completo**
2. 🔄 **Integrar lógica de abonos** (placeholders listos)
3. 🔄 **Conectar edición de grupos** (placeholder listo)

¡Todo está listo para funcionar! 🎉
