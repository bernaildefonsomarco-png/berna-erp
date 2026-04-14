import React from 'react';
import { formatMoney } from '../lib/calculos';

/* ──────────────────────────────────────────────────────────────────────────
   FINANZAS · COMPONENTES UI BASE
   ──────────────────────────────────────────────────────────────────────────
   Tipografía refinada: 400 para body, 500 para énfasis suave,
   600 solo para headings. Sin excesos de negrita.
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
      className={className}
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
  filter:      'M22 3H2l8 9.46V19l4 2v-8.54L22 3z',
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
  const base = 'bg-white border border-[#e7e5e4] rounded-xl';
  const hoverClass = hover ? 'hover:border-[#d6d3d1] transition-colors' : '';
  return <div className={`${base} ${hoverClass} ${padClass} ${className}`}>{children}</div>;
}


/* ─── Metric Card (KPI) ───────────────────────────────────────────────── */

export function MetricCard({ label, value, sublabel, isMoney = true, accent }) {
  const formatted = isMoney ? formatMoney(value) : value;
  const accentColor = accent === 'success' ? '#166534'
                    : accent === 'danger'  ? '#991b1b'
                    : accent === 'warning' ? '#854d0e'
                    : '#1c1917';

  return (
    <div className="bg-white border border-[#e7e5e4] rounded-xl p-5">
      <p className="text-[11px] text-[#a8a29e] uppercase tracking-wider mb-2" style={{ fontWeight: 500 }}>
        {label}
      </p>
      <p
        className="text-[26px] leading-none fin-num"
        style={{ fontWeight: 500, color: accentColor, letterSpacing: '-0.02em' }}
      >
        {formatted}
      </p>
      {sublabel && <p className="text-xs text-[#a8a29e] mt-2" style={{ fontWeight: 400 }}>{sublabel}</p>}
    </div>
  );
}


/* ─── Badge ───────────────────────────────────────────────────────────── */

