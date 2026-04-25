-- ============================================================================
-- Fase 2.01 — Catálogos como tablas dedicadas
-- ADR-002: todos los catálogos son tablas dedicadas, no JSON genérico.
-- Reemplaza catalogos_auxiliares (drop en 20260420_06).
-- ============================================================================

-- Función utilitaria updated_at (idempotente)
CREATE OR REPLACE FUNCTION public.trg_set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- 1. metodos_pago
CREATE TABLE IF NOT EXISTS public.metodos_pago (
    id_metodo            serial PRIMARY KEY,
    codigo               text NOT NULL UNIQUE,
    nombre               text NOT NULL,
    tipo                 text NOT NULL CHECK (tipo IN ('efectivo','digital','tarjeta','transferencia','cheque','otro')),
    requiere_referencia  boolean NOT NULL DEFAULT false,
    activo               boolean NOT NULL DEFAULT true,
    orden                integer NOT NULL DEFAULT 100,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_metodos_pago_activo ON public.metodos_pago(activo) WHERE activo;

INSERT INTO public.metodos_pago (codigo, nombre, tipo, orden) VALUES
    ('efectivo','Efectivo','efectivo',10),
    ('yape','Yape','digital',20),
    ('plin','Plin','digital',30),
    ('tarjeta','Tarjeta','tarjeta',40)
ON CONFLICT (codigo) DO NOTHING;

-- 2. areas
CREATE TABLE IF NOT EXISTS public.areas (
    id_area      serial PRIMARY KEY,
    codigo       text NOT NULL UNIQUE,
    nombre       text NOT NULL,
    activo       boolean NOT NULL DEFAULT true,
    orden        integer NOT NULL DEFAULT 100,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.areas (codigo, nombre, orden) VALUES
    ('tienda','Tienda',10),
    ('taller','Taller',20),
    ('administracion','Administración',30)
ON CONFLICT (codigo) DO NOTHING;

-- 3. cargos (puestos laborales)
CREATE TABLE IF NOT EXISTS public.cargos (
    id_cargo                  serial PRIMARY KEY,
    codigo                    text NOT NULL UNIQUE,
    nombre                    text NOT NULL,
    id_area_default           integer REFERENCES public.areas(id_area),
    salario_sugerido          numeric(12,2),
    id_cuenta_contable_sueldo integer REFERENCES public.plan_cuentas(id_cuenta_contable),
    activo                    boolean NOT NULL DEFAULT true,
    orden                     integer NOT NULL DEFAULT 100,
    created_at                timestamptz NOT NULL DEFAULT now(),
    updated_at                timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cargos_activo ON public.cargos(activo) WHERE activo;

INSERT INTO public.cargos (codigo, nombre, id_area_default, salario_sugerido, orden)
SELECT c.codigo, c.nombre, a.id_area, c.salario, c.orden
FROM (VALUES
    ('vendedora','Vendedora','tienda',1200,10),
    ('cajero','Cajero','tienda',1200,20),
    ('supervisor_tienda','Supervisor de tienda','tienda',1800,30),
    ('encargado_caja','Encargado de caja','tienda',1400,40),
    ('cortador','Cortador','taller',1500,50),
    ('armador','Armador','taller',1500,60),
    ('pegador','Pegador','taller',1400,70),
    ('disenador','Diseñador','taller',1800,80),
    ('administrador_general','Administrador general','administracion',2500,90),
    ('contador','Contador','administracion',2200,100)
) AS c(codigo, nombre, area_codigo, salario, orden)
LEFT JOIN public.areas a ON a.codigo = c.area_codigo
ON CONFLICT (codigo) DO NOTHING;

-- 4-6. motivos_merma, motivos_ajuste, motivos_devolucion (estructura idéntica)
CREATE TABLE IF NOT EXISTS public.motivos_merma (
    id_motivo    serial PRIMARY KEY,
    codigo       text NOT NULL UNIQUE,
    nombre       text NOT NULL,
    activo       boolean NOT NULL DEFAULT true,
    orden        integer NOT NULL DEFAULT 100,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.motivos_merma (codigo, nombre, orden) VALUES
    ('defecto_fabrica','Defecto de fábrica',10),
    ('dano_transporte','Daño en transporte',20),
    ('robo','Robo / extravío',30),
    ('vencimiento','Vencimiento',40),
    ('otro','Otro',99)
ON CONFLICT (codigo) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.motivos_ajuste (
    id_motivo    serial PRIMARY KEY,
    codigo       text NOT NULL UNIQUE,
    nombre       text NOT NULL,
    activo       boolean NOT NULL DEFAULT true,
    orden        integer NOT NULL DEFAULT 100,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.motivos_ajuste (codigo, nombre, orden) VALUES
    ('error_registro','Error de registro',10),
    ('conciliacion_bancaria','Conciliación bancaria',20),
    ('ajuste_inventario','Ajuste de inventario',30),
    ('otro','Otro',99)
ON CONFLICT (codigo) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.motivos_devolucion (
    id_motivo    serial PRIMARY KEY,
    codigo       text NOT NULL UNIQUE,
    nombre       text NOT NULL,
    activo       boolean NOT NULL DEFAULT true,
    orden        integer NOT NULL DEFAULT 100,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.motivos_devolucion (codigo, nombre, orden) VALUES
    ('no_le_quedo','No le quedó al cliente',10),
    ('defecto','Defecto del producto',20),
    ('cambio_de_opinion','Cambio de opinión',30),
    ('talla_equivocada','Talla equivocada',40)
ON CONFLICT (codigo) DO NOTHING;

-- 7. condiciones_pago
CREATE TABLE IF NOT EXISTS public.condiciones_pago (
    id_condicion  serial PRIMARY KEY,
    codigo        text NOT NULL UNIQUE,
    nombre        text NOT NULL,
    dias_credito  integer NOT NULL DEFAULT 0,
    activo        boolean NOT NULL DEFAULT true,
    orden         integer NOT NULL DEFAULT 100,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.condiciones_pago (codigo, nombre, dias_credito, orden) VALUES
    ('contado','Contado',0,10),
    ('credito_15','Crédito 15 días',15,20),
    ('credito_30','Crédito 30 días',30,30),
    ('credito_60','Crédito 60 días',60,40)
ON CONFLICT (codigo) DO NOTHING;

-- Triggers updated_at en los 7 catálogos
DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['metodos_pago','areas','cargos','motivos_merma','motivos_ajuste','motivos_devolucion','condiciones_pago']
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated ON public.%s;', t, t);
        EXECUTE format('CREATE TRIGGER trg_%s_updated BEFORE UPDATE ON public.%s FOR EACH ROW EXECUTE FUNCTION public.trg_set_updated_at();', t, t);
    END LOOP;
END $$;

-- Grants PostgREST
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.metodos_pago, public.areas, public.cargos,
  public.motivos_merma, public.motivos_ajuste, public.motivos_devolucion, public.condiciones_pago
  TO anon, authenticated;
GRANT USAGE, SELECT ON
  SEQUENCE public.metodos_pago_id_metodo_seq,
           public.areas_id_area_seq,
           public.cargos_id_cargo_seq,
           public.motivos_merma_id_motivo_seq,
           public.motivos_ajuste_id_motivo_seq,
           public.motivos_devolucion_id_motivo_seq,
           public.condiciones_pago_id_condicion_seq
  TO anon, authenticated;
