# Plan Fase 2.03 — Wizard Crear Tipo de Movimiento

**Fecha**: 2026-04-20
**Depende de**: Plan 01 (tabla `reglas_mapeo_sugerido` + RPC `fn_sugerir_cuenta_para_tipo`)
**Bloquea**: Plan 04 (obligaciones usan tipos_movimiento_caja con mapeo)

---

## Context

Reemplazar el formulario actual de `TabTiposMovimiento.jsx:43-70` + `TabMapeo.jsx:52` (dropdown plano de 50 cuentas) por un **wizard de 3 pasos** donde el admin piensa como dueño de negocio, no como contador. Ver §7 del spec maestro.

**DECIDIDO**:
- 3 pasos exactos: categoría macro → datos + dónde aplica → mapeo autosugerido
- Árbol navegable para plan de cuentas (NO dropdown plano)
- Código auto-generado, bloqueado para edición
- Autosugerencia vía RPC `fn_sugerir_cuenta_para_tipo`

---

## Archivos a crear

```
sistema-calzado/src/views/gestion/views/config/
├── TiposMovimiento.jsx                     (pantalla maestra con lista + botón "Nuevo")
├── WizardCrearTipo/
│   ├── WizardCrearTipo.jsx                 (contenedor de 3 pasos)
│   ├── Paso1CategoriaMacro.jsx
│   ├── Paso2DatosYAmbito.jsx
│   ├── Paso3MapeoContable.jsx
│   └── ArbolPlanCuentas.jsx                (selector jerárquico reutilizable)
└── tiposMovimientoClient.js                (API wrapper)
```

## Archivos a modificar

- `sistema-calzado/src/views/gestion/views/admin/TabTiposMovimiento.jsx` — **eliminar** (su rol lo toma `TiposMovimiento.jsx` nuevo)
- `sistema-calzado/src/views/gestion/views/admin/TabMapeo.jsx` — **simplificar**: solo vista de mapeos existentes (no creación, esa se hace en el wizard)
- `CatalogoAdmin` general — quitar las pestañas "Tipos" y "Mapeo" (absorben al flujo nuevo)

---

## Implementación

### 1. Pantalla maestra `TiposMovimiento.jsx`

```jsx
import { useState, useEffect } from 'react'
import { supabase } from '../../../../api/supabase'
import WizardCrearTipo from './WizardCrearTipo/WizardCrearTipo'

export default function TiposMovimiento() {
  const [tipos, setTipos] = useState([])
  const [wizardOpen, setWizardOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => { cargarTipos() }, [])

  async function cargarTipos() {
    setLoading(true)
    const { data } = await supabase
      .from('tipos_movimiento_caja')
      .select('id_tipo, codigo, nombre, emoji, categoria, activo, id_cuenta_contable_default')
      .order('orden', { ascending: true })
    setTipos(data || [])
    setLoading(false)
  }

  return (
    <div className="tipos-movimiento-page">
      <header className="page-header">
        <h2>Tipos de Movimiento</h2>
        <button className="btn-primary" onClick={() => setWizardOpen(true)}>
          + Nuevo tipo
        </button>
      </header>

      {loading ? <Spinner /> : (
        <table className="tabla-tipos">
          <thead>
            <tr><th>Emoji</th><th>Nombre</th><th>Código</th><th>Categoría</th><th>Cuenta</th><th>Activo</th><th></th></tr>
          </thead>
          <tbody>
            {tipos.map(t => (
              <tr key={t.id_tipo}>
                <td>{t.emoji}</td>
                <td>{t.nombre}</td>
                <td><code>{t.codigo}</code></td>
                <td>{t.categoria}</td>
                <td>{/* fetch cuenta FK opcionalmente */}</td>
                <td>{t.activo ? '✓' : '—'}</td>
                <td><button>Editar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {wizardOpen && (
        <WizardCrearTipo
          onClose={() => setWizardOpen(false)}
          onCreated={() => { setWizardOpen(false); cargarTipos() }}
        />
      )}
    </div>
  )
}
```

