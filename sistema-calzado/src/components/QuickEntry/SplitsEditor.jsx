// src/components/QuickEntry/SplitsEditor.jsx
export default function SplitsEditor({ splits, montoTotal, cuentasFinancieras, onChange }) {
  function actualizar(i, parche) {
    const next = splits.map((s, idx) => (idx === i ? { ...s, ...parche } : s));
    onChange(next);
  }
  function agregar() {
    onChange([...splits, { id_cuenta: null, monto: 0, es_prestamo: false }]);
  }
  function quitar(i) {
    onChange(splits.filter((_, idx) => idx !== i));
  }
  const suma = splits.reduce((a, s) => a + (Number(s.monto) || 0), 0);
  const balanceado = Math.abs(suma - Number(montoTotal || 0)) < 0.005;

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <span className="font-medium">Dividir entre cuentas</span>
        <button onClick={agregar} className="text-sm text-indigo-600">+ Agregar fila</button>
      </div>
      {splits.map((s, i) => (
        <div key={i} className="flex items-center gap-2">
          <select
            value={s.id_cuenta ?? ''}
            onChange={(e) => actualizar(i, { id_cuenta: Number(e.target.value) })}
            className="flex-1 rounded-md border px-2 py-1"
          >
            <option value="">— Cuenta —</option>
            {cuentasFinancieras.map((c) => (
              <option key={c.id_cuenta} value={c.id_cuenta}>
                {c.nombre}
              </option>
            ))}
          </select>
          <input
            type="number"
            step="0.01"
            value={s.monto}
            onChange={(e) => actualizar(i, { monto: Number(e.target.value) })}
            className="w-24 rounded-md border px-2 py-1"
          />
          <label className="flex items-center gap-1 text-xs">
            <input
              type="checkbox"
              checked={s.es_prestamo}
              onChange={(e) => actualizar(i, { es_prestamo: e.target.checked })}
            />
            Préstamo
          </label>
          <button onClick={() => quitar(i)} className="text-rose-600">×</button>
        </div>
      ))}
      <div className={`text-sm ${balanceado ? 'text-emerald-700' : 'text-rose-700'}`}>
        Suma: S/ {suma.toFixed(2)} / Total: S/ {Number(montoTotal || 0).toFixed(2)}
      </div>
    </div>
  );
}
