# Plan Fase 3.07 — Producción: Asignación Multi-Trabajador por Lote

**Fecha**: 2026-04-24
**Depende de**: Plan 01 (migración 04: `lote_asignaciones`), Fase 2 (catálogos `cargos`, `areas`)
**Estima**: 1 día

---

## Objetivo

Agregar un modal en el detalle del lote (`ProduccionLotes.jsx`) para asignar trabajadores con su cargo y área. Una persona puede aparecer varias veces con cargos distintos. El mockup de referencia es §5.3 del spec maestro.

## Archivos

### Crear
- `sistema-calzado/src/components/ModalAsignarTrabajadores.jsx` — modal de asignación
- `sistema-calzado/src/api/loteAsignacionClient.js` — CRUD de `lote_asignaciones`

### Modificar
- `sistema-calzado/src/views/ProduccionLotes.jsx` — agregar botón "Asignar trabajadores" en detalle del lote

---

## 1. Cliente Supabase

```javascript
// src/api/loteAsignacionClient.js
import { supabase } from './supabase';

export async function listarAsignaciones(idLote) {
  const { data, error } = await supabase
    .from('lote_asignaciones')
    .select(`
      id_asignacion, id_persona, id_area, id_cargo, pares_asignados, notas, activa,
      personas_tienda(nombre),
      areas(nombre),
      cargos(nombre)
    `)
    .eq('id_lote', idLote)
    .eq('activa', true)
    .order('created_at');
  if (error) throw error;
  return data;
}

export async function agregarAsignacion({ idLote, idPersona, idArea, idCargo, paresAsignados, notas }) {
  const { data, error } = await supabase
    .from('lote_asignaciones')
    .insert({
      id_lote: idLote,
      id_persona: idPersona,
      id_area: idArea || null,
      id_cargo: idCargo || null,
      pares_asignados: paresAsignados || null,
      notas: notas || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function editarAsignacion(idAsignacion, cambios) {
  const { error } = await supabase
    .from('lote_asignaciones')
    .update(cambios)
    .eq('id_asignacion', idAsignacion);
  if (error) throw error;
}

export async function desactivarAsignacion(idAsignacion) {
  return editarAsignacion(idAsignacion, { activa: false });
}
```

## 2. Modal de asignación

```jsx
// src/components/ModalAsignarTrabajadores.jsx
import { useState, useEffect } from 'react';
import { listarAsignaciones, agregarAsignacion, desactivarAsignacion } from '../api/loteAsignacionClient';

export default function ModalAsignarTrabajadores({ lote, onClose }) {
  const [asignaciones, setAsignaciones] = useState([]);
  const [personas, setPersonas] = useState([]);
  const [areas, setAreas] = useState([]);
  const [cargos, setCargos] = useState([]);
  const [form, setForm] = useState({ idPersona: '', idArea: '', idCargo: '', pares: '', notas: '' });
  const [agregando, setAgregando] = useState(false);

  useEffect(() => {
    listarAsignaciones(lote.id_lote).then(setAsignaciones);
    // Cargar catálogos
    supabase.from('personas_tienda').select('id_persona, nombre').eq('activa', true).then(r => setPersonas(r.data || []));
    supabase.from('areas').select('id_area, nombre').eq('activo', true).order('orden').then(r => setAreas(r.data || []));
    supabase.from('cargos').select('id_cargo, nombre').eq('activo', true).order('orden').then(r => setCargos(r.data || []));
  }, [lote.id_lote]);

  async function handleAgregar() {
    await agregarAsignacion({
      idLote: lote.id_lote,
      idPersona: Number(form.idPersona),
      idArea: form.idArea ? Number(form.idArea) : null,
      idCargo: form.idCargo ? Number(form.idCargo) : null,
      paresAsignados: form.pares ? Number(form.pares) : null,
      notas: form.notas,
    });
    setForm({ idPersona: '', idArea: '', idCargo: '', pares: '', notas: '' });
    setAgregando(false);
    listarAsignaciones(lote.id_lote).then(setAsignaciones);
  }

  // Render: lista de asignaciones actuales + botón "+ Agregar trabajador" + formulario inline
  // (ver mockup §5.3 del spec maestro)
}
```

## 3. Integrar en ProduccionLotes

En la vista de detalle del lote, agregar botón:

```jsx
<button onClick={() => setModalAsignacion(true)}
  className="px-4 py-2 bg-stone-100 rounded-lg text-sm font-medium">
  👥 Asignar trabajadores ({numAsignaciones})
</button>

{modalAsignacion && (
  <ModalAsignarTrabajadores
    lote={loteSeleccionado}
    onClose={() => setModalAsignacion(false)}
  />
)}
```

---

## Criterios de aceptación

- [ ] Abrir detalle del lote → botón "Asignar trabajadores" visible.
- [ ] Agregar a Rosa como "Cortadora" de 48 pares → aparece en la lista.
- [ ] Agregar a Juan como "Armador" de 48 pares Y como "Pegador" de 24 pares del mismo lote → 2 filas.
- [ ] `pares_asignados` vacío → se guarda como `NULL` (participó en todo el lote).
- [ ] Desactivar una asignación → desaparece de la lista pero `activa=false` en DB (no DELETE).
- [ ] Cargo y Área se seleccionan de catálogos `cargos` y `areas` (Fase 2).
