import { useNavigate } from 'react-router-dom';
import { tienePermiso, RECURSOS } from '../lib/permisos';

const WORKSPACES = [
  { code: 'gestion', label: 'Gestión Empresarial', path: '/gestion', recurso: RECURSOS.FINANZAS, nivel: 'ver' },
  { code: 'operaciones', label: 'Operaciones (tienda)', path: '/', recurso: RECURSOS.FINANZAS, nivel: 'ver' },
  { code: 'comando', label: 'Comando', path: '/comando', recurso: RECURSOS.RAPIDO, nivel: 'registrar' },
];

export default function WorkspaceSwitcher({ usuario, currentWorkspace = 'gestion' }) {
  const navigate = useNavigate();
  const opciones = WORKSPACES.filter((w) => tienePermiso(usuario, w.recurso, w.nivel || 'ver'));

  return (
    <select
      className="gestion-ws-select"
      aria-label="Cambiar workspace"
      value={currentWorkspace}
      onChange={(e) => {
        const target = WORKSPACES.find((w) => w.code === e.target.value);
        if (target) navigate(target.path);
      }}
    >
      {opciones.map((w) => (
        <option key={w.code} value={w.code}>
          {w.label}
        </option>
      ))}
    </select>
  );
}
