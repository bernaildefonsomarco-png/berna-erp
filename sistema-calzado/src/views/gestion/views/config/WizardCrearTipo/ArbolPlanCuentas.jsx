import { useEffect, useState, useMemo, useCallback } from 'react';
import { listPlanCuentasArbol } from '../tiposMovimientoClient';

function buildTree(nodos) {
  const byParent = new Map();
  (nodos || []).forEach((n) => {
    const p = n.id_padre == null ? null : n.id_padre;
    if (!byParent.has(p)) byParent.set(p, []);
    byParent.get(p).push(n);
  });
  byParent.forEach((list) => list.sort((a, b) => a.codigo.localeCompare(b.codigo)));
  return byParent;
}

export default function ArbolPlanCuentas({ selectedId, onSelect }) {
  const [nodos, setNodos] = useState([]);
  const [expandidos, setExpandidos] = useState(() => new Set());
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const rows = await listPlanCuentasArbol();
        if (live) setNodos(rows);
      } finally {
        if (live) setCargando(false);
      }
    })();
    return () => { live = false; };
  }, []);

  const byParent = useMemo(() => buildTree(nodos), [nodos]);

  const toggle = useCallback((id) => {
    setExpandidos((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  const renderNodo = (nodo) => {
    const hijos = byParent.get(nodo.id_cuenta_contable) || [];
    const tieneHijos = hijos.length > 0;
    const abierto = expandidos.has(nodo.id_cuenta_contable);
    const esHoja = !tieneHijos;
    const elige = esHoja && nodo.permite_movimientos;
    return (
      <div key={nodo.id_cuenta_contable} className="select-none" style={{ marginLeft: (nodo.nivel - 1) * 12 }}>
        <div
          className={`flex items-center gap-1 rounded py-0.5 pr-1 text-sm ${
            selectedId === nodo.id_cuenta_contable ? 'bg-stone-200 font-medium' : 'hover:bg-stone-50'
          }`}
        >
          {tieneHijos ? (
            <button type="button" className="w-5 shrink-0 text-stone-500" onClick={() => toggle(nodo.id_cuenta_contable)} aria-label={abierto ? 'Contraer' : 'Expandir'}>
              {abierto ? '▾' : '▸'}
            </button>
          ) : (
            <span className="w-5 shrink-0 text-stone-300">·</span>
          )}
          <span className="font-mono text-xs text-stone-600">{nodo.codigo}</span>
          <span className="text-stone-800">{nodo.nombre}</span>
          {elige && (
            <button
              type="button"
              className="ml-auto rounded border border-stone-300 px-1.5 py-0.5 text-xs text-stone-700 hover:bg-stone-100"
              onClick={() => onSelect(nodo.id_cuenta_contable)}
            >
              {selectedId === nodo.id_cuenta_contable ? '✓' : 'Elegir'}
            </button>
          )}
        </div>
        {abierto && hijos.map(renderNodo)}
      </div>
    );
  };

  const raices = byParent.get(null) || [];
  if (cargando) return <p className="text-sm text-stone-500">Cargando plan de cuentas…</p>;
  if (!raices.length) return <p className="text-sm text-amber-700">No hay cuentas en el plan.</p>;

  return <div className="arbol-plan-cuentas max-h-72 overflow-y-auto rounded border border-stone-200 p-2">{raices.map(renderNodo)}</div>;
}
