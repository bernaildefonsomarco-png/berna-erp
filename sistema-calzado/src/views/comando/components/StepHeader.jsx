import React from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Cabecera de wizard con botón atrás y progreso "Paso X de Y".
 *
 * Props:
 *   paso     — número del paso actual (1-based)
 *   total    — total de pasos
 *   titulo   — texto descriptivo del paso
 *   onBack   — función a llamar al presionar atrás (si no se provee, usa navigate(-1))
 */
export default function StepHeader({ paso, total, titulo, onBack }) {
  const navigate = useNavigate();
  const handleBack = onBack || (() => navigate(-1));

  return (
    <div className="flex flex-col gap-2 mb-6 pt-4">
      <div className="flex items-center gap-3">
        <button
          onClick={handleBack}
          className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 active:scale-95 transition-all flex-shrink-0"
          aria-label="Volver"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0a0a0a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
        </button>

        {total > 1 && (
          <div className="flex gap-1.5">
            {Array.from({ length: total }).map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i < paso ? 'bg-[#1c1917]' : 'bg-gray-200'
                } ${i === paso - 1 ? 'w-6' : 'w-3'}`}
              />
            ))}
          </div>
        )}

        <span className="text-xs text-gray-400 ml-auto">
          {paso}/{total}
        </span>
      </div>

      {titulo && (
        <h2 className="text-2xl font-bold text-[#0a0a0a] mt-1">{titulo}</h2>
      )}
    </div>
  );
}
