import React from 'react';

/**
 * Teclado numérico táctil para ingresar montos.
 * Maneja decimales: "." agrega coma decimal (máximo 2 decimales).
 *
 * Props:
 *   value     — string (ej: "1234" → muestra "12.34", o "123456" → "1234.56")
 *   onChange  — (newValue: string) => void
 *   maxInt    — máximo de dígitos enteros (default 7)
 */
export default function NumPad({ value = '', onChange, maxInt = 7 }) {
  const press = (d) => {
    if (d === '⌫') {
      onChange(value.slice(0, -1));
      return;
    }
    // Solo dígitos
    if (!/^\d$/.test(d)) return;

    const next = value + d;
    // Separar en parte entera y decimal (últimos 2 dígitos son centavos)
    const digits = next.replace(/\D/g, '');
    const intPart = digits.length > 2 ? digits.slice(0, -2) : '0';
    if (intPart.length > maxInt) return; // límite de parte entera
    onChange(digits);
  };

  // Formatear para mostrar: ej "12345" → "123.45"
  const display = (() => {
    if (!value) return '0.00';
    const digits = value.padStart(3, '0');
    const intPart = digits.slice(0, -2) || '0';
    const decPart = digits.slice(-2);
    return `${Number(intPart).toLocaleString('es-PE')}.${decPart}`;
  })();

  // Valor numérico real para el padre
  const numericValue = (() => {
    if (!value) return 0;
    const digits = value.padStart(3, '0');
    return Number(`${digits.slice(0, -2) || '0'}.${digits.slice(-2)}`);
  })();

  return { display, numericValue, pad: (
    <div className="grid grid-cols-3 gap-3 max-w-[320px] mx-auto select-none">
      {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((d, i) =>
        d === '' ? <div key={i} /> : (
          <button
            key={d}
            onPointerDown={e => { e.preventDefault(); press(d); }}
            className={`h-16 rounded-2xl text-2xl font-semibold transition-all active:scale-95 ${
              d === '⌫'
                ? 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                : 'bg-gray-100 text-[#0a0a0a] hover:bg-gray-200'
            }`}
          >
            {d}
          </button>
        )
      )}
    </div>
  )};
}
