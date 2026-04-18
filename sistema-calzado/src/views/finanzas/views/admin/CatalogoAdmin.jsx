import { useState } from 'react';
import TabTiposMovimiento from './TabTiposMovimiento';
import TabPlantillas from './TabPlantillas';
import TabMapeo from './TabMapeo';
import TabRoles from './TabRoles';
import TabCatalogosAux from './TabCatalogosAux';
import TabPeriodos from './TabPeriodos';
import TabSalud from './TabSalud';

const TABS = [
  { key:'tipos', label:'Tipos de movimiento', Comp: TabTiposMovimiento },
  { key:'plantillas', label:'Plantillas', Comp: TabPlantillas },
  { key:'mapeo', label:'Mapeo Tipo↔Cuenta', Comp: TabMapeo },
  { key:'roles', label:'Roles', Comp: TabRoles },
  { key:'aux', label:'Catálogos auxiliares', Comp: TabCatalogosAux },
  { key:'periodos', label:'Períodos', Comp: TabPeriodos },
  { key:'salud', label:'Salud', Comp: TabSalud },
];

export default function CatalogoAdmin() {
  const [tab, setTab] = useState('tipos');
  const Active = TABS.find((t) => t.key === tab).Comp;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Catálogo del sistema</h1>
      <nav className="flex flex-wrap gap-1 border-b">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
                  className={`px-3 py-2 text-sm font-medium transition-colors ${tab===t.key?'border-b-2 border-stone-900 text-stone-900':'text-stone-500 hover:text-stone-700'}`}>
            {t.label}
          </button>
        ))}
      </nav>
      <div className="pt-2"><Active /></div>
    </div>
  );
}
