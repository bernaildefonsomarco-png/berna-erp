// src/views/gestion/views/cierres/PasoPreviewReporte.jsx
import React, { Suspense, lazy, useState, useEffect } from 'react';
import { Spinner } from '../../components/UI';

const PDFViewer = lazy(() => import('@react-pdf/renderer').then(m => ({ default: m.PDFViewer })));
const ReporteCierrePDF = lazy(() => import('./ReporteCierrePDF'));

export default function PasoPreviewReporte({ reporteData, onVolver, onContinuar }) {
  const [listo, setListo] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setListo(true), 100);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold">Previsualización del reporte</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Revisa el reporte antes de confirmar el cierre. Una vez confirmado, quedará sellado con tu PIN.
        </p>
      </div>

      <div className="rounded-lg border overflow-hidden" style={{ height: 480 }}>
        {!listo ? (
          <div className="flex items-center justify-center h-full">
            <Spinner size={24} />
          </div>
        ) : (
          <Suspense fallback={
            <div className="flex items-center justify-center h-full gap-2">
              <Spinner size={20} />
              <span className="text-sm text-muted-foreground">Generando PDF…</span>
            </div>
          }>
            <PDFViewer width="100%" height="100%" showToolbar={false}>
              <ReporteCierrePDF {...reporteData} />
            </PDFViewer>
          </Suspense>
        )}
      </div>

      <div className="flex gap-3">
        <button
          onClick={onVolver}
          className="flex-1 rounded-lg border py-2.5 text-sm font-medium hover:bg-muted/50 transition-colors"
        >
          ← Volver al checklist
        </button>
        <button
          onClick={onContinuar}
          className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Continuar con el cierre →
        </button>
      </div>
    </div>
  );
}
