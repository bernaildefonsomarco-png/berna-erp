import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import App from './App.jsx';
import './index.css';

const FinanzasGate = lazy(() => import('./views/finanzas/FinanzasGate.jsx'));
const FinanzasLayout = lazy(() => import('./views/finanzas/FinanzasLayout.jsx'));
const ComandoGate   = lazy(() => import('./views/comando/ComandoGate.jsx'));
const ComandoLayout = lazy(() => import('./views/comando/ComandoLayout.jsx'));

const Spinner = () => (
  <div className="min-h-screen bg-white flex items-center justify-center">
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="animate-spin">
      <circle cx="12" cy="12" r="10" stroke="#e7e5e4" strokeWidth="3"/>
      <path d="M12 2a10 10 0 0110 10" stroke="#1c1917" strokeWidth="3" strokeLinecap="round"/>
    </svg>
  </div>
);

function FinanzasRoot() {
  return (
    <Suspense fallback={<Spinner />}>
      <FinanzasGate>
        {({ usuario, logout }) => (
          <FinanzasLayout usuario={usuario} logout={logout} />
        )}
      </FinanzasGate>
    </Suspense>
  );
}

function ComandoRoot() {
  return (
    <Suspense fallback={<Spinner />}>
      <ComandoGate>
        {({ usuario, logout }) => (
          <ComandoLayout usuario={usuario} logout={logout} />
        )}
      </ComandoGate>
    </Suspense>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/finanzas/*" element={<FinanzasRoot />} />
        <Route path="/rapido/*"   element={<Navigate to="/comando" replace />} />
        <Route path="/comando/*"  element={<ComandoRoot />} />
        <Route path="/*"          element={<App />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
