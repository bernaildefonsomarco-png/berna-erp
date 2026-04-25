// src/views/gestion/views/cierres/CierreWizard.jsx
// Orquestador de los 3 pasos del cierre. Carga datos, coordina el flujo.
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  validarCierre, cerrarPeriodo, obtenerPeriodos,
} from '../../api/cierresClient';
import { verificarPin } from '../../../../lib/pinAuth';
import PasoChecklistSalud from './PasoChecklistSalud';
import PasoPreviewReporte from './PasoPreviewReporte';
import PasoConfirmarPin from './PasoConfirmarPin';

const PASOS = ['Verificación', 'Vista previa', 'Confirmar'];
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

export default function CierreWizard({ usuario, year, month }) {
  const navigate = useNavigate();
  const [paso, setPaso] = useState(0);
  const [checklist, setChecklist] = useState(null);
  const [loadingChecklist, setLoadingChecklist] = useState(true);
  const [reporteData, setReporteData] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const yearN = parseInt(year);
  const monthN = parseInt(month);

  // Cargar checklist al montar
  useEffect(() => {
    setLoadingChecklist(true);
    validarCierre(yearN, monthN)
      .then(setChecklist)
      .catch(e => setError(e.message))
      .finally(() => setLoadingChecklist(false));
  }, [yearN, monthN]);

  // Cargar datos del reporte al avanzar al paso 2
  const cargarDatosReporte = async () => {
    if (reporteData) return;
    try {
      const { obtenerPLResumen, obtenerPatrimonioTotales } = await import('../../api/dashboardClient');
      const fechaInicio = `${yearN}-${String(monthN).padStart(2, '0')}-01`;
      const ultimoDia = new Date(yearN, monthN, 0).getDate();
      const fechaFin = `${yearN}-${String(monthN).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;

      const [plData, patrimonioTotales, periodos] = await Promise.all([
        obtenerPLResumen(fechaInicio, fechaFin),
        obtenerPatrimonioTotales(),
        obtenerPeriodos(),
      ]);

      const periodo = periodos.find(p => p.year === yearN && p.month === monthN);
      const historialReaperturas = (periodo?.cierres || []).filter(c => c.version > 1);

      const plArr = Array.isArray(plData) ? plData : [];
      const ingresos = plArr.filter(r => r.seccion === 'Ingresos' || r.tipo === 'ingreso')
        .reduce((a, r) => a + Math.abs(r.total || 0), 0);
      const egresos = plArr.filter(r => r.seccion !== 'Ingresos' && r.tipo !== 'ingreso')
        .reduce((a, r) => a + Math.abs(r.total || 0), 0);
      const utilidad_neta = ingresos - egresos;

      setReporteData({
        year: yearN,
        month: monthN,
        version: (periodo?.cierres?.length || 0) + 1,
        kpis: {
          ingresos,
          egresos,
          utilidad_neta,
          margen_pct: ingresos > 0 ? (utilidad_neta / ingresos) * 100 : 0,
          n_movimientos: 0,
          n_ventas: 0,
          saldo_total_cuentas: patrimonioTotales?.total_activos || 0,
          deuda_pendiente_total: patrimonioTotales?.total_pasivos || 0,
          patrimonio_neto: patrimonioTotales?.patrimonio_neto || 0,
        },
        plData: plArr,
        flujoData: [],
        patrimonioData: { cuentas: [], deudas: [] },
        checklist: checklist || {},
        cerradoPor: usuario?.nombre || 'Admin',
        cerradoEn: new Date().toISOString(),
        hash: '',
        historialReaperturas,
      });
    } catch (e) {
      setError('Error cargando datos del reporte: ' + e.message);
    }
  };

  const irAlPaso2 = async () => {
    await cargarDatosReporte();
    setPaso(1);
  };

  const handleConfirmar = async ({ pin }) => {
    setGuardando(true);
    setError('');
    try {
      const pinValido = await verificarPin(usuario.id_persona, pin);
      if (!pinValido) throw new Error('PIN incorrecto.');

      const { pdf } = await import('@react-pdf/renderer');
      const { default: ReporteCierrePDF } = await import('./ReporteCierrePDF');

      const snapshotKpis = {
        ...reporteData.kpis,
        year: yearN,
        month: monthN,
        version_schema: '1.0',
      };

      const element = React.createElement(ReporteCierrePDF, reporteData);
      const pdfBlob = await pdf(element).toBlob();

      const result = await cerrarPeriodo({
        year: yearN,
        month: monthN,
        idPersona: usuario.id_persona,
        pdfBlob,
        snapshotKpis,
        checklistSalud: checklist,
      });

      navigate('/gestion/cierres', {
        state: { toast: `Período ${MESES[monthN - 1]} ${yearN} cerrado (v${result.version}).` }
      });
    } catch (e) {
      throw e;
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-8">
        <h1 className="text-xl font-semibold">
          Cerrar {MESES[monthN - 1]} {yearN}
        </h1>
        <div className="mt-4 flex items-center">
          {PASOS.map((nombre, i) => (
            <React.Fragment key={i}>
              <div className={`flex items-center gap-2 ${i <= paso ? 'text-primary' : 'text-muted-foreground'}`}>
                <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium
                  ${i < paso ? 'bg-primary text-primary-foreground' : ''}
                  ${i === paso ? 'border-2 border-primary text-primary' : ''}
                  ${i > paso ? 'border border-muted-foreground/30' : ''}
                `}>
                  {i < paso ? '✓' : i + 1}
                </div>
                <span className="text-xs">{nombre}</span>
              </div>
              {i < PASOS.length - 1 && (
                <div className={`mx-2 h-px flex-1 min-w-8 ${i < paso ? 'bg-primary' : 'bg-border'}`} />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {paso === 0 && (
        <PasoChecklistSalud
          checklist={checklist}
          loading={loadingChecklist}
          onContinuar={irAlPaso2}
        />
      )}
      {paso === 1 && (
        <PasoPreviewReporte
          reporteData={reporteData || {}}
          onVolver={() => setPaso(0)}
          onContinuar={() => setPaso(2)}
        />
      )}
      {paso === 2 && (
        <PasoConfirmarPin
          year={yearN}
          month={monthN}
          onVolver={() => setPaso(1)}
          onConfirmar={handleConfirmar}
          guardando={guardando}
        />
      )}
    </div>
  );
}