### 2. `WizardCrearTipo.jsx` — contenedor

```jsx
import { useState } from 'react'
import Paso1CategoriaMacro from './Paso1CategoriaMacro'
import Paso2DatosYAmbito from './Paso2DatosYAmbito'
import Paso3MapeoContable from './Paso3MapeoContable'
import { supabase } from '../../../../../api/supabase'

export default function WizardCrearTipo({ onClose, onCreated }) {
  const [paso, setPaso] = useState(1)
  const [datos, setDatos] = useState({
    categoria_macro: null,      // 'ingreso', 'gasto_operativo', etc.
    nombre: '',
    emoji: '',
    codigo: '',                 // auto-generado desde nombre
    ambito: 'cualquier',        // 'cualquier' | 'tiendas' | 'talleres' | 'especificas'
    ubicaciones_especificas: [],
    roles_permitidos: [],
    id_cuenta_contable: null,
  })

  function actualizar(patch) { setDatos(d => ({ ...d, ...patch })) }

  function generarCodigo(nombre) {
    return nombre.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
  }

  async function crear() {
    const dir = datos.categoria_macro === 'ingreso' ? 'entrada'
              : datos.categoria_macro === 'traslado' ? 'transferencia'
              : 'salida'

    const { data, error } = await supabase
      .from('tipos_movimiento_caja')
      .insert({
        codigo: datos.codigo,
        nombre: datos.nombre,
        emoji: datos.emoji,
        categoria: datos.categoria_macro,
        tipo_flujo: dir,
        id_cuenta_contable_default: datos.id_cuenta_contable,
        activo: true,
      })
      .select()
      .single()

    if (error) { alert('Error: ' + error.message); return }

    // Crear registros de mapeo por ubicacion_rol según ámbito
    if (datos.ambito === 'tiendas' || datos.ambito === 'talleres') {
      await supabase.from('mapeo_tipo_cuenta').insert({
        id_tipo: data.id_tipo,
        ubicacion_rol: datos.ambito === 'tiendas' ? 'Tienda' : 'Taller',
        id_cuenta_contable: datos.id_cuenta_contable,
        activo: true,
      })
    }

    onCreated?.(data)
  }

  return (
    <div className="wizard-overlay">
      <div className="wizard-modal">
        <header className="wizard-header">
          <button onClick={onClose}>✕</button>
          <span className="wizard-title">
            {paso === 1 ? 'Nuevo tipo de movimiento' :
             paso === 2 ? `Nuevo tipo: ${emojiParaCategoria(datos.categoria_macro)} ${labelCategoria(datos.categoria_macro)}` :
             `Nuevo tipo: ${datos.emoji} ${datos.nombre}`}
          </span>
          <span className="wizard-paso">Paso {paso} / 3</span>
        </header>

        {paso === 1 && (
          <Paso1CategoriaMacro
            valor={datos.categoria_macro}
            onSeleccionar={(cat) => { actualizar({ categoria_macro: cat }); setPaso(2) }}
          />
        )}
        {paso === 2 && (
          <Paso2DatosYAmbito
            datos={datos}
            actualizar={(p) => actualizar({ ...p, codigo: generarCodigo(p.nombre ?? datos.nombre) })}
            onAtras={() => setPaso(1)}
            onSiguiente={() => setPaso(3)}
          />
        )}
        {paso === 3 && (
          <Paso3MapeoContable
            datos={datos}
            actualizar={actualizar}
            onAtras={() => setPaso(2)}
            onCrear={crear}
          />
        )}
      </div>
    </div>
  )
}
```

### 3. `Paso1CategoriaMacro.jsx`

