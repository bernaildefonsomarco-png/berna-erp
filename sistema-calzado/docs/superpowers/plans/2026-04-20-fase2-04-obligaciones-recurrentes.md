# Plan Fase 2.04 — Obligaciones Recurrentes (UI + Integraciones)

**Fecha**: 2026-04-20
**Depende de**: Plan 01 (tablas y RPCs de obligaciones), Plan 02 (sidebar con ruta `/gestion/obligaciones`), Plan 03 (tipos de movimiento)
**Bloquea**: nada directamente; plan 06 (resumen) consume la vista `v_obligaciones_bandeja`

---

## Context

Implementar la bandeja de obligaciones (3 pestañas: Próximas, Programadas, Histórico) + CRUD de recetas + modal de confirmar/pagar. Ver §8 del spec maestro para el ciclo de vida completo.

**DECIDIDO**:
- Sistema solo recuerda, NUNCA ejecuta movimientos automáticos
- Ciclo: PROYECTADO → CONFIRMADO → VENCIDO → PAGO (completo/parcial/acumular)
- El movimiento real se crea solo al confirmar pago (vía RPC `fn_pagar_obligacion`)

---

## Archivos a crear

```
sistema-calzado/src/views/gestion/views/obligaciones/
├── ObligacionesRecurrentes.jsx               (pantalla contenedora con 3 pestañas)
├── BandejaProximas.jsx
├── ListaProgramadas.jsx
├── ListaHistorico.jsx
├── ModalConfirmarMonto.jsx
├── ModalPagar.jsx
├── ModalNuevaObligacion.jsx                  (CRUD crear)
└── obligacionesClient.js                     (API wrapper)
```

---

## 1. `ObligacionesRecurrentes.jsx` (contenedor)

```jsx
import { useState, useEffect } from 'react'
import BandejaProximas from './BandejaProximas'
import ListaProgramadas from './ListaProgramadas'
import ListaHistorico from './ListaHistorico'
import ModalNuevaObligacion from './ModalNuevaObligacion'
import { fetchBandeja, fetchProgramadas, fetchHistorico } from './obligacionesClient'

export default function ObligacionesRecurrentes() {
  const [tab, setTab] = useState('proximas')
  const [bandeja, setBandeja] = useState([])
  const [programadas, setProgramadas] = useState([])
  const [historico, setHistorico] = useState([])
  const [nuevaOpen, setNuevaOpen] = useState(false)

  async function recargar() {
    setBandeja(await fetchBandeja())
    setProgramadas(await fetchProgramadas())
    setHistorico(await fetchHistorico())
  }

  useEffect(() => { recargar() }, [])

  return (
    <div className="obligaciones-page">
      <header className="page-header">
        <h2>📅 Obligaciones recurrentes</h2>
        <button className="btn-primary" onClick={() => setNuevaOpen(true)}>
          + Nueva obligación
        </button>
      </header>

      <nav className="tabs">
        <button className={tab === 'proximas' ? 'active' : ''} onClick={() => setTab('proximas')}>
          Próximas ({bandeja.filter(i => ['proyectado','confirmado','vencido','pagado_parcial','acumulado'].includes(i.estado)).length})
        </button>
        <button className={tab === 'programadas' ? 'active' : ''} onClick={() => setTab('programadas')}>
          Programadas ({programadas.filter(p => p.activa).length})
        </button>
        <button className={tab === 'historico' ? 'active' : ''} onClick={() => setTab('historico')}>
          Histórico
        </button>
      </nav>

      {tab === 'proximas' && <BandejaProximas items={bandeja} onRefresh={recargar} />}
      {tab === 'programadas' && <ListaProgramadas items={programadas} onRefresh={recargar} />}
      {tab === 'historico' && <ListaHistorico items={historico} />}

      {nuevaOpen && <ModalNuevaObligacion onClose={() => setNuevaOpen(false)} onCreated={recargar} />}
    </div>
  )
}
```

---

## 2. `BandejaProximas.jsx`

