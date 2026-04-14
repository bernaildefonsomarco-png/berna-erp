import React, { useState, useEffect, useMemo } from 'react';
import { listarCuentasDestinoCierre, registrarDistribucionCierre } from '../api/finanzasClient';

/* ──────────────────────────────────────────────────────────────────────────
   ModalDestinoEfectivo — Bloque 3.6
   ──────────────────────────────────────────────────────────────────────────
   Modal obligatorio que aparece después de cerrar caja diaria de tienda.
   Pregunta dónde va el efectivo y registra movimientos automáticos en las
   cuentas financieras de destino.

   Reglas de uso:
     - No tiene X ni click-fuera-cierra. Solo se cierra confirmando.
     - Si el monto de efectivo es 0, el modal se auto-salta (llama a onConfirmar
       sin crear movimientos).
     - Lee la lista de cuentas desde listarCuentasDestinoCierre() que devuelve
       las cuentas marcadas con mostrar_en_cierre_tienda=true.

   Props:
     montoEfectivo   Number   - cuánto efectivo hay que distribuir
     idCajaDia       Number   - id de la caja (sesión) que se cerró
     idUbicacion     Number   - id de la tienda
     idPersona       Number   - id de la persona que entrega
     nombreTienda    String   - label visible (ej "Tienda 1039")
     nombreVendedora String   - label visible (ej "Naty")
     onConfirmar     Function - se llama cuando ya se registró la distribución
                                (o al saltar si monto=0)

   El modal usa estilos propios (no depende de componentes de Finanzas)
   porque se monta dentro del POS que tiene su propio sistema visual tailwind.
   Estilo consistente con el resto de Caja.jsx.
   ────────────────────────────────────────────────────────────────────────── */

const fmt = n => `S/${Number(n || 0).toFixed(2)}`;

