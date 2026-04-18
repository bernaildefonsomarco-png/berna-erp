import React from 'react';

/**
 * Botón táctil grande (mínimo 64px de alto).
 * variant: 'primary' | 'success' | 'danger' | 'ghost'
 */
export default function BigButton({ children, onClick, variant = 'primary', disabled = false, className = '' }) {
  const variants = {
    primary: 'bg-[#1c1917] text-white hover:bg-[#292524] active:bg-[#0c0a09]',
    success: 'bg-[#15803d] text-white hover:bg-[#166534] active:bg-[#14532d]',
    danger:  'bg-[#b91c1c] text-white hover:bg-[#991b1b] active:bg-[#7f1d1d]',
    ghost:   'bg-gray-100 text-[#0a0a0a] hover:bg-gray-200 active:bg-gray-300',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        w-full min-h-[64px] rounded-2xl text-xl font-semibold
        transition-all active:scale-[0.98]
        disabled:opacity-40 disabled:cursor-not-allowed
        ${variants[variant]}
        ${className}
      `}
    >
      {children}
    </button>
  );
}
