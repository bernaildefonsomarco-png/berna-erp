import React, { useState, useRef, useEffect } from 'react';
import { formatMoney } from '../lib/calculos';
import { cn } from '@/lib/utils';
import { Button as ShadButton } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  Sheet as ShadSheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';

/* ──────────────────────────────────────────────────────────────────────────
   FINANZAS · UI SYSTEM
   ──────────────────────────────────────────────────────────────────────────
   Todos los primitivos del módulo Finanzas. Usar tokens CSS del tema shadcn
   en vez de colores hardcodeados para mantener consistencia y permitir dark
   mode en el futuro.

   Semántica de color funcional:
     text-foreground          → contenido primario
     text-muted-foreground    → labels, metadata, secondary
     bg-card / bg-muted       → fondos de contenedores
     border-border            → bordes estándar
     text-green-700           → valores positivos / ingresos
     text-red-700 / text-destructive → valores negativos / egresos
     text-amber-700           → alertas / pendientes
   ────────────────────────────────────────────────────────────────────────── */


/* ─── Icon ────────────────────────────────────────────────────────────── */

export function Icon({ d, size = 18, className = '', strokeWidth = 1.6, style }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('shrink-0', className)}
      style={style}
    >
      <path d={d} />
    </svg>
  );
}

export const ICONS = {
  home:        'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2zM9 22V12h6v10',
  factory:     'M2 20h20M5 20V8l5 4V8l5 4V8l4 12',
  bank:        'M3 21h18M3 10h18M5 10V21M19 10V21M9 10V21M15 10V21M12 3L3 9h18l-9-6',
  coins:       'M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6',
  arrowRight:  'M5 12h14M12 5l7 7-7 7',
  arrowLeft:   'M19 12H5M12 19l-7-7 7-7',
  plus:        'M12 5v14M5 12h14',
  edit:        'M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z',
  trash:       'M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2',
  chevronRight:'M9 18l6-6-6-6',
  chevronDown: 'M6 9l6 6 6-6',
  more:        'M12 5v.01M12 12v.01M12 19v.01',
  search:      'M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z',
  alert:       'M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z',
  check:       'M20 6L9 17l-5-5',
  x:           'M18 6L6 18M6 6l12 12',
  logout:      'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9',
  filter:      'M22 3H2l8 9.46V19l4 2v-8.54L22 3',
  download:    'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3',
  upload:      'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12',
  eye:         'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 15a3 3 0 100-6 3 3 0 000 6z',
  calendar:    'M19 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2zM16 2v4M8 2v4M3 10h18',
  trending:    'M22 7l-9.5 9.5-5-5L1 18M16 7h6v6',
  refresh:     'M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15',
  settings:    'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z',
  dashboard:   'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
  user:        'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z',
  users:       'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
  document:    'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8',
  exchange:    'M17 1l4 4-4 4M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 01-4 4H3',
  shield:      'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  key:         'M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4',
};


/* ─── Card ────────────────────────────────────────────────────────────── */

export function Card({ children, className = '', padding = 'md', hover = false }) {
  const padClass = padding === 'sm' ? 'p-3' : padding === 'lg' ? 'p-6' : 'p-5';
  return (
    <div
      className={cn(
        'bg-card text-card-foreground rounded-xl ring-1 ring-border',
        hover && 'cursor-pointer transition-shadow hover:shadow-md',
        padClass,
        className
      )}
    >
      {children}
    </div>
  );
}


/* ─── MetricCard (KPI) ────────────────────────────────────────────────── */

export function MetricCard({ label, value, sublabel, isMoney = true, accent, loading }) {
  const formatted = isMoney ? formatMoney(value) : value;
  const colorClass =
    accent === 'success' ? 'text-green-700' :
    accent === 'danger'  ? 'text-destructive' :
    accent === 'warning' ? 'text-amber-700' :
    'text-foreground';

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-card ring-1 ring-border p-5">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      {loading ? (
        <Skeleton className="mt-1 h-8 w-24" />
      ) : (
        <p className={cn('text-[26px] font-semibold leading-none tracking-tight tabular-nums', colorClass)}>
          {formatted}
        </p>
      )}
      {sublabel && !loading && (
        <p className="text-xs text-muted-foreground">{sublabel}</p>
      )}
    </div>
  );
}


