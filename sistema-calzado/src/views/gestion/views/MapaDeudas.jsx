import React, { useMemo, useState } from 'react';
import {
  formatMoney, formatPercent,
  calcularProximoVencimiento,
  costoFinancieroDiario, costoFinancieroDiarioTotal,
  costoTotalRestante, tceaEfectiva, simularPagoExtra,
} from '../lib/calculos';
import {
  Card, MetricCard, Icon, ICONS,
} from '../components/UI';

/* ──────────────────────────────────────────────────────────────────────────
   MAPA DE DEUDAS — 4 capas de información
   ──────────────────────────────────────────────────────────────────────────

   Capa 1 — STOCK: barras horizontales ordenadas por TCEA descendente
   Capa 2 — FLUJO: calendario del mes con vencimientos
   Capa 3 — COSTO REAL: total a pagar, intereses pendientes, costo diario
   Capa 4 — ESTRATEGIA: recomendaciones algorítmicas (avalancha, snowball,
            refinanciación urgente, riesgo de mora)

   Recibe via props:
     - deudas: array de deudas activas (todos los datos del select de Deudas)
     - cuentas: para calcular dinero disponible para recomendaciones
     - onClose: cierra el modal full-screen
     - onAbrirDeuda: callback al click sobre una deuda
     - onPagarDeuda: callback opcional al botón "Pagar"

   ────────────────────────────────────────────────────────────────────────── */


export default function MapaDeudas({ deudas, cuentas, onClose, onAbrirDeuda, onPagarDeuda }) {
  const activas = useMemo(
    () => (deudas || []).filter(d => d.estado === 'activa' && Number(d.saldo_actual) > 0),
    [deudas]
  );

  const ordenadasPorTCEA = useMemo(() => {
    return [...activas].sort((a, b) => tceaEfectiva(b) - tceaEfectiva(a));
  }, [activas]);

  /* ── Métricas globales ── */
  const metricas = useMemo(() => {
    const totalSaldo = activas.reduce((s, d) => s + Number(d.saldo_actual || 0), 0);
    const costoDiario = costoFinancieroDiarioTotal(activas);

    let interesPendiente = 0;
    let totalAPagar = 0;
    activas.forEach(d => {
      const c = costoTotalRestante(d);
      interesPendiente += c.interes;
      totalAPagar += c.total;
    });

    // TCEA promedio ponderada por saldo
    const sumaPond = activas.reduce((s, d) => s + tceaEfectiva(d) * Number(d.saldo_actual || 0), 0);
    const tceaPromedio = totalSaldo > 0 ? sumaPond / totalSaldo : 0;

    return {
      totalSaldo,
      costoDiario,
      costoMensual: costoDiario * 30,
      costoAnual: costoDiario * 365,
      interesPendiente,
      totalAPagar,
      tceaPromedio,
      cantidad: activas.length,
    };
  }, [activas]);

  /* ── Disponible en cuentas operativas (para recomendaciones) ── */
  const disponibleOperativo = useMemo(() => {
    return (cuentas || [])
      .filter(c => c.activa && (c.tipo_cuenta === 'operativa' || c.tipo_cuenta === 'ahorro'))
      .reduce((s, c) => s + Math.max(0, Number(c.saldo_actual) || 0), 0);
  }, [cuentas]);

  /* ── Recomendaciones estratégicas ── */
  const recomendaciones = useMemo(
    () => generarRecomendaciones(activas, disponibleOperativo, metricas),
    [activas, disponibleOperativo, metricas]
  );

  /* ── Vencimientos del mes ── */
  const vencimientosMes = useMemo(() => calcularVencimientosMes(activas), [activas]);

  /* Si no hay deudas activas, vista simple */
  if (activas.length === 0) {
    return (
      <FullScreenModal onClose={onClose} title="Mapa de deudas">
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mb-4">
            <Icon d={ICONS.check} size={28} className="text-green-700" />
          </div>
          <p className="text-lg text-foreground" style={{ fontWeight: 600 }}>Sin deudas activas</p>
          <p className="text-sm text-muted-foreground mt-2 max-w-sm text-center" style={{ fontWeight: 400 }}>
            Cuando tengas deudas activas, este mapa te mostrará un análisis completo con recomendaciones estratégicas.
          </p>
        </div>
      </FullScreenModal>
    );
  }

  return (
    <FullScreenModal onClose={onClose} title="Mapa de deudas">
      <div className="space-y-6">
        {/* ═══════════════════════════════════════════════════════════════
            CAPA 3 — COSTO REAL (la verdad incómoda, va arriba)
            ═══════════════════════════════════════════════════════════════ */}
        <SectionCostoReal metricas={metricas} disponibleOperativo={disponibleOperativo} />

        {/* ═══════════════════════════════════════════════════════════════
            CAPA 1 — STOCK: barras por TCEA descendente
            ═══════════════════════════════════════════════════════════════ */}
        <SectionStock
          deudas={ordenadasPorTCEA}
          totalSaldo={metricas.totalSaldo}
          onAbrirDeuda={onAbrirDeuda}
          onPagarDeuda={onPagarDeuda}
        />

        {/* ═══════════════════════════════════════════════════════════════
            CAPA 2 — FLUJO: calendario del mes
            ═══════════════════════════════════════════════════════════════ */}
        <SectionCalendario vencimientos={vencimientosMes} onAbrirDeuda={onAbrirDeuda} />

        {/* ═══════════════════════════════════════════════════════════════
            GANTT — Timeline de vida restante por deuda
            ═══════════════════════════════════════════════════════════════ */}
        <SectionGantt deudas={ordenadasPorTCEA} />

        {/* ═══════════════════════════════════════════════════════════════
            SIMULADOR — ¿Y si pago extra?
            ═══════════════════════════════════════════════════════════════ */}
        <SectionSimulador deudas={activas} disponible={disponibleOperativo} />

        {/* ═══════════════════════════════════════════════════════════════
            CAPA 4 — ESTRATEGIA: recomendaciones
            ═══════════════════════════════════════════════════════════════ */}
        <SectionRecomendaciones recomendaciones={recomendaciones} onAbrirDeuda={onAbrirDeuda} />
      </div>
    </FullScreenModal>
  );
}


