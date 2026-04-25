import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import App from './App.jsx';
import './index.css';

const GestionGate = lazy(() => import('./views/gestion/GestionGate.jsx'));
const GestionLayout = lazy(() => import('./views/gestion/GestionLayout.jsx'));
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

function LegacyFinanzasToGestion() {
  const loc = useLocation();
  const to = `${loc.pathname.replace(/^\/finanzas(?=\/|$)/, '/gestion')}${loc.search}${loc.hash}`;
  return <Navigate to={to} replace />;
}

function GestionRoot() {
  return (
    <Suspense fallback={<Spinner />}>
      <GestionGate>
        {({ usuario, logout }) => (
          <GestionLayout usuario={usuario} logout={logout} />
        )}
      </GestionGate>
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
        <Route path="/finanzas/*" element={<LegacyFinanzasToGestion />} />
        <Route path="/gestion/*" element={<GestionRoot />} />
        <Route path="/rapido/*"   element={<Navigate to="/comando" replace />} />
        <Route path="/comando/*"  element={<ComandoRoot />} />
        <Route path="/*"          element={<App />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