/* ─── Badge ───────────────────────────────────────────────────────────── */

const BADGE_STYLES = {
  gray:    'bg-muted text-muted-foreground',
  success: 'bg-green-50 text-green-700',
  danger:  'bg-destructive/10 text-destructive',
  warning: 'bg-amber-50 text-amber-700',
  info:    'bg-blue-50 text-blue-700',
  purple:  'bg-purple-50 text-purple-700',
  teal:    'bg-teal-50 text-teal-700',
};

export function Badge({ children, color = 'gray', size = 'md' }) {
  const palette = BADGE_STYLES[color] || BADGE_STYLES.gray;
  const sizeClass = size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]';
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md font-medium', sizeClass, palette)}>
      {children}
    </span>
  );
}


/* ─── Button ──────────────────────────────────────────────────────────── */

const VARIANT_MAP = {
  primary:   'default',
  secondary: 'outline',
  ghost:     'ghost',
  danger:    'destructive',
};
const SIZE_MAP = {
  sm: 'sm',
  md: 'default',
  lg: 'lg',
};

export function Button({
  children,
  variant = 'secondary',
  size = 'md',
  icon,
  onClick,
  disabled,
  type = 'button',
  className = '',
}) {
  return (
    <ShadButton
      type={type}
      variant={VARIANT_MAP[variant] || 'outline'}
      size={SIZE_MAP[size] || 'default'}
      onClick={onClick}
      disabled={disabled}
      className={className}
    >
      {icon && <Icon d={icon} size={size === 'sm' ? 14 : 15} />}
      {children}
    </ShadButton>
  );
}


/* ─── Field / Label ───────────────────────────────────────────────────── */

export function Field({ label, children, error, required, hint }) {
  return (
    <div className="mb-4 space-y-1.5">
      {label && (
        <label className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
          {required && <span className="ml-0.5 text-destructive">*</span>}
        </label>
      )}
      {children}
      {hint && !error && (
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      )}
      {error && (
        <p className="text-[11px] font-medium text-destructive" role="alert">{error}</p>
      )}
    </div>
  );
}


/* ─── Input / MoneyInput / Select ─────────────────────────────────────── */

const inputBase = (error) => cn(
  'flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs transition-colors',
  'placeholder:text-muted-foreground',
  'focus-visible:outline-none focus-visible:ring-2',
  'disabled:cursor-not-allowed disabled:opacity-50',
  error
    ? 'border-destructive focus-visible:ring-destructive/30'
    : 'border-input focus-visible:ring-ring/50'
);

export function Input({ value, onChange, type = 'text', placeholder, error, ...rest }) {
  return (
    <input
      type={type}
      value={value ?? ''}
      onChange={e => onChange?.(e.target.value)}
      placeholder={placeholder}
      aria-invalid={error ? 'true' : undefined}
      className={inputBase(error)}
      {...rest}
    />
  );
}

export function MoneyInput({ value, onChange, placeholder = '0', error, ...rest }) {
  const handleChange = e => {
    const v = e.target.value.replace(/[^0-9.]/g, '');
    onChange?.(v === '' ? null : Number(v));
  };
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 select-none text-sm text-muted-foreground">
        S/.
      </span>
      <input
        type="text"
        inputMode="decimal"
        value={value ?? ''}
        onChange={handleChange}
        placeholder={placeholder}
        aria-invalid={error ? 'true' : undefined}
        className={cn(inputBase(error), 'pl-9 tabular-nums')}
        {...rest}
      />
    </div>
  );
}

