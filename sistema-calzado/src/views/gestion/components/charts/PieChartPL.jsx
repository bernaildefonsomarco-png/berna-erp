import React from 'react';
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { CHART_COLORS } from './colors';

const fmtPEN = (v) =>
  'S/ ' + Number(v).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const LABEL_MAP = {
  ingresos:          'Ingresos',
  costo_ventas:      'Costo de ventas',
  gastos_operativos: 'Gastos operativos',
  gastos_financieros:'Gastos financieros',
  otros_egresos:     'Otros egresos',
};

/**
 * Pie chart de distribución del P&L.
 * Solo muestra secciones de egreso (costo_ventas, gastos_operativos, etc.)
 * para que los tamaños sean comparables.
 *
 * Props:
 *   data   — array de { seccion_pl, monto_total }
 *   height — number (default 260)
 */
export default function PieChartPL({ data = [], height = 260 }) {
  // Filtrar solo secciones de egreso con monto positivo
  const filtered = data.filter(
    (d) => d.seccion_pl !== 'ingresos' && Number(d.monto_total) > 0
  );

  if (filtered.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={filtered}
          dataKey="monto_total"
          nameKey="seccion_pl"
          cx="50%"
          cy="45%"
          outerRadius={90}
          innerRadius={48}
          paddingAngle={2}
        >
          {filtered.map((entry, i) => (
            <Cell
              key={entry.seccion_pl}
              fill={CHART_COLORS.PIE[i % CHART_COLORS.PIE.length]}
            />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            background: '#ffffff',
            border: `1px solid ${CHART_COLORS.borde}`,
            borderRadius: 8,
            fontSize: 12,
          }}
          formatter={(v, name) => [fmtPEN(v), LABEL_MAP[name] || name]}
        />
        <Legend
          wrapperStyle={{ fontSize: 12 }}
          formatter={(v) => LABEL_MAP[v] || v}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