export function Badge({ children, color = 'gray', size = 'md' }) {
  const palette = {
    gray:    { bg: '#f5f5f4', text: '#57534e' },
    success: { bg: '#dcfce7', text: '#166534' },
    danger:  { bg: '#fee2e2', text: '#991b1b' },
    warning: { bg: '#fef3c7', text: '#854d0e' },
    info:    { bg: '#dbeafe', text: '#1e40af' },
    purple:  { bg: '#ede9fe', text: '#5b21b6' },
    teal:    { bg: '#ccfbf1', text: '#115e59' },
  };
  const { bg, text } = palette[color] || palette.gray;
  const sizeClass = size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md ${sizeClass}`}
      style={{ backgroundColor: bg, color: text, fontWeight: 500 }}
    >
      {children}
    </span>
  );
}


/* ─── Button ──────────────────────────────────────────────────────────── */

export function Button({ children, variant = 'secondary', size = 'md', icon, onClick, disabled, type = 'button', className = '' }) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-lg transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed';

  const variantClass =
    variant === 'primary' ? 'bg-[#1c1917] text-white hover:bg-[#292524]' :
    variant === 'ghost'   ? 'text-[#57534e] hover:text-[#1c1917] hover:bg-[#f5f5f4]' :
    variant === 'danger'  ? 'bg-white border border-[#fca5a5] text-[#991b1b] hover:bg-[#fef2f2]' :
    'bg-white border border-[#e7e5e4] text-[#1c1917] hover:bg-[#fafaf9] hover:border-[#d6d3d1]';

  const sizeClass =
    size === 'sm' ? 'px-3 py-1.5 text-xs' :
    size === 'lg' ? 'px-5 py-2.5 text-sm' :
    'px-4 py-2 text-[13px]';

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{ fontWeight: 500 }}
      className={`${base} ${variantClass} ${sizeClass} ${className}`}
    >
      {icon && <Icon d={icon} size={size === 'sm' ? 14 : 15} />}
      {children}
    </button>
  );
}


/* ─── Input / Label / Field ───────────────────────────────────────────── */

export function Field({ label, children, error, required, hint }) {
  return (
    <div className="mb-4">
      {label && (
        <label className="block text-xs text-[#57534e] mb-1.5" style={{ fontWeight: 500 }}>
          {label}
          {required && <span className="text-[#991b1b] ml-0.5">*</span>}
        </label>
      )}
      {children}
      {hint && !error && <p className="text-[11px] text-[#a8a29e] mt-1.5" style={{ fontWeight: 400 }}>{hint}</p>}
      {error && <p className="text-[11px] text-[#991b1b] mt-1.5" style={{ fontWeight: 500 }}>{error}</p>}
    </div>
  );
}

const INPUT_BASE = 'w-full h-10 px-3 rounded-lg border bg-white text-sm text-[#1c1917] placeholder:text-[#a8a29e] focus:outline-none focus:ring-1 transition-colors';
const INPUT_NORMAL = 'border-[#e7e5e4] focus:border-[#1c1917] focus:ring-[#1c1917]';
const INPUT_ERROR = 'border-[#fca5a5] focus:border-[#991b1b] focus:ring-[#991b1b]';

export function Input({ value, onChange, type = 'text', placeholder, error, ...rest }) {
  return (
    <input
      type={type}
      value={value ?? ''}
      onChange={e => onChange?.(e.target.value)}
      placeholder={placeholder}
      style={{ fontWeight: 400 }}
      className={`${INPUT_BASE} ${error ? INPUT_ERROR : INPUT_NORMAL}`}
      {...rest}
    />
  );
}

export function MoneyInput({ value, onChange, placeholder = '0', ...rest }) {
  const handleChange = e => {
    const v = e.target.value.replace(/[^0-9.]/g, '');
    onChange?.(v === '' ? null : Number(v));
  };
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#a8a29e]" style={{ fontWeight: 400 }}>S/.</span>
      <input
        type="text"
        inputMode="decimal"
        value={value ?? ''}
        onChange={handleChange}
        placeholder={placeholder}
        style={{ fontWeight: 400 }}
        className={`${INPUT_BASE} ${INPUT_NORMAL} pl-9 fin-num`}
        {...rest}
      />
    </div>
  );
}

export function Select({ value, onChange, options = [], placeholder = 'Selecciona...', ...rest }) {
  return (
    <select
      value={value ?? ''}
      onChange={e => onChange?.(e.target.value)}
      style={{ fontWeight: 400 }}
      className={`${INPUT_BASE} ${INPUT_NORMAL}`}
      {...rest}
    >
      <option value="" disabled>{placeholder}</option>
      {options.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}


/* ─── Modal ───────────────────────────────────────────────────────────── */

export function Modal({ open, onClose, title, children, size = 'md', footer }) {
  if (!open) return null;
  const sizeClass = size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-2xl' : size === 'xl' ? 'max-w-4xl' : 'max-w-lg';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(28, 25, 23, 0.4)' }}
      onClick={onClose}
    >
      <div
        className={`bg-white rounded-2xl w-full ${sizeClass} max-h-[90vh] flex flex-col overflow-hidden border border-[#e7e5e4]`}
        onClick={e => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#f5f5f4]">
            <h3 className="text-[15px] text-[#1c1917]" style={{ fontWeight: 600 }}>{title}</h3>
            <button onClick={onClose}
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#f5f5f4] text-[#a8a29e] hover:text-[#1c1917] transition-colors">
              <Icon d={ICONS.x} size={16} />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[#f5f5f4] bg-[#fafaf9]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}


/* ─── EmptyState ──────────────────────────────────────────────────────── */

export function EmptyState({ icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      {icon && (
        <div className="w-12 h-12 rounded-full bg-[#f5f5f4] flex items-center justify-center mb-4">
          <Icon d={icon} size={20} className="text-[#a8a29e]" />
        </div>
      )}
      <p className="text-[15px] text-[#1c1917] mb-1" style={{ fontWeight: 500 }}>{title}</p>
      {description && <p className="text-sm text-[#57534e] max-w-sm mb-4" style={{ fontWeight: 400 }}>{description}</p>}
      {action}
    </div>
  );
}


/* ─── Spinner / Loading ───────────────────────────────────────────────── */

export function Spinner({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="animate-spin">
      <circle cx="12" cy="12" r="10" stroke="#e7e5e4" strokeWidth="2.5"/>
      <path d="M12 2a10 10 0 0110 10" stroke="#1c1917" strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  );
}

export function LoadingState({ message = 'Cargando...' }) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <Spinner size={22} />
      <p className="text-sm text-[#57534e] mt-3" style={{ fontWeight: 400 }}>{message}</p>
    </div>
  );
}


/* ─── PageHeader ──────────────────────────────────────────────────────── */

export function PageHeader({ title, description, actions, breadcrumb }) {
  return (
    <div className="mb-8">
      {breadcrumb && (
        <nav className="text-xs text-[#a8a29e] mb-2 flex items-center gap-1" style={{ fontWeight: 400 }}>
          {breadcrumb.map((b, i) => (
            <React.Fragment key={i}>
              {i > 0 && <Icon d={ICONS.chevronRight} size={12} />}
              <span className={i === breadcrumb.length - 1 ? 'text-[#1c1917]' : ''}>{b}</span>
            </React.Fragment>
          ))}
        </nav>
      )}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[24px] text-[#1c1917]" style={{ fontWeight: 600, letterSpacing: '-0.02em' }}>{title}</h1>
          {description && <p className="text-sm text-[#57534e] mt-1.5" style={{ fontWeight: 400 }}>{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}