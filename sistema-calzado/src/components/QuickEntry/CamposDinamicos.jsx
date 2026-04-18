// src/components/QuickEntry/CamposDinamicos.jsx
export default function CamposDinamicos({ campos, valores, onChange, ubicaciones, personas }) {
  return (
    <div className="space-y-3">
      {campos.map((c) => (
        <label key={c.key} className="block">
          <span className="mb-1 block text-sm font-medium">
            {c.label}
            {c.requerido && <span className="ml-1 text-rose-600">*</span>}
          </span>
          {renderInput(c, valores[c.key], (v) => onChange(c.key, v), { ubicaciones, personas })}
        </label>
      ))}
    </div>
  );
}

function renderInput(campo, valor, onChange, opts) {
  if (campo.tipo === 'numero') {
    return (
      <input
        type="number"
        inputMode="decimal"
        step="0.01"
        value={valor ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className="w-full rounded-md border px-3 py-2"
      />
    );
  }
  if (campo.tipo === 'ubicacion') {
    return (
      <select
        value={valor ?? ''}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        className="w-full rounded-md border px-3 py-2"
      >
        <option value="">— Selecciona —</option>
        {opts.ubicaciones.map((u) => (
          <option key={u.id_ubicacion} value={u.id_ubicacion}>
            {u.nombre} ({u.rol})
          </option>
        ))}
      </select>
    );
  }
  if (campo.tipo === 'persona') {
    return (
      <select
        value={valor ?? ''}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        className="w-full rounded-md border px-3 py-2"
      >
        <option value="">— Selecciona —</option>
        {opts.personas.map((p) => (
          <option key={p.id_persona} value={p.id_persona}>
            {p.nombre} · {p.rol}
          </option>
        ))}
      </select>
    );
  }
  if (campo.tipo === 'select' && campo.opciones) {
    return (
      <select
        value={valor ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border px-3 py-2"
      >
        <option value="">— Selecciona —</option>
        {campo.opciones.map((o) => (
          <option key={o.codigo} value={o.codigo}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      type="text"
      value={valor ?? ''}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border px-3 py-2"
    />
  );
}
