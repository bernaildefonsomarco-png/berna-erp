/* ──────────────────────────────────────────────────────────────────────────
   FINANZAS · LIB · CÁLCULOS Y FORMATEO
   ──────────────────────────────────────────────────────────────────────────
   Funciones puras (sin React, sin Supabase). Testables, reutilizables.
   ────────────────────────────────────────────────────────────────────────── */


/* ─── FORMATEO DE MONEDA Y NÚMEROS ────────────────────────────────────── */

const fmtPEN = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const fmtPENDecimal = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatMoney(n, { decimals = false } = {}) {
  if (n === null || n === undefined || isNaN(n)) return 'S/. 0';
  return decimals ? fmtPENDecimal.format(n) : fmtPEN.format(n);
}

export function formatPercent(n, { decimals = 1 } = {}) {
  if (n === null || n === undefined || isNaN(n)) return '0%';
  return `${(n * 100).toFixed(decimals)}%`;
}

export function formatNumber(n) {
  if (n === null || n === undefined || isNaN(n)) return '0';
  return new Intl.NumberFormat('es-PE').format(n);
}


/* ─── FECHAS ──────────────────────────────────────────────────────────── */

export function formatDate(date) {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateShort(date) {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' });
}

export function diasEntre(fecha1, fecha2 = new Date()) {
  const d1 = new Date(fecha1);
  const d2 = new Date(fecha2);
  d1.setHours(0,0,0,0);
  d2.setHours(0,0,0,0);
  return Math.round((d1 - d2) / (1000 * 60 * 60 * 24));
}


/* ─── AMORTIZACIÓN FRANCESA ───────────────────────────────────────────── */

export function teaToTem(teaPct) {
  return Math.pow(1 + teaPct, 1/12) - 1;
}

export function calcularCuotaFrancesa(monto, teaPct, plazoMeses) {
  if (!monto || !plazoMeses || plazoMeses <= 0) return 0;
  if (!teaPct || teaPct === 0) return monto / plazoMeses;
  const tem = teaToTem(teaPct);
  return monto * tem / (1 - Math.pow(1 + tem, -plazoMeses));
}

export function generarCronograma(monto, teaPct, plazoMeses, fechaInicio = new Date()) {
  if (!monto || !plazoMeses) return [];
  const cuota = calcularCuotaFrancesa(monto, teaPct, plazoMeses);
  const tem = teaPct ? teaToTem(teaPct) : 0;
  const cronograma = [];
  let saldo = monto;

  for (let i = 1; i <= plazoMeses; i++) {
    const interes = saldo * tem;
    const capital = cuota - interes;
    saldo = saldo - capital;

    const fechaCuota = new Date(fechaInicio);
    fechaCuota.setMonth(fechaCuota.getMonth() + i);

    cronograma.push({
      cuota_num: i,
      fecha: fechaCuota,
      cuota_total: cuota,
      capital,
      interes,
      saldo_pendiente: Math.max(0, saldo),
    });
  }

  return cronograma;
}

export function calcularProgresoDeuda(deuda) {
  if (!deuda) return null;
  const monto = Number(deuda.monto_original) || 0;
  const saldo = Number(deuda.saldo_actual) || 0;
  const pagado = monto - saldo;
  const pctPagado = monto > 0 ? pagado / monto : 0;

  return {
    pagado,
    pendiente: saldo,
    pct_pagado: pctPagado,
    pct_pendiente: 1 - pctPagado,
  };
}


/* ─── SEMÁFORO DE VENCIMIENTOS ────────────────────────────────────────── */

export function calcularSemaforo(diasHastaVencimiento) {
  if (diasHastaVencimiento === null || diasHastaVencimiento === undefined) return 'gris';
  if (diasHastaVencimiento <= 3) return 'rojo';
  if (diasHastaVencimiento <= 10) return 'amarillo';
  return 'verde';
}

export const SEMAFORO_COLORS = {
  rojo:     { bg: '#FCEBEB', text: '#791F1F', border: '#E24B4A', label: 'Urgente' },
  amarillo: { bg: '#FAEEDA', text: '#854F0B', border: '#EF9F27', label: 'Pronto'  },
  verde:    { bg: '#EAF3DE', text: '#3B6D11', border: '#97C459', label: 'A tiempo' },
  gris:     { bg: '#F1EFE8', text: '#5F5E5A', border: '#B4B2A9', label: '—' },
};


/* ─── PROXIMO VENCIMIENTO (calculado en JS si no viene de la vista) ───── */

export function calcularProximoVencimiento(deuda, hoy = new Date()) {
  if (!deuda) return null;
  if (deuda.frecuencia_cuota === 'diaria') {
    return { fecha: hoy, dias: 0 };
  }
  if (deuda.frecuencia_cuota === 'mensual' && deuda.dia_pago_mes) {
    const ahora = new Date(hoy);
    ahora.setHours(0,0,0,0);
    const diaActual = ahora.getDate();
    let mesObjetivo = ahora.getMonth();
    let anioObjetivo = ahora.getFullYear();
    if (diaActual > deuda.dia_pago_mes) {
      mesObjetivo++;
      if (mesObjetivo > 11) { mesObjetivo = 0; anioObjetivo++; }
    }
    const fecha = new Date(anioObjetivo, mesObjetivo, deuda.dia_pago_mes);
    const dias = Math.round((fecha - ahora) / (1000 * 60 * 60 * 24));
    return { fecha, dias };
  }
  return null;
}


/* ─── AGRUPACIÓN JERÁRQUICA DE CUENTAS ────────────────────────────────── */

export function agruparCuentasJerarquicas(cuentas) {
  if (!Array.isArray(cuentas)) return [];

  const mapa = new Map();
  cuentas.forEach(c => mapa.set(c.id_cuenta, { ...c, hijos: [] }));

  const raices = [];
  mapa.forEach(cuenta => {
    if (cuenta.id_cuenta_padre && mapa.has(cuenta.id_cuenta_padre)) {
      mapa.get(cuenta.id_cuenta_padre).hijos.push(cuenta);
    } else {
      raices.push(cuenta);
    }
  });

  return raices;
}

export function calcularRollupCuenta(cuenta) {
  if (!cuenta) return 0;
  const propio = Number(cuenta.saldo_actual) || 0;
  const hijos = (cuenta.hijos || []).reduce((sum, h) => sum + calcularRollupCuenta(h), 0);
  return propio + hijos;
}


/* ─── COLORES POR TIPO DE CUENTA ──────────────────────────────────────── */

export const COLOR_TIPO_CUENTA = {
  operativa: { bg: '#E6F1FB', text: '#0C447C', border: '#378ADD', label: 'Operativa' },
  ahorro:    { bg: '#E1F5EE', text: '#085041', border: '#1D9E75', label: 'Ahorro'    },
  bancaria:  { bg: '#EEEDFE', text: '#3C3489', border: '#7F77DD', label: 'Bancaria'  },
  credito:   { bg: '#FCEBEB', text: '#791F1F', border: '#E24B4A', label: 'Crédito'   },
  digital:   { bg: '#FBEAF0', text: '#72243E', border: '#D4537E', label: 'Digital'   },
  reserva:   { bg: '#FAEEDA', text: '#633806', border: '#EF9F27', label: 'Reserva'   },
  otra:      { bg: '#F1EFE8', text: '#444441', border: '#888780', label: 'Otra'      },
};


/* ─── CRONOGRAMA DINÁMICO (desde saldo actual + pagos reales) ─────────── */

/**
 * Genera un cronograma proyectado a partir del SALDO ACTUAL de la deuda,
 * NO del monto original. Útil para mostrar "esto es lo que falta de verdad"
 * después de pagos parciales, refinanciaciones, etc.
 *
 * Si la deuda tiene `cuota_monto` configurada, la usa como cuota fija
 * y proyecta hasta liquidar el saldo. Si no, usa amortización francesa
 * con el plazo restante estimado.
 */
export function generarCronogramaDinamico(deuda, { fechaDesde = new Date() } = {}) {
  if (!deuda) return [];
  const saldo = Number(deuda.saldo_actual) || 0;
  const tea = Number(deuda.tea_pct) || 0;
  const cuotaConfig = Number(deuda.cuota_monto) || 0;
  if (saldo <= 0) return [];

  const tem = tea > 0 ? teaToTem(tea) : 0;
  const cronograma = [];
  let saldoPendiente = saldo;
  let mes = 0;
  const MAX_MESES = 360; // 30 años, defensa contra bucles infinitos

  // Si no hay cuota configurada, calcular una asumiendo el plazo restante
  let cuota = cuotaConfig;
  if (cuota <= 0) {
    const plazoRestante = Math.max(1, (Number(deuda.plazo_meses) || 12));
    cuota = calcularCuotaFrancesa(saldo, tea, plazoRestante);
  }

  while (saldoPendiente > 0.01 && mes < MAX_MESES) {
    mes++;
    const interes = +(saldoPendiente * tem).toFixed(2);
    let capital = +(cuota - interes).toFixed(2);

    // Última cuota: ajustar para liquidar exactamente
    if (capital >= saldoPendiente) {
      capital = saldoPendiente;
    }

    const cuotaTotal = +(capital + interes).toFixed(2);
    saldoPendiente = +(saldoPendiente - capital).toFixed(2);
    if (saldoPendiente < 0.01) saldoPendiente = 0;

    const fechaCuota = new Date(fechaDesde);
    fechaCuota.setMonth(fechaCuota.getMonth() + mes);
    if (deuda.dia_pago_mes) {
      fechaCuota.setDate(deuda.dia_pago_mes);
    }

    cronograma.push({
      cuota_num: mes,
      fecha: fechaCuota,
      cuota_total: cuotaTotal,
      capital,
      interes,
      saldo_pendiente: saldoPendiente,
    });

    if (capital <= 0 && tem === 0) break;
  }

  return cronograma;
}


/* ─── COSTO FINANCIERO DIARIO ─────────────────────────────────────────── */

/**
 * Calcula cuánto te cuesta tener UNA deuda hoy, cada día que no la pagas.
 * Es el equivalente diario de los intereses + cargos sobre el saldo actual.
 *
 * Fórmula: (saldo × TCEA) / 365  +  (cargos_mensuales × 12) / 365
 * Si no hay TCEA, usa TEA + cargos como aproximación.
 */
export function costoFinancieroDiario(deuda) {
  if (!deuda) return 0;
  const saldo = Number(deuda.saldo_actual) || 0;
  if (saldo <= 0) return 0;

  const tcea = Number(deuda.tcea_pct) || Number(deuda.tea_pct) || 0;
  const cargosMensuales =
      (Number(deuda.comision_mensual) || 0)
    + (Number(deuda.seguro_mensual) || 0)
    + (Number(deuda.portes_mensual) || 0)
    + (Number(deuda.otros_cargos_mensual) || 0);

  const costoIntereses = (saldo * tcea) / 365;
  const costoCargos = (cargosMensuales * 12) / 365;

  return +(costoIntereses + costoCargos).toFixed(2);
}


/**
 * Costo financiero diario AGREGADO de una lista de deudas activas.
 */
export function costoFinancieroDiarioTotal(deudas) {
  if (!Array.isArray(deudas)) return 0;
  return deudas
    .filter(d => d.estado === 'activa')
    .reduce((sum, d) => sum + costoFinancieroDiario(d), 0);
}


/* ─── COSTO TOTAL HASTA LIQUIDAR ──────────────────────────────────────── */

/**
 * Suma todos los pagos pendientes hasta liquidar UNA deuda según el
 * cronograma dinámico. Devuelve { capital, interes, total }.
 */
export function costoTotalRestante(deuda) {
  const cronograma = generarCronogramaDinamico(deuda);
  let capital = 0, interes = 0;
  cronograma.forEach(c => { capital += c.capital; interes += c.interes; });
  return {
    capital: +capital.toFixed(2),
    interes: +interes.toFixed(2),
    total:   +(capital + interes).toFixed(2),
    cuotas:  cronograma.length,
  };
}


/* ─── TCEA EFECTIVA: prefiere la del contrato, fallback a TEA ─────────── */

/**
 * Devuelve la mejor estimación del costo total anual de una deuda.
 * Prioriza la TCEA del contrato; si no está, suma TEA + impacto anual de
 * los cargos mensuales.
 */
export function tceaEfectiva(deuda) {
  if (!deuda) return 0;
  if (deuda.tcea_pct != null && Number(deuda.tcea_pct) > 0) {
    return Number(deuda.tcea_pct);
  }
  const tea = Number(deuda.tea_pct) || 0;
  const monto = Number(deuda.monto_original) || Number(deuda.saldo_actual) || 0;
  if (monto <= 0) return tea;

  const cargosMensuales =
      (Number(deuda.comision_mensual) || 0)
    + (Number(deuda.seguro_mensual) || 0)
    + (Number(deuda.portes_mensual) || 0)
    + (Number(deuda.otros_cargos_mensual) || 0);

  if (cargosMensuales === 0) return tea;

  // Aproximación: agregar el peso anual de los cargos como % del monto
  const impactoCargos = (cargosMensuales * 12) / monto;
  return +(tea + impactoCargos).toFixed(4);
}


/* ─── SIMULADOR: ¿qué pasa si pago X extra al mes? ────────────────────── */

/**
 * Simula el efecto de aplicar un pago extra mensual sobre una deuda.
 * Devuelve { meses_ahorrados, intereses_ahorrados, nueva_fecha_fin }.
 */
export function simularPagoExtra(deuda, pagoExtraMensual) {
  if (!deuda || !pagoExtraMensual || pagoExtraMensual <= 0) return null;

  const cronogramaOriginal = generarCronogramaDinamico(deuda);
  const cronogramaAcelerado = generarCronogramaDinamico({
    ...deuda,
    cuota_monto: (Number(deuda.cuota_monto) || 0) + Number(pagoExtraMensual),
  });

  const interesOriginal = cronogramaOriginal.reduce((s, c) => s + c.interes, 0);
  const interesAcelerado = cronogramaAcelerado.reduce((s, c) => s + c.interes, 0);

  return {
    meses_originales: cronogramaOriginal.length,
    meses_acelerados: cronogramaAcelerado.length,
    meses_ahorrados: cronogramaOriginal.length - cronogramaAcelerado.length,
    intereses_ahorrados: +(interesOriginal - interesAcelerado).toFixed(2),
    nueva_fecha_fin: cronogramaAcelerado.length > 0
      ? cronogramaAcelerado[cronogramaAcelerado.length - 1].fecha
      : null,
  };
}


/** Interpreta una fila de `v_patrimonio_neto` aunque cambien nombres de columnas. */
export function extraerPatrimonioNetoDesdeVista(row) {
  if (!row || typeof row !== 'object') return null;
  const keys = ['patrimonio_neto', 'patrimonio', 'neto', 'valor_neto'];
  for (const k of keys) {
    if (row[k] != null && !Number.isNaN(Number(row[k]))) return Number(row[k]);
  }
  const ta = Number(row.total_activos);
  const tp = Number(row.total_pasivos ?? row.total_deudas);
  if (!Number.isNaN(ta) && !Number.isNaN(tp)) return ta - tp;
  return null;
}

/**
 * Próximo vencimiento aproximado de un costo fijo (misma lógica que la vista Costos fijos).
 * @returns {{ dias: number, fecha: Date } | null}
 */
export function proximoVencimientoCostoFijo(costo) {
  if (!costo || costo.activo === false) return null;
  const diaMes = costo.dia_vencimiento_mes ?? costo.dia_vencimiento;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  if (costo.frecuencia === 'mensual' && diaMes) {
    const venc = new Date(hoy.getFullYear(), hoy.getMonth(), Number(diaMes));
    if (venc < hoy) venc.setMonth(venc.getMonth() + 1);
    const dias = Math.round((venc - hoy) / (1000 * 60 * 60 * 24));
    return { fecha: venc, dias };
  }
  if (costo.frecuencia === 'semanal') {
    const venc = new Date(hoy);
    venc.setDate(venc.getDate() + 7);
    return { fecha: venc, dias: 7 };
  }
  if (costo.frecuencia === 'quincenal') {
    const venc = new Date(hoy);
    venc.setDate(venc.getDate() + 15);
    return { fecha: venc, dias: 15 };
  }
  if (costo.frecuencia === 'anual' && diaMes) {
    const venc = new Date(hoy.getFullYear(), hoy.getMonth(), Number(diaMes));
    if (venc < hoy) venc.setFullYear(venc.getFullYear() + 1);
    const dias = Math.round((venc - hoy) / (1000 * 60 * 60 * 24));
    return { fecha: venc, dias };
  }
  return null;
}