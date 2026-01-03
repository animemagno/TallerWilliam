# 📊 Sistema de Estado de Cuenta - Guía de Uso

## ✅ Instalación Completada

Se han integrado los siguientes componentes en `ventas_refactor.html`:

1. **CSS**: `css/estadoCuenta.css` (ya vinculado en el `<head>`)
2. **JavaScript**: `js/estadoCuenta.js` (ya cargado antes del `</body>`)
3. **Modal HTML**: Insertado en `ventas_refactor.html` antes del cierre de `</body>`

---

## 🎯 Cómo Usar

### **Para Equipos Individuales**

Agrega un botón en la tarjeta de cada equipo:

```html
<button class="btn btn-info" onclick="mostrarEstadoCuentaEquipo('20')">
    📊 Estado de Cuenta
</button>
```

**Donde:**
- `'20'` es el número del equipo (debe coincidir con el campo `equipoNumber` en Firestore)

---

### **Para Grupos**

Agrega un botón en la tarjeta de cada grupo:

```html
<button class="btn btn-info" onclick="mostrarEstadoCuentaGrupo('NOMINA DIC')">
    📊 Estado de Cuenta
</button>
```

**Donde:**
- `'NOMINA DIC'` es el nombre del grupo (debe coincidir con el campo `clientName` en Firestore)

---

## 📝 Ejemplo de Integración

### En la función que renderiza equipos:

```javascript
function renderEquipo(equipo) {
    const html = `
        <div class="equipo-card">
            <h3>Equipo ${equipo.number}</h3>
            <p>Saldo: $${equipo.saldo.toFixed(2)}</p>
            
            <div class="equipo-actions">
                <button onclick="mostrarEstadoCuentaEquipo('${equipo.number}')">
                    📊 Estado de Cuenta
                </button>
                <button onclick="abonarEquipo('${equipo.number}')">
                    💰 Abonar
                </button>
            </div>
        </div>
    `;
    return html;
}
```

### En la función que renderiza grupos:

```javascript
function renderGrupo(grupo) {
    const html = `
        <div class="grupo-card">
            <h3>${grupo.name}</h3>
            <p>Saldo Total: $${grupo.saldoTotal.toFixed(2)}</p>
            
            <div class="grupo-actions">
                <button onclick="mostrarEstadoCuentaGrupo('${grupo.name}')">
                    📊 Estado de Cuenta
                </button>
                <button onclick="abonarGrupo('${grupo.name}')">
                    💰 Abonar Grupo
                </button>
            </div>
        </div>
    `;
    return html;
}
```

---

## 🔍 Funciones Disponibles

### `mostrarEstadoCuentaEquipo(equipoNumber)`
Genera y muestra el estado de cuenta de un equipo individual.

**Parámetros:**
- `equipoNumber` (string): Número del equipo

**Ejemplo:**
```javascript
mostrarEstadoCuentaEquipo('20'); // Muestra estado de cuenta del equipo 20
```

---

### `mostrarEstadoCuentaGrupo(groupName)`
Genera y muestra el estado de cuenta de un grupo.

**Parámetros:**
- `groupName` (string): Nombre del grupo

**Ejemplo:**
```javascript
mostrarEstadoCuentaGrupo('NOMINA DIC'); // Muestra estado de cuenta del grupo
```

---

### `cerrarEstadoCuentaModal()`
Cierra el modal de estado de cuenta.

**Uso interno:** Se llama automáticamente al hacer clic en "Cerrar" o en la "X".

---

## 🖨️ Funcionalidad de Impresión

El botón **"🖨️ Imprimir"** del modal:

1. Abre una nueva ventana con el ticket formateado para impresora térmica de 58mm
2. Usa fuente de 22px (igual que los tickets de venta actuales)
3. Muestra:
   - **Para Equipos**: Lista de facturas pendientes + abonos + saldo actual
   - **Para Grupos**: Lista de equipos con sus saldos + abonos grupales + saldo total

---

## 📊 Estructura de Datos Requerida

### Firestore Collection: `ventas`

El sistema busca documentos con estos campos:

```javascript
{
  equipoNumber: "20",           // Número del equipo
  clientName: "NOMINA DIC",     // Nombre del grupo (si aplica)
  paymentType: "pendiente",     // Tipo de pago
  total: 100.00,                // Total de la factura
  saldoPendiente: 50.00,        // Saldo pendiente (opcional)
  invoiceNumber: "001",         // Número de factura
  timestamp: Timestamp,         // Fecha de creación
  abonos: [                     // Array de abonos (opcional)
    {
      monto: 50.00,
      fecha: Timestamp
    }
  ]
}
```

---

## 🎨 Personalización del Modal

Si quieres cambiar colores, fuentes o estilos del modal, edita:
- `css/estadoCuenta.css`

El modal usa un gradiente morado (`#667eea` a `#764ba2`) que puedes cambiar.

---

## ⚠️ Notas Importantes

1. **Firebase debe estar inicializado** antes de llamar a las funciones
2. Las funciones son **async**, manejan errores automáticamente con `alert()`
3. El modal se **cierra automáticamente** después de imprimir
4. **Compatibilidad**: Funciona en Chrome, Firefox, Edge (requiere navegador moderno)

---

## 🐛 Solución de Problemas

### "Error al generar estado de cuenta"
- Verifica que Firebase esté conectado
- Revisa la consola del navegador (F12) para ver el error exacto
- Asegúrate de que el `equipoNumber` o `groupName` coincida exactamente con los datos en Firestore

### El modal no se muestra
- Verifica que `css/estadoCuenta.css` se haya cargado correctamente
- Revisa que el modal HTML esté presente en el DOM

### La impresión no funciona
- Verifica que la impresora térmica esté correctamente configurada
- Asegúrate de que el papel sea de 58mm en la configuración de Windows

---

## 📞 Soporte

Para modificaciones o mejoras, edita:
- **Lógica**: `js/estadoCuenta.js`
- **Estilos**: `css/estadoCuenta.css`
- **Modal HTML**: Directamente en `ventas_refactor.html` (líneas 6930-6952)
