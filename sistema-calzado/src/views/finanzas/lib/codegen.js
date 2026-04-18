/* ──────────────────────────────────────────────────────────────────────────
   FINANZAS · LIB · GENERACIÓN DE CÓDIGOS
   ──────────────────────────────────────────────────────────────────────────
   Funciones puras (sin React, sin Supabase) para auto-generar códigos en
   todos los formularios del módulo de finanzas.
   ────────────────────────────────────────────────────────────────────────── */


/* ─── HELPER GENERAL ──────────────────────────────────────────────────── */

/**
 * Convierte un nombre libre a un slug en mayúsculas apto para códigos.
 * Elimina acentos, reemplaza espacios por "_" y conserva sólo A-Z, 0-9 y _.
 *
 * @param {string} nombre  Ej. "Luz tienda 1039"
 * @returns {string}       Ej. "LUZ_TIENDA_1039"
 */
export function slugify(nombre) {
  if (!nombre) return '';
  return nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // quitar diacríticos
    .toUpperCase()
    .replace(/\s+/g, '_')             // espacios → _
    .replace(/[^A-Z0-9_]/g, '');      // eliminar el resto
}


/* ─── SECUENCIAL GENÉRICO ─────────────────────────────────────────────── */

/**
 * Genera el siguiente código secuencial para un prefijo dado.
 * Busca entre los códigos existentes el mayor número con ese prefijo
 * e incrementa en 1, con padding de 3 dígitos.
 *
 * @param {string}   prefix            Ej. "CTA", "DDA", "CF"
 * @param {string[]} codigosExistentes Ej. ["CTA-001", "CTA-003"]
 * @returns {string}                   Ej. "CTA-004"
 */
export function generarCodigoSecuencial(prefix, codigosExistentes = []) {
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);
  let max = 0;

  for (const codigo of codigosExistentes) {
    const match = String(codigo).match(pattern);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > max) max = num;
    }
  }

  return `${prefix}-${String(max + 1).padStart(3, '0')}`;
}


/* ─── CUENTAS FINANCIERAS ─────────────────────────────────────────────── */

/** Mapa de tipo_cuenta → prefijo de código */
const PREFIJO_TIPO_CUENTA = {
  operativa: 'OPE',
  ahorro:    'AHO',
  bancaria:  'BAN',
  credito:   'CRE',
  digital:   'DIG',
  reserva:   'RES',
  otra:      'OTR',
};

/**
 * Genera el código siguiente para una cuenta financiera según su tipo.
 *
 * @param {string}   tipoCuenta        Ej. "operativa", "ahorro"
 * @param {string[]} codigosExistentes Ej. ["OPE-001", "OPE-002"]
 * @returns {string}                   Ej. "OPE-003"
 */
export function generarCodigoCuenta(tipoCuenta, codigosExistentes = []) {
  const prefix = PREFIJO_TIPO_CUENTA[tipoCuenta] ?? 'OTR';
  return generarCodigoSecuencial(prefix, codigosExistentes);
}


/* ─── DEUDAS ──────────────────────────────────────────────────────────── */

/**
 * Genera el código siguiente para una deuda (prefijo fijo "DDA").
 *
 * @param {string[]} codigosExistentes Ej. ["DDA-001"]
 * @returns {string}                   Ej. "DDA-002"
 */
export function generarCodigoDeuda(codigosExistentes = []) {
  return generarCodigoSecuencial('DDA', codigosExistentes);
}


/* ─── COSTOS FIJOS ────────────────────────────────────────────────────── */

/** Mapa de categoria → prefijo de código */
const PREFIJO_CATEGORIA_COSTO = {
  servicio:    'SRV',
  alquiler:    'ALQ',
  suscripcion: 'SUS',
  salario:     'SAL',
  impuesto:    'IMP',
  seguro:      'SEG',
  otro:        'OTR',
};

/**
 * Genera el código siguiente para un costo fijo según su categoría.
 *
 * @param {string}   categoria         Ej. "servicio", "alquiler"
 * @param {string[]} codigosExistentes Ej. ["SRV-001"]
 * @returns {string}                   Ej. "SRV-002"
 */
