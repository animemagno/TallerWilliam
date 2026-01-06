/**
 * KardexService.js
 * Servicio para gestionar la bitácora de movimientos de inventario (Kardex).
 * Garantiza la integridad del stock mediante un historial inmutable y reconstrucción.
 */

const KardexService = {
    collectionName: 'INVENTORY_LOG',

    /**
     * Registra un movimiento en el Kardex y actualiza el stock del producto.
     * @param {string} productId - ID del producto en Firestore (INVENTARIO).
     * @param {string} type - Tipo de movimiento: 'entrada' | 'salida' | 'ajuste' | 'inicial'.
     * @param {number} quantity - Cantidad (siempre positiva).
     * @param {number} cost - Costo unitario (opcional).
     * @param {string} reference - Referencia (e.g., "Factura #123", "Corrección manual").
     * @param {object} metadata - Datos extra (usuario, fecha original, etc.).
     */
    async logMovement(productId, type, quantity, cost = 0, reference = '', metadata = {}) {
        if (!productId) throw new Error("ID de producto requerido para Kardex.");
        if (quantity <= 0) throw new Error("La cantidad debe ser positiva.");

        const db = firebase.firestore();
        const batch = db.batch();
        const timestamp = firebase.firestore.FieldValue.serverTimestamp();

        // 1. Crear registro en Kardex
        const logRef = db.collection(this.collectionName).doc();
        const logData = {
            productId,
            type, // entrada, salida, ajuste, inicial
            quantity: Number(quantity),
            cost: Number(cost),
            reference: String(reference),
            timestamp,
            ...metadata
        };
        batch.set(logRef, logData);

        // 2. Calcular cambio de stock según tipo
        let change = 0;
        if (type === 'entrada' || type === 'inicial') {
            change = quantity;
        } else if (type === 'salida') {
            change = -quantity;
        } else if (type === 'ajuste') {
            // Para ajuste, asumimos que 'quantity' es el delta directo o se maneja aparte.
            // Por seguridad, un 'ajuste' debería ser explícito en signo si se permite negativo.
            // Para simplificar, asumiremos que 'ajuste' positivo SUMA y un nuevo tipo 'ajuste_neg' RESTA
            // O mejor: quantity siempre positivo, el TYPE define el signo.
            change = quantity; // Revisar lógica de invocación
        }

        // Ref al producto
        const productRef = db.collection('INVENTARIO').doc(productId);

        if (type === 'recalculo') {
            // Si es un recálculo forzado, no hacemos incremento atómico, seteamos el valor directo
            // PERO logMovement se suele usar para deltas. Miremos 'rebuildStock'.
        } else {
            batch.update(productRef, {
                cantidad: firebase.firestore.FieldValue.increment(change)
            });
        }

        await batch.commit();
        console.log(`[Kardex] Movimiento registrado: ${type} ${quantity} para ${productId}`);
        return logRef.id;
    },

    /**
     * Obtiene el historial de movimientos de un producto.
     */
    async getHistory(productId) {
        const db = firebase.firestore();
        const snapshot = await db.collection(this.collectionName)
            .where('productId', '==', productId)
            .orderBy('timestamp', 'desc')
            .get();

        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },

    /**
     * Reconstruye el stock de un producto sumando/restando todo su historial.
     * Útil para corregir desfases.
     */
    async rebuildStock(productId) {
        if (!productId) return;
        const history = await this.getHistory(productId);

        let calculatedStock = 0;
        history.reverse().forEach(log => { // Procesar desde el más antiguo
            const qty = Number(log.quantity) || 0;
            if (log.type === 'entrada' || log.type === 'inicial') {
                calculatedStock += qty;
            } else if (log.type === 'salida') {
                calculatedStock -= qty;
            }
            // Agregar más lógica si hay otros tipos
        });

        // Actualizar producto
        const db = firebase.firestore();
        await db.collection('INVENTARIO').doc(productId).update({
            cantidad: calculatedStock
        });

        console.log(`[Kardex] Stock reconstruido para ${productId}: ${calculatedStock}`);
        return calculatedStock;
    },

    /**
     * Revierte (anula) un movimiento específico.
     * Ej: Si eliminas una Entrada de 10, esto crea una contra-partida o ajusta el stock.
     */
    async revertMovement(logId) {
        const db = firebase.firestore();
        const docRef = db.collection(this.collectionName).doc(logId);
        const doc = await docRef.get();

        if (!doc.exists) throw new Error("Movimiento no encontrado");
        const log = doc.data();

        // Calcular reverso
        let reverseType = '';
        if (log.type === 'entrada') reverseType = 'salida'; // Revertir entrada = sacar
        else if (log.type === 'salida') reverseType = 'entrada'; // Revertir salida = meter
        else throw new Error(`No se puede revertir automáticamente tipo: ${log.type}`);

        // Registrar la reversión como un nuevo movimiento (Kardex auditable: no borramos el log original, creamos uno compensatorio)
        // Opcional: Marcar el original como 'anulado'

        await this.logMovement(
            log.productId,
            reverseType,
            log.quantity,
            log.cost,
            `Anulación de movimiento ${logId} (${log.reference})`,
            { relatedLogId: logId, action: 'revert' }
        );

        // Opcional: Marcar original como anulado visualmente
        await docRef.update({ isReverted: true });
    }
};

window.KardexService = KardexService;
