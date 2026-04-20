# Plan Fase 2.05 — Catálogos del Sistema (UI Unificada)

**Fecha**: 2026-04-20
**Depende de**: Plan 01 (tablas dedicadas de catálogos creadas)
**Bloquea**: Plan 07 (trabajadores usa `cargos` y `areas` desde esta UI)

---

## Context

Reemplazar `TabCatalogosAux.jsx` por una pantalla master-detail única (`/gestion/config/catalogos`) que gestione los 7 catálogos dedicados (`metodos_pago`, `areas`, `cargos`, `motivos_merma`, `motivos_ajuste`, `motivos_devolucion`, `condiciones_pago`). Formulario se renderiza dinámicamente según las columnas de cada tabla.

**DECIDIDO**:
- NO usar tabla genérica — son tablas dedicadas (regla Fase 2)
- Una pantalla con UI idéntica para todos los catálogos (consistencia mental)
- Cada catálogo tiene su propia definición de columnas (declarativa)

---

## Archivos a crear

```
sistema-calzado/src/views/gestion/views/config/catalogos/
├── CatalogosDelSistema.jsx           (contenedor master-detail)
├── ListaCatalogos.jsx                (panel izquierdo)
├── DetalleCatalogo.jsx               (panel derecho)
├── FormularioCatalogoItem.jsx        (modal para crear/editar un ítem)
└── definiciones.js                   (declaraciones de cada catálogo)
```

## Archivos a eliminar (al final del plan)

- `sistema-calzado/src/views/gestion/views/admin/TabCatalogosAux.jsx`
- `sistema-calzado/src/views/gestion/api/catalogoClient.js` — solo la parte que maneja `catalogos_auxiliares`

---

## 1. `definiciones.js` — registro de catálogos

