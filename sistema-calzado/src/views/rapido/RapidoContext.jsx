import React, { createContext, useContext, useState, useCallback } from 'react';
import { listarCuentasRapido } from './api/rapidoClient';

const RapidoContext = createContext(null);

export function RapidoProvider({ usuario, logout, children }) {
  const [cuentas, setCuentas] = useState([]);
  const [cuentasCargadas, setCuentasCargadas] = useState(false);

  const refrescarCuentas = useCallback(async () => {
    try {
      const data = await listarCuentasRapido();
      setCuentas(data);
      setCuentasCargadas(true);
    } catch (e) {
      console.error('Error al cargar cuentas:', e);
    }
  }, []);

  return (
    <RapidoContext.Provider value={{ usuario, logout, cuentas, cuentasCargadas, refrescarCuentas }}>
      {children}
    </RapidoContext.Provider>
  );
}

export function useRapido() {
  const ctx = useContext(RapidoContext);
  if (!ctx) throw new Error('useRapido debe usarse dentro de RapidoProvider');
  return ctx;
}