```jsx
import { useState } from 'react'
import ModalConfirmarMonto from './ModalConfirmarMonto'
import ModalPagar from './ModalPagar'

function agrupar(items) {
  const vencidas = items.filter(i => i.estado === 'vencido' || i.dias_hasta_vencimiento < 0)
  const estaSemana = items.filter(i => i.estado !== 'vencido' && i.dias_hasta_vencimiento >= 0 && i.dias_hasta_vencimiento <= 7)
  const proximas = items.filter(i => i.dias_hasta_vencimiento > 7 && i.dias_hasta_vencimiento <= 30)
  return { vencidas, estaSemana, proximas }
}

export default function BandejaProximas({ items, onRefresh }) {
  const [confirmarItem, setConfirmarItem] = useState(null)
  const [pagarItem, setPagarItem] = useState(null)
  const { vencidas, estaSemana, proximas } = agrupar(items)

  return (
    <div className="bandeja-proximas">
      {vencidas.length > 0 && (
        <section>
          <h3>🔴 VENCIDAS ({vencidas.length})</h3>
          {vencidas.map(i => (
            <Card key={i.id_instancia} item={i} rojo
              onConfirmar={() => setConfirmarItem(i)}
              onPagar={() => setPagarItem(i)}
            />
          ))}
        </section>
      )}
      {estaSemana.length > 0 && (
        <section>
          <h3>🟡 VENCEN ESTA SEMANA ({estaSemana.length})</h3>
          {estaSemana.map(i => (
            <Card key={i.id_instancia} item={i}
              onConfirmar={() => setConfirmarItem(i)}
              onPagar={() => setPagarItem(i)}
            />
          ))}
        </section>
      )}
      {proximas.length > 0 && (
        <section>
          <h3>🟢 PRÓXIMAS ({proximas.length})</h3>
          {proximas.map(i => (
            <div key={i.id_instancia} className="row-compact">
              <span>{i.emoji} {i.nombre}</span>
              <span>{i.fecha_vencimiento}</span>
              <span>S/ ~{i.monto_proyectado}</span>
            </div>
          ))}
        </section>
      )}

      {confirmarItem && (
        <ModalConfirmarMonto
          instancia={confirmarItem}
          onClose={() => setConfirmarItem(null)}
          onSaved={() => { setConfirmarItem(null); onRefresh() }}
        />
      )}
      {pagarItem && (
        <ModalPagar
          instancia={pagarItem}
          onClose={() => setPagarItem(null)}
          onSaved={() => { setPagarItem(null); onRefresh() }}
        />
      )}
    </div>
  )
}

function Card({ item, rojo, onConfirmar, onPagar }) {
  const esProyectado = item.estado === 'proyectado'
  return (
    <div className={`card-obligacion ${rojo ? 'rojo' : ''}`}>
      <div className="card-head">
        <span className="titulo">{item.emoji} {item.nombre}</span>
        <span className="fecha">{
          item.dias_hasta_vencimiento < 0
            ? `Venció hace ${Math.abs(item.dias_hasta_vencimiento)} días`
            : `Vence en ${item.dias_hasta_vencimiento} días — ${item.fecha_vencimiento}`
        }</span>
      </div>
      <div className="card-monto">
        {item.monto_confirmado
          ? <>Monto confirmado: <b>S/ {item.monto_confirmado}</b></>
          : <>Monto estimado: S/ {item.monto_proyectado} <em>· recibo no confirmado</em></>
        }
        {item.ubicacion_nombre && <span> · {item.ubicacion_nombre}</span>}
      </div>
      <div className="card-acciones">
        {esProyectado && !item.monto_confirmado && (
          <button onClick={onConfirmar}>Confirmar monto</button>
        )}
        <button className="btn-primary" onClick={onPagar}>Pagar</button>
        <button>···</button>
      </div>
    </div>
  )
}
```

---

## 3. `ModalConfirmarMonto.jsx`

```jsx
import { useState } from 'react'
import { supabase } from '../../../../api/supabase'

export default function ModalConfirmarMonto({ instancia, onClose, onSaved }) {
  const [monto, setMonto] = useState(instancia.monto_proyectado || '')
  const [archivo, setArchivo] = useState(null)

  async function guardar() {
    const idPersona = JSON.parse(localStorage.getItem('berna_gestion_session'))?.id_persona
    let archivoUrl = null

    if (archivo) {
      const path = `obligaciones/${instancia.id_instancia}/${archivo.name}`
      await supabase.storage.from('recibos').upload(path, archivo, { upsert: true })
      archivoUrl = path
    }

    const { error } = await supabase.rpc('fn_confirmar_monto_obligacion', {
      p_id_instancia: instancia.id_instancia,
      p_monto_real: Number(monto),
      p_id_persona: idPersona,
      p_archivo_url: archivoUrl,
    })
    if (error) { alert(error.message); return }
    onSaved()
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <header>
          <button onClick={onClose}>✕</button>
          <h3>Confirmar monto: {instancia.emoji} {instancia.nombre}</h3>
        </header>
        <div className="modal-body">
          <p>Monto estimado: S/ {instancia.monto_proyectado}</p>
          <label>Monto real del recibo
            <input type="number" step="0.01" value={monto} onChange={e => setMonto(e.target.value)} autoFocus />
          </label>
          <label>Adjuntar recibo (opcional)
            <input type="file" onChange={e => setArchivo(e.target.files?.[0])} />
          </label>
          <p className="nota">Esto solo confirma el monto. El pago real se registra con el botón "Pagar".</p>
        </div>
        <footer>
          <button onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={guardar}>Confirmar</button>
        </footer>
      </div>
    </div>
  )
}
```

