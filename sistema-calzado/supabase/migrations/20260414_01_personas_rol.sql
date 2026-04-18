-- Migration: Add rol column to personas_tienda
-- Purpose: Distinguish sellers from admins so admin users (Mamá, Papá)
--          don't appear in the POS login screen.

ALTER TABLE personas_tienda
  ADD COLUMN IF NOT EXISTS rol text NOT NULL DEFAULT 'vendedora'
  CHECK (rol IN ('vendedora', 'admin', 'operador'));

-- Set admin roles for parents
UPDATE personas_tienda SET rol = 'admin' WHERE LOWER(nombre) LIKE '%mamá%' OR LOWER(nombre) LIKE '%mama%';
UPDATE personas_tienda SET rol = 'admin' WHERE LOWER(nombre) LIKE '%papá%' OR LOWER(nombre) LIKE '%papa%';
