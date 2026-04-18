import React, { useEffect } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { ComandoProvider, useComando } from './ComandoContext';
import Home from './views/Home';
import RegistrarGasto from './views/RegistrarGasto';
import RegistrarPagoDeuda from './views/RegistrarPagoDeuda';
import Transferir from './views/Transferir';
import VerCuentas from './views/VerCuentas';
import Obligaciones from './views/Obligaciones';

function Header() {
  const { usuario, logout } = useComando();
  const navigate = useNavigate();

  return (
    <header className="fixed top-0 left-0 right-0 h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 z-10">
      <button
        onClick={() => navigate('/comando')}
        className="text-base font-bold text-[#0a0a0a]"
      >
        Modo Comando
      </button>
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-500">{usuario?.nombre}</span>
        <button
          onClick={logout}
          className="text-sm font-medium text-red-600 hover:text-red-800"
        >
          Salir
        </button>
      </div>
    </header>
  );
}

function AppShell() {
  const { refrescarCuentas, cuentasCargadas } = useComando();

  useEffect(() => {
    if (!cuentasCargadas) refrescarCuentas();
  }, [cuentasCargadas, refrescarCuentas]);

  return (
    <div className="min-h-screen bg-white">
      <Header />
      <main className="pt-14 px-4 pb-8 max-w-lg mx-auto">
        <Routes>
          <Route index element={<Home />} />
          <Route path="gasto"        element={<RegistrarGasto />} />
          <Route path="pago-deuda"   element={<RegistrarPagoDeuda />} />
          <Route path="transferir"   element={<Transferir />} />
          <Route path="cuentas"      element={<VerCuentas />} />
          <Route path="obligaciones" element={<Obligaciones />} />
        </Routes>
      </main>
    </div>
  );
}

export default function ComandoLayout({ usuario, logout }) {
  return (
    <ComandoProvider usuario={usuario} logout={logout}>
      <AppShell />
    </ComandoProvider>
  );
}
