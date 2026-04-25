import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
  Input,
  Label,
  Separator,
} from '../../components/shadcn';
import { Spinner } from '../../components/UI';
import { getTipoById, updateTipoMovimiento, macroAFlujo, fetchCuentaById } from './tiposMovimientoClient';
import ArbolPlanCuentas from './WizardCrearTipo/ArbolPlanCuentas';

const CATEGORIAS = [
  { value: 'ingreso', label: 'Entra dinero' },
  { value: 'gasto_operativo', label: 'Gasto operativo' },
  { value: 'pago_personas', label: 'Pago a personas' },
  { value: 'inversion', label: 'Inversión' },
  { value: 'traslado', label: 'Traslado / entre cuentas' },
  { value: 'pago_deuda', label: 'Pago deuda / financiero' },
  { value: 'compra_material', label: 'Compra de material' },
];

const emptyForm = {
  codigo: '',
  nombre: '',
  emoji: '',
  categoria: 'gasto_operativo',
  tipo_flujo: 'egreso',
  direccion: 'salida',
  requiere_nota: false,
  activo: true,
  orden: 99,
  id_cuenta_contable_default: null,
  scope: ['manual'],
  solo_admin: false,
  naturaleza: '',
};

export default function EditarTipoModal({ idTipo, onClose, onGuardado }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [cuentaLabel, setCuentaLabel] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [mostrarArbol, setMostrarArbol] = useState(false);
  const [editarCodigo, setEditarCodigo] = useState(false);

  const load = useCallback(async () => {
    if (idTipo == null) return;
    setLoading(true);
    setErr('');
    try {
      const row = await getTipoById(idTipo);
      setForm({
        codigo: row.codigo || '',
        nombre: row.nombre || '',
        emoji: row.emoji || '',
        categoria: row.categoria || 'gasto_operativo',
        tipo_flujo: row.tipo_flujo || 'egreso',
        direccion: row.direccion || 'salida',
        requiere_nota: !!row.requiere_nota,
        activo: row.activo !== false,
        orden: row.orden ?? 99,
        id_cuenta_contable_default: row.id_cuenta_contable_default,
        scope: Array.isArray(row.scope) && row.scope.length ? row.scope : ['manual'],
        solo_admin: !!row.solo_admin,
        naturaleza: row.naturaleza || '',
      });
      if (row.id_cuenta_contable_default) {
        const c = await fetchCuentaById(row.id_cuenta_contable_default);
        setCuentaLabel(c ? `${c.codigo} — ${c.nombre}` : '');
      } else {
        setCuentaLabel('');
      }
    } catch (e) {
      setErr(e?.message || 'Error al cargar');
    } finally {
      setLoading(false);
    }
  }, [idTipo]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (form.id_cuenta_contable_default) {
      fetchCuentaById(form.id_cuenta_contable_default).then((c) => {
        if (c) setCuentaLabel(`${c.codigo} — ${c.nombre}`);
      });
    } else {
      setCuentaLabel('');
    }
  }, [form.id_cuenta_contable_default]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const alinearFlujo = () => {
    const { direccion, tipo_flujo } = macroAFlujo(form.categoria);
    set({ direccion, tipo_flujo });
  };

  const scopeStr = (form.scope || []).join(', ');

  const onScopeInput = (s) => {
    const arr = s.split(',').map((x) => x.trim()).filter(Boolean);
    set({ scope: arr.length ? arr : ['manual'] });
  };

  const guardar = async () => {
    if (!form.nombre?.trim() || !form.codigo?.trim()) {
      setErr('Nombre y código son obligatorios.');
      return;
    }
    if (form.id_cuenta_contable_default == null) {
      setErr('Selecciona una cuenta contable por defecto.');
      return;
    }
    setSaving(true);
    setErr('');
    try {
      await updateTipoMovimiento(idTipo, {
        ...form,
        emoji: form.emoji?.trim() || null,
        naturaleza: form.naturaleza?.trim() || null,
      });
      onGuardado?.();
      onClose();
    } catch (e) {
      setErr(e?.message || 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={idTipo != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[min(90vh,720px)] max-w-lg overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar tipo de movimiento</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner size={24} />
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            {err && <p className="rounded border border-red-200 bg-red-50 p-2 text-red-800">{err}</p>}

            <div>
              <Label className="text-stone-600">Nombre *</Label>
              <Input className="mt-1" value={form.nombre} onChange={(e) => set({ nombre: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-stone-600">Emoji</Label>
                <Input className="mt-1" value={form.emoji} maxLength={4} onChange={(e) => set({ emoji: e.target.value })} />
              </div>
              <div>
                <Label className="text-stone-600">Código *</Label>
                <div className="mt-1 flex gap-1">
                  <Input
                    className="font-mono text-xs"
                    value={form.codigo}
                    readOnly={!editarCodigo}
                    onChange={(e) => set({ codigo: e.target.value })}
                  />
                  <Button type="button" variant="outline" size="sm" onClick={() => setEditarCodigo((v) => !v)} title="Cambiar código puede afectar integraciones">
                    {editarCodigo ? '🔒' : '✎'}
                  </Button>
                </div>
              </div>
            </div>

            <div>
              <Label className="text-stone-600">Categoría (macro)</Label>
              <select
                className="mt-1 flex h-9 w-full rounded-md border border-stone-300 bg-white px-2 text-sm"
                value={form.categoria}
                onChange={(e) => set({ categoria: e.target.value })}
              >
                {!CATEGORIAS.some((c) => c.value === form.categoria) && form.categoria && (
                  <option value={form.categoria}>{form.categoria} (actual)</option>
                )}
                {CATEGORIAS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              <Button type="button" variant="ghost" className="mt-1 h-auto p-0 text-xs text-indigo-600" onClick={alinearFlujo}>
                Alinear dirección y flujo según esta categoría
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-stone-600">Tipo de flujo (contable)</Label>
                <select
                  className="mt-1 flex h-9 w-full rounded-md border border-stone-300 bg-white px-2 text-sm"
                  value={form.tipo_flujo}
                  onChange={(e) => set({ tipo_flujo: e.target.value })}
                >
                  <option value="ingreso">ingreso</option>
                  <option value="egreso">egreso</option>
                  <option value="ambos">ambos</option>
                </select>
              </div>
              <div>
                <Label className="text-stone-600">Dirección</Label>
                <select
                  className="mt-1 flex h-9 w-full rounded-md border border-stone-300 bg-white px-2 text-sm"
                  value={form.direccion || ''}
                  onChange={(e) => set({ direccion: e.target.value || null })}
                >
                  <option value="entrada">entrada</option>
                  <option value="salida">salida</option>
                  <option value="transferencia">transferencia</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-stone-600">Orden</Label>
                <Input
                  type="number"
                  className="mt-1"
                  value={form.orden}
                  onChange={(e) => set({ orden: Number(e.target.value) || 0 })}
                />
              </div>
              <div className="flex flex-col justify-end gap-1">
                <label className="flex items-center gap-2 text-stone-700">
                  <input type="checkbox" checked={form.activo} onChange={(e) => set({ activo: e.target.checked })} />
                  Activo
                </label>
                <label className="flex items-center gap-2 text-stone-700">
                  <input type="checkbox" checked={form.solo_admin} onChange={(e) => set({ solo_admin: e.target.checked })} />
                  Solo administradores
                </label>
                <label className="flex items-center gap-2 text-stone-700">
                  <input type="checkbox" checked={form.requiere_nota} onChange={(e) => set({ requiere_nota: e.target.checked })} />
                  Requiere nota
                </label>
              </div>
            </div>

            <div>
              <Label className="text-stone-600">Scope (coma: manual, pos, …)</Label>
              <Input className="mt-1 font-mono text-xs" value={scopeStr} onChange={(e) => onScopeInput(e.target.value)} />
            </div>

            <div>
              <Label className="text-stone-600">Naturaleza (opcional)</Label>
              <Input
                className="mt-1"
                value={form.naturaleza}
                onChange={(e) => set({ naturaleza: e.target.value })}
                placeholder="operativo, extraordinario…"
              />
            </div>

            <Separator />

            <div>
              <Label className="text-stone-600">Cuenta contable por defecto *</Label>
              {cuentaLabel && !mostrarArbol && (
                <p className="mt-1 font-mono text-xs text-stone-700">{cuentaLabel}</p>
              )}
              <Button type="button" variant="outline" size="sm" className="mt-1" onClick={() => setMostrarArbol((v) => !v)}>
                {mostrarArbol ? 'Ocultar árbol' : 'Cambiar cuenta'}
              </Button>
              {mostrarArbol && (
                <div className="mt-2">
                  <ArbolPlanCuentas
                    selectedId={form.id_cuenta_contable_default}
                    onSelect={(id) => {
                      set({ id_cuenta_contable_default: id });
                      setMostrarArbol(false);
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="button" onClick={guardar} disabled={loading || saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
