import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { CHART_COLORS } from './colors';

const fmtPEN = (v) =>
  'S/ ' + Number(v).toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

/**
 * Gráfico de barras apiladas: ingresos vs egresos.
 *
 * Props:
 *   data     — array con campos { periodo_mes|fecha, ingresos, egresos }
 *   xKey     — 'periodo_mes' (default) | 'fecha'
 *   height   — number (default 280)
 */
export default function BarChartFlujo({ data = [], xKey = 'periodo_mes', height = 280 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.borde} vertical={false} />
        <XAxis
          dataKey={xKey}
          tick={{ fill: CHART_COLORS.neutro, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: CHART_COLORS.neutro, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `S/${(v / 1000).toFixed(0)}k`}
          width={48}
        />
        <Tooltip
          contentStyle={{
            background: '#ffffff',
            border: `1px solid ${CHART_COLORS.borde}`,
            borderRadius: 8,
            fontSize: 12,
          }}
          formatter={(v, name) => [fmtPEN(v), name === 'ingresos' ? 'Ingresos' : 'Egresos']}
        />
        <Legend
          wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
          formatter={(v) => (v === 'ingresos' ? 'Ingresos' : 'Egresos')}
        />
        <Bar dataKey="ingresos" fill={CHART_COLORS.ingreso} radius={[4, 4, 0, 0]} maxBarSize={32} />
        <Bar dataKey="egresos"  fill={CHART_COLORS.egreso}  radius={[4, 4, 0, 0]} maxBarSize={32} />
      </BarChart>
    </ResponsiveContainer>
  );
}