```js
// Registro declarativo de catálogos del sistema.
// Cada entrada define cómo se listan, editan y muestran los ítems de una tabla dedicada.
// Para agregar un catálogo nuevo: (1) crear la tabla en una migration, (2) agregar entrada aquí.

export const CATALOGOS = [
  {
    codigo: 'metodos_pago',
    tabla: 'metodos_pago',
    label: 'Métodos de pago',
    descripcion: 'Formas con las que se cobra o paga',
    icono: '💳',
    columnas: [
      { key: 'codigo', label: 'Código', tipo: 'text', auto: 'fromNombre', readonly: true },
      { key: 'nombre', label: 'Nombre', tipo: 'text', required: true },
      { key: 'tipo', label: 'Tipo', tipo: 'select',
        opciones: ['efectivo','digital','tarjeta','transferencia','cheque','otro'], required: true },
      { key: 'requiere_referencia', label: 'Requiere referencia (ej: N° operación)', tipo: 'boolean' },
      { key: 'orden', label: 'Orden', tipo: 'int' },
      { key: 'activo', label: 'Activo', tipo: 'boolean' },
    ],
    mostrarEnLista: ['nombre','tipo','activo'],
  },
  {
    codigo: 'areas',
    tabla: 'areas',
    label: 'Áreas',
    descripcion: 'Divisiones organizativas de la empresa',
    icono: '🏢',
    columnas: [
      { key: 'codigo', label: 'Código', tipo: 'text', auto: 'fromNombre', readonly: true },
      { key: 'nombre', label: 'Nombre', tipo: 'text', required: true },
      { key: 'orden', label: 'Orden', tipo: 'int' },
      { key: 'activo', label: 'Activo', tipo: 'boolean' },
    ],
    mostrarEnLista: ['nombre','activo'],
  },
  {
    codigo: 'cargos',
    tabla: 'cargos',
    label: 'Cargos',
    descripcion: 'Puestos laborales. Afecta nómina y organigrama. NO confundir con roles de sistema.',
    icono: '👔',
    columnas: [
      { key: 'codigo', label: 'Código', tipo: 'text', auto: 'fromNombre', readonly: true },
      { key: 'nombre', label: 'Nombre', tipo: 'text', required: true },
      { key: 'id_area_default', label: 'Área default', tipo: 'fk', fkTabla: 'areas', fkLabel: 'nombre' },
      { key: 'salario_sugerido', label: 'Salario sugerido (S/)', tipo: 'numeric' },
      { key: 'id_cuenta_contable_sueldo', label: 'Cuenta de sueldo', tipo: 'fk', fkTabla: 'plan_cuentas', fkLabel: 'nombre' },
      { key: 'orden', label: 'Orden', tipo: 'int' },
      { key: 'activo', label: 'Activo', tipo: 'boolean' },
    ],
    mostrarEnLista: ['nombre','id_area_default','salario_sugerido','activo'],
  },
  {
    codigo: 'motivos_merma',
    tabla: 'motivos_merma',
    label: 'Motivos de merma',
    descripcion: 'Causas para registrar pérdidas de inventario',
    icono: '📉',
    columnas: [
      { key: 'codigo', label: 'Código', tipo: 'text', auto: 'fromNombre', readonly: true },
      { key: 'nombre', label: 'Nombre', tipo: 'text', required: true },
      { key: 'orden', label: 'Orden', tipo: 'int' },
      { key: 'activo', label: 'Activo', tipo: 'boolean' },
    ],
    mostrarEnLista: ['nombre','activo'],
  },
  {
    codigo: 'motivos_ajuste',
    tabla: 'motivos_ajuste',
    label: 'Motivos de ajuste',
    descripcion: 'Causas para ajustes manuales de cuentas o inventario',
    icono: '⚖️',
    columnas: [
      { key: 'codigo', label: 'Código', tipo: 'text', auto: 'fromNombre', readonly: true },
      { key: 'nombre', label: 'Nombre', tipo: 'text', required: true },
      { key: 'orden', label: 'Orden', tipo: 'int' },
      { key: 'activo', label: 'Activo', tipo: 'boolean' },
    ],
    mostrarEnLista: ['nombre','activo'],
  },
  {
    codigo: 'motivos_devolucion',
    tabla: 'motivos_devolucion',
    label: 'Motivos de devolución',
    descripcion: 'Razones por las que un cliente devuelve un producto',
    icono: '↩️',
    columnas: [
      { key: 'codigo', label: 'Código', tipo: 'text', auto: 'fromNombre', readonly: true },
      { key: 'nombre', label: 'Nombre', tipo: 'text', required: true },
      { key: 'orden', label: 'Orden', tipo: 'int' },
      { key: 'activo', label: 'Activo', tipo: 'boolean' },
    ],
    mostrarEnLista: ['nombre','activo'],
  },
  {
    codigo: 'condiciones_pago',
    tabla: 'condiciones_pago',
    label: 'Condiciones de pago',
    descripcion: 'Plazos de crédito ofrecidos o recibidos',
    icono: '📆',
    columnas: [
      { key: 'codigo', label: 'Código', tipo: 'text', auto: 'fromNombre', readonly: true },
      { key: 'nombre', label: 'Nombre', tipo: 'text', required: true },
      { key: 'dias_credito', label: 'Días de crédito', tipo: 'int', required: true },
      { key: 'orden', label: 'Orden', tipo: 'int' },
      { key: 'activo', label: 'Activo', tipo: 'boolean' },
    ],
    mostrarEnLista: ['nombre','dias_credito','activo'],
  },
]

export function getCatalogoByCodigo(codigo) {
  return CATALOGOS.find(c => c.codigo === codigo)
}
```

---

## 2. `CatalogosDelSistema.jsx`

```jsx
import { useState } from 'react'
import ListaCatalogos from './ListaCatalogos'
import DetalleCatalogo from './DetalleCatalogo'
import { CATALOGOS } from './definiciones'

export default function CatalogosDelSistema() {
  const [seleccionado, setSeleccionado] = useState(CATALOGOS[0].codigo)

  return (
    <div className="catalogos-page">
      <header className="page-header">
        <h2>🗂️ Catálogos del sistema</h2>
      </header>
      <div className="catalogos-split">
        <ListaCatalogos
          catalogos={CATALOGOS}
          seleccionado={seleccionado}
          onSeleccionar={setSeleccionado}
        />
        <DetalleCatalogo key={seleccionado} codigo={seleccionado} />
      </div>
    </div>
  )
}
```

---

## 3. `ListaCatalogos.jsx`

```jsx
import { useState, useEffect } from 'react'
import { supabase } from '../../../../../api/supabase'

export default function ListaCatalogos({ catalogos, seleccionado, onSeleccionar }) {
  const [counts, setCounts] = useState({})

  useEffect(() => {
    Promise.all(
      catalogos.map(c =>
        supabase.from(c.tabla).select('*', { count: 'exact', head: true })
          .then(r => [c.codigo, r.count])
      )
    ).then(pares => setCounts(Object.fromEntries(pares)))
  }, [catalogos])

  return (
    <nav className="lista-catalogos">
      <div className="lista-header">Catálogos disponibles</div>
      {catalogos.map(c => (
        <button
          key={c.codigo}
          className={`item-catalogo ${seleccionado === c.codigo ? 'activo' : ''}`}
          onClick={() => onSeleccionar(c.codigo)}
        >
          <span className="icono">{c.icono}</span>
          <span className="label">{c.label}</span>
          <span className="count">({counts[c.codigo] ?? '…'})</span>
        </button>
      ))}
    </nav>
  )
}
```

