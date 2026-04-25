import WorkspaceSwitcher from './WorkspaceSwitcher';

export default function HeaderGlobal({ usuario, onOpenRegistrar, onOpenMobileMenu }) {
  return (
    <header className="gestion-header-global">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 md:gap-3">
        {onOpenMobileMenu && (
          <button
            type="button"
            onClick={onOpenMobileMenu}
            className="shrink-0 rounded-md border border-stone-600 bg-stone-800 px-2.5 py-1.5 text-xs font-medium text-stone-100 md:hidden"
            aria-label="Abrir menú de navegación"
          >
            Menú
          </button>
        )}
        <WorkspaceSwitcher usuario={usuario} currentWorkspace="gestion" />
        <h1 className="gestion-ws-title m-0">Gestión Empresarial</h1>
      </div>
      <div className="flex items-center gap-2 md:gap-3">
        <button type="button" className="gestion-btn-registrar" onClick={onOpenRegistrar}>
          + Registrar
        </button>
        <span className="gestion-user-chip" title={usuario?.nombre || ''}>
          {usuario?.nombre || 'Usuario'}
        </span>
      </div>
    </header>
  );
}