---

## 4. `ModalPagar.jsx`

```jsx
import { useState, useEffect } from 'react'
import { supabase } from '../../../../api/supabase'

export default function ModalPagar({ instancia, onClose, onSaved }) {
  const [cuentas, setCuentas] = useState([])
  const [idCuenta, setIdCuenta] = useState('')
  const [monto, setMonto] = useState(instancia.monto_confirmado || instancia.monto_proyectado || '')
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0,10))
  const [modo, setModo] = useState('completo')

  useEffect(() => {
    supabase.from('cuentas_financieras').select('id_cuenta, nombre, saldo_actual').eq('activa', true)
      .then(r => setCuentas(r.data || []))
  }, [])

  async function pagar() {
    const idPersona = JSON.parse(localStorage.getItem('berna_gestion_session'))?.id_persona
    const { error } = await supabase.rpc('fn_pagar_obligacion', {
      p_id_instancia: instancia.id_instancia,
      p_monto_pagado: Number(monto),
      p_id_cuenta: idCuenta,
      p_fecha_pago: fecha,
      p_id_persona: idPersona,
      p_modo: modo,
    })
    if (error) { alert(error.message); return }
    onSaved()
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <header>
          <button onClick={onClose}>✕</button>
          <h3>Pagar: {instancia.emoji} {instancia.nombre}</h3>
        </header>
        <div className="modal-body">
          <label>Monto a pagar
            <input type="number" step="0.01" value={monto} onChange={e => setMonto(e.target.value)} />
          </label>
          <label>Fecha
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
          </label>
          <label>Cuenta de origen
            <select value={idCuenta} onChange={e => setIdCuenta(e.target.value)}>
              <option value="">Seleccionar…</option>
              {cuentas.map(c => <option key={c.id_cuenta} value={c.id_cuenta}>{c.nombre} — S/ {c.saldo_actual}</option>)}
            </select>
          </label>
          <fieldset>
            <legend>Modo de pago</legend>
            <label><input type="radio" name="modo" checked={modo === 'completo'} onChange={() => setModo('completo')} /> Completo</label>
            <label><input type="radio" name="modo" checked={modo === 'parcial'} onChange={() => setModo('parcial')} /> Parcial (queda saldo)</label>
            <label><input type="radio" name="modo" checked={modo === 'acumular'} onChange={() => setModo('acumular')} /> Acumular al próximo mes</label>
          </fieldset>
          <p className="nota">Esto generará un movimiento real en caja/cuenta bancaria.</p>
        </div>
        <footer>
          <button onClick={onClose}>Cancelar</button>
          <button className="btn-primary" disabled={!idCuenta || !monto} onClick={pagar}>
            Confirmar pago
          </button>
        </footer>
      </div>
    </div>
  )
}
```

---

## 5. `ModalNuevaObligacion.jsx`

