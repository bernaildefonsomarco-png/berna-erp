import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import TabPlantillas from './TabPlantillas';
import TabRoles from './TabRoles';
import TabCatalogosAux from './TabCatalogosAux';
import TabPeriodos from './TabPeriodos';
import TabSalud from './TabSalud';

const TABS = [
  { key: 'plantillas', label: 'Plantillas', Comp: TabPlantillas },
  { key: 'roles', label: 'Roles', Comp: TabRoles },
  { key: 'aux', label: 'Catálogos auxiliares', Comp: TabCatalogosAux },
  { key: 'periodos', label: 'Períodos', Comp: TabPeriodos },
  { key: 'salud', label: 'Salud', Comp: TabSalud },
];

const TAB_KEYS = new Set(TABS.map((t) => t.key));

export default function CatalogoAdmin() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const tabQ = searchParams.get('tab');
  const [tab, setTab] = useState(() => (tabQ && TAB_KEYS.has(tabQ) ? tabQ : 'plantillas'));

  useEffect(() => {
    if (tabQ === 'tipos' || tabQ === 'mapeo') {
      navigate('/gestion/config/tipos-movimiento', { replace: true });
      return;
    }
    if (tabQ && TAB_KEYS.has(tabQ)) setTab(tabQ);
  }, [tabQ, navigate]);

  const Active = useMemo(() => (TABS.find((t) => t.key === tab) || TABS[0]).Comp, [tab]);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Catálogo del sistema</h1>
      <p className="text-sm text-stone-600">
        Tipos de movimiento y mapeo contable:{' '}
        <a href="/gestion/config/tipos-movimiento" className="font-medium text-indigo-600 underline">
          pantalla dedicada
        </a>
        .
      </p>
      <nav className="flex flex-wrap gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.key ? 'border-b-2 border-stone-900 text-stone-900' : 'text-stone-500 hover:text-stone-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <div className="pt-2">
        <Active />
      </div>
    </div>
  );
}
