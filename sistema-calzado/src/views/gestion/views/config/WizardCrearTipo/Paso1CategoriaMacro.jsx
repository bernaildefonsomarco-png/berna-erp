const CATEGORIAS = [
  { code: 'ingreso',         emoji: '💰', titulo: 'Entra dinero',         desc: 'Venta, devolución de proveedor, préstamo recibido' },
  { code: 'gasto_operativo', emoji: '💸', titulo: 'Sale — gasto operativo', desc: 'Servicios, alquiler, suministros' },
  { code: 'pago_personas',   emoji: '👥', titulo: 'Sale — pago a personas', desc: 'Sueldo, bono, adelanto, comisión' },
  { code: 'inversion',       emoji: '🏗️', titulo: 'Sale — inversión',     desc: 'Compra de máquina, mejora de local' },
  { code: 'traslado',        emoji: '🔁', titulo: 'Entre cuentas propias',  desc: 'Traslado, no es gasto' },
  { code: 'pago_deuda',      emoji: '💳', titulo: 'Pago de deuda / financiero', desc: 'Cuota préstamo, intereses' },
  { code: 'compra_material', emoji: '📦', titulo: 'Compra de material',    desc: 'Insumos para producción' },
];

export default function Paso1CategoriaMacro({ onSeleccionar }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-stone-600">¿Qué clase de actividad económica representa este tipo?</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {CATEGORIAS.map((c) => (
          <button
            key={c.code}
            type="button"
            className="rounded-xl border border-stone-200 bg-white p-3 text-left shadow-sm transition hover:border-stone-400 hover:shadow"
            onClick={() => onSeleccionar(c.code)}
          >
            <div className="text-2xl">{c.emoji}</div>
            <div className="mt-1 text-sm font-semibold text-stone-900">{c.titulo}</div>
            <div className="mt-0.5 text-xs text-stone-500">{c.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