export function generarCodigoCosto(categoria, codigosExistentes = []) {
  const prefix = PREFIJO_CATEGORIA_COSTO[categoria] ?? 'OTR';
  return generarCodigoSecuencial(prefix, codigosExistentes);
}


/* ─── PLAN DE CUENTAS (jerárquico) ───────────────────────────────────── */

/** Mapa de seccion_pl → número raíz del código contable */
const NUMERO_SECCION_PL = {
  ingresos:           1,
  costo_ventas:       2,
  costo_produccion:   3,
  gastos_operativos:  4,
  gastos_personal:    5,
  gastos_financieros: 6,
  impuestos:          7,
  otros_ingresos:     8,
  otros_egresos:      9,
  sin_impacto:        0,
};

/**
 * Genera un código jerárquico para el plan de cuentas contable.
 *
 * Nivel raíz (sin idPadre):
 *   - Primer ítem de la sección → "4."
 *   - Siguientes ítems          → "4.1", "4.2", …
 *
 * Nivel hijo (con idPadre):
 *   - Primer hijo de "4.1"  → "4.1.01"
 *   - Segundo hijo de "4.1" → "4.1.02"
 *
 * @param {string|null} seccionPl        Valor de seccion_pl del nuevo ítem
 * @param {string|null} idPadre          id_cuenta_contable del padre (null si es raíz)
 * @param {Array<{id_cuenta_contable: string, codigo: string, id_padre: string|null, seccion_pl: string}>} cuentasExistentes
 * @returns {string}  Código generado
 */
export function generarCodigoPlanCuentas(seccionPl, idPadre, cuentasExistentes = []) {
  const raiz = NUMERO_SECCION_PL[seccionPl] ?? 0;

  /* ── Nivel raíz ── */
  if (!idPadre) {
    // Códigos raíz de esta sección: "4." o "4.N" (sin más niveles de punto)
    // Patrón: empieza con el número de sección, tiene exactamente un punto,
    // y lo que viene después del punto es vacío o un entero simple.
    const patronRaiz = new RegExp(`^${raiz}\\.(?:\\d+)?$`);
    const raices = cuentasExistentes
      .map(c => String(c.codigo ?? ''))
      .filter(c => patronRaiz.test(c));

    if (raices.length === 0) {
      // Primera entrada: código raíz con punto final
      return `${raiz}.`;
    }

    // Determinar el mayor índice ya usado entre "4." (=0) y "4.N"
    let maxIdx = 0;
    for (const c of raices) {
      // "4." → suffix vacío → índice 0 (ya existe)
      const suffix = c.slice(String(raiz).length + 1); // todo lo que viene después de "X."
      if (suffix === '') {
        // "4." cuenta como existente; si sólo existe éste, el próximo es "4.1"
        maxIdx = Math.max(maxIdx, 0);
      } else {
        const n = parseInt(suffix, 10);
        if (!isNaN(n)) maxIdx = Math.max(maxIdx, n);
      }
    }

    // Si "4." existe, el siguiente libre es "4.1"; si "4.1" existe, "4.2"; etc.
    return `${raiz}.${maxIdx + 1}`;
  }

  /* ── Nivel hijo ── */
  const padre = cuentasExistentes.find(c => c.id_cuenta_contable === idPadre);
  const codigoPadre = padre ? String(padre.codigo ?? '') : `${raiz}.`;

  // Eliminar punto final si el código padre es raíz ("4.")
  const base = codigoPadre.endsWith('.') ? codigoPadre : `${codigoPadre}.`;

  // Contar hijos actuales del padre
  const hijos = cuentasExistentes.filter(c => c.id_padre === idPadre);

  // Buscar el mayor número entre los hijos existentes para evitar colisiones
  let maxHijo = 0;
  const patronHijo = new RegExp(`^${escapeRegex(base)}(\\d+)$`);
  for (const h of hijos) {
    const match = String(h.codigo ?? '').match(patronHijo);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > maxHijo) maxHijo = n;
    }
  }

  return `${base}${String(maxHijo + 1).padStart(2, '0')}`;
}

/** Escapa caracteres especiales de regex en una cadena literal. */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
