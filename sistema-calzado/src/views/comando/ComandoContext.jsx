import React, { createContext, useContext, useState, useCallback } from 'react';
import { listarCuentasComando } from './api/comandoClient';

const ComandoContext = createContext(null);

export function ComandoProvider({ usuario, logout, children }) {
  const [cuentas, setCuentas] = useState([]);
  const [cuentasCargadas, setCuentasCargadas] = useState(false);

  const refrescarCuentas = useCallback(async () => {
    try {
      const data = await listarCuentasComando();
      setCuentas(data);
      setCuentasCargadas(true);
    } catch (e) {
      console.error('Error al cargar cuentas:', e);
    }
  }, []);

  return (
    <ComandoContext.Provider value={{ usuario, logout, cuentas, cuentasCargadas, refrescarCuentas }}>
      {children}
    </ComandoContext.Provider>
  );
}

export function useComando() {
  const ctx = useContext(ComandoContext);
  if (!ctx) throw new Error('useComando debe usarse dentro de ComandoProvider');
  return ctx;
}