---

## 4. `DetalleCatalogo.jsx`

```jsx
import { useState, useEffect } from 'react'
import { supabase } from '../../../../../api/supabase'
import { getCatalogoByCodigo } from './definiciones'
import FormularioCatalogoItem from './FormularioCatalogoItem'

export default function DetalleCatalogo({ codigo }) {
  const catalogo = getCatalogoByCodigo(codigo)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [editando, setEditando] = useState(null)
  const [creando, setCreando] = useState(false)
  const [usos, setUsos] = useState({})

  async function cargar() {
    setLoading(true)
    const { data } = await supabase.from(catalogo.tabla).select('*').order('orden').order('nombre')
    setItems(data || [])
    // contar usos solo para cargos/areas (tienen FK clara). Extender si se requiere.
    if (codigo === 'cargos') {
      const { data: usos } = await supabase.rpc('count_usos_cargo')
        .then(r => r).catch(() => ({ data: null }))
      // Fallback: query directa
      const { data: rows } = await supabase
        .from('personas_tienda').select('id_cargo').not('id_cargo', 'is', null)
      const map = {}
      for (const r of (rows || [])) map[r.id_cargo] = (map[r.id_cargo] || 0) + 1
      setUsos(map)
    }
    setLoading(false)
  }

  useEffect(() => { cargar() }, [codigo])

  async function guardar(datos, esEdicion) {
    if (esEdicion) {
      await supabase.from(catalogo.tabla).update(datos).eq('id', datos.id)
    } else {
      await supabase.from(catalogo.tabla).insert(datos)
    }
    setEditando(null); setCreando(false); cargar()
  }

  async function desactivar(item) {
    if (!confirm(`¿Desactivar "${item.nombre}"?`)) return
    await supabase.from(catalogo.tabla).update({ activo: false }).eq('id', item.id)
    cargar()
  }

  return (
    <section className="detalle-catalogo">
      <header>
        <div>
          <h3>{catalogo.icono} {catalogo.label.toUpperCase()}</h3>
          <p className="desc">{catalogo.descripcion}</p>
        </div>
        <button className="btn-primary" onClick={() => setCreando(true)}>+ Nuevo</button>
      </header>

      {loading ? <Spinner /> : (
        <ul className="lista-items">
          {items.map(it => (
            <li key={it.id} className={it.activo ? '' : 'inactivo'}>
              <div className="item-head">
                <span className="nombre">{it.nombre}</span>
                {usos[it.id] === 0 && <span className="warn">⚠ Sin uso</span>}
                {usos[it.id] > 0 && <span className="uso">En uso: {usos[it.id]}</span>}
              </div>
              <div className="item-fields">
                {catalogo.mostrarEnLista.map(col => (
                  <div key={col}><em>{col}:</em> {formatear(it[col], catalogo.columnas.find(c => c.key === col))}</div>
                ))}
              </div>
              <div className="item-actions">
                <button onClick={() => setEditando(it)}>Editar</button>
                {it.activo && <button onClick={() => desactivar(it)}>Desactivar</button>}
              </div>
            </li>
          ))}
        </ul>
      )}

      {(creando || editando) && (
        <FormularioCatalogoItem
          catalogo={catalogo}
          item={editando}
          onClose={() => { setCreando(false); setEditando(null) }}
          onSave={(datos) => guardar(datos, !!editando)}
        />
      )}
    </section>
  )
}

function formatear(valor, col) {
  if (col?.tipo === 'boolean') return valor ? '✓' : '—'
  if (col?.tipo === 'numeric') return valor != null ? `S/ ${valor}` : '—'
  return valor ?? '—'
}

function Spinner() { return <div className="spinner">…</div> }
```

---

## 5. `FormularioCatalogoItem.jsx`

