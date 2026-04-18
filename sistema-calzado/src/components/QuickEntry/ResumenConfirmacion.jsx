// src/components/QuickEntry/ResumenConfirmacion.jsx
export default function ResumenConfirmacion({
  tipo,
  valores,
  idCuentaContable,
  idCuentaFinanciera,
  splits,
  ubicaciones,
  cuentasFinancieras,
  onConfirmar,
  onAtras,
  enviando,
}) {
  const ubic = ubicaciones.find((u) => u.id_ubicacion === valores.id_ubicacion);
  const caja = cuentasFinancieras.find((c) => c.id_cuenta === idCuentaFinanciera);

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold">Confirmar registro</h3>
      <dl className="divide-y rounded-md border">
        <Row k="Tipo" v={`${tipo.emoji || ''} ${tipo.nombre}`} />
        <Row k="Monto" v={`S/ ${Number(valores.monto || 0).toFixed(2)}`} />
        {ubic && <Row k="Ubicación" v={`${ubic.nombre} (${ubic.rol})`} />}
        {caja && <Row k="Cuenta financiera" v={caja.nombre} />}
        <Row k="Cuenta contable" v={idCuentaContable ? `#${idCuentaContable}` : '⚠ no resuelta'} />
        {splits?.length > 0 && (
          <Row k="Splits" v={`${splits.length} fila${splits.length > 1 ? 's' : ''}`} />
        )}
        {valores.concepto && <Row k="Concepto" v={valores.concepto} />}
      </dl>
      <div className="flex justify-end gap-2 pt-2">
        <button onClick={onAtras} disabled={enviando} className="rounded-md border px-3 py-2">
          Atrás
        </button>
        <button
          onClick={onConfirmar}
          disabled={enviando || !idCuentaContable}
          className="rounded-md bg-stone-900 px-4 py-2 text-white disabled:opacity-50"
        >
          {enviando ? 'Registrando…' : 'Registrar'}
        </button>
      </div>
    </div>
  );
}

function Row({ k, v }) {
  return (
    <div className="flex justify-between px-3 py-2 text-sm">
      <span className="text-stone-500">{k}</span>
      <span className="font-medium">{v}</span>
    </div>
  );
}