```jsx
const CATEGORIAS = [
  { code: 'ingreso',         emoji: '💰', titulo: 'Entra dinero',         desc: 'Venta, devolución de proveedor, préstamo recibido' },
  { code: 'gasto_operativo', emoji: '💸', titulo: 'Sale — gasto operativo', desc: 'Servicios, alquiler, suministros' },
  { code: 'pago_personas',   emoji: '👥', titulo: 'Sale — pago a personas', desc: 'Sueldo, bono, adelanto, comisión' },
  { code: 'inversion',       emoji: '🏗️', titulo: 'Sale — inversión',     desc: 'Compra de máquina, mejora de local' },
  { code: 'traslado',        emoji: '🔁', titulo: 'Entre cuentas propias',  desc: 'Traslado, no es gasto' },
  { code: 'pago_deuda',      emoji: '💳', titulo: 'Pago de deuda / financiero', desc: 'Cuota préstamo, intereses' },
  { code: 'compra_material', emoji: '📦', titulo: 'Compra de material',    desc: 'Insumos para producción' },
]

export default function Paso1CategoriaMacro({ valor, onSeleccionar }) {
  return (
    <div className="wizard-paso-body">
      <p className="wizard-pregunta">¿Qué clase de actividad económica representa este tipo?</p>
      <div className="grid-categorias">
        {CATEGORIAS.map(c => (
          <button
            key={c.code}
            className={`card-categoria ${valor === c.code ? 'activa' : ''}`}
            onClick={() => onSeleccionar(c.code)}
          >
            <div className="emoji">{c.emoji}</div>
            <div className="titulo">{c.titulo}</div>
            <div className="desc">{c.desc}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
```

### 4. `Paso2DatosYAmbito.jsx`

```jsx
import { useEffect, useState } from 'react'
import { supabase } from '../../../../../api/supabase'

export default function Paso2DatosYAmbito({ datos, actualizar, onAtras, onSiguiente }) {
  const [ubicaciones, setUbicaciones] = useState([])
  const [roles, setRoles] = useState([])

  useEffect(() => {
    supabase.from('ubicaciones').select('id_ubicacion, nombre, rol').then(r => setUbicaciones(r.data || []))
    supabase.from('roles_persona').select('id_rol, codigo, nombre').then(r => setRoles(r.data || []))
  }, [])

  const valido = datos.nombre?.trim() && datos.ambito &&
    (datos.ambito !== 'especificas' || datos.ubicaciones_especificas.length > 0)

  return (
    <div className="wizard-paso-body">
      <label>Nombre del tipo
        <input value={datos.nombre} onChange={e => actualizar({ nombre: e.target.value })} />
      </label>
      <div className="row">
        <label>Emoji (opcional)
          <input value={datos.emoji} onChange={e => actualizar({ emoji: e.target.value })} maxLength={4} />
        </label>
        <label>Código (auto) 🔒
          <input value={datos.codigo} readOnly />
        </label>
      </div>

      <hr />

      <p className="subtitulo">¿Dónde aplica este tipo?</p>
      <label><input type="radio" name="ambito" checked={datos.ambito === 'cualquier'}
        onChange={() => actualizar({ ambito: 'cualquier' })} /> Cualquier ubicación</label>
      <label><input type="radio" name="ambito" checked={datos.ambito === 'tiendas'}
        onChange={() => actualizar({ ambito: 'tiendas' })} /> Solo en Tiendas</label>
      <label><input type="radio" name="ambito" checked={datos.ambito === 'talleres'}
        onChange={() => actualizar({ ambito: 'talleres' })} /> Solo en Talleres</label>
      <label><input type="radio" name="ambito" checked={datos.ambito === 'especificas'}
        onChange={() => actualizar({ ambito: 'especificas' })} /> Solo en estas ubicaciones:</label>

      {datos.ambito === 'especificas' && (
        <select multiple value={datos.ubicaciones_especificas}
          onChange={e => actualizar({ ubicaciones_especificas: [...e.target.selectedOptions].map(o => o.value) })}>
          {ubicaciones.map(u => <option key={u.id_ubicacion} value={u.id_ubicacion}>{u.nombre} ({u.rol})</option>)}
        </select>
      )}

      <hr />
      <p className="subtitulo">¿Quién puede registrarlo?</p>
      {roles.map(r => (
        <label key={r.id_rol}>
          <input type="checkbox"
            checked={datos.roles_permitidos.includes(r.codigo)}
            onChange={() => {
              const next = datos.roles_permitidos.includes(r.codigo)
                ? datos.roles_permitidos.filter(x => x !== r.codigo)
                : [...datos.roles_permitidos, r.codigo]
              actualizar({ roles_permitidos: next })
            }}
          /> {r.nombre}
        </label>
      ))}

      <footer className="wizard-footer">
        <button onClick={onAtras}>← Atrás</button>
        <button disabled={!valido} onClick={onSiguiente} className="btn-primary">Siguiente →</button>
      </footer>
    </div>
  )
}
```

