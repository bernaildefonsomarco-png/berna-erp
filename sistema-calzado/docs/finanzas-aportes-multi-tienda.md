# Aportes variables entre tiendas (diseño operativo)

Cuando varias tiendas aportan a un mismo gasto (luz común, obligación compartida, etc.) en **montos distintos el mismo día**, el sistema registra **un solo movimiento** con **splits**:

1. Ir a **Finanzas → Movimientos → Nuevo movimiento manual**.
2. Activar **split** e ingresar una línea por cada cuenta/tienda:
   - **Cuenta**: de dónde sale el dinero (caja BCP, caja tienda, etc.).
   - **Monto**: lo que aportó esa línea.
   - **Tienda que aporta (opcional)**: etiqueta contable (`id_ubicacion` en `movimiento_splits`) para saber si el aporte vino de 1039, 1042 o 1044.

La suma de splits debe coincidir con el monto total del movimiento.

### Alternativa: transferencias

Para mover saldo entre cuentas sin imputar P&amp;L inmediato, usar **Transferencias** con concepto claro; para capital hacia compra de materiales usar motivo `aporte_pedido` cuando aplique.
