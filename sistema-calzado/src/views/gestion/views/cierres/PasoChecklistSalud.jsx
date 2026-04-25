// src/views/gestion/views/cierres/PasoChecklistSalud.jsx
import React from 'react';
import { Spinner } from '../../components/UI';

const CHECKS = [
  { key: 'movimientos_sin_tipo',            label: 'Movimientos sin tipo',            bloqueante: true },
  { key: 'movimientos_sin_cuenta_contable', label: 'Movimientos sin cuenta contable', bloqueante: true },
  { key: 'splits_desbalanceados',           label: 'Splits desbalanceados',           bloqueante: true },
  { key: 'plantillas_mensuales_pendientes', label: 'Plantillas mensuales pendientes', bloqueante: false },
  { key: 'cuentas_con_saldo_negativo',      label: 'Cuentas con saldo negativo',      bloqueante: false },
];

export default function PasoChecklistSalud({ checklist, loading, onContinuar }) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Spinner size={28} />
        <p className="text-sm text-muted-foreground">Verificando salud del período...</p>
      </div>
    );
  }

  if (!checklist) return null;

  const hayBloqueantes = checklist.bloqueante;
  const hayWarnings = (checklist.plantillas_mensuales_pendientes > 0) || (checklist.cuentas_con_saldo_negativo > 0);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold">Verificación de salud del período</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Revisamos que el período esté completo antes de cerrarlo.
        </p>
      </div>

      <div className="divide-y divide-border rounded-lg border">
        {CHECKS.map(({ key, label, bloqueante }) => {
          const valor = checklist[key] ?? 0;
          const esError = valor > 0 && bloqueante;
          const esWarning = valor > 0 && !bloqueante;
          const esOk = valor === 0;

          return (
            <div key={key} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium
                  ${esError   ? 'bg-destructive/10 text-destructive' : ''}
                  ${esWarning ? 'bg-amber-100 text-amber-700' : ''}
                  ${esOk      ? 'bg-green-100 text-green-700' : ''}
                `}>
                  {esOk ? '✓' : valor}
                </div>
                <span className="text-sm">{label}</span>
                {!bloqueante && <span className="text-xs text-muted-foreground">(advertencia)</span>}
              </div>
              <span className={`text-xs font-medium
                ${esError ? 'text-destructive' : ''}
                ${esWarning ? 'text-amber-600' : ''}
                ${esOk ? 'text-green-600' : ''}
              `}>
                {esOk ? 'OK' : esError ? 'Error' : 'Aviso'}
              </span>
            </div>
          );
        })}
      </div>

      {checklist.warnings?.length > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          {checklist.warnings.map((w, i) => <p key={i}>⚠ {w}</p>)}
        </div>
      )}

      {hayBloqueantes ? (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3">
          <p className="text-sm font-medium text-destructive">
            Resuelve los errores marcados antes de cerrar el período.
          </p>
        </div>
      ) : (
        <button
          onClick={onContinuar}
          className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          {hayWarnings ? 'Continuar de todas formas →' : 'Continuar →'}
        </button>
      )}
    </div>
  );
}