```jsx
import { useState, useEffect } from 'react'
import { supabase } from '../../../../api/supabase'

export default function ModalNuevaObligacion({ onClose, onCreated }) {
  const [form, setForm] = useState({
    nombre: '', emoji: '', id_tipo_movimiento: '', id_ubicacion: '',
    id_cuenta_origen: '', monto_estimado: '', monto_es_fijo: false,
    frecuencia: 'mensual', dia_del_periodo: 1, dias_anticipacion_aviso: 5, notas: ''
  })
  const [tipos, setTipos] = useState([])
  const [ubicaciones, setUbicaciones] = useState([])
  const [cuentas, setCuentas] = useState([])

  useEffect(() => {
    supabase.from('tipos_movimiento_caja').select('id_tipo, codigo, nombre, emoji').eq('activo', true)
      .then(r => setTipos(r.data || []))
    supabase.from('ubicaciones').select('id_ubicacion, nombre').eq('activa', true)
      .then(r => setUbicaciones(r.data || []))
    supabase.from('cuentas_financieras').select('id_cuenta, nombre').eq('activa', true)
      .then(r => setCuentas(r.data || []))
  }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function crear() {
    const codigo = form.nombre.toLowerCase().replace(/[^a-z0-9]+/g, '_')
    const { error } = await supabase.from('obligaciones_recurrentes').insert({
      ...form, codigo,
      monto_estimado: form.monto_estimado ? Number(form.monto_estimado) : null,
      dia_del_periodo: form.dia_del_periodo ? Number(form.dia_del_periodo) : null,
      activa: true,
    })
    if (error) { alert(error.message); return }
    onCreated()
    onClose()
  }

  return (
    <div className="modal-overlay">
      <div className="modal grande">
        <header><button onClick={onClose}>✕</button><h3>Nueva obligación recurrente</h3></header>
        <div className="modal-body grid-2">
          <label>Nombre <input value={form.nombre} onChange={e => set('nombre', e.target.value)} /></label>
          <label>Emoji <input value={form.emoji} onChange={e => set('emoji', e.target.value)} /></label>
          <label>Tipo de movimiento
            <select value={form.id_tipo_movimiento} onChange={e => set('id_tipo_movimiento', e.target.value)}>
              <option value="">…</option>
              {tipos.map(t => <option key={t.id_tipo} value={t.id_tipo}>{t.emoji} {t.nombre}</option>)}
            </select>
          </label>
          <label>Ubicación
            <select value={form.id_ubicacion} onChange={e => set('id_ubicacion', e.target.value)}>
              <option value="">Cualquiera</option>
              {ubicaciones.map(u => <option key={u.id_ubicacion} value={u.id_ubicacion}>{u.nombre}</option>)}
            </select>
          </label>
          <label>Cuenta default
            <select value={form.id_cuenta_origen} onChange={e => set('id_cuenta_origen', e.target.value)}>
              <option value="">Elegir al pagar</option>
              {cuentas.map(c => <option key={c.id_cuenta} value={c.id_cuenta}>{c.nombre}</option>)}
            </select>
          </label>
          <label>Monto estimado
            <input type="number" step="0.01" value={form.monto_estimado} onChange={e => set('monto_estimado', e.target.value)} />
          </label>
          <label>
            <input type="checkbox" checked={form.monto_es_fijo} onChange={e => set('monto_es_fijo', e.target.checked)} />
            Monto fijo (no varía mes a mes)
          </label>
          <label>Frecuencia
            <select value={form.frecuencia} onChange={e => set('frecuencia', e.target.value)}>
              <option value="mensual">Mensual</option>
              <option value="quincenal">Quincenal</option>
              <option value="semanal">Semanal</option>
              <option value="anual">Anual</option>
            </select>
          </label>
          {form.frecuencia === 'mensual' && (
            <label>Día del mes
              <input type="number" min="1" max="31" value={form.dia_del_periodo} onChange={e => set('dia_del_periodo', e.target.value)} />
            </label>
          )}
          <label>Días de anticipación
            <input type="number" min="1" max="30" value={form.dias_anticipacion_aviso} onChange={e => set('dias_anticipacion_aviso', e.target.value)} />
          </label>
          <label className="full">Notas
            <textarea value={form.notas} onChange={e => set('notas', e.target.value)} rows={3} />
          </label>
        </div>
        <footer>
          <button onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={crear} disabled={!form.nombre || !form.id_tipo_movimiento}>
            Crear obligación
          </button>
        </footer>
      </div>
    </div>
  )
}
```

---

## 6. `obligacionesClient.js`

```js
import { supabase } from '../../../../api/supabase'

export async function fetchBandeja() {
  const { data } = await supabase.from('v_obligaciones_bandeja').select('*').order('fecha_vencimiento')
  return data || []
}

export async function fetchProgramadas() {
  const { data } = await supabase.from('obligaciones_recurrentes').select('*').order('nombre')
  return data || []
}

export async function fetchHistorico() {
  const { data } = await supabase.from('obligaciones_instancias')
    .select('*, obligaciones_recurrentes(nombre, emoji)')
    .in('estado', ['pagado_completo','pagado_parcial','cancelado'])
    .order('fecha_vencimiento', { ascending: false })
    .limit(100)
  return data || []
}
```

---

## 7. Generación de instancias al entrar

Al montar `ObligacionesRecurrentes.jsx`, invocar `fn_generar_obligaciones_pendientes(45)` para asegurar que la bandeja esté actualizada incluso si el cron no corrió:

```jsx
useEffect(() => {
  supabase.rpc('fn_generar_obligaciones_pendientes', { p_horizonte_dias: 45 })
    .then(() => recargar())
}, [])
```

---

## Criterio de aceptación

- [ ] `/gestion/obligaciones` muestra 3 pestañas
- [ ] "Nueva obligación" crea un registro con frecuencia mensual día N
- [ ] Al entrar a la pantalla, si no hay instancia para este mes, se genera automáticamente
- [ ] "Confirmar monto" actualiza `monto_confirmado` y cambia estado a `confirmado`
- [ ] "Pagar completo" genera fila en `movimientos_caja` con el monto + cambia estado a `pagado_completo`
- [ ] "Pagar parcial" deja `saldo_pendiente > 0`
- [ ] "Marcar acumulado" cambia estado a `acumulado`, próxima instancia considera el saldo
- [ ] Instancia con fecha < hoy y estado proyectado/confirmado aparece como "vencida" al recargar
- [ ] Commit: `feat(fase2-04): obligaciones recurrentes UI completa`
