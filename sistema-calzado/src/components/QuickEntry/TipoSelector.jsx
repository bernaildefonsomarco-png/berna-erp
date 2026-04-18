// src/components/QuickEntry/TipoSelector.jsx
import { useMemo, useState } from 'react';

export default function TipoSelector({ tipos, onSelect }) {
  const [q, setQ] = useState('');
  const filtrados = useMemo(() => {
    const norm = q.trim().toLowerCase();
    if (!norm) return tipos.slice(0, 12);
    return tipos
      .filter(
        (t) =>
          t.nombre.toLowerCase().includes(norm) ||
          (t.codigo || '').toLowerCase().includes(norm) ||
          (t.categoria || '').toLowerCase().includes(norm)
      )
      .slice(0, 12);
  }, [tipos, q]);

  return (
    <div className="space-y-3">
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar tipo de movimiento..."
        className="w-full rounded-md border px-3 py-2 text-lg"
      />
      <ul className="divide-y">
        {filtrados.map((t) => (
          <li key={t.id_tipo}>
            <button
              onClick={() => onSelect(t)}
              className="flex w-full items-center gap-3 py-3 text-left hover:bg-stone-50"
            >
              <span className="text-2xl">{t.emoji || '·'}</span>
              <span className="flex-1">
                <span className="block font-medium">{t.nombre}</span>
                <span className="block text-sm text-stone-500">
                  {t.categoria} · {t.direccion || 'sin dirección'}
                </span>
              </span>
            </button>
          </li>
        ))}
        {filtrados.length === 0 && (
          <li className="py-3 text-center text-stone-500">Sin coincidencias</li>
        )}
      </ul>
    </div>
  );
}