### 5. `Paso3MapeoContable.jsx`

```jsx
import { useEffect, useState } from 'react'
import { supabase } from '../../../../../api/supabase'
import ArbolPlanCuentas from './ArbolPlanCuentas'

export default function Paso3MapeoContable({ datos, actualizar, onAtras, onCrear }) {
  const [sugerencia, setSugerencia] = useState(null)
  const [modo, setModo] = useState('sugerencia') // 'sugerencia' | 'manual'

  useEffect(() => {
    const rol = datos.ambito === 'tiendas' ? 'Tienda'
             : datos.ambito === 'talleres' ? 'Taller'
             : '*'
    supabase.rpc('fn_sugerir_cuenta_para_tipo', {
      p_categoria_macro: datos.categoria_macro,
      p_ubicacion_rol: rol,
    }).then(async ({ data }) => {
      if (!data) { setModo('manual'); return }
      const { data: cuenta } = await supabase
        .from('plan_cuentas')
        .select('id_cuenta, codigo, nombre, seccion_pl')
        .eq('id_cuenta', data)
        .single()
      setSugerencia(cuenta)
      actualizar({ id_cuenta_contable: data })
    })
  }, [])

  return (
    <div className="wizard-paso-body">
      {modo === 'sugerencia' && sugerencia && (
        <>
          <p className="subtitulo">💡 Sugerencia automática del sistema</p>
          <div className="card-sugerencia">
            <div className="codigo">{sugerencia.codigo} — {sugerencia.nombre}</div>
            <div className="seccion">Sección: {sugerencia.seccion_pl}</div>
            <div className="explicacion">
              Aparecerá en el Estado de Resultados bajo: {sugerencia.seccion_pl} → {sugerencia.nombre}
            </div>
          </div>
          <div className="acciones-sugerencia">
            <button className="btn-aceptar">✓ Aceptar sugerencia</button>
            <button onClick={() => setModo('manual')}>Ajustar mapeo manualmente</button>
          </div>
        </>
      )}

      {modo === 'manual' && (
        <>
          <p className="subtitulo">Elige la cuenta contable</p>
          <ArbolPlanCuentas
            selectedId={datos.id_cuenta_contable}
            onSelect={(id) => actualizar({ id_cuenta_contable: id })}
          />
        </>
      )}

      <hr />
      <p className="subtitulo">Vista previa:</p>
      <div className="vista-previa">
        <div>{datos.emoji} {datos.nombre}</div>
        <div>Aplica: {labelAmbito(datos.ambito)}</div>
        <div>Puede registrarlo: {datos.roles_permitidos.join(', ')}</div>
        <div>Cuenta contable: {sugerencia?.codigo} {sugerencia?.nombre}</div>
      </div>

      <footer className="wizard-footer">
        <button onClick={onAtras}>← Atrás</button>
        <button disabled={!datos.id_cuenta_contable} onClick={onCrear} className="btn-primary">
          Crear ✓
        </button>
      </footer>
    </div>
  )
}
```

