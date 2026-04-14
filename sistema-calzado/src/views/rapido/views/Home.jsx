import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useRapido } from '../RapidoContext';

const ACCIONES = [
  {
    to: '/rapido/gasto',
    emoji: '💸',
    titulo: 'Registrar gasto',
    subtitulo: 'Pagué algo con efectivo o banco',
    color: 'border-red-100 hover:border-red-300',
  },
  {
    to: '/rapido/pago-deuda',
    emoji: '🏦',
    titulo: 'Pagar deuda',
    subtitulo: 'Abono a un préstamo o cuota',
    color: 'border-orange-100 hover:border-orange-300',
  },
  {
    to: '/rapido/transferir',
    emoji: '↔️',
    titulo: 'Mover dinero',
    subtitulo: 'Transferencia entre cuentas',
    color: 'border-blue-100 hover:border-blue-300',
  },
  {
    to: '/rapido/cuentas',
    emoji: '💰',
    titulo: 'Ver saldos',
    subtitulo: 'Cuánto hay en cada cuenta ahora',
    color: 'border-green-100 hover:border-green-300',
  },
  {
    to: '/rapido/obligaciones',
    emoji: '📅',
    titulo: 'Qué pagar pronto',
    subtitulo: 'Vencimientos en los próximos 30 días',
    color: 'border-yellow-100 hover:border-yellow-300',
  },
];

export default function Home() {
  const navigate = useNavigate();
  const { usuario } = useRapido();

  return (
    <div className="pt-6">
      <p className="text-gray-400 text-base mb-1">Hola, {usuario?.nombre?.split(' ')[0]}</p>
      <h1 className="text-3xl font-bold text-[#0a0a0a] mb-8">¿Qué necesitas hacer?</h1>

      <div className="space-y-3">
        {ACCIONES.map(a => (
          <button
            key={a.to}
            onClick={() => navigate(a.to)}
            className={`w-full flex items-center gap-4 p-5 rounded-2xl border-2 bg-white transition-all active:scale-[0.98] text-left ${a.color}`}
          >
            <span className="text-4xl leading-none">{a.emoji}</span>
            <div>
              <p className="text-xl font-bold text-[#0a0a0a]">{a.titulo}</p>
              <p className="text-sm text-gray-500 mt-0.5">{a.subtitulo}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