export function Select({ value, onChange, options = [], placeholder = 'Selecciona...', error, ...rest }) {
  return (
    <select
      value={value ?? ''}
      onChange={e => onChange?.(e.target.value)}
      aria-invalid={error ? 'true' : undefined}
      className={cn(inputBase(error), 'bg-background')}
      {...rest}
    >
      <option value="" disabled>{placeholder}</option>
      {options.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}


/* ─── Modal → Dialog ──────────────────────────────────────────────────── */

const MODAL_SIZE = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
};

export function Modal({ open, onClose, title, children, size = 'md', footer }) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose?.(); }}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          'flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0',
          MODAL_SIZE[size] || MODAL_SIZE.md
        )}
      >
        {title && (
          <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
            <DialogTitle className="text-[15px] font-semibold leading-none text-foreground">
              {title}
            </DialogTitle>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Icon d={ICONS.x} size={15} />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {children}
        </div>
        {footer && (
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-muted/30 px-5 py-3">
            {footer}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}


/* ─── EmptyState ──────────────────────────────────────────────────────── */

export function EmptyState({ icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
      {icon && (
        <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
          <Icon d={icon} size={20} className="text-muted-foreground" />
        </div>
      )}
      <p className="mb-1 text-[15px] font-medium text-foreground">{title}</p>
      {description && (
        <p className="mb-4 max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {action}
    </div>
  );
}


/* ─── Spinner / Loading ───────────────────────────────────────────────── */

export function Spinner({ size = 20, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={cn('animate-spin shrink-0', className)}
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" className="opacity-20" />
      <path d="M12 2a10 10 0 0110 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function LoadingState({ message = 'Cargando...' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16">
      <Spinner size={22} className="text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}


/* ─── PageHeader ──────────────────────────────────────────────────────── */

export function PageHeader({ title, description, actions, breadcrumb }) {
  return (
    <div className="mb-8">
      {breadcrumb && (
        <nav aria-label="Ruta" className="mb-2 flex items-center gap-1 text-xs text-muted-foreground">
          {breadcrumb.map((b, i) => (
            <React.Fragment key={i}>
              {i > 0 && <Icon d={ICONS.chevronRight} size={12} />}
              <span className={i === breadcrumb.length - 1 ? 'text-foreground' : ''}>{b}</span>
            </React.Fragment>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
          {description && (
            <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}


/* ─── SearchableGroupedSelect ─────────────────────────────────────────── */

export function SearchableGroupedSelect({
  value,
  onChange,
  groups = [],
  placeholder = 'Selecciona...',
  disabled = false,
  error,
}) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setSearchTerm('');
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  useEffect(() => {
    if (open && searchRef.current) searchRef.current.focus();
  }, [open]);

  const selectedLabel = (() => {
    for (const group of groups) {
      const found = group.options?.find(opt => String(opt.value) === String(value));
      if (found) return found.label;
    }
    return null;
  })();

  const term = searchTerm.trim().toLowerCase();
  const filteredGroups = term
    ? groups
        .map(g => ({
          ...g,
          options: (g.options || []).filter(opt =>
            opt.label?.toLowerCase().includes(term) ||
            opt.sublabel?.toLowerCase().includes(term)
          ),
        }))
        .filter(g => g.options.length > 0)
    : groups;

  function handleSelect(val) {
    onChange?.(val);
    setOpen(false);
    setSearchTerm('');
  }

  return (
    <div className="relative w-full" ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => { if (!disabled) setOpen(prev => !prev); }}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          'flex h-9 w-full items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-1 text-sm text-left',
          'shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          error
            ? 'border-destructive focus-visible:ring-destructive/30'
            : open
              ? 'border-ring ring-2 ring-ring/50'
              : 'border-input focus-visible:ring-ring/50'
        )}
      >
        <span className={selectedLabel ? 'text-foreground' : 'text-muted-foreground'}>
          {selectedLabel ?? placeholder}
        </span>
        <Icon d={ICONS.chevronDown} size={14} className="text-muted-foreground" />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-lg border border-border bg-popover shadow-lg"
          style={{ maxHeight: 280 }}
        >
          <div className="border-b border-border">
            <input
              ref={searchRef}
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Buscar..."
              className="w-full bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: 232 }}>
            {filteredGroups.length === 0 ? (
              <p className="px-3 py-3 text-center text-sm text-muted-foreground">Sin resultados</p>
            ) : (
              filteredGroups.map((group, gi) => (
                <div key={gi}>
                  <div className="bg-muted/40 px-3 py-1.5">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      {group.label}
                    </span>
                  </div>
                  {(group.options || []).map((opt, oi) => {
                    const isSelected = String(opt.value) === String(value);
                    return (
                      <button
                        key={oi}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => handleSelect(opt.value)}
                        className={cn(
                          'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors',
                          isSelected
                            ? 'bg-muted font-medium text-foreground'
                            : 'text-foreground hover:bg-muted/60'
                        )}
                      >
                        <span className="truncate">{opt.label}</span>
                        {opt.sublabel && (
                          <span className="shrink-0 text-[11px] text-muted-foreground">{opt.sublabel}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}


/* ─── SideSheet ───────────────────────────────────────────────────────── */

/**
 * Panel lateral deslizante para formularios. Reemplaza los modales
 * cuando se necesita más espacio o no bloquear la vista principal.
 *
 * Props:
 *   open       boolean
 *   onClose    () => void
 *   title      string
 *   description string (opcional)
 *   children   ReactNode
 *   side       'right' | 'left'  (default 'right')
 *   size       'sm' | 'md' | 'lg'  (default 'md')
 *   footer     ReactNode (opcional, se pega al fondo)
 */
export function SideSheet({ open, onClose, title, description, children, side = 'right', size = 'md', footer }) {
  const widthClass = size === 'sm' ? 'w-full sm:max-w-sm' : size === 'lg' ? 'w-full sm:max-w-xl' : 'w-full sm:max-w-md';
  return (
    <ShadSheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent
        side={side}
        className={cn('flex flex-col gap-0 p-0', widthClass)}
      >
        <SheetHeader className="border-b border-border px-6 py-4 shrink-0">
          <SheetTitle className="text-base font-semibold text-foreground">{title}</SheetTitle>
          {description && (
            <SheetDescription className="text-xs text-muted-foreground mt-0.5">{description}</SheetDescription>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {children}
        </div>

        {footer && (
          <div className="border-t border-border px-6 py-4 shrink-0 bg-card">
            {footer}
          </div>
        )}
      </SheetContent>
    </ShadSheet>
  );
}


/* ─── ProgressBar ─────────────────────────────────────────────────────── */

export function ProgressBar({ value, max, color = '#1c1917', className = '', height = 4 }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div
      className={cn('w-full rounded-full bg-muted overflow-hidden', className)}
      style={{ height }}
    >
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  );
}


/* ─── AvatarInitials ──────────────────────────────────────────────────── */

export function AvatarInitials({ name, size = 36, className = '' }) {
  const initials = (name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const colors = [
    ['#dbeafe', '#1d4ed8'], ['#dcfce7', '#166534'], ['#fef3c7', '#92400e'],
    ['#ede9fe', '#6d28d9'], ['#fee2e2', '#991b1b'], ['#e0f2fe', '#0369a1'],
    ['#fce7f3', '#9d174d'], ['#f0fdf4', '#14532d'],
  ];
  const idx = (name || '').charCodeAt(0) % colors.length;
  const [bg, fg] = colors[idx];
  return (
    <div
      className={cn('flex items-center justify-center rounded-full shrink-0 font-semibold select-none', className)}
      style={{ width: size, height: size, backgroundColor: bg, color: fg, fontSize: size * 0.38 }}
    >
      {initials}
    </div>
  );
}


/* ─── Tabs (simple inline) ────────────────────────────────────────────── */

export function InlineTabs({ tabs, active, onChange, className = '' }) {
  return (
    <div className={cn('flex items-center gap-0.5 border-b border-border/60', className)}>
      {tabs.map(t => (
        <button
          key={t.k}
          type="button"
          onClick={() => onChange(t.k)}
          className={cn(
            'px-4 py-2.5 text-sm border-b-2 -mb-px transition-colors shrink-0',
            active === t.k
              ? 'text-foreground border-ring font-medium'
              : 'text-muted-foreground border-transparent hover:text-foreground'
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