export default function ModalDestinoEfectivo({
  montoEfectivo,
  idCajaDia,
  idUbicacion,
  idPersona,
  nombreTienda,
  nombreVendedora,
  onConfirmar,
}) {
  const [cuentas, setCuentas] = useState([]);
  const [cargandoCuentas, setCargandoCuentas] = useState(true);
  const [errorCarga, setErrorCarga] = useState('');
  const [modo, setModo] = useState('rapido'); // 'rapido' | 'dividir'
  const [seleccionRapida, setSeleccionRapida] = useState(null); // id_cuenta, 'tienda' o null
  const [distribucion, setDistribucion] = useState([]); // [{id_cuenta, monto, concepto}]
  const [guardando, setGuardando] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState('');

  /* ── Auto-salta si no hay efectivo ── */
  useEffect(() => {
    if (!montoEfectivo || montoEfectivo <= 0) {
      onConfirmar();
    }
  }, [montoEfectivo, onConfirmar]);

  /* ── Cargar cuentas disponibles ── */
  useEffect(() => {
    (async () => {
      setCargandoCuentas(true);
      try {
        const data = await listarCuentasDestinoCierre();
        setCuentas(data || []);
      } catch (e) {
        console.error(e);
        setErrorCarga(e.message || 'Error al cargar cuentas');
      } finally {
        setCargandoCuentas(false);
      }
    })();
  }, []);

  /* ── Opciones rápidas: 4 botones grandes ── */
  const opcionesRapidas = useMemo(() => {
    const opts = [];
    const caja_prod = cuentas.find(c => c.codigo === 'CAJA_PROD');
    const caja_admin = cuentas.find(c => c.codigo === 'CAJA_ADMIN');
    if (caja_prod) {
      opts.push({
        tipo: 'cuenta',
        id: caja_prod.id_cuenta,
        nombre: caja_prod.nombre,
        sub: caja_prod.alias || 'Caja del taller',
        custodio: caja_prod.custodio?.nombre,
      });
    }
    if (caja_admin) {
      opts.push({
        tipo: 'cuenta',
        id: caja_admin.id_cuenta,
        nombre: caja_admin.nombre,
        sub: caja_admin.alias || 'Caja de administración',
        custodio: caja_admin.custodio?.nombre,
      });
    }
    opts.push({
      tipo: 'tienda',
      id: 'tienda',
      nombre: 'Queda en tienda',
      sub: `Se guarda en ${nombreTienda}`,
      custodio: null,
    });
    opts.push({
      tipo: 'dividir',
      id: 'dividir',
      nombre: 'Dividir entre varias',
      sub: 'Elegir cuentas y montos',
      custodio: null,
    });
    return opts;
  }, [cuentas, nombreTienda]);

  /* ── Total distribución ── */
  const totalDist = useMemo(
    () => distribucion.reduce((s, d) => s + (Number(d.monto) || 0), 0),
    [distribucion]
  );

  const restante = Number(montoEfectivo) - totalDist;
  const cuadra = Math.abs(restante) < 0.01;

  /* ── Handlers modo dividir ── */

  const iniciarDividir = () => {
    setModo('dividir');
    // Pre-poblar con 2 cuentas si existen las clásicas
    const prod = cuentas.find(c => c.codigo === 'CAJA_PROD');
    const admin = cuentas.find(c => c.codigo === 'CAJA_ADMIN');
    const inicial = [];
    if (prod) inicial.push({ id_cuenta: prod.id_cuenta, monto: 0 });
    if (admin) inicial.push({ id_cuenta: admin.id_cuenta, monto: 0 });
    if (inicial.length === 0 && cuentas.length > 0) {
      inicial.push({ id_cuenta: cuentas[0].id_cuenta, monto: 0 });
    }
    setDistribucion(inicial);
  };

  const handleDistChange = (idx, field, value) => {
    setDistribucion(prev => prev.map((d, i) => i === idx ? { ...d, [field]: value } : d));
  };

  const handleDistAdd = () => {
    setDistribucion(prev => [...prev, { id_cuenta: null, monto: 0 }]);
  };

  const handleDistRemove = (idx) => {
    setDistribucion(prev => prev.filter((_, i) => i !== idx));
  };

  /* ── Confirmar ── */

  const confirmar = async () => {
    setErrorGuardar('');

    // Modo rápido: una sola cuenta o queda en tienda
    if (modo === 'rapido') {
      if (!seleccionRapida) {
        setErrorGuardar('Elige una opción para continuar');
        return;
      }
      setGuardando(true);
      try {
        if (seleccionRapida === 'tienda') {
          // No se crean movimientos, el dinero queda en el sobre de la tienda
          await registrarDistribucionCierre({
            idCajaDia,
            idUbicacionTienda: idUbicacion,
            idPersonaOrigen: idPersona,
            destinos: [],
            montoQueda: Number(montoEfectivo),
          });
        } else {
          // Todo a una sola cuenta
          await registrarDistribucionCierre({
            idCajaDia,
            idUbicacionTienda: idUbicacion,
            idPersonaOrigen: idPersona,
            destinos: [{
              id_cuenta: Number(seleccionRapida),
              monto: Number(montoEfectivo),
              concepto: `Entrega cierre ${nombreTienda} - ${nombreVendedora}`,
            }],
            montoQueda: 0,
          });
        }
        onConfirmar();
      } catch (e) {
        console.error(e);
        setErrorGuardar(e.message || 'Error al registrar la distribución');
      } finally {
        setGuardando(false);
      }
      return;
    }

    // Modo dividir: validaciones y envío
    const destinosValidos = distribucion.filter(d => d.id_cuenta && Number(d.monto) > 0);
    if (destinosValidos.length === 0) {
      setErrorGuardar('Agrega al menos un destino con monto mayor a cero');
      return;
    }
    if (!cuadra) {
      if (restante > 0) {
        setErrorGuardar(`Falta distribuir ${fmt(restante)}. Si parte queda en tienda, agrégalo explícitamente abajo.`);
      } else {
        setErrorGuardar(`Distribuiste ${fmt(Math.abs(restante))} más que el efectivo disponible.`);
      }
      return;
    }
    // Verificar que no haya cuentas repetidas
    const ids = destinosValidos.map(d => Number(d.id_cuenta));
    if (new Set(ids).size !== ids.length) {
      setErrorGuardar('No puedes tener la misma cuenta repetida dos veces.');
      return;
    }

    setGuardando(true);
    try {
      await registrarDistribucionCierre({
        idCajaDia,
        idUbicacionTienda: idUbicacion,
        idPersonaOrigen: idPersona,
        destinos: destinosValidos.map(d => ({
          id_cuenta: Number(d.id_cuenta),
          monto: Number(d.monto),
          concepto: `Entrega cierre ${nombreTienda} - ${nombreVendedora}`,
        })),
        montoQueda: 0,
      });
      onConfirmar();
    } catch (e) {
      console.error(e);
      setErrorGuardar(e.message || 'Error al registrar la distribución');
    } finally {
      setGuardando(false);
    }
  };

  /* ── Si no hay efectivo, no renderizar ── */
  if (!montoEfectivo || montoEfectivo <= 0) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ backgroundColor: 'rgba(15, 23, 42, 0.6)' }}
    >
      <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-xl max-h-[92vh] overflow-hidden flex flex-col">

        {/* Header — nota: NO hay botón de cerrar */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-100">
          <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-1">
            Paso final · obligatorio
          </p>
          <h2 className="text-2xl font-black text-slate-900 leading-tight">
            ¿A dónde va este efectivo?
          </h2>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-4xl font-black font-mono text-slate-900">
              {fmt(montoEfectivo)}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 font-mono">
            {nombreTienda} · {nombreVendedora}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">

          {cargandoCuentas ? (
            <div className="py-12 text-center">
              <p className="text-sm text-slate-400">Cargando cuentas...</p>
            </div>
          ) : errorCarga ? (
            <div className="p-4 bg-red-50 border border-red-200 rounded-2xl">
              <p className="text-sm font-bold text-red-700">Error al cargar cuentas</p>
              <p className="text-xs text-red-600 mt-1">{errorCarga}</p>
              <p className="text-[11px] text-red-500 mt-2 font-mono">
                Revisa que el parche SQL 3.5.0 esté aplicado.
              </p>
            </div>
          ) : cuentas.length === 0 ? (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl">
              <p className="text-sm font-bold text-amber-700">Sin cuentas disponibles</p>
              <p className="text-xs text-amber-700 mt-1">
                No hay cuentas marcadas como destino de cierre de tienda.
                Avisa a quien administra las cuentas en Finanzas para que las habilite.
              </p>
            </div>
          ) : modo === 'rapido' ? (
            /* ═══════════════════════════════════════════════════════════
               MODO RÁPIDO: 4 botones grandes
               ═══════════════════════════════════════════════════════════ */
            <div className="space-y-2.5">
              {opcionesRapidas.map(op => {
                const seleccionada = seleccionRapida === (op.tipo === 'cuenta' ? op.id : op.id);
                const isDividir = op.tipo === 'dividir';
                return (
                  <button
                    key={op.id}
                    onClick={() => {
                      if (isDividir) {
                        iniciarDividir();
                      } else {
                        setSeleccionRapida(op.tipo === 'cuenta' ? op.id : op.id);
                      }
                    }}
                    className={`w-full text-left px-4 py-3.5 rounded-2xl border-2 transition-all active:scale-[0.98] ${
                      seleccionada
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <p className={`text-base font-black ${seleccionada ? 'text-white' : 'text-slate-900'}`}>
                      {op.nombre}
                    </p>
                    <p className={`text-xs font-bold mt-0.5 ${seleccionada ? 'text-slate-300' : 'text-slate-500'}`}>
                      {op.sub}
                      {op.custodio && ` · ${op.custodio}`}
                    </p>
                  </button>
                );
              })}
            </div>
          ) : (
            /* ═══════════════════════════════════════════════════════════
               MODO DIVIDIR: formulario
               ═══════════════════════════════════════════════════════════ */
            <div>
              <button
                onClick={() => { setModo('rapido'); setDistribucion([]); }}
                className="text-xs text-slate-400 font-bold mb-3"
              >
                ← Volver a opciones rápidas
              </button>

              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-2">
                Distribución
              </p>

              <div className="space-y-2 mb-3">
                {distribucion.map((d, idx) => {
                  const cuenta = cuentas.find(c => c.id_cuenta === Number(d.id_cuenta));
                  return (
                    <div key={idx} className="flex items-end gap-2">
                      <div className="flex-1">
                        <select
                          value={d.id_cuenta || ''}
                          onChange={e => handleDistChange(idx, 'id_cuenta', e.target.value ? Number(e.target.value) : null)}
                          className="w-full h-11 px-3 rounded-xl border-2 border-slate-200 bg-white text-sm font-bold text-slate-900 focus:outline-none focus:border-slate-900"
                        >
                          <option value="">— Cuenta —</option>
                          {cuentas.map(c => (
                            <option key={c.id_cuenta} value={c.id_cuenta}>
                              {c.nombre}{c.alias ? ` (${c.alias})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="w-28">
                        <div className="flex items-center h-11 px-2 rounded-xl border-2 border-slate-200 bg-white">
                          <span className="text-slate-400 text-xs font-mono mr-1">S/</span>
                          <input
                            type="number"
                            inputMode="decimal"
                            value={d.monto || ''}
                            onChange={e => handleDistChange(idx, 'monto', e.target.value)}
                            placeholder="0"
                            className="flex-1 w-full text-right font-mono text-sm font-bold outline-none bg-transparent text-slate-900"
                          />
                        </div>
                      </div>
                      {distribucion.length > 1 && (
                        <button
                          onClick={() => handleDistRemove(idx)}
                          className="w-9 h-11 flex items-center justify-center rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <button
                onClick={handleDistAdd}
                className="text-xs text-slate-500 font-bold flex items-center gap-1 hover:text-slate-900"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Agregar cuenta
              </button>

              {/* Barra de totales */}
              <div className="mt-4 p-3 bg-slate-50 rounded-2xl">
                <div className="flex justify-between items-center">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Distribuido</span>
                  <span className="font-mono font-black text-slate-900">{fmt(totalDist)}</span>
                </div>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total disponible</span>
                  <span className="font-mono font-black text-slate-900">{fmt(montoEfectivo)}</span>
                </div>
                <div className="h-px bg-slate-200 my-2" />
                <div className="flex justify-between items-center">
                  <span className="text-[11px] font-bold uppercase tracking-wider">
                    <span className={cuadra ? 'text-emerald-600' : restante > 0 ? 'text-amber-600' : 'text-red-600'}>
                      {cuadra ? '✓ Cuadra' : restante > 0 ? 'Falta' : 'Sobra'}
                    </span>
                  </span>
                  <span className={`font-mono font-black ${cuadra ? 'text-emerald-600' : restante > 0 ? 'text-amber-600' : 'text-red-600'}`}>
                    {cuadra ? fmt(0) : fmt(Math.abs(restante))}
                  </span>
                </div>
              </div>
            </div>
          )}

          {errorGuardar && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-2xl">
              <p className="text-xs font-bold text-red-700">{errorGuardar}</p>
            </div>
          )}
        </div>

        {/* Footer con botón confirmar */}
        <div className="px-6 pb-6 pt-3 border-t border-slate-100 bg-white">
          <button
            onClick={confirmar}
            disabled={guardando || cargandoCuentas || (modo === 'rapido' && !seleccionRapida) || (modo === 'dividir' && !cuadra)}
            className="w-full py-4 bg-slate-900 text-white font-black text-base rounded-2xl disabled:opacity-40 active:scale-[0.98] transition-transform"
          >
            {guardando ? 'Guardando...' : 'Confirmar entrega'}
          </button>
          <p className="text-[10px] text-slate-400 text-center mt-2 font-bold">
            Este paso es obligatorio. No puedes salir sin elegir destino.
          </p>
        </div>
      </div>
    </div>
  );
}