### 6. `ArbolPlanCuentas.jsx` — selector jerárquico

```jsx
import { useEffect, useState } from 'react'
import { supabase } from '../../../../../api/supabase'

export default function ArbolPlanCuentas({ selectedId, onSelect }) {
  const [nodos, setNodos] = useState([])
  const [expandidos, setExpandidos] = useState(new Set())

  useEffect(() => {
    supabase.from('plan_cuentas')
      .select('id_cuenta, codigo, nombre, id_padre, nivel')
      .order('codigo')
      .then(r => setNodos(r.data || []))
  }, [])

  function toggle(id) {
    setExpandidos(s => {
      const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n
    })
  }

  function renderNodo(nodo) {
    const hijos = nodos.filter(n => n.id_padre === nodo.id_cuenta)
    const tieneHijos = hijos.length > 0
    const abierto = expandidos.has(nodo.id_cuenta)
    return (
      <div key={nodo.id_cuenta} className={`arbol-nodo nivel-${nodo.nivel}`}>
        <div className={`fila ${selectedId === nodo.id_cuenta ? 'seleccionada' : ''}`}>
          {tieneHijos ? (
            <button className="toggle" onClick={() => toggle(nodo.id_cuenta)}>
              {abierto ? '▼' : '▶'}
            </button>
          ) : <span className="toggle-placeholder">•</span>}
          <span className="codigo">{nodo.codigo}</span>
          <span className="nombre">{nodo.nombre}</span>
          {!tieneHijos && (
            <button className="btn-elegir" onClick={() => onSelect(nodo.id_cuenta)}>
              {selectedId === nodo.id_cuenta ? '●' : '○'}
            </button>
          )}
        </div>
        {abierto && hijos.map(renderNodo)}
      </div>
    )
  }

  const raices = nodos.filter(n => !n.id_padre)
  return <div className="arbol-plan-cuentas">{raices.map(renderNodo)}</div>
}
```

### 7. Helpers

**Archivo**: `sistema-calzado/src/views/gestion/views/config/WizardCrearTipo/helpers.js`

```js
export function emojiParaCategoria(cat) {
  return {
    ingreso: '💰', gasto_operativo: '💸', pago_personas: '👥',
    inversion: '🏗️', traslado: '🔁', pago_deuda: '💳', compra_material: '📦',
  }[cat] || ''
}
export function labelCategoria(cat) {
  return {
    ingreso: 'Entra dinero', gasto_operativo: 'Gasto operativo',
    pago_personas: 'Pago a personas', inversion: 'Inversión',
    traslado: 'Traslado', pago_deuda: 'Pago deuda', compra_material: 'Compra material',
  }[cat] || cat
}
export function labelAmbito(ambito) {
  return {
    cualquier: 'Cualquier ubicación', tiendas: 'Solo Tiendas',
    talleres: 'Solo Talleres', especificas: 'Ubicaciones específicas',
  }[ambito] || ambito
}
```

---

## Criterio de aceptación

- [ ] `/gestion/config/tipos-movimiento` muestra lista de tipos existentes
- [ ] Botón "+ Nuevo tipo" abre wizard
- [ ] Paso 1: seleccionar cualquiera de las 7 categorías avanza a paso 2
- [ ] Paso 2: escribir nombre genera código automático válido (snake_case, sin tildes)
- [ ] Paso 3: al abrir, muestra sugerencia de cuenta basada en `fn_sugerir_cuenta_para_tipo`
- [ ] Botón "Ajustar mapeo manualmente" abre árbol navegable del plan de cuentas
- [ ] Al crear, aparece en la lista con el mapeo correcto en `mapeo_tipo_cuenta`
- [ ] Commit: `feat(fase2-03): wizard crear tipo de movimiento con arbol plan cuentas`
