/* ──────────────────────────────────────────────────────────────────────────
   FINANZAS · DESIGN SYSTEM
   ──────────────────────────────────────────────────────────────────────────
   Tokens, paletas y clases base para el módulo Finanzas.
   Estética distinta a la app de ventas: más clean, más profesional,
   pensado para análisis y lectura prolongada (no para taps rápidos).
   ────────────────────────────────────────────────────────────────────────── */

export const colors = {
  bg: {
    page:    '#fafaf9',
    card:    '#ffffff',
    subtle:  '#f5f5f4',
    hover:   '#f0efed',
  },
  text: {
    primary:   '#1c1917',
    secondary: '#57534e',
    tertiary:  '#a8a29e',
    inverse:   '#ffffff',
  },
  border: {
    base:    '#e7e5e4',
    subtle:  '#f5f5f4',
    strong:  '#d6d3d1',
    focus:   '#1c1917',
  },
  brand: {
    primary: '#1c1917',
    accent:  '#7c3aed',
  },
  status: {
    success: { bg: '#dcfce7', text: '#166534', border: '#86efac' },
    warning: { bg: '#fef3c7', text: '#854d0e', border: '#fcd34d' },
    danger:  { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
    info:    { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
  },
};

export const cls = {
  page:        'min-h-screen bg-[#fafaf9] text-[#1c1917]',
  card:        'bg-white border border-[#e7e5e4] rounded-xl',
  cardHover:   'bg-white border border-[#e7e5e4] rounded-xl hover:border-[#d6d3d1] transition-colors',
  cardSubtle:  'bg-[#f5f5f4] rounded-xl',

  btn:         'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed',
  btnPrimary:  'bg-[#1c1917] text-white hover:bg-[#292524]',
  btnSecondary:'bg-white border border-[#e7e5e4] text-[#1c1917] hover:bg-[#f5f5f4] hover:border-[#d6d3d1]',
  btnGhost:    'text-[#57534e] hover:text-[#1c1917] hover:bg-[#f5f5f4]',
  btnDanger:   'bg-white border border-[#fca5a5] text-[#991b1b] hover:bg-[#fef2f2]',

  input:       'w-full h-10 px-3 rounded-lg border border-[#e7e5e4] bg-white text-sm text-[#1c1917] placeholder:text-[#a8a29e] focus:outline-none focus:border-[#1c1917] focus:ring-1 focus:ring-[#1c1917] transition-colors',
  inputError:  'border-[#fca5a5] focus:border-[#991b1b] focus:ring-[#991b1b]',

  label:       'block text-xs font-medium text-[#57534e] mb-1.5',

  table:       'w-full text-sm',
  tableHead:   'bg-[#fafaf9] text-[11px] font-medium text-[#a8a29e] uppercase tracking-wider',
  tableTh:     'px-4 py-2.5 text-left',
  tableTr:     'border-t border-[#f5f5f4] hover:bg-[#fafaf9] transition-colors',
  tableTd:     'px-4 py-3 text-[#1c1917]',

  badge:       'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium',

  h1:          'text-2xl font-semibold text-[#1c1917] tracking-tight',
  h2:          'text-lg font-semibold text-[#1c1917]',
  h3:          'text-base font-semibold text-[#1c1917]',
  pSubtle:     'text-sm text-[#57534e]',
  pTertiary:   'text-xs text-[#a8a29e]',
};

export function moneyClass(value) {
  if (value > 0) return 'text-[#166534]';
  if (value < 0) return 'text-[#991b1b]';
  return 'text-[#57534e]';
}