```jsx
import { useState, useEffect } from 'react'
import { supabase } from '../../../../../api/supabase'

export default function FormularioCatalogoItem({ catalogo, item, onClose, onSave }) {
  const [form, setForm] = useState(() => {
    const inicial = {}
    for (const col of catalogo.columnas) {
      inicial[col.key] = item?.[col.key] ?? defaultValue(col)
    }
    return inicial
  })
  const [fkOptions, setFkOptions] = useState({})

  useEffect(() => {
    // Cargar opciones para columnas FK
    const fkCols = catalogo.columnas.filter(c => c.tipo === 'fk')
    Promise.all(fkCols.map(async c => {
      const { data } = await supabase.from(c.fkTabla).select(`id, ${c.fkLabel}`).order(c.fkLabel)
      return [c.key, data || []]
    })).then(pares => setFkOptions(Object.fromEntries(pares)))
  }, [])

  function set(k, v) {
    setForm(f => {
      const nuevo = { ...f, [k]: v }
      // auto-generar codigo si corresponde
      if (k === 'nombre') {
        const colCodigo = catalogo.columnas.find(c => c.key === 'codigo' && c.auto === 'fromNombre')
        if (colCodigo) nuevo.codigo = (v || '').toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
      }
      return nuevo
    })
  }

  function valido() {
    return catalogo.columnas.every(c => !c.required || (form[c.key] != null && form[c.key] !== ''))
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <header>
          <button onClick={onClose}>✕</button>
          <h3>{item ? `Editar ${catalogo.label.toLowerCase()}` : `Nuevo ${catalogo.label.toLowerCase()}`}</h3>
        </header>
        <div className="modal-body">
          {catalogo.columnas.map(col => (
            <FieldRenderer
              key={col.key}
              col={col}
              valor={form[col.key]}
              onChange={(v) => set(col.key, v)}
              fkOptions={fkOptions[col.key] || []}
              disabled={col.readonly || (item && col.key === 'codigo')}
            />
          ))}
        </div>
        <footer>
          <button onClick={onClose}>Cancelar</button>
          <button className="btn-primary" disabled={!valido()} onClick={() => onSave(form)}>
            {item ? 'Guardar' : 'Crear'}
          </button>
        </footer>
      </div>
    </div>
  )
}

function FieldRenderer({ col, valor, onChange, fkOptions, disabled }) {
  switch (col.tipo) {
    case 'text':
      return <label>{col.label} {col.required && <span>*</span>}
        <input value={valor ?? ''} onChange={e => onChange(e.target.value)} disabled={disabled} />
      </label>
    case 'int':
    case 'numeric':
      return <label>{col.label}
        <input type="number" step={col.tipo === 'numeric' ? '0.01' : '1'}
          value={valor ?? ''} onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
          disabled={disabled} />
      </label>
    case 'boolean':
      return <label><input type="checkbox" checked={!!valor} onChange={e => onChange(e.target.checked)} /> {col.label}</label>
    case 'select':
      return <label>{col.label} {col.required && <span>*</span>}
        <select value={valor ?? ''} onChange={e => onChange(e.target.value)}>
          <option value="">—</option>
          {col.opciones.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>
    case 'fk':
      return <label>{col.label}
        <select value={valor ?? ''} onChange={e => onChange(e.target.value || null)}>
          <option value="">—</option>
          {fkOptions.map(o => <option key={o.id} value={o.id}>{o[col.fkLabel]}</option>)}
        </select>
      </label>
    default:
      return null
  }
}

function defaultValue(col) {
  if (col.tipo === 'boolean') return col.key === 'activo' ? true : false
  if (col.tipo === 'int' || col.tipo === 'numeric') return col.key === 'orden' ? 100 : null
  return ''
}
```

---

## 6. Eliminar `TabCatalogosAux.jsx`

Después de confirmar que la pantalla nueva funciona:

```bash
git rm sistema-calzado/src/views/gestion/views/admin/TabCatalogosAux.jsx
```

Y remover del `CatalogoAdmin.jsx` principal la pestaña correspondiente (si aún vive como composite).

---

## Criterio de aceptación

- [ ] `/gestion/config/catalogos` muestra master-detail con los 7 catálogos
- [ ] Click en un catálogo de la lista izquierda muestra sus ítems a la derecha
- [ ] Contador `(N)` por catálogo es correcto
- [ ] "+ Nuevo" abre formulario dinámico con los campos exactos del catálogo seleccionado
- [ ] Al escribir nombre, el `codigo` se genera automáticamente (readonly)
- [ ] FK (ej: cargo → area_default) muestra dropdown de opciones válidas
- [ ] Editar un ítem existente preserva el código original
- [ ] Desactivar mueve el ítem al estado inactivo (visible como tal, no eliminado)
- [ ] Para cargos: muestra "En uso: N" contando personas_tienda con id_cargo
- [ ] `TabCatalogosAux.jsx` eliminado
- [ ] Commit: `feat(fase2-05): catalogos del sistema UI unificada + elimina catalogos_auxiliares`
