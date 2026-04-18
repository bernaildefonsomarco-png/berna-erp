// src/views/finanzas/views/cierres/ReporteCierrePDF.jsx
// Reporte ejecutivo de cierre mensual — 5 páginas.
// Generado con @react-pdf/renderer (declarativo JSX, no usa CSS externo).
import {
  Document, Page, Text, View, StyleSheet,
} from '@react-pdf/renderer';

/* ── Estilos ─────────────────────────────────────────────────────────────── */
const C = {
  bg:      '#fafaf9',
  text:    '#1c1917',
  muted:   '#57534e',
  light:   '#a8a29e',
  border:  '#e7e5e4',
  primary: '#1c1917',
  green:   '#16a34a',
  red:     '#dc2626',
  amber:   '#d97706',
};

const s = StyleSheet.create({
  page:        { backgroundColor: C.bg, padding: 40, fontFamily: 'Helvetica', color: C.text },
  section:     { marginBottom: 16 },
  h1:          { fontSize: 22, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  h2:          { fontSize: 14, fontFamily: 'Helvetica-Bold', marginBottom: 8, color: C.text },
  h3:          { fontSize: 11, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  label:       { fontSize: 8, color: C.muted, marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  value:       { fontSize: 18, fontFamily: 'Helvetica-Bold' },
  body:        { fontSize: 9, color: C.text, lineHeight: 1.4 },
  muted:       { fontSize: 8, color: C.muted },
  row:         { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: C.border, paddingVertical: 5 },
  rowHeader:   { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.text, paddingBottom: 4, marginBottom: 2 },
  col1:        { flex: 3, fontSize: 9 },
  col2:        { flex: 1, fontSize: 9, textAlign: 'right' },
  col3:        { flex: 1, fontSize: 9, textAlign: 'right', color: C.muted },
  kpiGrid:     { flexDirection: 'row', gap: 12, marginBottom: 20 },
  kpiBox:      { flex: 1, backgroundColor: '#f5f5f4', borderRadius: 4, padding: 10 },
  divider:     { borderBottomWidth: 0.5, borderBottomColor: C.border, marginVertical: 12 },
  footer:      { position: 'absolute', bottom: 20, left: 40, right: 40 },
  footerText:  { fontSize: 7, color: C.light, textAlign: 'center' },
  badge:       { borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1, fontSize: 8 },
  badgeOk:     { backgroundColor: '#dcfce7', color: '#15803d' },
  badgeWarn:   { backgroundColor: '#fef9c3', color: '#854d0e' },
  badgeErr:    { backgroundColor: '#fee2e2', color: '#991b1b' },
  checkRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
});

/* ── Helpers ─────────────────────────────────────────────────────────────── */
const fmt = (n) => `S/ ${Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}`;
const pct = (n) => `${Number(n || 0).toFixed(1)}%`;
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const mesNombre = (m) => MESES[m - 1] || '';

function Footer({ hash, page }) {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>
        BERNA CALZADO — DOCUMENTO CONFIDENCIAL · Pág. {page} · SHA-256: {hash?.slice(0,16)}...
      </Text>
    </View>
  );
}

function KpiBox({ label, value, sub }) {
  return (
    <View style={s.kpiBox}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.value}>{value}</Text>
      {sub && <Text style={s.muted}>{sub}</Text>}
    </View>
  );
}

/* ── Páginas ─────────────────────────────────────────────────────────────── */

function PaginaPortada({ year, month, version, kpis, generadoEn, hash }) {
  return (
    <Page size="A4" style={s.page}>
      <View style={s.section}>
        <Text style={[s.h1, { fontSize: 28, marginBottom: 2 }]}>BERNA CALZADO</Text>
        <Text style={[s.muted, { fontSize: 10 }]}>Reporte de Cierre Mensual</Text>
      </View>

      <View style={s.divider} />

      <View style={[s.section, { marginBottom: 24 }]}>
        <Text style={[s.label, { fontSize: 10 }]}>{mesNombre(month).toUpperCase()} {year}</Text>
        <Text style={[s.h2, { fontSize: 20, marginBottom: 2 }]}>Versión v{version}</Text>
        <Text style={s.muted}>Generado: {new Date(generadoEn).toLocaleString('es-PE')}</Text>
      </View>

      <View style={s.kpiGrid}>
        <KpiBox label="Ingresos" value={fmt(kpis.ingresos)} />
        <KpiBox label="Egresos" value={fmt(kpis.egresos)} />
      </View>
      <View style={s.kpiGrid}>
        <KpiBox
          label="Utilidad Neta"
          value={fmt(kpis.utilidad_neta)}
          sub={`Margen: ${pct(kpis.margen_pct)}`}
        />
        <KpiBox
          label="Movimientos"
          value={String(kpis.n_movimientos || 0)}
          sub={`${kpis.n_ventas || 0} ventas`}
        />
      </View>

      <Footer hash={hash} page={1} />
    </Page>
  );
}

function PaginaPL({ plData, kpis, hash }) {
  return (
    <Page size="A4" style={s.page}>
      <Text style={s.h2}>Estado de Resultados</Text>
      <View style={s.rowHeader}>
        <Text style={s.col1}>Concepto</Text>
        <Text style={s.col2}>S/</Text>
        <Text style={s.col3}>% Ing.</Text>
      </View>
      {(plData || []).map((row, i) => (
        <View key={i} style={[s.row, row.es_seccion ? { backgroundColor: '#f5f5f4' } : {}]}>
          <Text style={[s.col1, row.es_seccion ? { fontFamily: 'Helvetica-Bold' } : { paddingLeft: 10 }]}>
            {row.nombre}
          </Text>
          <Text style={s.col2}>{fmt(row.total)}</Text>
          <Text style={s.col3}>{kpis.ingresos > 0 ? pct((row.total / kpis.ingresos) * 100) : '-'}</Text>
        </View>
      ))}
      <View style={[s.divider, { marginTop: 8 }]} />
      <View style={s.row}>
        <Text style={[s.col1, { fontFamily: 'Helvetica-Bold' }]}>UTILIDAD NETA</Text>
        <Text style={[s.col2, { fontFamily: 'Helvetica-Bold' }]}>{fmt(kpis.utilidad_neta)}</Text>
        <Text style={[s.col3, { fontFamily: 'Helvetica-Bold' }]}>{pct(kpis.margen_pct)}</Text>
      </View>
      <Footer hash={hash} page={2} />
    </Page>
  );
}

function PaginaFlujo({ flujoData, kpis, hash }) {
  const burnRate = kpis.egresos ? (kpis.egresos / 30).toFixed(2) : 0;
  return (
    <Page size="A4" style={s.page}>
      <Text style={s.h2}>Flujo de Caja</Text>
      <View style={s.kpiGrid}>
        <KpiBox label="Total Ingresado" value={fmt(kpis.ingresos)} />
        <KpiBox label="Total Egresado" value={fmt(kpis.egresos)} />
        <KpiBox label="Burn Rate Diario" value={fmt(burnRate)} />
      </View>
      <View style={s.rowHeader}>
        <Text style={s.col1}>Fecha</Text>
        <Text style={s.col2}>Ingresos</Text>
        <Text style={s.col2}>Egresos</Text>
        <Text style={s.col3}>Neto</Text>
      </View>
      {(flujoData || []).slice(0, 35).map((row, i) => (
        <View key={i} style={s.row}>
          <Text style={s.col1}>{row.fecha}</Text>
          <Text style={s.col2}>{fmt(row.total_ingresos)}</Text>
          <Text style={s.col2}>{fmt(row.total_egresos)}</Text>
          <Text style={[s.col3, { color: (row.neto >= 0 || (row.total_ingresos - row.total_egresos) >= 0) ? C.green : C.red }]}>
            {fmt(row.neto ?? (row.total_ingresos - row.total_egresos))}
          </Text>
        </View>
      ))}
      <Footer hash={hash} page={3} />
    </Page>
  );
}

function PaginaPatrimonio({ patrimonioData, kpis, hash }) {
  return (
    <Page size="A4" style={s.page}>
      <Text style={s.h2}>Snapshot de Patrimonio</Text>
      <View style={s.kpiGrid}>
        <KpiBox label="Saldo Total Cuentas" value={fmt(kpis.saldo_total_cuentas)} />
        <KpiBox label="Deuda Pendiente" value={fmt(kpis.deuda_pendiente_total)} />
        <KpiBox label="Patrimonio Neto" value={fmt(kpis.patrimonio_neto)} />
      </View>
      <Text style={[s.h3, { marginTop: 8 }]}>Cuentas Financieras</Text>
      <View style={s.rowHeader}>
        <Text style={s.col1}>Cuenta</Text>
        <Text style={s.col2}>Saldo</Text>
      </View>
      {(patrimonioData?.cuentas || []).map((c, i) => (
        <View key={i} style={s.row}>
          <Text style={s.col1}>{c.nombre}</Text>
          <Text style={[s.col2, { color: c.saldo >= 0 ? C.text : C.red }]}>{fmt(c.saldo)}</Text>
        </View>
      ))}
      {(patrimonioData?.deudas || []).length > 0 && (
        <>
          <Text style={[s.h3, { marginTop: 12 }]}>Deudas Activas</Text>
          <View style={s.rowHeader}>
            <Text style={s.col1}>Deuda</Text>
            <Text style={s.col2}>Saldo</Text>
            <Text style={s.col3}>TCEA</Text>
          </View>
          {patrimonioData.deudas.map((d, i) => (
            <View key={i} style={s.row}>
              <Text style={s.col1}>{d.nombre}</Text>
              <Text style={s.col2}>{fmt(d.saldo_pendiente)}</Text>
              <Text style={s.col3}>{pct(d.tcea)}</Text>
            </View>
          ))}
        </>
      )}
      <Footer hash={hash} page={4} />
    </Page>
  );
}

function PaginaChecklist({ checklist, cerradoPor, cerradoEn, hash, historialReaperturas }) {
  const items = [
    { label: 'Movimientos sin tipo',            valor: checklist.movimientos_sin_tipo,            bloqueante: true },
    { label: 'Movimientos sin cuenta contable', valor: checklist.movimientos_sin_cuenta_contable, bloqueante: true },
    { label: 'Splits desbalanceados',           valor: checklist.splits_desbalanceados,           bloqueante: true },
    { label: 'Plantillas mensuales pendientes', valor: checklist.plantillas_mensuales_pendientes, bloqueante: false },
    { label: 'Cuentas con saldo negativo',      valor: checklist.cuentas_con_saldo_negativo,      bloqueante: false },
  ];

  return (
    <Page size="A4" style={s.page}>
      <Text style={s.h2}>Checklist de Cierre y Auditoría</Text>
      {items.map((item, i) => (
        <View key={i} style={s.checkRow}>
          <Text style={[
            s.badge,
            item.valor === 0 ? s.badgeOk : item.bloqueante ? s.badgeErr : s.badgeWarn,
            { marginRight: 8, minWidth: 20, textAlign: 'center' }
          ]}>
            {item.valor === 0 ? '✓' : String(item.valor)}
          </Text>
          <Text style={s.body}>{item.label}</Text>
        </View>
      ))}

      <View style={s.divider} />

      <Text style={s.h3}>Auditoría del Cierre</Text>
      <Text style={s.body}>Cerrado por: {cerradoPor}</Text>
      <Text style={s.body}>Fecha y hora: {new Date(cerradoEn).toLocaleString('es-PE')}</Text>

      <View style={[s.divider, { marginTop: 8 }]} />
      <Text style={[s.label, { marginBottom: 4 }]}>Hash SHA-256 (verificación de integridad)</Text>
      <Text style={[s.muted, { fontSize: 7 }]}>{hash}</Text>

      {historialReaperturas?.length > 0 && (
        <>
          <View style={s.divider} />
          <Text style={s.h3}>Historial de Reaperturas</Text>
          {historialReaperturas.map((r, i) => (
            <Text key={i} style={s.body}>
              v{r.version - 1} → Reabierto el {new Date(r.cerrado_en).toLocaleDateString('es-PE')}: {r.motivo_reapertura}
            </Text>
          ))}
        </>
      )}

      <View style={[s.footer, { bottom: 30 }]}>
        <Text style={[s.footerText, { marginBottom: 4 }]}>
          Generado por BERNA ERP · SHA-256: {hash}
        </Text>
        <Text style={s.footerText}>DOCUMENTO CONFIDENCIAL — USO INTERNO</Text>
      </View>
    </Page>
  );
}

/* ── Componente principal ─────────────────────────────────────────────────── */

/**
 * ReporteCierrePDF — Document de @react-pdf/renderer.
 */
export default function ReporteCierrePDF({
  year, month, version = 1,
  kpis = {}, plData = [], flujoData = [], patrimonioData = {},
  checklist = {}, cerradoPor = '', cerradoEn = new Date().toISOString(),
  hash = '', historialReaperturas = [],
}) {
  const generadoEn = new Date().toISOString();

  return (
    <Document
      title={`Cierre ${mesNombre(month)} ${year} v${version} — Berna Calzado`}
      author="Berna ERP"
      subject={`Reporte de Cierre Contable — ${mesNombre(month)} ${year}`}
    >
      <PaginaPortada year={year} month={month} version={version} kpis={kpis} generadoEn={generadoEn} hash={hash} />
      <PaginaPL plData={plData} kpis={kpis} hash={hash} />
      <PaginaFlujo flujoData={flujoData} kpis={kpis} hash={hash} />
      <PaginaPatrimonio patrimonioData={patrimonioData} kpis={kpis} hash={hash} />
      <PaginaChecklist
        checklist={checklist}
        cerradoPor={cerradoPor}
        cerradoEn={cerradoEn}
        hash={hash}
        historialReaperturas={historialReaperturas}
      />
    </Document>
  );
}
