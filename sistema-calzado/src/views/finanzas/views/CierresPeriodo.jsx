// src/views/finanzas/views/CierresPeriodo.jsx
// Historial de períodos: tabla con estado, versión, acciones (descargar, reabrir, cerrar).
import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  obtenerPeriodos, descargarPdfCierre, reabrirPeriodo,
} from '../api/cierresClient';
import { verifyPersonaPin } from '../../../lib/pinAuth';
import { puedeCerrar, puedeReabrir, puedeVerCierres } from '../lib/permisos';
import { LoadingState, PageHeader } from '../components/UI';

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function ModalReabrir({ periodo, usuario, onClose, onExito }) {
  const [motivo, setMotivo] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!motivo.trim()) { setError('El motivo es obligatorio.'); return; }
    if (!pin || pin.length < 4) { setError('PIN inválido.'); return; }
    setGuardando(true);
    try {
      const pinValido = await verifyPersonaPin({ pin_hash: usuario.pin_hash }, pin);
      if (!pinValido) throw new Error('PIN incorrecto.');
      await reabrirPeriodo({ idPeriodo: periodo.id_periodo, motivo, idPersona: usuario.id_persona });
      onExito();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl bg-background p-6 shadow-xl">
        <h3 className="text-base font-semibold mb-4">
          Reabrir {MESES[periodo.month - 1]} {periodo.year}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
              Motivo de la reapertura *
            </label>
            <textarea
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              rows={3}
              placeholder="Ej: Faltó registrar el pago de servicios del día 28."
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
              PIN de administrador
            </label>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
              maxLength={8}
              className="w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              required
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border py-2 text-sm font-medium hover:bg-muted/50">
              Cancelar
            </button>
            <button type="submit" disabled={guardando}
              className="flex-1 rounded-lg bg-amber-600 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50">
              {guardando ? 'Reabriendo…' : 'Reabrir período'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function CierresPeriodo({ usuario }) {
  const [periodos, setPeriodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [descargando, setDescargando] = useState(null);
  const [reabriendo, setReabriendo] = useState(null);
  const location = useLocation();
  const [toast, setToast] = useState(location.state?.toast || '');

  const cargar = () => {
    setLoading(true);
    obtenerPeriodos()
      .then(setPeriodos)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { cargar(); }, []);
  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(''), 4000); return () => clearTimeout(t); }
  }, [toast]);

  const handleDescargar = async (cierre) => {
    setDescargando(cierre.id_cierre);
    try {
      const url = await descargarPdfCierre(cierre.url_storage);
      window.open(url, '_blank');
    } catch (e) {
      alert('Error descargando PDF: ' + e.message);
    } finally {
      setDescargando(null);
    }
  };

  if (loading) return <LoadingState />;
  if (error) return <div className="text-destructive text-sm">{error}</div>;

  return (
    <div className="space-y-6">
      {toast && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
          ✓ {toast}
        </div>
      )}

      <PageHeader title="Cierres de Período" description="Historial de cierres contables mensuales." />

      {periodos.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-muted-foreground text-sm">
          No hay períodos registrados.
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Período</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Estado</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Versión</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Cerrado</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {periodos.map(p => {
                const ultimoCierre = p.cierres?.sort((a, b) => b.version - a.version)[0];
                const hoy = new Date();
                const esPasado = p.year < hoy.getFullYear() ||
                  (p.year === hoy.getFullYear() && p.month < hoy.getMonth() + 1);
                return (
                  <tr key={p.id_periodo} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-medium">{MESES[p.month - 1]} {p.year}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium
                        ${p.estado === 'cerrado' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}
                      `}>
                        {p.estado === 'cerrado' ? '● Cerrado' : '○ Abierto'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {ultimoCierre ? `v${ultimoCierre.version}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {ultimoCierre
                        ? new Date(ultimoCierre.cerrado_en).toLocaleDateString('es-PE')
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-3">
                        {ultimoCierre && puedeVerCierres(usuario) && (
                          <button
                            onClick={() => handleDescargar(ultimoCierre)}
                            disabled={descargando === ultimoCierre.id_cierre}
                            className="text-xs text-primary hover:underline disabled:opacity-50"
                          >
                            {descargando === ultimoCierre.id_cierre ? 'Descargando…' : 'PDF'}
                          </button>
                        )}
                        {p.estado === 'cerrado' && puedeReabrir(usuario) && (
                          <button
                            onClick={() => setReabriendo(p)}
                            className="text-xs text-amber-600 hover:underline"
                          >
                            Reabrir
                          </button>
                        )}
                        {p.estado === 'abierto' && esPasado && puedeCerrar(usuario) && (
                          <Link
                            to={`/finanzas/cierres/${p.year}/${p.month}`}
                            className="text-xs text-primary hover:underline"
                          >
                            Cerrar →
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {reabriendo && (
        <ModalReabrir
          periodo={reabriendo}
          usuario={usuario}
          onClose={() => setReabriendo(null)}
          onExito={() => {
            const label = `${MESES[reabriendo.month - 1]} ${reabriendo.year}`;
            setReabriendo(null);
            cargar();
            setToast(`Período ${label} reabierto.`);
          }}
        />
      )}
    </div>
  );
}