/* ══════════════════════════════════════════════════════════════════════════
   GANTT — Timeline de vida restante
   ══════════════════════════════════════════════════════════════════════════ */

function SectionGantt({ deudas }) {
  if (!deudas || deudas.length === 0) return null;

  // Para cada deuda: calcular meses restantes aproximados
  const hoy = new Date();
  const items = deudas.map(d => {
    const saldo = Number(d.saldo_actual) || 0;
    const cuota = Number(d.cuota_monto) || 0;
    const tasa = Number(d.tasa_interes_mensual) || 0;

    let mesesRestantes;
    if (d.fecha_fin) {
      const fin = new Date(d.fecha_fin);
      mesesRestantes = Math.max(0, Math.round((fin - hoy) / (1000 * 60 * 60 * 24 * 30.4)));
    } else if (cuota > 0 && saldo > 0) {
      if (tasa > 0) {
        mesesRestantes = Math.ceil(Math.log(cuota / (cuota - saldo * tasa)) / Math.log(1 + tasa));
      } else {
        mesesRestantes = Math.ceil(saldo / cuota);
      }
      mesesRestantes = Math.max(1, Math.min(mesesRestantes, 120));
    } else {
      mesesRestantes = 12; // fallback
    }

    return { ...d, mesesRestantes };
  }).filter(d => d.mesesRestantes > 0);

  const maxMeses = Math.max(...items.map(d => d.mesesRestantes), 1);

  const COLORES = ['#b91c1c', '#d97706', '#0369a1', '#7c3aed', '#059669', '#0891b2'];

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-base text-foreground" style={{ fontWeight: 600 }}>Timeline de deudas</h2>
        <p className="text-xs text-muted-foreground" style={{ fontWeight: 400 }}>Vida restante estimada por deuda</p>
      </div>
      <Card padding="md">
        <div className="space-y-3">
          {items.map((d, i) => {
            const pct = (d.mesesRestantes / maxMeses) * 100;
            const color = COLORES[i % COLORES.length];
            const años = Math.floor(d.mesesRestantes / 12);
            const mesesR = d.mesesRestantes % 12;
            const label = años > 0
              ? `${años}a ${mesesR > 0 ? mesesR + 'm' : ''}`
              : `${d.mesesRestantes}m`;

            return (
              <div key={d.id_deuda}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-foreground" style={{ fontWeight: 500 }}>{d.nombre}</span>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground" style={{ fontWeight: 400 }}>
                    <span>{formatMoney(d.saldo_actual)}</span>
                    <span className="text-muted-foreground">{label} restante{d.mesesRestantes !== 1 ? 's' : ''}</span>
                  </div>
                </div>
                <div className="h-4 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, backgroundColor: color, minWidth: 8 }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between mt-3 text-[10px] text-muted-foreground" style={{ fontWeight: 400 }}>
          <span>Hoy</span>
          <span>{Math.floor(maxMeses / 12) > 0 ? `~${Math.floor(maxMeses / 12)}a ${maxMeses % 12}m` : `${maxMeses}m`}</span>
        </div>
      </Card>
    </div>
  );
}


/* ══════════════════════════════════════════════════════════════════════════
   SIMULADOR — ¿Y si pago extra?
   ══════════════════════════════════════════════════════════════════════════ */

function SectionSimulador({ deudas, disponible }) {
  const [deudaId, setDeudaId] = useState(deudas[0]?.id_deuda || null);
  const [pagoExtra, setPagoExtra] = useState(200);

  const deudaSeleccionada = deudas.find(d => d.id_deuda === deudaId);
  const maxSlider = Math.min(Math.max(disponible * 0.3, 500), 5000);

  const simulacion = useMemo(() => {
    if (!deudaSeleccionada || pagoExtra <= 0) return null;
    return simularPagoExtra(deudaSeleccionada, pagoExtra);
  }, [deudaSeleccionada, pagoExtra]);

  if (deudas.length === 0) return null;

  const deudaSinSim = deudaSeleccionada ? costoTotalRestante(deudaSeleccionada) : null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-base text-foreground" style={{ fontWeight: 600 }}>Simulador de payoff</h2>
        <p className="text-xs text-muted-foreground" style={{ fontWeight: 400 }}>¿Cuánto ahorras pagando más cada mes?</p>
      </div>

      <Card padding="md">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Controles */}
          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-2" style={{ fontWeight: 500 }}>
                Deuda a simular
              </label>
              <select
                value={deudaId || ''}
                onChange={e => setDeudaId(Number(e.target.value))}
                className="w-full h-10 px-3 rounded-lg border border-border bg-card text-sm text-foreground focus:outline-none focus-visible:border-ring"
              >
                {deudas.map(d => (
                  <option key={d.id_deuda} value={d.id_deuda}>
                    {d.nombre} — {formatMoney(d.saldo_actual)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-2" style={{ fontWeight: 500 }}>
                Pago extra mensual: <span className="text-foreground text-sm">{formatMoney(pagoExtra)}</span>
              </label>
              <input
                type="range"
                min={50}
                max={Math.round(maxSlider)}
                step={50}
                value={pagoExtra}
                onChange={e => setPagoExtra(Number(e.target.value))}
                className="w-full accent-[#1c1917]"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1" style={{ fontWeight: 400 }}>
                <span>S/ 50</span>
                <span>{formatMoney(Math.round(maxSlider))}</span>
              </div>
            </div>

            {deudaSeleccionada && (
              <div className="text-xs text-muted-foreground space-y-1" style={{ fontWeight: 400 }}>
                <p>Cuota actual: <span style={{ fontWeight: 500 }}>{formatMoney(deudaSeleccionada.cuota_monto)}</span></p>
                <p>Con pago extra: <span style={{ fontWeight: 500 }}>{formatMoney(Number(deudaSeleccionada.cuota_monto) + pagoExtra)}</span></p>
              </div>
            )}
          </div>

          {/* Resultados */}
          <div>
            {simulacion && simulacion.meses_ahorrados > 0 ? (
              <div className="space-y-3">
                <div className="p-4 rounded-xl bg-green-50 border border-green-300">
                  <p className="text-[10px] text-green-700 uppercase tracking-wider mb-1" style={{ fontWeight: 500 }}>Meses ahorrados</p>
                  <p className="text-3xl text-green-700 fin-num" style={{ fontWeight: 700 }}>
                    {simulacion.meses_ahorrados}
                  </p>
                  <p className="text-xs text-green-700 mt-1" style={{ fontWeight: 400 }}>
                    {simulacion.meses_originales}m → {simulacion.meses_acelerados}m
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-blue-50 border border-blue-300">
                  <p className="text-[10px] text-blue-700 uppercase tracking-wider mb-1" style={{ fontWeight: 500 }}>Intereses ahorrados</p>
                  <p className="text-2xl text-blue-700 fin-num" style={{ fontWeight: 700 }}>
                    {formatMoney(simulacion.intereses_ahorrados)}
                  </p>
                  {simulacion.nueva_fecha_fin && (
                    <p className="text-xs text-blue-700 mt-1" style={{ fontWeight: 400 }}>
                      Liquidación: {new Date(simulacion.nueva_fecha_fin).toLocaleDateString('es-PE', { month: 'short', year: 'numeric' })}
                    </p>
                  )}
                </div>
                {deudaSinSim && (
                  <div className="p-3 rounded-xl bg-muted/30 border border-border">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1" style={{ fontWeight: 500 }}>Total a pagar sin extra</p>
                    <p className="text-sm text-muted-foreground fin-num" style={{ fontWeight: 500 }}>{formatMoney(deudaSinSim.total)}</p>
                  </div>
                )}
              </div>
            ) : simulacion && simulacion.meses_ahorrados === 0 ? (
              <div className="p-4 rounded-xl bg-muted/30 border border-border flex items-center gap-3">
                <p className="text-sm text-muted-foreground" style={{ fontWeight: 400 }}>
                  El pago extra no reduce el tiempo significativamente con esta deuda (puede que sea una deuda corta o sin cuotas fijas).
                </p>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground" style={{ fontWeight: 400 }}>
                Selecciona una deuda y ajusta el slider para ver la simulación
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}


/* ══════════════════════════════════════════════════════════════════════════
   FullScreenModal - contenedor full-screen propio (no usa Modal estándar)
   ══════════════════════════════════════════════════════════════════════════ */

function FullScreenModal({ children, title, onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ backgroundColor: 'rgba(28, 25, 23, 0.5)' }}
    >
      <div className="flex-1 overflow-hidden flex flex-col bg-muted/30 m-0 sm:m-4 rounded-none sm:rounded-xl border border-border">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card">
          <div>
            <p className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground" style={{ fontWeight: 500 }}>Análisis financiero</p>
            <h1 className="text-xl text-foreground" style={{ fontWeight: 600, letterSpacing: '-0.02em' }}>{title}</h1>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <Icon d={ICONS.x} size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}


/* ══════════════════════════════════════════════════════════════════════════
   CAPA 3 - COSTO REAL
   ══════════════════════════════════════════════════════════════════════════ */

function SectionCostoReal({ metricas, disponibleOperativo }) {
  const ratioDeuda = disponibleOperativo > 0
    ? (metricas.totalSaldo / disponibleOperativo)
    : null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-base text-foreground" style={{ fontWeight: 600 }}>
          Costo real
        </h2>
        <p className="text-xs text-muted-foreground" style={{ fontWeight: 400 }}>
          La verdad completa de lo que cuestan tus deudas
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          label="Saldo total deudas"
          value={metricas.totalSaldo}
          accent="danger"
          sublabel={`${metricas.cantidad} deuda${metricas.cantidad !== 1 ? 's' : ''} activa${metricas.cantidad !== 1 ? 's' : ''}`}
        />
        <MetricCard
          label="Total a pagar (capital + interés)"
          value={metricas.totalAPagar}
          sublabel={`Hasta liquidar todas según cronograma`}
        />
        <MetricCard
          label="Intereses pendientes"
          value={metricas.interesPendiente}
          accent="warning"
          sublabel={metricas.totalSaldo > 0
            ? `${formatPercent(metricas.interesPendiente / metricas.totalSaldo, { decimals: 1 })} sobre el capital`
            : ''}
        />
        <MetricCard
          label="Costo diario actual"
          value={metricas.costoDiario}
          accent="danger"
          sublabel={`${formatMoney(metricas.costoMensual)}/mes · ${formatMoney(metricas.costoAnual)}/año`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3">
        <Card padding="md">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-2" style={{ fontWeight: 500 }}>
            TCEA promedio ponderada
          </p>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl text-foreground fin-num" style={{ fontWeight: 500, letterSpacing: '-0.02em' }}>
              {formatPercent(metricas.tceaPromedio, { decimals: 2 })}
            </p>
            <p className="text-xs text-muted-foreground" style={{ fontWeight: 400 }}>anual</p>
          </div>
          <p className="text-xs text-muted-foreground mt-2" style={{ fontWeight: 400 }}>
            {metricas.tceaPromedio >= 0.30
              ? 'Tu costo financiero promedio es alto. Considera refinanciar las deudas más caras.'
              : metricas.tceaPromedio >= 0.15
              ? 'Tu costo financiero está en rango razonable para Perú.'
              : 'Tu costo financiero promedio es bajo. Aprovecha para acelerar pagos.'}
          </p>
        </Card>

        <Card padding="md">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-2" style={{ fontWeight: 500 }}>
            Cobertura disponible
          </p>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl text-foreground fin-num" style={{ fontWeight: 500, letterSpacing: '-0.02em' }}>
              {ratioDeuda != null
                ? `${(ratioDeuda).toFixed(1)}×`
                : '—'}
            </p>
            <p className="text-xs text-muted-foreground" style={{ fontWeight: 400 }}>
              ({formatMoney(disponibleOperativo)} disponible)
            </p>
          </div>
          <p className="text-xs text-muted-foreground mt-2" style={{ fontWeight: 400 }}>
            {ratioDeuda == null
              ? 'Sin cuentas operativas con saldo positivo.'
              : ratioDeuda <= 1
              ? 'Tu dinero disponible cubre el total de las deudas. Estás en posición sólida.'
              : ratioDeuda <= 3
              ? 'Tus deudas son varias veces tu efectivo disponible. Manejable pero ojo con la liquidez.'
              : 'Tus deudas son muchas veces tu efectivo. Riesgo de liquidez alto, prioriza generar caja.'}
          </p>
        </Card>
      </div>
    </div>
  );
}


/* ══════════════════════════════════════════════════════════════════════════
   CAPA 1 - STOCK (barras horizontales por TCEA)
   ══════════════════════════════════════════════════════════════════════════ */

function SectionStock({ deudas, totalSaldo, onAbrirDeuda, onPagarDeuda }) {
  // Encuentra el saldo máximo para escalar las barras
  const saldoMax = Math.max(...deudas.map(d => Number(d.saldo_actual) || 0), 1);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-base text-foreground" style={{ fontWeight: 600 }}>
          Deudas por costo (TCEA descendente)
        </h2>
        <p className="text-xs text-muted-foreground" style={{ fontWeight: 400 }}>
          La más cara primero. Ataca de arriba hacia abajo.
        </p>
      </div>

      <Card padding="md">
        <div className="space-y-3">
          {deudas.map((d, idx) => {
            const saldo = Number(d.saldo_actual) || 0;
            const original = Number(d.monto_original) || saldo;
            const pagado = Math.max(0, original - saldo);
            const pctPagado = original > 0 ? pagado / original : 0;
            const tcea = tceaEfectiva(d);
            const colorTCEA =
              tcea >= 0.40 ? '#991b1b'
              : tcea >= 0.30 ? '#c2410c'
              : tcea >= 0.20 ? '#a16207'
              : tcea >= 0.10 ? '#4d7c0f'
              : '#166534';

            const widthPct = (saldo / saldoMax) * 100;

            return (
              <div
                key={d.id_deuda}
                className="group cursor-pointer hover:bg-muted/30 -mx-2 px-2 py-2 rounded-lg transition-colors"
                onClick={() => onAbrirDeuda?.(d)}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[11px] text-muted-foreground fin-num w-5" style={{ fontWeight: 500 }}>
                      #{idx + 1}
                    </span>
                    <p className="text-sm text-foreground truncate" style={{ fontWeight: 500 }}>
                      {d.nombre}
                    </p>
                    <span className="text-[11px] text-muted-foreground truncate" style={{ fontWeight: 400 }}>
                      · {d.acreedor}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span
                      className="text-[11px] fin-num px-1.5 py-0.5 rounded"
                      style={{ fontWeight: 600, color: colorTCEA, backgroundColor: colorTCEA + '15' }}
                    >
                      TCEA {formatPercent(tcea, { decimals: 1 })}
                    </span>
                    <span className="text-sm text-foreground fin-num" style={{ fontWeight: 600 }}>
                      {formatMoney(saldo)}
                    </span>
                  </div>
                </div>

                {/* Barra de progreso compuesta: pagado + pendiente */}
                <div className="relative h-2 bg-muted rounded-full overflow-hidden" style={{ width: `${Math.max(8, widthPct)}%`, minWidth: '60px' }}>
                  <div
                    className="absolute inset-y-0 left-0 bg-primary opacity-20"
                    style={{ width: '100%' }}
                  />
                  <div
                    className="absolute inset-y-0 left-0"
                    style={{
                      width: `${(saldo / (saldo + pagado || 1)) * 100}%`,
                      backgroundColor: colorTCEA,
                    }}
                  />
                </div>

                <div className="flex items-center justify-between mt-1.5">
                  <p className="text-[11px] text-muted-foreground" style={{ fontWeight: 400 }}>
                    Pagado {formatMoney(pagado)} de {formatMoney(original)} ({formatPercent(pctPagado, { decimals: 0 })})
                    {' · cuota '}{formatMoney(d.cuota_monto)}
                    {' · costo '}<span className="fin-num">{formatMoney(costoFinancieroDiario(d))}/día</span>
                  </p>
                  {onPagarDeuda && (
                    <button
                      onClick={e => { e.stopPropagation(); onPagarDeuda(d); }}
                      className="text-[11px] px-2 py-1 rounded bg-primary text-primary-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ fontWeight: 500 }}
                    >
                      Pagar
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}


/* ══════════════════════════════════════════════════════════════════════════
   CAPA 2 - CALENDARIO DEL MES
   ══════════════════════════════════════════════════════════════════════════ */

function calcularVencimientosMes(deudas) {
  const ahora = new Date();
  const año = ahora.getFullYear();
  const mes = ahora.getMonth();
  const ultimoDia = new Date(año, mes + 1, 0).getDate();

  const porDia = new Map();

  deudas.forEach(d => {
    if (d.frecuencia_cuota === 'diaria') {
      // Las deudas diarias aparecen en TODOS los días del mes
      for (let dia = 1; dia <= ultimoDia; dia++) {
        if (!porDia.has(dia)) porDia.set(dia, []);
        porDia.get(dia).push({ deuda: d, cuota: d.cuota_monto });
      }
    } else if (d.frecuencia_cuota === 'mensual' && d.dia_pago_mes) {
      const dia = Math.min(d.dia_pago_mes, ultimoDia);
      if (!porDia.has(dia)) porDia.set(dia, []);
      porDia.get(dia).push({ deuda: d, cuota: d.cuota_monto });
    }
  });

  return { año, mes, ultimoDia, porDia, hoy: ahora.getDate() };
}

function SectionCalendario({ vencimientos, onAbrirDeuda }) {
  const { año, mes, ultimoDia, porDia, hoy } = vencimientos;
  const nombreMes = new Date(año, mes, 1).toLocaleDateString('es-PE', { month: 'long', year: 'numeric' });

  // Día de la semana del primer día (0=domingo)
  const primerDiaSemana = new Date(año, mes, 1).getDay();

  // Total del mes
  let totalMes = 0;
  porDia.forEach(items => {
    items.forEach(i => { totalMes += Number(i.cuota) || 0; });
  });

  // Construir grid de 7 columnas
  const celdas = [];
  for (let i = 0; i < primerDiaSemana; i++) celdas.push(null); // espacios vacíos
  for (let d = 1; d <= ultimoDia; d++) celdas.push(d);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-base text-foreground" style={{ fontWeight: 600 }}>
            Calendario de vencimientos
          </h2>
          <p className="text-xs text-muted-foreground" style={{ fontWeight: 400 }}>
            {nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1)}
          </p>
        </div>
        <p className="text-xs text-muted-foreground" style={{ fontWeight: 500 }}>
          Total del mes: <span className="fin-num text-foreground" style={{ fontWeight: 600 }}>{formatMoney(totalMes)}</span>
        </p>
      </div>

      <Card padding="md">
        <div className="grid grid-cols-7 gap-1.5">
          {['D', 'L', 'M', 'X', 'J', 'V', 'S'].map(d => (
            <div key={d} className="text-center text-[10px] text-muted-foreground uppercase tracking-wider py-1" style={{ fontWeight: 500 }}>
              {d}
            </div>
          ))}
          {celdas.map((dia, i) => {
            if (dia === null) return <div key={`empty-${i}`} />;

            const items = porDia.get(dia) || [];
            const tieneVenc = items.length > 0;
            const esPasado = dia < hoy;
            const esHoy = dia === hoy;
            const totalDia = items.reduce((s, x) => s + Number(x.cuota || 0), 0);

            const colorBG = esHoy
              ? '#1c1917'
              : tieneVenc && !esPasado
                ? (dia - hoy <= 3 ? '#fef2f2' : dia - hoy <= 10 ? '#fef9c3' : '#f0fdf4')
                : 'transparent';
            const colorBorder = esHoy
              ? '#1c1917'
              : tieneVenc && !esPasado
                ? (dia - hoy <= 3 ? '#fca5a5' : dia - hoy <= 10 ? '#fde68a' : '#86efac')
                : '#f5f5f4';
            const colorText = esHoy ? 'white' : '#1c1917';

            return (
              <div
                key={dia}
                className={`aspect-square flex flex-col items-center justify-center rounded-lg border ${
                  esPasado && !tieneVenc ? 'opacity-30' : ''
                } ${tieneVenc ? 'cursor-pointer hover:scale-105 transition-transform' : ''}`}
                style={{ backgroundColor: colorBG, borderColor: colorBorder }}
                onClick={() => {
                  if (tieneVenc && items.length === 1) onAbrirDeuda?.(items[0].deuda);
                }}
                title={tieneVenc ? items.map(i => `${i.deuda.nombre}: ${formatMoney(i.cuota)}`).join('\n') : ''}
              >
                <span className="text-xs fin-num" style={{ fontWeight: esHoy ? 600 : 500, color: colorText }}>
                  {dia}
                </span>
                {tieneVenc && (
                  <span
                    className="text-[9px] fin-num mt-0.5"
                    style={{ fontWeight: 500, color: esHoy ? 'white' : '#57534e' }}
                  >
                    {totalDia >= 1000 ? `${(totalDia/1000).toFixed(1)}k` : Math.round(totalDia)}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-3 mt-4 text-[11px]" style={{ fontWeight: 400 }}>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: '#fef2f2', border: '1px solid #fca5a5' }} />
            <span className="text-muted-foreground">Próx. 3 días</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: '#fef9c3', border: '1px solid #fde68a' }} />
            <span className="text-muted-foreground">Próx. 10 días</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: '#f0fdf4', border: '1px solid #86efac' }} />
            <span className="text-muted-foreground">Más adelante</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-primary" />
            <span className="text-muted-foreground">Hoy</span>
          </span>
        </div>
      </Card>
    </div>
  );
}


/* ══════════════════════════════════════════════════════════════════════════
   CAPA 4 - RECOMENDACIONES ESTRATÉGICAS
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Genera recomendaciones algorítmicas basadas en el estado de las deudas
 * y el dinero disponible. Devuelve un array de objetos { tipo, prioridad,
 * titulo, descripcion, deuda?, accion? }.
 */
function generarRecomendaciones(deudas, disponible, metricas) {
  const recs = [];

  if (deudas.length === 0) return recs;

  /* ── 1. Riesgo de mora (URGENTE) ── */
  const proximos7 = deudas
    .map(d => ({ d, venc: calcularProximoVencimiento(d) }))
    .filter(x => x.venc && x.venc.dias >= 0 && x.venc.dias <= 7);

  const sumaProximos7 = proximos7.reduce((s, x) => s + (Number(x.d.cuota_monto) || 0), 0);
  if (sumaProximos7 > disponible && proximos7.length > 0) {
    recs.push({
      tipo: 'mora',
      prioridad: 1,
      titulo: 'Riesgo de mora en los próximos 7 días',
      descripcion: `Tienes ${proximos7.length} vencimiento${proximos7.length !== 1 ? 's' : ''} por ${formatMoney(sumaProximos7)} en los próximos 7 días, pero solo dispones de ${formatMoney(disponible)} en cuentas operativas. Necesitas generar ${formatMoney(sumaProximos7 - disponible)} adicionales o renegociar fechas.`,
      color: 'danger',
    });
  }

  /* ── 2. Estrategia avalancha (deuda más cara) ── */
  const masCara = [...deudas].sort((a, b) => tceaEfectiva(b) - tceaEfectiva(a))[0];
  if (masCara && tceaEfectiva(masCara) > 0.10 && disponible > 0) {
    // Sugerir un pago extra del 10% de lo disponible
    const pagoExtra = Math.min(disponible * 0.10, Number(masCara.cuota_monto || 0));
    if (pagoExtra >= 50) {
      const sim = simularPagoExtra(masCara, pagoExtra);
      if (sim && sim.meses_ahorrados > 0) {
        recs.push({
          tipo: 'avalancha',
          prioridad: 2,
          titulo: `Estrategia avalancha: ataca ${masCara.nombre}`,
          descripcion: `Es tu deuda más cara con TCEA de ${formatPercent(tceaEfectiva(masCara), { decimals: 1 })}. Si pagas ${formatMoney(pagoExtra)} extra cada mes, terminas ${sim.meses_ahorrados} ${sim.meses_ahorrados === 1 ? 'mes' : 'meses'} antes y ahorras ${formatMoney(sim.intereses_ahorrados)} en intereses.`,
          deuda: masCara,
          color: 'info',
        });
      }
    }
  }

  /* ── 3. Estrategia bola de nieve (deuda más pequeña liquidable) ── */
  const liquidableYa = [...deudas]
    .filter(d => Number(d.saldo_actual) > 0 && Number(d.saldo_actual) <= disponible)
    .sort((a, b) => Number(a.saldo_actual) - Number(b.saldo_actual))[0];

  if (liquidableYa && deudas.length > 1) {
    recs.push({
      tipo: 'snowball',
      prioridad: 3,
      titulo: `Bola de nieve: liquida ${liquidableYa.nombre} de un golpe`,
      descripcion: `Su saldo es de solo ${formatMoney(liquidableYa.saldo_actual)} y tienes ${formatMoney(disponible)} disponible. Pagarla completa elimina ${formatMoney(costoFinancieroDiario(liquidableYa))}/día de costo financiero y libera la cuota mensual de ${formatMoney(liquidableYa.cuota_monto)} para atacar otras deudas.`,
      deuda: liquidableYa,
      color: 'success',
    });
  }

  /* ── 4. Refinanciación urgente (TCEA > 30%) ── */
  const carasParaRefinanciar = deudas.filter(d => tceaEfectiva(d) >= 0.30);
  if (carasParaRefinanciar.length > 0) {
    const totalCaro = carasParaRefinanciar.reduce((s, d) => s + Number(d.saldo_actual || 0), 0);
    if (totalCaro >= 1000) {
      recs.push({
        tipo: 'refinanciar',
        prioridad: 4,
        titulo: `Considera refinanciar deudas de TCEA ≥ 30%`,
        descripcion: `Tienes ${carasParaRefinanciar.length} deuda${carasParaRefinanciar.length !== 1 ? 's' : ''} por un total de ${formatMoney(totalCaro)} con TCEA igual o mayor al 30%. Una consolidación con un banco a ~24% TCEA ahorraría aproximadamente ${formatMoney(totalCaro * 0.06)} al año en intereses.`,
        color: 'warning',
      });
    }
  }

  /* ── 5. Concentración en un solo acreedor ── */
  const porAcreedor = new Map();
  deudas.forEach(d => {
    porAcreedor.set(d.acreedor, (porAcreedor.get(d.acreedor) || 0) + Number(d.saldo_actual || 0));
  });
  const totalDeuda = metricas.totalSaldo;
  let concentracionMax = 0;
  let acreedorConcentrado = null;
  porAcreedor.forEach((monto, acr) => {
    if (monto / totalDeuda > concentracionMax) {
      concentracionMax = monto / totalDeuda;
      acreedorConcentrado = acr;
    }
  });
  if (concentracionMax >= 0.60 && deudas.length >= 2) {
    recs.push({
      tipo: 'concentracion',
      prioridad: 5,
      titulo: `Concentración alta con ${acreedorConcentrado}`,
      descripcion: `${formatPercent(concentracionMax, { decimals: 0 })} de tu deuda total está con un solo acreedor. Si renegocia o cambia condiciones, te afecta de un golpe. Diversificar fuentes de financiamiento reduce este riesgo.`,
      color: 'warning',
    });
  }

  /* ── 6. Felicitación si todo está bajo control ── */
  if (recs.length === 0 && metricas.tceaPromedio < 0.20 && disponible >= metricas.totalSaldo * 0.5) {
    recs.push({
      tipo: 'ok',
      prioridad: 99,
      titulo: 'Tus deudas están bajo control',
      descripcion: 'TCEA promedio razonable, dinero disponible suficiente, sin vencimientos en riesgo. Mantén esta disciplina y considera adelantar pagos cuando puedas.',
      color: 'success',
    });
  }

  return recs.sort((a, b) => a.prioridad - b.prioridad);
}

function SectionRecomendaciones({ recomendaciones, onAbrirDeuda }) {
  if (recomendaciones.length === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-base text-foreground" style={{ fontWeight: 600 }}>
          Recomendaciones estratégicas
        </h2>
        <p className="text-xs text-muted-foreground" style={{ fontWeight: 400 }}>
          Calculadas automáticamente con tus datos
        </p>
      </div>

      <div className="space-y-3">
        {recomendaciones.map((rec, i) => (
          <RecomendacionCard key={i} rec={rec} onAbrirDeuda={onAbrirDeuda} />
        ))}
      </div>
    </div>
  );
}

function RecomendacionCard({ rec, onAbrirDeuda }) {
  const colores = {
    danger:  { bg: '#fef2f2', border: '#fca5a5', text: '#991b1b', icon: ICONS.alert },
    warning: { bg: '#fef9c3', border: '#fde68a', text: '#854d0e', icon: ICONS.alert },
    info:    { bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af', icon: ICONS.trending },
    success: { bg: '#f0fdf4', border: '#86efac', text: '#166534', icon: ICONS.check },
  };
  const c = colores[rec.color] || colores.info;

  return (
    <div
      className="p-4 rounded-xl border flex items-start gap-3"
      style={{ backgroundColor: c.bg, borderColor: c.border }}
    >
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: 'white', border: `1px solid ${c.border}` }}
      >
        <Icon d={c.icon} size={16} style={{ color: c.text }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm" style={{ fontWeight: 600, color: c.text }}>{rec.titulo}</p>
        <p className="text-xs mt-1" style={{ fontWeight: 400, color: c.text }}>{rec.descripcion}</p>
        {rec.deuda && onAbrirDeuda && (
          <button
            onClick={() => onAbrirDeuda(rec.deuda)}
            className="mt-2 text-[11px] px-2 py-1 rounded bg-card border hover:bg-muted/30 transition-colors"
            style={{ fontWeight: 500, color: c.text, borderColor: c.border }}
          >
            Ver {rec.deuda.nombre} →
          </button>
        )}
      </div>
    </div>
  );
}