// src/views/finanzas/components/BannerCierrePendiente.jsx
// Banner amber que aparece cuando hay períodos del pasado sin cerrar.
// Se muestra solo a admins con puedeCerrar. Dismissable por mes.
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { obtenerPeriodosPendientes } from '../api/cierresClient';
import { puedeCerrar } from '../lib/permisos';

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DISMISS_KEY = 'berna.cierre.dismissed';

export default function BannerCierrePendiente({ usuario }) {
  const [pendientes, setPendientes] = useState([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!puedeCerrar(usuario)) return;

    const mesActual = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const dismissedMes = localStorage.getItem(DISMISS_KEY);
    if (dismissedMes === mesActual) {
      setDismissed(true);
      return;
    }

    obtenerPeriodosPendientes()
      .then(setPendientes)
      .catch(() => {});
  }, [usuario]);

  const handleDismiss = () => {
    const mesActual = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    localStorage.setItem(DISMISS_KEY, mesActual);
    setDismissed(true);
  };

  if (dismissed || !puedeCerrar(usuario) || pendientes.length === 0) return null;

  const primero = pendientes[0];
  const etiqueta = `${MESES[primero.month - 1]} ${primero.year}`;
  const extra = pendientes.length > 1 ? ` y ${pendientes.length - 1} más` : '';

  return (
    <div className="mx-4 md:mx-8 mb-4 flex items-center justify-between gap-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
      <p className="text-sm text-amber-800">
        <span className="font-medium">
          ⚠ {pendientes.length} período{pendientes.length > 1 ? 's' : ''} pendiente{pendientes.length > 1 ? 's' : ''} de cierre:
        </span>{' '}
        {etiqueta}{extra}
      </p>
      <div className="flex shrink-0 items-center gap-2">
        <Link
          to={`/finanzas/cierres/${primero.year}/${primero.month}`}
          className="rounded-md bg-amber-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-800 transition-colors"
        >
          Ver y cerrar →
        </Link>
        <button
          onClick={handleDismiss}
          className="text-amber-600 hover:text-amber-800 text-lg leading-none"
          aria-label="Descartar por este mes"
        >
          ×
        </button>
      </div>
    </div>
  );
}
