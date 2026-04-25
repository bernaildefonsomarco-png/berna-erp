import React, { useState, useEffect } from 'react';
import {
  obtenerConfiguracionClaves, guardarConfiguracionClave,
  listarCuentas,
} from '../api/finanzasClient';
import { esAdmin, RECURSOS } from '../lib/permisos';
import {
  Card, Button, Field, EmptyState, LoadingState, PageHeader, Icon, ICONS, Spinner,
} from '../components/UI';

const CLAVES = ['finanzas_reglas_ritual', 'finanzas_cuentas_liquidez_lunes'];

export default function AjustesFinanzas({ usuario }) {
  const [cuentas, setCuentas] = useState([]);
  const [ritual, setRitual] = useState('');
  const [idsLiquidez, setIdsLiquidez] = useState([]);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState('');

  const esAdministrador = esAdmin(usuario, RECURSOS.FINANZAS);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [cs, cfg] = await Promise.all([
          listarCuentas({ incluirInactivas: false }),
          obtenerConfiguracionClaves(CLAVES),
        ]);
        setCuentas(cs);
        setRitual(cfg.finanzas_reglas_ritual || '');
        let arr = [];
        try {
          arr = JSON.parse(cfg.finanzas_cuentas_liquidez_lunes || '[]');
          if (!Array.isArray(arr)) arr = [];
        } catch { arr = []; }
        setIdsLiquidez(arr.map(Number).filter(n => !Number.isNaN(n)));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const toggleCuentaLiquidez = (id) => {
    setIdsLiquidez(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const guardar = async () => {
    setGuardando(true);
    setMsg('');
    try {
      await guardarConfiguracionClave('finanzas_reglas_ritual', ritual);
      await guardarConfiguracionClave('finanzas_cuentas_liquidez_lunes', JSON.stringify(idsLiquidez));
      setMsg('Cambios guardados.');
    } catch (e) {
      setMsg(e.message || 'Error al guardar');
    } finally {
      setGuardando(false);
    }
  };

  if (loading) return <LoadingState message="Cargando ajustes..." />;

  if (!esAdministrador) {
    return (
      <>
        <PageHeader title="Ajustes del negocio" description="Parámetros editables" />
        <Card>
          <EmptyState
            icon={ICONS.shield}
            title="Sin acceso"
            description="Solo administradores de Finanzas pueden editar estos parámetros."
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Ajustes del negocio"
        description="Textos operativos y cuentas que cuentan para la liquidez del lunes (Dashboard). Los cambios aplican de inmediato en la app."
      />

      <Card padding="md" className="mb-4">
        <h2 className="text-[15px] text-foreground mb-2" style={{ fontWeight: 600 }}>Ritual y reglas (texto libre)</h2>
        <p className="text-xs text-muted-foreground mb-3">
          Copia o resume lo acordado en familia (quién cierra caja, cómo se entrega efectivo, etc.). También existe la plantilla en{' '}
          <code className="text-[11px] bg-muted px-1 rounded">docs/finanzas-catalogo-y-ritual.md</code>.
        </p>
        <Field label="Contenido visible para el equipo (opcional)">
          <textarea
            className="w-full min-h-[140px] rounded-lg border border-border p-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-[#1c1917]"
            value={ritual}
            onChange={e => setRitual(e.target.value)}
            placeholder="Ej.: Los lunes papá junta efectivo de CAJA_PROD + BCP antes del pedido..."
          />
        </Field>
      </Card>

      <Card padding="md" className="mb-4">
        <h2 className="text-[15px] text-foreground mb-2" style={{ fontWeight: 600 }}>Cuentas para “liquidez lunes”</h2>
        <p className="text-xs text-muted-foreground mb-3">
          Marca las cuentas financieras cuyo saldo debe sumarse en el widget del Dashboard (capital disponible para compra de materiales).
        </p>
        <div className="max-h-56 overflow-y-auto border border-border rounded-lg divide-y divide-[#f5f5f4]">
          {cuentas.map(c => (
            <label key={c.id_cuenta} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/30">
              <input
                type="checkbox"
                checked={idsLiquidez.includes(c.id_cuenta)}
                onChange={() => toggleCuentaLiquidez(c.id_cuenta)}
              />
              <span className="text-sm text-foreground flex-1" style={{ fontWeight: 500 }}>{c.nombre}</span>
              <span className="text-xs text-muted-foreground">{c.codigo}</span>
            </label>
          ))}
        </div>
      </Card>

      {msg && (
        <p className={`text-sm mb-3 ${msg.includes('Error') ? 'text-destructive' : 'text-[#059669]'}`}>{msg}</p>
      )}

      <Button variant="primary" onClick={guardar} disabled={guardando}>
        {guardando ? <><Spinner size={14} /> Guardando…</> : 'Guardar ajustes'}
      </Button>
    </>
  );
}
