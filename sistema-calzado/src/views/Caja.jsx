import React, { useState, useEffect } from 'react';
import { supabase } from '../api/supabase';
import { jsPDF } from 'jspdf';
import ModalDestinoEfectivo from './gestion/components/ModalDestinoEfectivo';
import QuickEntry from '../components/QuickEntry/QuickEntry';
// ─── Número de WhatsApp del dueño (con código de país, sin + ni espacios) ────
const WA_NUMERO = '51954839139';

const fmt    = n => `S/${Number(n||0).toFixed(2)}`;
const fmtDif = d => `${Number(d) >= 0 ? '+' : ''}${fmt(d)}`;

const METODO_SHORT = { efectivo: 'Efec', yape: 'Yape', plin: 'Plin', tarjeta: 'Tarj' };

export default function Caja({ vendedora, logout, onVolver }) {
  const AUTORIZADAS_CAJA = ['naty', 'yova', 'alina'];
  const nombreVendedor = (vendedora.nombre_display || vendedora.nombre || '').toLowerCase().trim();
  const tieneAccesoCaja = AUTORIZADAS_CAJA.some(n => nombreVendedor.includes(n));

  const [cajaActual, setCajaActual] = useState(null);
  const [cargando, setCargando]     = useState(true);
  const [panel, setPanel]           = useState('actual');

  // Apertura
  const [modalApertura, setModalApertura] = useState(false);
  const [montoInicial, setMontoInicial]   = useState('');
  const [abriendo, setAbriendo]           = useState(false);
  const [ultimoCierre, setUltimoCierre]   = useState(null);

  // Cierre
  const [modalCierre, setModalCierre] = useState(false);
  const [pasoCierre, setPasoCierre]   = useState('resumen'); // 'resumen' | 'arqueo'
  const [arqueo, setArqueo]           = useState({ efectivo:'', yape:'', plin:'', tarjeta:'' });
  const [cerrando, setCerrando]       = useState(false);
  const [resumenEntrega, setResumenEntrega] = useState(null);
  const [modalDestinoVisible, setModalDestinoVisible] = useState(false);
  // QuickEntry
  const [quickEntryAbierto, setQuickEntryAbierto] = useState(false);
  const [tiposMovimiento, setTiposMovimiento] = useState([]);

  // Stats
  const [ventasHoy, setVentasHoy]     = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [totales, setTotales]         = useState({});
  const [historial, setHistorial]     = useState([]);

  // Obligaciones
  const [obligaciones, setObligaciones] = useState([]);
  const [obligExpanded, setObligExpanded] = useState(true);

  useEffect(() => { cargar(); }, [vendedora]);

  // ─── CARGA PRINCIPAL ──────────────────────────────────────────────────────
  const cargar = async () => {
    setCargando(true);
    try {
      const { data: cajas } = await supabase.from('cajas')
        .select('*').eq('id_ubicacion', vendedora.id_ubicacion)
        .is('fecha_cierre', null).order('fecha_apertura', { ascending: false }).limit(1);

      if (cajas?.[0]) {
        setCajaActual(cajas[0]);
        await cargarDatosCaja(cajas[0]);
      } else {
        setCajaActual(null); setVentasHoy([]); setMovimientos([]); setTotales({});
        const { data: ult } = await supabase.from('cajas').select('*')
          .eq('id_ubicacion', vendedora.id_ubicacion).not('fecha_cierre', 'is', null)
          .order('fecha_cierre', { ascending: false }).limit(1).single();
        setUltimoCierre(ult || null);
      }

      const { data: hist } = await supabase.from('cajas').select('*')
        .eq('id_ubicacion', vendedora.id_ubicacion).not('fecha_cierre', 'is', null)
        .order('fecha_cierre', { ascending: false }).limit(30);
      setHistorial(hist || []);

      // Cargar obligaciones y tipos de movimiento
      await cargarObligaciones();
      await cargarTiposMovimiento();
    } catch(e) { console.error(e); }
    finally { setCargando(false); }
  };

  const cargarObligaciones = async () => {
    try {
      const { data } = await supabase.from('trackeo_obligaciones').select('*');
      setObligaciones(data || []);
    } catch(e) { console.error(e); }
  };

  const cargarTiposMovimiento = async () => {
    try {
      const { data } = await supabase.from('tipos_movimiento_caja')
        .select('*').eq('activo', true).order('orden', { ascending: true });
      setTiposMovimiento(data || []);
    } catch(e) { console.error(e); }
  };

  // ─── CARGA DATOS CAJA ACTIVA ──────────────────────────────────────────────
  const cargarDatosCaja = async (caja) => {
    const { data: ventas } = await supabase.from('ventas').select('*')
      .eq('id_ubicacion', vendedora.id_ubicacion)
      .gte('fecha_hora', caja.fecha_apertura).order('fecha_hora', { ascending: false });
    setVentasHoy(ventas || []);

    const { data: movs } = await supabase.from('movimientos_caja').select('*')
      .eq('id_caja', caja.id_caja).order('fecha_movimiento', { ascending: false });
    setMovimientos(movs || []);

    const vEfectivo = (ventas||[]).reduce((s,v) => s + Number(v.pago_efectivo||0), 0);
    const vVuelto   = (ventas||[]).reduce((s,v) => s + Number(v.vuelto||0), 0);
    const vYape     = (ventas||[]).reduce((s,v) => s + Number(v.pago_yape||0), 0);
    const vPlin     = (ventas||[]).reduce((s,v) => s + Number(v.pago_plin||0), 0);
    const vTarjeta  = (ventas||[]).reduce((s,v) => s + Number(v.pago_tarjeta||0), 0);

    const movsNeto = (metodo) => {
      const lista = movs || [];
      // Solo contar movimientos con origen_pago = 'caja' o los legacy sin origen_pago
      const i = lista.filter(m => m.tipo === 'ingreso' && m.metodo === metodo && m.origen_pago !== 'ahorro_bcp').reduce((s,m) => s + Number(m.monto), 0);
      const e = lista.filter(m => m.tipo === 'egreso'  && m.metodo === metodo && m.origen_pago !== 'ahorro_bcp').reduce((s,m) => s + Number(m.monto), 0);
      return i - e;
    };

    const mEfectivo = movsNeto('efectivo');
    const mYape     = movsNeto('yape');
    const mPlin     = movsNeto('plin');
    const mTarjeta  = movsNeto('tarjeta');

    setTotales({
      efectivo:       vEfectivo - vVuelto + mEfectivo,
      efectivoVentas: vEfectivo - vVuelto,
      efectivoMovs:   mEfectivo,
      yape:           vYape + mYape,   yapeVentas:    vYape,    yapeMovs:    mYape,
      plin:           vPlin + mPlin,   plinVentas:    vPlin,    plinMovs:    mPlin,
      tarjeta:        vTarjeta + mTarjeta,
      total:          (ventas||[]).reduce((s,v) => s + Number(v.monto_total), 0),
    });
  };

  // ─── APERTURA ─────────────────────────────────────────────────────────────
  const abrirCaja = async () => {
    const monto = Number(montoInicial);
    if (isNaN(monto) || monto < 0) { alert('Monto inválido'); return; }
    setAbriendo(true);
    try {
      const cajaData = {
        id_ubicacion:    vendedora.id_ubicacion,
        monto_apertura:  monto,
        fecha_apertura:  new Date().toISOString(),
        nombre_apertura: vendedora.nombre_display || vendedora.nombre || 'Sistema',
      };
      if (vendedora.id_persona) cajaData.id_persona = vendedora.id_persona;
      const { error } = await supabase.from('cajas').insert([cajaData]);
      if (error) throw error;
      await supabase.from('log_sesiones').insert([{
        id_ubicacion: vendedora.id_ubicacion,
        id_persona:   vendedora.id_persona || null,
        accion: 'login',
        detalles: `Apertura caja: ${fmt(monto)} | ${vendedora.nombre_display || 'Sistema'}`
      }]);
      setModalApertura(false); setMontoInicial(''); await cargar();
    } catch(e) { alert('Error al abrir caja: ' + e.message); }
    finally { setAbriendo(false); }
  };

  // ─── HELPERS PARA CIERRE ────────────────────────────────────────────────
  const calcularDesgloseCategoria = () => {
    // Solo movimientos con origen_pago = 'caja' o legacy (null)
    const movsCaja = movimientos.filter(m => m.origen_pago !== 'ahorro_bcp');
    const movsAhorro = movimientos.filter(m => m.origen_pago === 'ahorro_bcp');

    const sumarCat = (lista, cat) => lista.filter(m => m.categoria === cat && m.tipo === 'egreso').reduce((s,m) => s + Number(m.monto), 0);
    const sumarCatIngreso = (lista, cat) => lista.filter(m => m.categoria === cat && m.tipo === 'ingreso').reduce((s,m) => s + Number(m.monto), 0);

    const gastosOp       = sumarCat(movsCaja, 'gasto_operativo');
    const adelantos      = sumarCat(movsCaja, 'gasto_personal');
    const obligacionesCj = sumarCat(movsCaja, 'obligacion');
    const transferencias = sumarCat(movsCaja, 'transferencia');
    const retirosDueno   = sumarCat(movsCaja, 'retiro_dueno');
    const devoluciones   = sumarCatIngreso(movsCaja, 'devolucion');
    const ingresosExtra  = sumarCatIngreso(movsCaja, 'ingreso_extra');

    // Legacy: movimientos sin categoría
    const legacy = movsCaja.filter(m => !m.categoria);
    const legacyEgresos  = legacy.filter(m => m.tipo === 'egreso').reduce((s,m) => s + Number(m.monto), 0);
    const legacyIngresos = legacy.filter(m => m.tipo === 'ingreso').reduce((s,m) => s + Number(m.monto), 0);

    const totalEgresosCaja = gastosOp + adelantos + obligacionesCj + transferencias + retirosDueno + legacyEgresos;

    // Movimientos desde ahorro BCP (informativo)
    const totalAhorroBCP = movsAhorro.filter(m => m.tipo === 'egreso').reduce((s,m) => s + Number(m.monto), 0);

    // Adelantos pendientes
    const pendientes = movimientos.filter(m => m.pendiente_devolucion === true);

    return {
      gastosOp, adelantos, obligacionesCj, transferencias, retirosDueno,
      devoluciones, ingresosExtra, legacyEgresos, legacyIngresos,
      totalEgresosCaja, totalAhorroBCP, pendientes
    };
  };

  // ─── CIERRE ───────────────────────────────────────────────────────────────
  // Flujo "Confirmar" — usa los valores del sistema directamente
  const cerrarCajaConfirmada = async () => {
    const arqEfectivo = esperadoEfectivo;
    const arqYape     = totales.yape    || 0;
    const arqPlin     = totales.plin    || 0;
    const arqTarjeta  = totales.tarjeta || 0;

    const desglose = calcularDesgloseCategoria();
    if (desglose.pendientes.length > 0) {
      const nombres = desglose.pendientes.map(m => `${m.concepto || 'Adelanto'}: ${fmt(m.monto)}`).join('\n');
      const ok = window.confirm(`Hay adelantos sin devolver:\n${nombres}\n\nContinuar con el cierre?`);
      if (!ok) return;
    }

    setCerrando(true);
    try {
      const { error } = await supabase.from('cajas').update({
        fecha_cierre:          new Date().toISOString(),
        monto_cierre_efectivo: arqEfectivo,
        monto_cierre_yape:     arqYape,
        monto_cierre_plin:     arqPlin,
        monto_cierre_tarjeta:  arqTarjeta,
        monto_entrega:         arqEfectivo,
        diferencia_efectivo:   0,
        diferencia_yape:       0,
        diferencia_plin:       0,
        diferencia_tarjeta:    0,
        total_ventas:          totales.total,
        nombre_cierre:         vendedora.nombre_display || vendedora.nombre || 'Sistema',
        observaciones:         null,
        desglose_cierre:       JSON.stringify(desglose),
      }).eq('id_caja', cajaActual.id_caja);
      if (error) throw error;

      await supabase.from('log_sesiones').insert([{
        id_ubicacion: vendedora.id_ubicacion,
        id_persona:   vendedora.id_persona || null,
        accion: 'logout',
        detalles: `Cierre #${cajaActual.id_caja} | Efec:${fmt(arqEfectivo)} Yape:${fmt(arqYape)} Plin:${fmt(arqPlin)} Tarj:${fmt(arqTarjeta)} | ${vendedora.nombre_display || ''}`
      }]);

      setModalCierre(false);
      const oblHoySnap = obligacionesHoy();
      const oblAcumulados = { cuota: oblCuota?.acumulado || 0, ahorro: oblAhorro?.acumulado || 0 };
      setResumenEntrega({
        arqEfectivo, arqYape, arqPlin, arqTarjeta,
        fondoApertura: Number(cajaActual.monto_apertura || 0),
        totalVentas: totales.total,
        difEfectivo: 0, difYape: 0, difPlin: 0, difTarjeta: 0,
        hayDiferencias: false,
        obs: [],
        vendedora: vendedora.nombre_display || vendedora.nombre || '',
        idCaja: cajaActual.id_caja,
        desglose,
        oblHoy: oblHoySnap,
        oblAcumulados,
      });
      await cargar();
    } catch(e) { alert('Error al cerrar caja: ' + e.message); }
    finally { setCerrando(false); }
  };

  // Flujo "No confirmar" — la vendedora escribe lo que contó
  const cerrarCaja = async () => {
    if (arqueo.efectivo === '') {
      alert('El efectivo es obligatorio. Cuenta el dinero físico y completa el campo.');
      return;
    }
    const arqEfectivo = Number(arqueo.efectivo) || 0;
    const arqYape     = Number(arqueo.yape)     || 0;
    const arqPlin     = Number(arqueo.plin)     || 0;
    const arqTarjeta  = Number(arqueo.tarjeta)  || 0;

    const advertencias = [];
    if (totales.yape    > 0 && arqueo.yape    === '') advertencias.push(`Yape (sistema: ${fmt(totales.yape)})`);
    if (totales.plin    > 0 && arqueo.plin    === '') advertencias.push(`Plin (sistema: ${fmt(totales.plin)})`);
    if (totales.tarjeta > 0 && arqueo.tarjeta === '') advertencias.push(`Tarjeta (sistema: ${fmt(totales.tarjeta)})`);

    if (advertencias.length > 0) {
      const ok = window.confirm(`⚠️ Dejaste en blanco:\n${advertencias.join('\n')}\n\nSe guardarán como S/0.00 y quedarán marcados como diferencia.\n\n¿Continuar de todas formas?`);
      if (!ok) return;
    }

    // Advertencia de adelantos pendientes
    const desglose = calcularDesgloseCategoria();
    if (desglose.pendientes.length > 0) {
      const nombres = desglose.pendientes.map(m => {
        const nom = m.concepto || m.categoria || 'Adelanto';
        return `${nom}: ${fmt(m.monto)}`;
      }).join('\n');
      const ok = window.confirm(`⚠️ Hay adelantos sin devolver:\n${nombres}\n\n¿Continuar con el cierre de todas formas?`);
      if (!ok) return;
    }

    const esperadoEf  = Number(cajaActual.monto_apertura || 0) + (totales.efectivo || 0);
    const difEfectivo = arqEfectivo - esperadoEf;
    const difYape     = arqYape     - (totales.yape    || 0);
    const difPlin     = arqPlin     - (totales.plin    || 0);
    const difTarjeta  = arqTarjeta  - (totales.tarjeta || 0);

    const obs = [
      difEfectivo !== 0 ? `Efec: ${fmtDif(difEfectivo)}` : null,
      difYape     !== 0 ? `Yape: ${fmtDif(difYape)}`     : null,
      difPlin     !== 0 ? `Plin: ${fmtDif(difPlin)}`     : null,
      difTarjeta  !== 0 ? `Tarj: ${fmtDif(difTarjeta)}`  : null,
    ].filter(Boolean);

    setCerrando(true);
    try {
      const { error } = await supabase.from('cajas').update({
        fecha_cierre:          new Date().toISOString(),
        monto_cierre_efectivo: arqEfectivo,
        monto_cierre_yape:     arqYape,
        monto_cierre_plin:     arqPlin,
        monto_cierre_tarjeta:  arqTarjeta,
        monto_entrega:         arqEfectivo,
        diferencia_efectivo:   difEfectivo,
        diferencia_yape:       difYape,
        diferencia_plin:       difPlin,
        diferencia_tarjeta:    difTarjeta,
        total_ventas:          totales.total,
        nombre_cierre:         vendedora.nombre_display || vendedora.nombre || 'Sistema',
        observaciones:         obs.length > 0 ? `Difs · ${obs.join(' · ')}` : null,
        desglose_cierre:       JSON.stringify(desglose),
      }).eq('id_caja', cajaActual.id_caja);
      if (error) throw error;

      await supabase.from('log_sesiones').insert([{
        id_ubicacion: vendedora.id_ubicacion,
        id_persona:   vendedora.id_persona || null,
        accion: 'logout',
        detalles: `Cierre #${cajaActual.id_caja} | Efec:${fmt(arqEfectivo)} Yape:${fmt(arqYape)} Plin:${fmt(arqPlin)} Tarj:${fmt(arqTarjeta)} | ${vendedora.nombre_display || ''}`
      }]);

      setModalCierre(false);
      setArqueo({ efectivo:'', yape:'', plin:'', tarjeta:'' });
      const oblHoySnap = obligacionesHoy();
      const oblAcumulados = { cuota: oblCuota?.acumulado || 0, ahorro: oblAhorro?.acumulado || 0 };
      setResumenEntrega({
        arqEfectivo, arqYape, arqPlin, arqTarjeta,
        fondoApertura: Number(cajaActual.monto_apertura || 0),
        totalVentas: totales.total,
        difEfectivo, difYape, difPlin, difTarjeta,
        hayDiferencias: obs.length > 0,
        obs,
        vendedora: vendedora.nombre_display || vendedora.nombre || '',
        idCaja: cajaActual.id_caja,
        desglose,
        oblHoy: oblHoySnap,
        oblAcumulados,
      });
      await cargar();
    } catch(e) { alert('Error al cerrar caja: ' + e.message); }
    finally { setCerrando(false); }
  };


  // ─── VALORES DERIVADOS CIERRE ──────────────────────────────────────────────
  const esperadoEfectivo  = cajaActual ? Number(cajaActual.monto_apertura || 0) + (totales.efectivo || 0) : 0;
  const difEfectivoCierre = (Number(arqueo.efectivo) || 0) - esperadoEfectivo;
  const difYapeCierre     = (Number(arqueo.yape)     || 0) - (totales.yape    || 0);
  const difPlinCierre     = (Number(arqueo.plin)     || 0) - (totales.plin    || 0);
  const difTarjetaCierre  = (Number(arqueo.tarjeta)  || 0) - (totales.tarjeta || 0);
  const colorDif = d => Number(d) === 0 ? 'text-green-600' : Number(d) > 0 ? 'text-blue-600' : 'text-red-600';
  const bgDif    = d => Number(d) === 0 ? 'bg-green-50 border-green-200' : Number(d) > 0 ? 'bg-blue-50 border-blue-200' : 'bg-red-50 border-red-200';

  // Obligaciones del día
  const obligacionesHoy = () => {
    const cuotaHoy  = movimientos.filter(m => m.categoria === 'obligacion' && tiposMovimiento.find(t => t.id_tipo === m.id_tipo)?.codigo === 'cuota_aly').reduce((s,m) => s + Number(m.monto), 0);
    const ahorroHoy = movimientos.filter(m => m.categoria === 'obligacion' && tiposMovimiento.find(t => t.id_tipo === m.id_tipo)?.codigo === 'ahorro_bcp').reduce((s,m) => s + Number(m.monto), 0);
    // Alternativa: filtrar por concepto si no hay tipos cargados
    const cuotaAlt  = movimientos.filter(m => m.concepto?.toLowerCase().includes('cuota aly')).reduce((s,m) => s + Number(m.monto), 0);
    const ahorroAlt = movimientos.filter(m => m.concepto?.toLowerCase().includes('ahorro bcp')).reduce((s,m) => s + Number(m.monto), 0);
    return {
      cuotaHoy:  cuotaHoy || cuotaAlt,
      ahorroHoy: ahorroHoy || ahorroAlt,
    };
  };

  // Adelantos pendientes del día
  const adelantosPendientes = () => {
    return movimientos.filter(m => m.pendiente_devolucion === true);
  };

  // ─── PANTALLA RESUMEN ENTREGA ──────────────────────────────────────────────
  if (resumenEntrega) {
    const r = resumenEntrega;
    const efectivoAEntregar = r.arqEfectivo;
    const fmtD = d => `${Number(d) >= 0 ? '+' : ''}${fmt(d)}`;
    const hayDigitales = r.arqYape > 0 || r.arqPlin > 0 || r.arqTarjeta > 0;
    const hora  = new Date().toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit',timeZone:'America/Lima'});
    const fecha = new Date().toLocaleDateString('es-PE',{weekday:'long',day:'2-digit',month:'long',timeZone:'America/Lima'});

    const d = r.desglose || {};
    const oblHoyR = r.oblHoy || { cuotaHoy: 0, ahorroHoy: 0 };

    // ── Mensaje WhatsApp: simple, sin emojis, sin caracteres especiales ──
    const lineas = [
      'REPORTE DEL DIA',
      `${r.vendedora} - ${fecha}`,
      '',
      'Ventas',
      `Total: ${fmt(r.totalVentas)}`,
      `Efectivo: ${fmt(efectivoAEntregar)}`,
    ];
    if (r.arqYape    > 0) lineas.push(`Yape: ${fmt(r.arqYape)}`);
    if (r.arqPlin    > 0) lineas.push(`Plin: ${fmt(r.arqPlin)}`);
    if (r.arqTarjeta > 0) lineas.push(`Tarjeta: ${fmt(r.arqTarjeta)}`);

    if (d.gastosOp > 0 || d.adelantos > 0 || d.transferencias > 0 || d.retirosDueno > 0 || d.legacyEgresos > 0) {
      lineas.push('', 'Gastos');
      if (d.gastosOp > 0)       lineas.push(`Operativos: ${fmt(d.gastosOp)}`);
      if (d.adelantos > 0)      lineas.push(`Adelantos: ${fmt(d.adelantos)}`);
      if (d.transferencias > 0) lineas.push(`Fabrica: ${fmt(d.transferencias)}`);
      if (d.retirosDueno > 0)   lineas.push(`Retiros: ${fmt(d.retirosDueno)}`);
      if (d.legacyEgresos > 0)  lineas.push(`Otros: ${fmt(d.legacyEgresos)}`);
      lineas.push(`Total gastos: ${fmt(d.totalEgresosCaja)}`);
    }

    if (oblHoyR.cuotaHoy > 0 || oblHoyR.ahorroHoy > 0) {
      const acum = r.oblAcumulados || {};
      lineas.push('', 'Obligaciones');
      if (oblHoyR.cuotaHoy > 0)  lineas.push(`Cuota Aly hoy: ${fmt(oblHoyR.cuotaHoy)}`, `Cuota Aly acumulado: ${fmt(acum.cuota)}`);
      if (oblHoyR.ahorroHoy > 0) lineas.push(`Ahorro BCP hoy: ${fmt(oblHoyR.ahorroHoy)}`, `Ahorro BCP acumulado: ${fmt(acum.ahorro)}`);
    }

    if (d.pendientes?.length > 0) {
      lineas.push('', 'Adelantos sin devolver');
      d.pendientes.forEach(p => lineas.push(`${p.concepto?.split(' — ')[0] || 'Adelanto'}: ${fmt(p.monto)}`));
    }

    if (r.hayDiferencias) {
      lineas.push('', 'Diferencias en arqueo');
      r.obs.forEach(o => lineas.push(o));
    }

    const waUrl = `https://wa.me/${WA_NUMERO}?text=${encodeURIComponent(lineas.join('\n'))}`;

    return (
      <div className="min-h-screen flex flex-col bg-white max-w-md mx-auto">

        <header className="sticky top-0 bg-white z-20 px-5 pt-5 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-0.5">Cierre · Caja #{r.idCaja}</p>
              <h1 className="text-xl font-black text-slate-900 leading-none">{r.vendedora}</h1>
            </div>
            <button onClick={logout} className="text-xs text-slate-400">Salir</button>
          </div>
          <p className="text-[11px] text-slate-400 mt-1 font-mono">{fecha} · {hora}</p>
        </header>

        <div className="flex-1 overflow-y-auto px-5 pb-10 space-y-px">

          <div className="py-6 border-b border-slate-100">
            <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-1">Total vendido</p>
            <p className="text-4xl font-black font-mono text-slate-900">{fmt(r.totalVentas)}</p>
          </div>

          <div className="py-5 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-1">Efectivo a entregar</p>
                <p className="text-2xl font-black font-mono text-slate-900">{fmt(efectivoAEntregar)}</p>
                <p className="text-[11px] text-slate-400 mt-0.5 font-mono">
                  Ventas {fmt(r.arqEfectivo - r.fondoApertura)} + Fondo {fmt(r.fondoApertura)}
                </p>
              </div>
              {r.difEfectivo !== 0 && (
                <span className={`text-sm font-black px-3 py-1.5 rounded-xl ${r.difEfectivo > 0 ? 'bg-blue-50 text-blue-600' : 'bg-red-50 text-red-600'}`}>
                  {fmtD(r.difEfectivo)}
                </span>
              )}
            </div>
          </div>

          {hayDigitales && (
            <div className="py-4 border-b border-slate-100 space-y-3">
              <p className="text-[10px] text-slate-400 uppercase tracking-widest">Digitales</p>
              {[['Yape',r.arqYape,r.difYape],['Plin',r.arqPlin,r.difPlin],['Tarjeta',r.arqTarjeta,r.difTarjeta]]
                .filter(([,v]) => v > 0).map(([label,val,dif]) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">{label}</span>
                  <div className="flex items-center gap-3">
                    {dif !== 0 && <span className={`text-xs font-bold ${dif > 0 ? 'text-blue-500' : 'text-red-500'}`}>{fmtD(dif)}</span>}
                    <span className="font-black font-mono text-slate-900">{fmt(val)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Desglose por categoría en resumen */}
          {d.totalEgresosCaja > 0 && (
            <div className="py-4 border-b border-slate-100">
              <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-3">Egresos por categoría</p>
              <div className="space-y-1.5">
                {d.gastosOp > 0       && <div className="flex justify-between text-sm"><span className="text-slate-500">Gastos operativos</span><span className="font-mono font-bold">{fmt(d.gastosOp)}</span></div>}
                {d.adelantos > 0      && <div className="flex justify-between text-sm"><span className="text-slate-500">Adelantos personales</span><span className="font-mono font-bold">{fmt(d.adelantos)}</span></div>}
                {d.obligacionesCj > 0 && <div className="flex justify-between text-sm"><span className="text-slate-500">Obligaciones</span><span className="font-mono font-bold">{fmt(d.obligacionesCj)}</span></div>}
                {d.transferencias > 0 && <div className="flex justify-between text-sm"><span className="text-slate-500">Transf. fábrica</span><span className="font-mono font-bold">{fmt(d.transferencias)}</span></div>}
                {d.retirosDueno > 0   && <div className="flex justify-between text-sm"><span className="text-slate-500">Retiros del dueño</span><span className="font-mono font-bold">{fmt(d.retirosDueno)}</span></div>}
                {d.legacyEgresos > 0  && <div className="flex justify-between text-sm"><span className="text-slate-500">Otros egresos</span><span className="font-mono font-bold">{fmt(d.legacyEgresos)}</span></div>}
                <div className="flex justify-between text-sm pt-2 border-t border-slate-100">
                  <span className="font-bold text-slate-700">Total egresos (caja)</span>
                  <span className="font-mono font-black">{fmt(d.totalEgresosCaja)}</span>
                </div>
                {d.totalAhorroBCP > 0 && (
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>Pagado desde ahorro BCP</span>
                    <span className="font-mono">{fmt(d.totalAhorroBCP)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {r.hayDiferencias && (
            <div className="py-4 border-b border-slate-100">
              <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-2">Diferencias</p>
              <p className="text-xs text-red-500 font-mono">{r.obs.join('  ·  ')}</p>
            </div>
          )}

          {d.pendientes?.length > 0 && (
            <div className="py-4 border-b border-slate-100">
              <div className="flex items-center gap-2 mb-2">
                <p className="text-[10px] text-amber-600 uppercase tracking-widest font-bold">Adelantos sin devolver</p>
              </div>
              {d.pendientes.map((p, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-slate-500">{p.concepto}</span>
                  <span className="font-mono font-bold text-amber-700">{fmt(p.monto)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="py-5 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-0.5">Entregado por</p>
              <p className="font-black text-slate-900">{r.vendedora}</p>
            </div>
            <p className="text-[11px] text-slate-400 font-mono">{hora}</p>
          </div>

        </div>

        <div className="px-5 pb-8 pt-3 border-t border-slate-100 space-y-2.5">
          <a href={waUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-2.5 w-full py-3.5 bg-[#25D366] text-white font-black rounded-2xl active:scale-[0.98] transition-transform text-sm">
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white flex-shrink-0">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            Enviar por WhatsApp
          </a>
          <button onClick={() => setModalDestinoVisible(true)}
  className="w-full py-3.5 bg-slate-900 text-white font-black rounded-2xl active:scale-[0.98] transition-transform text-sm">
  Listo
</button>
{modalDestinoVisible && (
        <ModalDestinoEfectivo
          montoEfectivo={r.arqEfectivo}
          idCajaDia={r.idCaja}
          idUbicacion={vendedora.id_ubicacion}
          idPersona={vendedora.id_persona || null}
          nombreTienda={vendedora.nombre_ubicacion || `Tienda ${vendedora.id_ubicacion || ''}`}
          nombreVendedora={r.vendedora}
          onConfirmar={() => {
            setModalDestinoVisible(false);
            setResumenEntrega(null);
          }}
        />
      )}
        </div>

      </div>
    );
  }


  // ─── PANTALLA SIN CAJA ────────────────────────────────────────────────────
  if (!cargando && !cajaActual) {
    if (!tieneAccesoCaja) {
      return (
        <div className="h-screen flex flex-col items-center justify-center bg-white max-w-md mx-auto px-8 text-center gap-4">
          <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center text-2xl">🔒</div>
          <div>
            <p className="font-black text-slate-900 text-lg">Sin acceso a caja</p>
            <p className="text-sm text-slate-400 mt-1">Solo el personal autorizado puede abrir y cerrar caja.</p>
          </div>
          <button onClick={onVolver} className="mt-2 px-6 py-3 bg-slate-900 text-white font-bold rounded-2xl active:scale-95 transition-all">
            Volver
          </button>
        </div>
      );
    }
    return (
      <div className="h-screen flex flex-col bg-white max-w-md mx-auto overflow-hidden">

        <header className="sticky top-0 bg-white border-b border-slate-100 z-20">
          <div className="flex items-center justify-between px-4 py-2.5">
            <div className="flex items-center gap-2">
              <button onClick={onVolver} className="text-slate-400 p-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
                </svg>
              </button>
              <span className="font-black text-base">CAJA</span>
            </div>
            <button onClick={logout} className="text-xs text-slate-400">Salir</button>
          </div>
          <div className="flex px-4 border-t border-slate-100">
            {[['apertura','Abrir'],['historial','Historial']].map(([k,l]) => (
              <button key={k} onClick={() => setPanel(k)}
                className={`mr-5 py-2 text-sm font-bold border-b-2 transition-colors ${
                  panel === k ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400'
                }`}>{l}</button>
            ))}
          </div>
        </header>

        {(panel === 'apertura' || panel === 'actual') && (
          <div className="flex-1 overflow-y-auto p-6">
            {ultimoCierre && (
              <div className="mb-6 p-4 bg-slate-50 rounded-2xl">
                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-3">Último cierre</p>
                <div className="space-y-1.5">
                  {[
                    ['Efectivo', ultimoCierre.monto_cierre_efectivo],
                    ['Yape',     ultimoCierre.monto_cierre_yape],
                    ['Plin',     ultimoCierre.monto_cierre_plin],
                    ['Tarjeta',  ultimoCierre.monto_cierre_tarjeta],
                  ].filter(([,v]) => Number(v||0) > 0).map(([l,v]) => (
                    <div key={l} className="flex justify-between items-center">
                      <span className="text-sm text-slate-500">{l}</span>
                      <span className="font-black font-mono text-slate-900">{fmt(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mb-6">
              <div className="flex items-baseline justify-center gap-2 py-5">
                <span className="text-2xl font-black text-slate-300">S/</span>
                <span className="text-5xl font-black font-mono text-slate-900 min-w-[120px] text-center">
                  {montoInicial || <span className="text-slate-200">0.00</span>}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3 select-none">
                {['1','2','3','4','5','6','7','8','9','.','0','⌫'].map((d, idx) => (
                  <button key={idx}
                    onPointerDown={e => {
                      e.preventDefault();
                      if (abriendo) return;
                      if (d === '⌫') { setMontoInicial(v => v.slice(0,-1)); return; }
                      if (d === '.') { if (!montoInicial.includes('.')) setMontoInicial(v => v + '.'); return; }
                      const partes = montoInicial.split('.');
                      if (partes[1] !== undefined && partes[1].length >= 2) return;
                      setMontoInicial(v => v + d);
                    }}
                    className={`h-14 rounded-2xl font-bold text-xl transition-all active:scale-95 ${
                      d === '⌫' ? 'bg-slate-100 text-slate-500' : 'bg-slate-100 text-slate-900 hover:bg-slate-200'
                    }`}>{d}</button>
                ))}
              </div>
            </div>

            <button onClick={abrirCaja} disabled={abriendo || !montoInicial || !tieneAccesoCaja}
              className="w-full py-4 bg-slate-900 text-white font-black text-base rounded-2xl disabled:opacity-30 active:scale-[0.98] transition-transform">
              {abriendo ? 'Abriendo...' : montoInicial ? `Abrir con S/${montoInicial}` : 'Ingresa el fondo'}
            </button>
          </div>
        )}

        {panel === 'historial' && (
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <HistorialCajas historial={historial} />
          </div>
        )}

      </div>
    );
  }

  // ─── PANTALLA PRINCIPAL ───────────────────────────────────────────────────
  const oblHoy = obligacionesHoy();
  const pendientes = adelantosPendientes();
  const oblCuota = obligaciones.find(o => o.codigo === 'cuota_aly');
  const oblAhorro = obligaciones.find(o => o.codigo === 'ahorro_bcp');

  return (
    <div className="min-h-screen flex flex-col bg-white max-w-md mx-auto">

      <header className="sticky top-0 bg-white border-b border-slate-100 z-20">
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-2">
            <button onClick={onVolver} className="text-slate-400 p-1">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
              </svg>
            </button>
            <div>
              <span className="font-black text-base">CAJA</span>
              <span className="text-xs text-slate-400 ml-2">{vendedora.nombre_display || vendedora.nombre}</span>
            </div>
          </div>
          <button onClick={logout} className="text-xs text-slate-400">Salir</button>
        </div>
        <div className="flex px-4 border-t border-slate-100">
          {[['actual','Actual'],['historial','Historial']].map(([k,l]) => (
            <button key={k} onClick={() => setPanel(k)}
              className={`mr-5 py-2 text-sm font-bold border-b-2 transition-colors ${
                panel === k ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400'
              }`}>{l}</button>
          ))}
        </div>
      </header>

      {/* ── PANEL ACTUAL ── */}
      {panel === 'actual' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-8">
          {cargando ? (
            <div className="text-center py-16 text-slate-300 animate-pulse text-sm">Cargando...</div>
          ) : (
            <>
              {/* Efectivo — métrica principal */}
              <div className="border-2 border-slate-900 rounded-2xl p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Efectivo en caja</div>
                    <div className="text-3xl font-black font-mono">
                      {fmt(Number(cajaActual?.monto_apertura || 0) + (totales.efectivo || 0))}
                    </div>
                  </div>
                  <div className="text-right text-xs text-slate-400 space-y-0.5 mt-1">
                    <div>Apertura {fmt(cajaActual?.monto_apertura)}</div>
                    <div>Ventas {fmt(totales.efectivoVentas)}</div>
                    {totales.efectivoMovs !== 0 && (
                      <div>Movs {totales.efectivoMovs >= 0 ? '+' : ''}{fmt(totales.efectivoMovs)}</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Digitales */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  ['Yape',    totales.yape,    totales.yapeMovs],
                  ['Plin',    totales.plin,    totales.plinMovs],
                  ['Tarjeta', totales.tarjeta, 0],
                ].map(([label, val, movNeto]) => (
                  <div key={label} className="border border-slate-200 rounded-xl p-3">
                    <div className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">{label}</div>
                    <div className="font-black font-mono text-sm text-slate-900">{fmt(val)}</div>
                    {movNeto !== 0 && (
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {movNeto >= 0 ? '+' : ''}{fmt(movNeto)}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Total sesión */}
              <div className="flex justify-between items-center px-1">
                <div>
                  <span className="text-xs text-slate-500">Total sesión</span>
                  <span className="text-xs text-slate-400 ml-1.5">· {ventasHoy.length} venta{ventasHoy.length !== 1 ? 's' : ''}</span>
                </div>
                <span className="font-black font-mono text-slate-900">{fmt(totales.total)}</span>
              </div>

              {/* ── WIDGET OBLIGACIONES ── */}
              <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
                <button
                  onClick={() => setObligExpanded(!obligExpanded)}
                  className="w-full flex items-center justify-between p-4"
                >
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Obligaciones</span>
                  <svg className={`w-4 h-4 text-slate-400 transition-transform ${obligExpanded ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
                  </svg>
                </button>
                {obligExpanded && (
                  <div className="px-4 pb-4 space-y-3">
                    {/* Cuota Aly */}
                    <div className="flex items-start gap-3">
                      <span className="text-xl">🏦</span>
                      <div className="flex-1">
                        <div className="text-sm font-bold text-slate-700">Cuota Aly</div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          Hoy: <span className="font-mono font-bold text-slate-600">{fmt(oblHoy.cuotaHoy)}</span>
                        </div>
                        <div className="text-xs text-slate-400">
                          Acumulado: <span className="font-mono font-bold text-slate-600">{fmt(oblCuota?.acumulado)}</span>
                        </div>
                      </div>
                    </div>
                    {/* Ahorro BCP */}
                    <div className="flex items-start gap-3">
                      <span className="text-xl">💰</span>
                      <div className="flex-1">
                        <div className="text-sm font-bold text-slate-700">Ahorro BCP</div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          Hoy: <span className="font-mono font-bold text-slate-600">{fmt(oblHoy.ahorroHoy)}</span>
                        </div>
                        <div className="text-xs text-slate-400">
                          Acumulado: <span className="font-mono font-bold text-slate-600">{fmt(oblAhorro?.acumulado)}</span>
                        </div>
                      </div>
                    </div>
                    {/* Adelantos pendientes */}
                    {pendientes.length > 0 && (
                      <div className="mt-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <span className="text-sm">⚠️</span>
                          <span className="text-xs font-bold text-amber-700">Adelantos pendientes</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {pendientes.map((p, i) => (
                            <span key={i} className="text-xs font-mono text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                              {p.concepto?.split(' — ')[0] || p.concepto}: {fmt(p.monto)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Acciones */}
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setQuickEntryAbierto(true)}
                  className="py-3 border-2 border-slate-900 text-slate-900 font-bold rounded-xl text-sm active:scale-95 transition-transform">
                  + Movimiento
                </button>
                <button onClick={() => { setPasoCierre('resumen'); setArqueo({ efectivo:'', yape:'', plin:'', tarjeta:'' }); setModalCierre(true); }}
                  className="py-3 bg-slate-900 text-white font-bold rounded-xl text-sm active:scale-95 transition-transform">
                  Cerrar Caja
                </button>
              </div>

              {/* Movimientos */}
              {movimientos.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Movimientos</p>
                  <div className="space-y-0">
                    {movimientos.map(m => {
                      const esTraslado = m.concepto?.startsWith('[TRASLADO');
                      const esIngreso  = m.tipo === 'ingreso';
                      const esAhorro   = m.origen_pago === 'ahorro_bcp';
                      const catEmoji   = tiposMovimiento.find(t => t.id_tipo === m.id_tipo)?.emoji || '';
                      return (
                        <div key={m.id_movimiento}
                          className="flex justify-between items-center py-2.5 border-b border-slate-100">
                          <div className="flex-1 min-w-0">
                            <span className="text-sm mr-1">{catEmoji}</span>
                            <span className={`text-[10px] font-black mr-1.5 ${
                              esAhorro ? 'text-purple-600' : esTraslado ? 'text-amber-600' : esIngreso ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {esAhorro ? 'BCP' : esTraslado ? '⇄' : esIngreso ? '↓' : '↑'} {!esAhorro ? (METODO_SHORT[m.metodo] || m.metodo) : ''}
                            </span>
                            <span className="text-xs text-slate-500 truncate">{m.concepto}</span>
                          </div>
                          <div className="text-right ml-3 flex-shrink-0">
                            <div className={`font-black font-mono text-sm ${
                              esAhorro ? 'text-purple-700' : esTraslado ? 'text-amber-700' : esIngreso ? 'text-green-700' : 'text-red-700'
                            }`}>
                              {esTraslado ? '⇄' : esIngreso ? '+' : '−'}{fmt(m.monto)}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              {new Date(m.fecha_movimiento).toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit',timeZone:'America/Lima'})}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Ventas recientes */}
              {ventasHoy.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Ventas de la sesión</p>
                  <div className="space-y-0">
                    {ventasHoy.slice(0,8).map(v => (
                      <div key={v.id_venta} className="flex justify-between items-center py-2 border-b border-slate-100">
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <span className="font-mono">#{v.id_venta}</span>
                          <span>{new Date(v.fecha_hora).toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit',timeZone:'America/Lima'})}</span>
                          {v.nombre_vendedora && <span>· {v.nombre_vendedora}</span>}
                        </div>
                        <span className="font-black font-mono text-sm">{fmt(v.monto_total)}</span>
                      </div>
                    ))}
                    {ventasHoy.length > 8 && (
                      <p className="text-xs text-slate-400 text-center pt-2">+ {ventasHoy.length - 8} ventas más</p>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── PANEL HISTORIAL ── */}
      {panel === 'historial' && (
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <HistorialCajas historial={historial} />
        </div>
      )}

      {/* ── QUICK ENTRY ── */}
      {quickEntryAbierto && (
        <QuickEntry
          scope="pos"
          contexto={{ idUbicacion: vendedora?.id_ubicacion ?? null, idCaja: cajaActual?.id_caja ?? null }}
          filtroDireccion="salida"
          onSubmit={async () => {
            setQuickEntryAbierto(false);
            if (cajaActual) await cargarDatosCaja(cajaActual);
            await cargarObligaciones();
          }}
          onClose={() => setQuickEntryAbierto(false)}
        />
      )}

      {/* ── MODAL CIERRE — 2 pasos: resumen → confirmar o arqueo ── */}
      {modalCierre && (
        <Sheet title={pasoCierre === 'resumen' ? 'Cerrar caja' : 'Arqueo de caja'} onClose={() => { setModalCierre(false); setPasoCierre('resumen'); setArqueo({ efectivo:'', yape:'', plin:'', tarjeta:'' }); }}>

          {/* ── PASO 1: Resumen con lo que debería tener ── */}
          {pasoCierre === 'resumen' && (
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Deberías tener</p>
              <div className="space-y-2.5 mb-5">
                <div className="flex justify-between items-center px-4 py-3 bg-slate-50 rounded-2xl">
                  <span className="text-sm text-slate-600">Efectivo</span>
                  <span className="text-lg font-black font-mono text-slate-900">{fmt(esperadoEfectivo)}</span>
                </div>
                {(totales.yape || 0) > 0 && (
                  <div className="flex justify-between items-center px-4 py-3 bg-slate-50 rounded-2xl">
                    <span className="text-sm text-slate-600">Yape</span>
                    <span className="text-lg font-black font-mono text-slate-900">{fmt(totales.yape)}</span>
                  </div>
                )}
                {(totales.plin || 0) > 0 && (
                  <div className="flex justify-between items-center px-4 py-3 bg-slate-50 rounded-2xl">
                    <span className="text-sm text-slate-600">Plin</span>
                    <span className="text-lg font-black font-mono text-slate-900">{fmt(totales.plin)}</span>
                  </div>
                )}
                {(totales.tarjeta || 0) > 0 && (
                  <div className="flex justify-between items-center px-4 py-3 bg-slate-50 rounded-2xl">
                    <span className="text-sm text-slate-600">Tarjeta</span>
                    <span className="text-lg font-black font-mono text-slate-900">{fmt(totales.tarjeta)}</span>
                  </div>
                )}
              </div>

              {/* Desglose por categoría */}
              {(() => {
                const d = calcularDesgloseCategoria();
                return (d.totalEgresosCaja > 0 || d.totalAhorroBCP > 0) ? (
                  <div className="mb-5 pb-4 border-b border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Egresos del día</p>
                    <div className="space-y-1">
                      {d.gastosOp > 0       && <div className="flex justify-between text-xs"><span className="text-slate-500">Gastos operativos</span><span className="font-mono font-bold">{fmt(d.gastosOp)}</span></div>}
                      {d.adelantos > 0      && <div className="flex justify-between text-xs"><span className="text-slate-500">Adelantos personales</span><span className="font-mono font-bold">{fmt(d.adelantos)}</span></div>}
                      {d.obligacionesCj > 0 && <div className="flex justify-between text-xs"><span className="text-slate-500">Obligaciones</span><span className="font-mono font-bold">{fmt(d.obligacionesCj)}</span></div>}
                      {d.transferencias > 0 && <div className="flex justify-between text-xs"><span className="text-slate-500">Transf. fábrica</span><span className="font-mono font-bold">{fmt(d.transferencias)}</span></div>}
                      {d.retirosDueno > 0   && <div className="flex justify-between text-xs"><span className="text-slate-500">Retiros del dueño</span><span className="font-mono font-bold">{fmt(d.retirosDueno)}</span></div>}
                      {d.legacyEgresos > 0  && <div className="flex justify-between text-xs"><span className="text-slate-500">Otros egresos</span><span className="font-mono font-bold">{fmt(d.legacyEgresos)}</span></div>}
                    </div>
                    {d.pendientes.length > 0 && (
                      <div className="mt-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl">
                        <span className="text-xs font-bold text-amber-700">Adelantos sin devolver: </span>
                        {d.pendientes.map((p, i) => (
                          <span key={i} className="text-[11px] font-mono text-amber-800">
                            {i > 0 ? ' · ' : ''}{p.concepto?.split(' — ')[0]}: {fmt(p.monto)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null;
              })()}

              <p className="text-sm text-slate-500 mb-5 text-center">Confirma que los montos cuadran con lo que tienes</p>

              <div className="space-y-2.5">
                <button onClick={cerrarCajaConfirmada} disabled={cerrando}
                  className="w-full py-4 bg-slate-900 text-white font-black text-base rounded-2xl disabled:opacity-40 active:scale-[0.98] transition-transform">
                  {cerrando ? 'Cerrando...' : 'Confirmar y continuar'}
                </button>
                <button onClick={() => setPasoCierre('arqueo')}
                  className="w-full py-4 border-2 border-slate-300 text-slate-600 font-bold text-sm rounded-2xl active:scale-[0.98] transition-transform">
                  No confirmo, quiero escribir lo que tengo
                </button>
              </div>
            </div>
          )}

          {/* ── PASO 2: Arqueo manual (cuando no confirma) ── */}
          {pasoCierre === 'arqueo' && (
            <div>
              <button onClick={() => setPasoCierre('resumen')} className="text-xs text-slate-400 mb-4">
                ← Volver
              </button>

              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Ingresa lo que contaste</p>
              <div className="space-y-3 mb-5">
                {[
                  ['efectivo', 'Efectivo', esperadoEfectivo,   difEfectivoCierre, true ],
                  ['yape',     'Yape',     totales.yape||0,    difYapeCierre,     false],
                  ['plin',     'Plin',     totales.plin||0,    difPlinCierre,     false],
                  ['tarjeta',  'Tarjeta',  totales.tarjeta||0, difTarjetaCierre,  false],
                ].map(([k, label, esperado, dif, req]) => (
                  <div key={k}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-slate-700">
                        {label}{req && <span className="text-red-400 ml-0.5">*</span>}
                      </span>
                      {arqueo[k] !== '' && (
                        <span className={`text-xs font-black ${colorDif(dif)}`}>
                          {Number(dif) === 0 ? '✓ Cuadra' : fmtDif(dif)}
                        </span>
                      )}
                    </div>
                    <div className={`flex items-center rounded-2xl border-2 px-4 py-3 transition-colors ${
                      arqueo[k] !== '' ? 'border-slate-900 bg-white' : 'border-slate-200 bg-slate-50'
                    }`}>
                      <span className="text-slate-400 text-sm font-mono mr-2">S/</span>
                      <input
                        type="number" inputMode="decimal"
                        value={arqueo[k]}
                        onChange={e => setArqueo(a => ({...a, [k]: e.target.value}))}
                        placeholder={Number(esperado).toFixed(2)}
                        className="flex-1 font-mono text-right text-lg font-bold outline-none bg-transparent text-slate-900 placeholder-slate-300"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Alerta diferencia */}
              {arqueo.efectivo !== '' && difEfectivoCierre !== 0 && (
                <div className={`mb-4 px-4 py-3 rounded-2xl flex items-center justify-between ${bgDif(difEfectivoCierre)}`}>
                  <span className={`text-sm font-bold ${colorDif(difEfectivoCierre)}`}>
                    {difEfectivoCierre < 0 ? 'Falta efectivo' : 'Sobra efectivo'}
                  </span>
                  <span className={`font-black font-mono text-base ${colorDif(difEfectivoCierre)}`}>
                    {fmtDif(difEfectivoCierre)}
                  </span>
                </div>
              )}

              <button onClick={cerrarCaja} disabled={cerrando}
                className="w-full py-4 bg-slate-900 text-white font-black text-base rounded-2xl disabled:opacity-40 active:scale-[0.98] transition-transform">
                {cerrando ? 'Cerrando...' : 'Confirmar cierre'}
              </button>
            </div>
          )}
        </Sheet>
      )}
    </div>
  );
}

// ─── HISTORIAL ────────────────────────────────────────────────────────────────
function HistorialCajas({ historial }) {
  const [cajaDetalle, setCajaDetalle] = useState(null);
  const [detalle, setDetalle]         = useState(null);
  const [cargandoDet, setCargandoDet] = useState(false);
  const [ventaModal, setVentaModal]   = useState(null);

  if (historial.length === 0) {
    return <p className="text-center text-slate-400 py-16 text-sm">Sin historial de cajas</p>;
  }

  const fmt      = n => `S/${Number(n||0).toFixed(2)}`;
  const fmtDif   = d => `${Number(d) >= 0 ? '+' : ''}${fmt(d)}`;
  const colorDif = d => Number(d) === 0 ? 'text-green-600' : Number(d) > 0 ? 'text-blue-600' : 'text-red-600';

  const abrirDetalle = async (c) => {
    setCajaDetalle(c);
    setCargandoDet(true);
    setDetalle(null);
    try {
      const { data: ventas } = await supabase.from('ventas')
        .select('*')
        .eq('id_ubicacion', c.id_ubicacion)
        .gte('fecha_hora', c.fecha_apertura)
        .lte('fecha_hora', c.fecha_cierre)
        .order('fecha_hora', { ascending: false });

      const { data: movs } = await supabase.from('movimientos_caja')
        .select('*')
        .eq('id_caja', c.id_caja)
        .order('fecha_movimiento', { ascending: false });

      setDetalle({ ventas: ventas || [], movimientos: movs || [] });
    } catch(e) { console.error(e); }
    finally { setCargandoDet(false); }
  };

  const abrirVenta = async (idVenta) => {
    const { data: venta }    = await supabase.from('ventas').select('*').eq('id_venta', idVenta).single();
    const { data: detalles } = await supabase.from('ventas_detalle').select('*').eq('id_venta', idVenta);
    setVentaModal({ ...venta, items: detalles || [] });
  };

  const METODO_SHORT = { efectivo:'Efec', yape:'Yape', plin:'Plin', tarjeta:'Tarj' };

  const generarTextoReporte = (c, det) => {
    if (!det) return '';
    const fmtN = n => `S/${Number(n||0).toFixed(2)}`;
    const fmtD = d => `${Number(d)>=0?'+':''}${fmtN(d)}`;
    const pad  = (l, v, w=14) => l + ' '.repeat(Math.max(1, w - l.length)) + v;
    const fecha = new Date(c.fecha_apertura).toLocaleDateString('es-PE',{weekday:'short',day:'2-digit',month:'short',timeZone:'America/Lima'});
    const hAp   = new Date(c.fecha_apertura).toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit',timeZone:'America/Lima'});
    const hCi   = c.fecha_cierre ? new Date(c.fecha_cierre).toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit',timeZone:'America/Lima'}) : '--';
    const vend  = c.nombre_apertura === c.nombre_cierre ? c.nombre_apertura : `${c.nombre_apertura||'--'} / ${c.nombre_cierre||'--'}`;
    const lineas = [`BERNA - Caja #${c.id_caja}`, `${vend} - ${fecha} - ${hAp}-${hCi}`, '',
      pad('Total vendido', fmtN(c.total_ventas)), pad('Ventas', String(det.ventas.length)), ''];
    const metodos = [['Efectivo',c.monto_cierre_efectivo,c.diferencia_efectivo],['Yape',c.monto_cierre_yape,c.diferencia_yape],
      ['Plin',c.monto_cierre_plin,c.diferencia_plin],['Tarjeta',c.monto_cierre_tarjeta,c.diferencia_tarjeta]].filter(([,v])=>Number(v||0)>0);
    metodos.forEach(([l,v,d]) => { const dif=Number(d||0); lineas.push(pad(l,fmtN(v))+(dif!==0?`  (${fmtD(dif)})`:''));});
    const hayDifs = metodos.some(([,,d])=>Number(d||0)!==0);
    lineas.push('', hayDifs ? `! ${metodos.filter(([,,d])=>Number(d||0)!==0).map(([l,,d])=>`${l}: ${fmtD(Number(d))}`).join(' - ')}` : 'Sin diferencias');
    if (det.movimientos.length > 0) {
      lineas.push('', `Movimientos (${det.movimientos.length})`);
      det.movimientos.forEach(m => {
        const hora = new Date(m.fecha_movimiento).toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit',timeZone:'America/Lima'});
        const met  = {efectivo:'Efec',yape:'Yape',plin:'Plin',tarjeta:'Tarj'}[m.metodo]||m.metodo;
        lineas.push(`${hora}  ${m.tipo==='ingreso'?'+':'-'}${fmtN(m.monto)}  ${met}  ${m.concepto}`);
      });
    }
    return lineas.join('\n');
  };

  const descargarPDF = (c, det) => {
    if (!det) return;
    const S = n => `S/${Number(n||0).toFixed(2)}`;
    const D = d => `${Number(d)>=0?'+':''}${S(d)}`;
    const doc = new jsPDF({ unit:'mm', format:'a4' });
    const PW=doc.internal.pageSize.getWidth(), PH=doc.internal.pageSize.getHeight();
    const L=18, R=PW-18; let y=0;
    const INK=[10,10,10],MID=[80,80,80],MUTED=[150,150,150],RULE=[220,220,220],GREEN=[22,130,60],RED=[200,40,40],BLUE=[37,99,220];
    const f=(sz,w,col)=>{doc.setFont('helvetica',w||'normal');doc.setFontSize(sz);doc.setTextColor(...(col||INK));};
    const tL=(s,yy,x)=>doc.text(String(s),x??L,yy);
    const tR=(s,yy,x)=>doc.text(String(s),x??R,yy,{align:'right'});
    const hr=(yy,col,w)=>{doc.setDrawColor(...(col||RULE));doc.setLineWidth(w||0.2);doc.line(L,yy,R,yy);};
    const guard=(n=10)=>{if(y+n>PH-18){doc.addPage();y=18;}};
    const fecha=new Date(c.fecha_apertura).toLocaleDateString('es-PE',{weekday:'long',day:'2-digit',month:'long',year:'numeric',timeZone:'America/Lima'});
    const hAp=new Date(c.fecha_apertura).toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit',timeZone:'America/Lima'});
    const hCi=c.fecha_cierre?new Date(c.fecha_cierre).toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit',timeZone:'America/Lima'}):'--';
    const vend=c.nombre_apertura===c.nombre_cierre?(c.nombre_apertura||''):`${c.nombre_apertura||'--'} / ${c.nombre_cierre||'--'}`;
    const metodos=[['Efectivo',c.monto_cierre_efectivo,c.diferencia_efectivo],['Yape',c.monto_cierre_yape,c.diferencia_yape],
      ['Plin',c.monto_cierre_plin,c.diferencia_plin],['Tarjeta',c.monto_cierre_tarjeta,c.diferencia_tarjeta]].filter(([,v])=>Number(v||0)>0);
    const hayDifs=metodos.some(([,,d])=>Number(d||0)!==0);
    y=16; doc.setDrawColor(...INK); doc.setLineWidth(0.6); doc.line(L,y,R,y); y+=5;
    f(7.5,'bold',MUTED); tL('BERNA',y,L); tR(`Caja #${c.id_caja}`,y); y+=5;
    f(20,'bold',INK); tL('Reporte de Caja',y); y+=6;
    f(8,'normal',MUTED); tL(`${vend}  -  ${fecha}  -  ${hAp} - ${hCi}`,y); y+=5;
    doc.setDrawColor(...INK); doc.setLineWidth(0.6); doc.line(L,y,R,y); y+=8;
    const kpis=[{label:'Total vendido',value:S(c.total_ventas)},{label:'Ventas',value:String(det.ventas.length)},{label:'Fondo apertura',value:S(c.monto_apertura)}];
    const kW=(R-L)/3;
    f(6.5,'bold',MUTED); kpis.forEach((k,i)=>tL(k.label.toUpperCase(),y,L+i*kW)); y+=5;
    kpis.forEach((k,i)=>{f(i===0?16:13,'bold',INK);tL(k.value,y,L+i*kW);}); y+=7;
    hr(y,RULE,0.2); y+=7;
    const section=(label)=>{guard(16);f(6.5,'bold',MUTED);tL(label.toUpperCase(),y);y+=4;hr(y,RULE);y+=6;};
    section('Arqueo por metodo');
    metodos.forEach(([label,val,dif])=>{
      guard(7); const d=Number(dif||0);
      f(9.5,'normal',MID);tL(label,y); f(9.5,'bold',INK);tR(S(val),y);
      if(d!==0){f(8,'bold',d>0?BLUE:RED);tR(D(d),y,R-30);} y+=6; hr(y-1,[238,238,238]);
    });
    y+=2; f(8.5,'bold',hayDifs?RED:GREEN); tL(hayDifs?'Con diferencias':'Arqueo sin diferencias',y); y+=9; hr(y,RULE); y+=7;

    // Desglose por categoría en PDF
    if (c.desglose_cierre) {
      try {
        const dg = typeof c.desglose_cierre === 'string' ? JSON.parse(c.desglose_cierre) : c.desglose_cierre;
        if (dg.totalEgresosCaja > 0) {
          section('Egresos por categoria');
          const cats = [
            ['Gastos operativos', dg.gastosOp],
            ['Adelantos personales', dg.adelantos],
            ['Obligaciones', dg.obligacionesCj],
            ['Transf. fábrica', dg.transferencias],
            ['Retiros del dueño', dg.retirosDueno],
            ['Otros egresos', dg.legacyEgresos],
          ].filter(([,v]) => v > 0);
          cats.forEach(([label, val]) => {
            guard(7); f(9.5,'normal',MID);tL(label,y); f(9.5,'bold',INK);tR(S(val),y); y+=6;
          });
          hr(y-1,[238,238,238]); y+=2;
          f(9.5,'bold',INK);tL('Total egresos (caja)',y); tR(S(dg.totalEgresosCaja),y); y+=6;
          if (dg.totalAhorroBCP > 0) {
            f(8,'normal',MUTED);tL('Pagado desde ahorro BCP',y); tR(S(dg.totalAhorroBCP),y); y+=6;
          }
          y+=3; hr(y,RULE); y+=7;
        }
      } catch(e) {}
    }

    if(det.ventas.length>0){
      section(`Ventas  (${det.ventas.length})`);
      f(6.5,'bold',MUTED); tL('HORA',y,L);tL('N.',y,L+20);tL('VENDEDORA',y,L+38);tL('METODO',y,L+90);tR('TOTAL',y);
      y+=4; hr(y,[200,200,200]); y+=5;
      det.ventas.forEach(v=>{
        guard(7);
        const hora=new Date(v.fecha_hora).toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit',timeZone:'America/Lima'});
        const mets=[v.pago_efectivo>0?'Efectivo':null,v.pago_yape>0?'Yape':null,v.pago_plin>0?'Plin':null,v.pago_tarjeta>0?'Tarjeta':null].filter(Boolean).join('+');
        f(8.5,'normal',MUTED);tL(hora,y,L); f(8.5,'bold',INK);tL(`#${v.id_venta}`,y,L+20);
        f(8.5,'normal',MID);tL(v.nombre_vendedora||'--',y,L+38); f(8.5,'normal',MUTED);tL(mets,y,L+90);
        f(8.5,'bold',INK);tR(S(v.monto_total),y); y+=6;
      });
      hr(y,[180,180,180]); y+=4; f(9.5,'bold',INK);tL('Total',y);tR(S(c.total_ventas),y); y+=9; hr(y,RULE); y+=7;
    }
    if(det.movimientos.length>0){
      section(`Movimientos  (${det.movimientos.length})`);
      f(6.5,'bold',MUTED); tL('HORA',y,L);tL('TIPO',y,L+20);tL('CONCEPTO',y,L+44);tL('METODO',y,L+118);tR('MONTO',y);
      y+=4; hr(y,[200,200,200]); y+=5;
      det.movimientos.forEach(m=>{
        guard(7);
        const hora=new Date(m.fecha_movimiento).toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit',timeZone:'America/Lima'});
        const esIng=m.tipo==='ingreso'; const met={efectivo:'Efectivo',yape:'Yape',plin:'Plin',tarjeta:'Tarjeta'}[m.metodo]||m.metodo;
        const col=esIng?GREEN:RED; const conc=doc.splitTextToSize(m.concepto||'--',68);
        f(8.5,'normal',MUTED);tL(hora,y,L); f(8.5,'bold',col);tL(esIng?'Ingreso':'Egreso',y,L+20);
        f(8.5,'normal',MID);tL(conc[0],y,L+44); f(8.5,'normal',MUTED);tL(met,y,L+118);
        f(8.5,'bold',col);tR(`${esIng?'+':'-'}${S(m.monto)}`,y); y+=6;
      });
      y+=3;
    }
    const total=doc.internal.getNumberOfPages();
    for(let p=1;p<=total;p++){
      doc.setPage(p); doc.setDrawColor(...INK); doc.setLineWidth(0.6); doc.line(L,PH-12,R,PH-12);
      f(6.5,'normal',MUTED);
      const gen=new Date().toLocaleDateString('es-PE',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'America/Lima'});
      tL(`BERNA Sistema  -  Caja #${c.id_caja}  -  ${gen}`,PH-8,L); tR(`${p} / ${total}`,PH-8);
    }
    doc.save(`berna-caja-${c.id_caja}.pdf`);
  };

  return (
    <>
    <div className="space-y-3">
      {historial.map(c => {
        const difs = {
          efectivo: Number(c.diferencia_efectivo || 0),
          yape:     Number(c.diferencia_yape     || 0),
          plin:     Number(c.diferencia_plin     || 0),
          tarjeta:  Number(c.diferencia_tarjeta  || 0),
        };
        const hayDifs = Object.values(difs).some(d => d !== 0);

        return (
          <button key={c.id_caja}
            onClick={() => abrirDetalle(c)}
            className="w-full text-left p-4 border border-slate-100 rounded-2xl hover:border-slate-300 active:scale-[0.98] transition-all">

            <div className="flex justify-between items-start">
              <div>
                <div className="font-bold text-sm text-slate-900">
                  {new Date(c.fecha_apertura).toLocaleDateString('es-PE',{weekday:'short',day:'2-digit',month:'short',timeZone:'America/Lima'})}
                </div>
                <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                  {new Date(c.fecha_apertura).toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit',timeZone:'America/Lima'})}
                  {' – '}
                  {c.fecha_cierre && new Date(c.fecha_cierre).toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit',timeZone:'America/Lima'})}
                </div>
                {c.nombre_apertura === c.nombre_cierre ? (
                  <div className="text-[11px] text-slate-400 mt-0.5">{c.nombre_apertura} abrió y cerró</div>
                ) : (
                  <div className="text-[11px] text-slate-400 mt-0.5 space-y-0.5">
                    {c.nombre_apertura && <div>{c.nombre_apertura} abrió</div>}
                    {c.nombre_cierre   && <div>{c.nombre_cierre} cerró</div>}
                  </div>
                )}
              </div>
              <div className="text-right">
                <div className="font-black font-mono text-slate-900">{fmt(c.total_ventas)}</div>
                {hayDifs
                  ? <div className="text-[10px] font-bold text-red-500 mt-0.5">dif.</div>
                  : <div className="text-[10px] text-green-600 mt-0.5">✓</div>
                }
              </div>
            </div>

            <div className="flex gap-3 mt-2.5">
              {[
                ['Efec', c.monto_cierre_efectivo, difs.efectivo],
                ['Yape', c.monto_cierre_yape,     difs.yape],
                ['Plin', c.monto_cierre_plin,     difs.plin],
                ['Tarj', c.monto_cierre_tarjeta,  difs.tarjeta],
              ].filter(([,val]) => Number(val||0) > 0).map(([label, val, dif]) => (
                <div key={label}>
                  <div className="text-[9px] text-slate-400 uppercase">{label}</div>
                  <div className="font-bold font-mono text-xs text-slate-800">{fmt(val)}</div>
                  {dif !== 0 && <div className={`text-[9px] font-black ${colorDif(dif)}`}>{fmtDif(dif)}</div>}
                </div>
              ))}
            </div>
          </button>
        );
      })}
    </div>

    {/* ── Modal detalle de caja ── */}
    {cajaDetalle && (
      <div className="fixed inset-0 z-50" onClick={() => { setCajaDetalle(null); setDetalle(null); }}>
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
        <div className="absolute inset-0 flex flex-col max-w-md mx-auto" onClick={e => e.stopPropagation()}>
          <div className="flex-1 bg-white mt-12 rounded-t-3xl flex flex-col overflow-hidden">

            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100 flex-shrink-0">
              <div>
                <p className="font-black text-base">
                  {new Date(cajaDetalle.fecha_apertura).toLocaleDateString('es-PE',{weekday:'long',day:'2-digit',month:'long',timeZone:'America/Lima'})}
                </p>
                <p className="text-xs text-slate-400 font-mono">
                  {new Date(cajaDetalle.fecha_apertura).toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit',timeZone:'America/Lima'})}
                  {' → '}
                  {cajaDetalle.fecha_cierre && new Date(cajaDetalle.fecha_cierre).toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit',timeZone:'America/Lima'})}
                  {' · '}
                  {cajaDetalle.nombre_apertura || ''}
                </p>
              </div>
              <button onClick={() => { setCajaDetalle(null); setDetalle(null); }}
                className="w-8 h-8 flex items-center justify-center text-slate-300 hover:text-slate-600 text-2xl flex-shrink-0">×</button>
            </div>
            {detalle && (
              <button onClick={() => descargarPDF(cajaDetalle, detalle)}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-900 text-white text-xs font-black rounded-xl active:scale-95 transition-transform mt-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17a4 4 0 004 4h10a4 4 0 004-4V7a4 4 0 00-3-3.87M16 3H8a4 4 0 00-4 4v10"/>
                </svg>
                Descargar PDF
              </button>
            )}

            {cargandoDet ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-slate-400 text-sm animate-pulse">Cargando...</div>
              </div>
            ) : detalle && (
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">

                <div className="flex justify-between items-center px-4 py-3 bg-slate-50 rounded-2xl">
                  <span className="text-sm font-bold text-slate-600">{detalle.ventas.length} ventas</span>
                  <span className="font-black text-xl font-mono">{fmt(cajaDetalle.total_ventas)}</span>
                </div>

                {detalle.ventas.length > 0 && (
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">Ventas</p>
                    <div className="space-y-2">
                      {detalle.ventas.map(v => (
                        <button key={v.id_venta} onClick={() => abrirVenta(v.id_venta)}
                          className="w-full text-left px-3.5 py-3 border border-slate-100 rounded-2xl hover:border-blue-200 hover:bg-blue-50 active:scale-[0.98] transition-all">
                          <div className="flex justify-between items-center">
                            <div>
                              <span className="text-[10px] text-slate-400 font-mono">#{v.id_venta}</span>
                              {v.tipo_venta === 'mayorista' && <span className="ml-1.5 text-[10px] text-amber-600 font-bold">📦</span>}
                              {v.nombre_vendedora && <span className="ml-1.5 text-[10px] text-slate-400">{v.nombre_vendedora}</span>}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-slate-400 font-mono">
                                {new Date(v.fecha_hora).toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit',timeZone:'America/Lima'})}
                              </span>
                              <span className="text-xs text-blue-500 font-bold">Ver →</span>
                            </div>
                          </div>
                          <div className="flex items-center justify-between mt-1">
                            <span className="font-black font-mono text-slate-900">{fmt(v.monto_total)}</span>
                            <div className="flex gap-1">
                              {v.pago_efectivo > 0 && <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 rounded-full text-slate-500">Efec</span>}
                              {v.pago_yape     > 0 && <span className="text-[10px] px-1.5 py-0.5 bg-purple-50 rounded-full text-purple-600">Yape</span>}
                              {v.pago_plin     > 0 && <span className="text-[10px] px-1.5 py-0.5 bg-green-50 rounded-full text-green-600">Plin</span>}
                              {v.pago_tarjeta  > 0 && <span className="text-[10px] px-1.5 py-0.5 bg-blue-50 rounded-full text-blue-600">Tarj</span>}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {detalle.movimientos.length > 0 && (
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">Movimientos de caja</p>
                    <div className="space-y-1.5">
                      {detalle.movimientos.map(m => {
                        const esIngreso  = m.tipo === 'ingreso';
                        const esTraslado = m.concepto?.toLowerCase().includes('traslado') || m.concepto?.toLowerCase().includes('cross');
                        const esAhorro   = m.origen_pago === 'ahorro_bcp';
                        return (
                          <div key={m.id_movimiento}
                            className="flex justify-between items-center px-3.5 py-2.5 border border-slate-100 rounded-xl">
                            <div className="flex-1 min-w-0">
                              <span className={`text-[10px] font-black mr-1.5 ${
                                esAhorro ? 'text-purple-600' : esTraslado ? 'text-amber-600' : esIngreso ? 'text-green-600' : 'text-red-600'
                              }`}>
                                {esAhorro ? 'BCP' : (METODO_SHORT[m.metodo] || m.metodo)}
                              </span>
                              <span className="text-xs text-slate-500 truncate">{m.concepto}</span>
                            </div>
                            <div className="text-right ml-3 flex-shrink-0">
                              <div className={`font-black font-mono text-sm ${
                                esAhorro ? 'text-purple-700' : esTraslado ? 'text-amber-700' : esIngreso ? 'text-green-700' : 'text-red-700'
                              }`}>
                                {esIngreso ? '+' : '−'}{fmt(m.monto)}
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                {new Date(m.fecha_movimiento).toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit',timeZone:'America/Lima'})}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {detalle.ventas.length === 0 && detalle.movimientos.length === 0 && (
                  <p className="text-center text-slate-400 py-8 text-sm">Sin registros en esta caja</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    )}

    {/* ── Modal detalle de venta individual ── */}
    {ventaModal && (
      <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={() => setVentaModal(null)}>
        <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold">Venta #{ventaModal.id_venta}</h3>
              {ventaModal.tipo_venta === 'mayorista' && <span className="text-xs text-amber-600 font-bold">📦 Mayorista</span>}
              {ventaModal.nombre_vendedora && <div className="text-xs text-slate-400">{ventaModal.nombre_vendedora}</div>}
            </div>
            <button onClick={() => setVentaModal(null)} className="text-slate-400 text-2xl font-black">×</button>
          </div>
          <div className="px-6 py-4 space-y-4">
            <div className="text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Fecha</span>
                <span className="font-mono">{new Date(ventaModal.fecha_hora).toLocaleString('es-PE',{timeZone:'America/Lima'})}</span>
              </div>
            </div>
            <div className="border-t border-slate-100 pt-3">
              <div className="text-xs text-slate-500 mb-2">Productos</div>
              <div className="space-y-2">
                {(ventaModal.items||[]).map((it,idx) => (
                  <div key={idx} className="flex justify-between items-start p-3 bg-slate-50 rounded-xl">
                    <div className="flex-1">
                      <div className="font-medium text-sm">{it.descripcion_manual || `SKU ${it.sku_id}`}</div>
                      <div className="text-xs text-slate-500 font-mono">
                        {it.talla && `T${it.talla}`}{it.color && ` · ${it.color}`}{it.cantidad > 1 && ` · ×${it.cantidad}`}
                      </div>
                    </div>
                    <div className="text-right ml-3">
                      <div className="font-mono font-bold">{fmt(it.precio_final_venta*(it.cantidad||1))}</div>
                      {it.cantidad > 1 && <div className="text-xs text-slate-400">{fmt(it.precio_final_venta)} c/u</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="border-t border-slate-100 pt-3 space-y-2">
              {ventaModal.descuento_aplicado > 0 && (
                <div className="flex justify-between text-sm text-orange-600">
                  <span>Descuento</span><span className="font-mono">-{fmt(ventaModal.descuento_aplicado)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-black pt-1 border-t border-slate-200">
                <span>Total</span><span className="font-mono">{fmt(ventaModal.monto_total)}</span>
              </div>
            </div>
            <div className="border-t border-slate-100 pt-3">
              <div className="text-xs text-slate-500 mb-2">Pagos</div>
              <div className="grid grid-cols-2 gap-2">
                {[['Efectivo',ventaModal.pago_efectivo],['Yape',ventaModal.pago_yape],['Plin',ventaModal.pago_plin],['Tarjeta',ventaModal.pago_tarjeta]]
                  .filter(([,v]) => Number(v) > 0).map(([k,v]) => (
                    <div key={k} className="p-2 bg-slate-50 rounded-lg">
                      <div className="text-xs text-slate-500">{k}</div>
                      <div className="font-mono font-bold text-sm">{fmt(v)}</div>
                    </div>
                  ))}
              </div>
              {ventaModal.vuelto > 0 && (
                <div className="mt-2 flex justify-between text-sm text-slate-500">
                  <span>Vuelto</span><span className="font-mono">{fmt(ventaModal.vuelto)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

// ─── SHEET ────────────────────────────────────────────────────────────────────
function Sheet({ children, title, onClose }) {
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute bottom-0 inset-x-0 bg-white rounded-t-3xl shadow-2xl pb-safe max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 flex-shrink-0">
          <h3 className="text-base font-black text-slate-900">{title}</h3>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-slate-400 text-2xl leading-none">
            ×
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 pb-10">
          {children}
        </div>
      </div>
    </div>
  );
}