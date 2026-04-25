-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.analytics_ventas (
  id_analytics integer NOT NULL DEFAULT nextval('analytics_ventas_id_analytics_seq'::regclass),
  id_venta integer,
  id_ubicacion integer,
  hora_venta integer NOT NULL CHECK (hora_venta >= 0 AND hora_venta <= 23),
  dia_semana integer NOT NULL CHECK (dia_semana >= 0 AND dia_semana <= 6),
  cantidad_items integer NOT NULL,
  metodo_pago_principal text NOT NULL,
  tiene_descuento boolean DEFAULT false,
  es_cliente_frecuente boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT analytics_ventas_pkey PRIMARY KEY (id_analytics),
  CONSTRAINT analytics_ventas_id_venta_fkey FOREIGN KEY (id_venta) REFERENCES public.ventas(id_venta),
  CONSTRAINT analytics_ventas_id_ubicacion_fkey FOREIGN KEY (id_ubicacion) REFERENCES public.ubicaciones(id_ubicacion)
);
CREATE TABLE public.cajas (
  id_caja integer NOT NULL DEFAULT nextval('cajas_id_caja_seq'::regclass),
  id_ubicacion integer,
  monto_apertura numeric DEFAULT 0,
  fecha_apertura timestamp with time zone DEFAULT now(),
  fecha_cierre timestamp with time zone,
  monto_cierre_efectivo numeric,
  monto_cierre_yape numeric,
  monto_cierre_plin numeric,
  monto_cierre_tarjeta numeric,
  diferencia_efectivo numeric,
  total_ventas numeric,
  observaciones text,
  created_at timestamp with time zone DEFAULT now(),
  diferencia_yape numeric DEFAULT 0,
  diferencia_plin numeric DEFAULT 0,
  diferencia_tarjeta numeric DEFAULT 0,
  nombre_apertura text,
  nombre_cierre text,
  id_persona integer,
  monto_entrega numeric DEFAULT 0,
  desglose_cierre jsonb,
  CONSTRAINT cajas_pkey PRIMARY KEY (id_caja),
  CONSTRAINT cajas_id_ubicacion_fkey FOREIGN KEY (id_ubicacion) REFERENCES public.ubicaciones(id_ubicacion),
  CONSTRAINT cajas_id_persona_fkey FOREIGN KEY (id_persona) REFERENCES public.personas_tienda(id_persona)
);
CREATE TABLE public.categorias (
  id_categoria integer NOT NULL DEFAULT nextval('categorias_id_categoria_seq'::regclass),
  nombre_categoria text NOT NULL UNIQUE,
  CONSTRAINT categorias_pkey PRIMARY KEY (id_categoria)
);
CREATE TABLE public.colores_modelos (
  id_color integer NOT NULL DEFAULT nextval('colores_modelos_id_color_seq'::regclass),
  id_producto integer NOT NULL,
  color text NOT NULL,
  costo_grande numeric NOT NULL DEFAULT 0,
  costo_mediana numeric NOT NULL DEFAULT 0,
  costo_chica numeric NOT NULL DEFAULT 0,
  precio_especial_grande numeric,
  precio_especial_mediana numeric,
  precio_especial_chica numeric,
  estado text NOT NULL DEFAULT 'Activo'::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  foto_url text,
  CONSTRAINT colores_modelos_pkey PRIMARY KEY (id_color),
  CONSTRAINT colores_modelos_id_producto_fkey FOREIGN KEY (id_producto) REFERENCES public.productos(id_producto)
);
CREATE TABLE public.configuracion_sistema (
  clave text NOT NULL,
  valor text,
  CONSTRAINT configuracion_sistema_pkey PRIMARY KEY (clave)
);
CREATE TABLE public.costos_fijos (
  id_costo integer NOT NULL DEFAULT nextval('costos_fijos_id_costo_seq'::regclass),
  codigo text NOT NULL UNIQUE,
  nombre text NOT NULL,
  categoria text NOT NULL DEFAULT 'servicio'::text CHECK (categoria = ANY (ARRAY['servicio'::text, 'alquiler'::text, 'suscripcion'::text, 'salario'::text, 'impuesto'::text, 'seguro'::text, 'otro'::text])),
  proveedor text,
  monto_estimado numeric NOT NULL,
  es_monto_variable boolean DEFAULT false,
  frecuencia text NOT NULL DEFAULT 'mensual'::text CHECK (frecuencia = ANY (ARRAY['diaria'::text, 'semanal'::text, 'quincenal'::text, 'mensual'::text, 'bimestral'::text, 'trimestral'::text, 'anual'::text])),
  dia_vencimiento_mes integer CHECK (dia_vencimiento_mes IS NULL OR dia_vencimiento_mes >= 1 AND dia_vencimiento_mes <= 31),
  dia_vencimiento_semana integer CHECK (dia_vencimiento_semana IS NULL OR dia_vencimiento_semana >= 0 AND dia_vencimiento_semana <= 6),
  id_ubicacion integer,
  id_cuenta_reserva integer,
  id_responsable integer,
  fecha_inicio date NOT NULL DEFAULT CURRENT_DATE,
  fecha_fin date,
  activo boolean NOT NULL DEFAULT true,
  notas text,
  datos_extra jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  id_cuenta_contable integer,
  unidad text,
  tarifa_por_unidad numeric,
  es_por_unidad boolean NOT NULL DEFAULT false,
  CONSTRAINT costos_fijos_pkey PRIMARY KEY (id_costo),
  CONSTRAINT costos_fijos_id_cuenta_reserva_fkey FOREIGN KEY (id_cuenta_reserva) REFERENCES public.cuentas_financieras(id_cuenta),
  CONSTRAINT costos_fijos_id_responsable_fkey FOREIGN KEY (id_responsable) REFERENCES public.personas_tienda(id_persona),
  CONSTRAINT costos_fijos_id_cuenta_contable_fkey FOREIGN KEY (id_cuenta_contable) REFERENCES public.plan_cuentas(id_cuenta_contable),
  CONSTRAINT costos_fijos_id_ubicacion_fkey FOREIGN KEY (id_ubicacion) REFERENCES public.ubicaciones(id_ubicacion)
);
CREATE TABLE public.cuentas_financieras (
  id_cuenta integer NOT NULL DEFAULT nextval('cuentas_financieras_id_cuenta_seq'::regclass),
  codigo text NOT NULL UNIQUE,
  nombre text NOT NULL,
  alias text,
  tipo_cuenta text NOT NULL DEFAULT 'operativa'::text CHECK (tipo_cuenta = ANY (ARRAY['operativa'::text, 'ahorro'::text, 'bancaria'::text, 'credito'::text, 'digital'::text, 'reserva'::text, 'otra'::text])),
  id_cuenta_padre integer,
  id_custodio_actual integer,
  id_ubicacion integer,
  saldo_actual numeric NOT NULL DEFAULT 0,
  saldo_minimo_alerta numeric,
  moneda text NOT NULL DEFAULT 'PEN'::text,
  es_cuenta_personal boolean NOT NULL DEFAULT false,
  titular_legal text,
  banco text,
  numero_enmascarado text,
  color_hex text,
  icono text,
  orden_display integer DEFAULT 99,
  activa boolean NOT NULL DEFAULT true,
  notas text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  mostrar_en_cierre_tienda boolean NOT NULL DEFAULT false,
  CONSTRAINT cuentas_financieras_pkey PRIMARY KEY (id_cuenta),
  CONSTRAINT cuentas_financieras_id_cuenta_padre_fkey FOREIGN KEY (id_cuenta_padre) REFERENCES public.cuentas_financieras(id_cuenta),
  CONSTRAINT cuentas_financieras_id_custodio_actual_fkey FOREIGN KEY (id_custodio_actual) REFERENCES public.personas_tienda(id_persona),
  CONSTRAINT cuentas_financieras_id_ubicacion_fkey FOREIGN KEY (id_ubicacion) REFERENCES public.ubicaciones(id_ubicacion)
);
CREATE TABLE public.despachos (
  id_despacho integer NOT NULL DEFAULT nextval('despachos_id_despacho_seq'::regclass),
  id_lote integer,
  id_ubicacion integer,
  nombre_tienda text,
  cantidad_despachada integer NOT NULL,
  id_ubicacion_origen integer,
  fecha_despacho timestamp with time zone DEFAULT now(),
  observaciones text,
  CONSTRAINT despachos_pkey PRIMARY KEY (id_despacho),
  CONSTRAINT despachos_id_lote_fkey FOREIGN KEY (id_lote) REFERENCES public.lotes(id_lote),
  CONSTRAINT despachos_id_ubicacion_fkey FOREIGN KEY (id_ubicacion) REFERENCES public.ubicaciones(id_ubicacion),
  CONSTRAINT despachos_id_ubicacion_origen_fkey FOREIGN KEY (id_ubicacion_origen) REFERENCES public.ubicaciones(id_ubicacion)
);
CREATE TABLE public.deudas (
  id_deuda integer NOT NULL DEFAULT nextval('deudas_id_deuda_seq'::regclass),
  codigo text NOT NULL UNIQUE,
  nombre text NOT NULL,
  acreedor text NOT NULL,
  tipo_acreedor text NOT NULL DEFAULT 'otro'::text CHECK (tipo_acreedor = ANY (ARRAY['banco'::text, 'caja'::text, 'financiera'::text, 'prestamista'::text, 'familiar'::text, 'proveedor'::text, 'otro'::text])),
  id_responsable integer,
  monto_original numeric NOT NULL,
  moneda text NOT NULL DEFAULT 'PEN'::text,
  fecha_inicio date NOT NULL,
  plazo_meses integer,
  fecha_fin_estimada date,
  tea_pct numeric DEFAULT 0,
  cuota_monto numeric,
  frecuencia_cuota text NOT NULL DEFAULT 'mensual'::text CHECK (frecuencia_cuota = ANY (ARRAY['diaria'::text, 'semanal'::text, 'quincenal'::text, 'mensual'::text, 'variable'::text, 'unica'::text])),
  dia_pago_mes integer CHECK (dia_pago_mes IS NULL OR dia_pago_mes >= 1 AND dia_pago_mes <= 31),
  dia_pago_semana integer CHECK (dia_pago_semana IS NULL OR dia_pago_semana >= 0 AND dia_pago_semana <= 6),
  saldo_actual numeric NOT NULL DEFAULT 0,
  capital_pagado numeric NOT NULL DEFAULT 0,
  interes_pagado numeric NOT NULL DEFAULT 0,
  id_cuenta_reserva integer,
  estado text NOT NULL DEFAULT 'activa'::text CHECK (estado = ANY (ARRAY['activa'::text, 'pagada'::text, 'refinanciada'::text, 'en_mora'::text, 'cancelada'::text, 'pausada'::text])),
  tiene_garantia boolean DEFAULT false,
  descripcion_garantia text,
  numero_contrato text,
  notas text,
  datos_extra jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  tcea_pct numeric,
  comision_mensual numeric,
  seguro_mensual numeric,
  portes_mensual numeric,
  itf_pct numeric,
  otros_cargos_mensual numeric,
  CONSTRAINT deudas_pkey PRIMARY KEY (id_deuda),
  CONSTRAINT deudas_id_cuenta_reserva_fkey FOREIGN KEY (id_cuenta_reserva) REFERENCES public.cuentas_financieras(id_cuenta),
  CONSTRAINT deudas_id_responsable_fkey FOREIGN KEY (id_responsable) REFERENCES public.personas_tienda(id_persona)
);
CREATE TABLE public.deudas_eventos (
  id_evento integer NOT NULL DEFAULT nextval('deudas_eventos_id_evento_seq'::regclass),
  id_deuda integer NOT NULL,
  fecha_evento date NOT NULL DEFAULT CURRENT_DATE,
  tipo_evento text NOT NULL CHECK (tipo_evento = ANY (ARRAY['refinanciacion'::text, 'ajuste_saldo'::text, 'condonacion'::text, 'cambio_tea'::text, 'cambio_cuota'::text, 'pausa'::text, 'reactivacion'::text, 'mora'::text, 'otro'::text])),
  monto_afectado numeric,
  descripcion text,
  datos_antes jsonb,
  datos_despues jsonb,
  registrado_por integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT deudas_eventos_pkey PRIMARY KEY (id_evento),
  CONSTRAINT deudas_eventos_id_deuda_fkey FOREIGN KEY (id_deuda) REFERENCES public.deudas(id_deuda),
  CONSTRAINT deudas_eventos_registrado_por_fkey FOREIGN KEY (registrado_por) REFERENCES public.personas_tienda(id_persona)
);
CREATE TABLE public.devoluciones (
  id_devolucion integer NOT NULL DEFAULT nextval('devoluciones_id_devolucion_seq'::regclass),
  sku_id text,
  id_ubicacion integer,
  fecha_devolucion timestamp with time zone DEFAULT now(),
  motivo text,
  observaciones text,
  CONSTRAINT devoluciones_pkey PRIMARY KEY (id_devolucion),
  CONSTRAINT devoluciones_sku_id_fkey FOREIGN KEY (sku_id) REFERENCES public.inventario(sku_id),
  CONSTRAINT devoluciones_id_ubicacion_fkey FOREIGN KEY (id_ubicacion) REFERENCES public.ubicaciones(id_ubicacion)
);
CREATE TABLE public.inventario (
  sku_id text NOT NULL DEFAULT ('SKU-'::text || (nextval('sku_seq'::regclass))::text),
  id_producto integer,
  id_lote integer DEFAULT 0,
  id_ubicacion integer,
  talla integer NOT NULL,
  color text NOT NULL,
  costo_fabricacion numeric,
  estado text DEFAULT 'Disponible'::text,
  fecha_ingreso timestamp with time zone DEFAULT now(),
  fecha_venta timestamp with time zone,
  fecha_produccion timestamp with time zone DEFAULT now(),
  nombre_tienda text,
  CONSTRAINT inventario_pkey PRIMARY KEY (sku_id),
  CONSTRAINT inventario_id_producto_fkey FOREIGN KEY (id_producto) REFERENCES public.productos(id_producto),
  CONSTRAINT inventario_id_lote_fkey FOREIGN KEY (id_lote) REFERENCES public.lotes(id_lote),
  CONSTRAINT inventario_id_ubicacion_fkey FOREIGN KEY (id_ubicacion) REFERENCES public.ubicaciones(id_ubicacion)
);
CREATE TABLE public.lista_compras (
  id_lista integer NOT NULL DEFAULT nextval('lista_compras_id_lista_seq'::regclass),
  id_pedido integer NOT NULL UNIQUE,
  fecha_generacion timestamp with time zone DEFAULT now(),
  estado text DEFAULT 'generada'::text CHECK (estado = ANY (ARRAY['generada'::text, 'ajustada'::text, 'finalizada'::text])),
  notas text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT lista_compras_pkey PRIMARY KEY (id_lista),
  CONSTRAINT lista_compras_id_pedido_fkey FOREIGN KEY (id_pedido) REFERENCES public.pedidos_semana(id_pedido)
);
CREATE TABLE public.lista_compras_items (
  id_item_lista integer NOT NULL DEFAULT nextval('lista_compras_items_id_item_lista_seq'::regclass),
  id_lista integer NOT NULL,
  id_material integer,
  nombre_material text NOT NULL,
  categoria text DEFAULT 'General'::text,
  unidad text NOT NULL DEFAULT 'unidad'::text,
  cantidad_calculada numeric DEFAULT 0,
  cantidad_ajustada numeric DEFAULT 0,
  stock_taller numeric DEFAULT 0,
  precio_estimado numeric DEFAULT 0,
  modelos_origen text,
  es_manual boolean DEFAULT false,
  notas text,
  CONSTRAINT lista_compras_items_pkey PRIMARY KEY (id_item_lista),
  CONSTRAINT lista_compras_items_id_lista_fkey FOREIGN KEY (id_lista) REFERENCES public.lista_compras(id_lista),
  CONSTRAINT lista_compras_items_id_material_fkey FOREIGN KEY (id_material) REFERENCES public.materiales_catalogo(id_material)
);
CREATE TABLE public.log_produccion (
  id_log integer NOT NULL DEFAULT nextval('log_produccion_id_log_seq'::regclass),
  id_lote integer,
  id_ubicacion integer,
  accion text NOT NULL,
  detalles text,
  timestamp timestamp with time zone DEFAULT now(),
  CONSTRAINT log_produccion_pkey PRIMARY KEY (id_log),
  CONSTRAINT log_produccion_id_lote_fkey FOREIGN KEY (id_lote) REFERENCES public.lotes(id_lote),
  CONSTRAINT log_produccion_id_ubicacion_fkey FOREIGN KEY (id_ubicacion) REFERENCES public.ubicaciones(id_ubicacion)
);
CREATE TABLE public.log_sesiones (
  id_log integer NOT NULL DEFAULT nextval('log_sesiones_id_log_seq'::regclass),
  id_ubicacion integer,
  accion text NOT NULL CHECK (accion = ANY (ARRAY['login'::text, 'logout'::text])),
  detalles text,
  timestamp timestamp with time zone DEFAULT now(),
  id_persona integer,
  CONSTRAINT log_sesiones_pkey PRIMARY KEY (id_log),
  CONSTRAINT log_sesiones_id_ubicacion_fkey FOREIGN KEY (id_ubicacion) REFERENCES public.ubicaciones(id_ubicacion)
);
CREATE TABLE public.lotes (
  id_lote integer NOT NULL DEFAULT nextval('lotes_id_lote_seq'::regclass),
  id_producto integer,
  id_ubicacion integer,
  id_serie_tallas integer,
  fecha_produccion timestamp with time zone DEFAULT now(),
  estado_lote text DEFAULT 'Abierto'::text,
  cantidad_total integer DEFAULT 0,
  costo_total_lote numeric DEFAULT 0.00,
  descripcion text,
  observaciones text,
  puede_editar boolean DEFAULT true,
  precio_unitario numeric NOT NULL DEFAULT 0,
  CONSTRAINT lotes_pkey PRIMARY KEY (id_lote),
  CONSTRAINT lotes_id_producto_fkey FOREIGN KEY (id_producto) REFERENCES public.productos(id_producto),
  CONSTRAINT lotes_id_ubicacion_fkey FOREIGN KEY (id_ubicacion) REFERENCES public.ubicaciones(id_ubicacion),
  CONSTRAINT lotes_id_serie_tallas_fkey FOREIGN KEY (id_serie_tallas) REFERENCES public.series_tallas(id_serie_tallas)
);
CREATE TABLE public.materiales_catalogo (
  id_material integer NOT NULL DEFAULT nextval('materiales_catalogo_id_material_seq'::regclass),
  nombre text NOT NULL UNIQUE,
  categoria text DEFAULT 'General'::text CHECK (categoria = ANY (ARRAY['Cuero'::text, 'Suela'::text, 'Insumo'::text, 'Etiqueta'::text, 'Herramienta'::text, 'General'::text])),
  unidad_medida text NOT NULL DEFAULT 'unidad'::text,
  precio_unitario numeric DEFAULT 0,
  activo boolean DEFAULT true,
  notas text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT materiales_catalogo_pkey PRIMARY KEY (id_material)
);
CREATE TABLE public.materiales_modelo (
  id integer NOT NULL DEFAULT nextval('materiales_modelo_id_seq'::regclass),
  id_producto integer NOT NULL,
  id_material integer NOT NULL,
  nombre_serie text NOT NULL CHECK (nombre_serie = ANY (ARRAY['Grande'::text, 'Mediana'::text, 'Pequeña'::text])),
  cantidad_por_docena numeric NOT NULL DEFAULT 0,
  merma_pct numeric DEFAULT 0,
  notas text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  id_color integer,
  CONSTRAINT materiales_modelo_pkey PRIMARY KEY (id),
  CONSTRAINT materiales_modelo_id_producto_fkey FOREIGN KEY (id_producto) REFERENCES public.productos(id_producto),
  CONSTRAINT materiales_modelo_id_material_fkey FOREIGN KEY (id_material) REFERENCES public.materiales_catalogo(id_material),
  CONSTRAINT materiales_modelo_id_color_fkey FOREIGN KEY (id_color) REFERENCES public.colores_modelos(id_color)
);
CREATE TABLE public.movimiento_splits (
  id_split integer NOT NULL DEFAULT nextval('movimiento_splits_id_split_seq'::regclass),
  id_movimiento integer NOT NULL,
  id_cuenta integer,
  id_caja_dia integer,
  monto numeric NOT NULL CHECK (monto > 0::numeric),
  porcentaje numeric,
  notas text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT movimiento_splits_pkey PRIMARY KEY (id_split),
  CONSTRAINT movimiento_splits_id_movimiento_fkey FOREIGN KEY (id_movimiento) REFERENCES public.movimientos_caja(id_movimiento),
  CONSTRAINT movimiento_splits_id_cuenta_fkey FOREIGN KEY (id_cuenta) REFERENCES public.cuentas_financieras(id_cuenta),
  CONSTRAINT movimiento_splits_id_caja_dia_fkey FOREIGN KEY (id_caja_dia) REFERENCES public.cajas(id_caja)
);
CREATE TABLE public.movimientos_caja (
  id_movimiento integer NOT NULL DEFAULT nextval('movimientos_caja_id_movimiento_seq'::regclass),
  id_caja integer,
  id_ubicacion integer,
  tipo text NOT NULL CHECK (tipo = ANY (ARRAY['ingreso'::text, 'egreso'::text])),
  monto numeric NOT NULL,
  concepto text NOT NULL,
  fecha_movimiento timestamp with time zone DEFAULT now(),
  metodo text DEFAULT 'efectivo'::text,
  id_persona integer,
  id_tipo integer,
  categoria text,
  origen_pago text CHECK (origen_pago = ANY (ARRAY['caja'::text, 'ahorro_bcp'::text])),
  pendiente_devolucion boolean DEFAULT false,
  id_cuenta_financiera integer,
  id_deuda integer,
  id_costo_fijo integer,
  id_transferencia integer,
  tiene_splits boolean DEFAULT false,
  datos_extra jsonb DEFAULT '{}'::jsonb,
  id_cuenta_contable integer,
  CONSTRAINT movimientos_caja_pkey PRIMARY KEY (id_movimiento),
  CONSTRAINT movimientos_caja_id_caja_fkey FOREIGN KEY (id_caja) REFERENCES public.cajas(id_caja),
  CONSTRAINT movimientos_caja_id_ubicacion_fkey FOREIGN KEY (id_ubicacion) REFERENCES public.ubicaciones(id_ubicacion),
  CONSTRAINT movimientos_caja_id_tipo_fkey FOREIGN KEY (id_tipo) REFERENCES public.tipos_movimiento_caja(id_tipo),
  CONSTRAINT movimientos_caja_id_cuenta_contable_fkey FOREIGN KEY (id_cuenta_contable) REFERENCES public.plan_cuentas(id_cuenta_contable),
  CONSTRAINT movimientos_caja_id_cuenta_financiera_fkey FOREIGN KEY (id_cuenta_financiera) REFERENCES public.cuentas_financieras(id_cuenta),
  CONSTRAINT movimientos_caja_id_deuda_fkey FOREIGN KEY (id_deuda) REFERENCES public.deudas(id_deuda),
  CONSTRAINT movimientos_caja_id_costo_fijo_fkey FOREIGN KEY (id_costo_fijo) REFERENCES public.costos_fijos(id_costo),
  CONSTRAINT movimientos_caja_id_transferencia_fkey FOREIGN KEY (id_transferencia) REFERENCES public.transferencias_internas(id_transferencia),
  CONSTRAINT movimientos_caja_id_persona_fkey FOREIGN KEY (id_persona) REFERENCES public.personas_tienda(id_persona)
);
CREATE TABLE public.pedido_items (
  id_item integer NOT NULL DEFAULT nextval('pedido_items_id_item_seq'::regclass),
  id_pedido integer NOT NULL,
  id_producto integer NOT NULL,
  nombre_serie text NOT NULL CHECK (nombre_serie = ANY (ARRAY['Grande'::text, 'Mediana'::text, 'Pequeña'::text])),
  docenas integer NOT NULL DEFAULT 1 CHECK (docenas > 0),
  notas text,
  CONSTRAINT pedido_items_pkey PRIMARY KEY (id_item),
  CONSTRAINT pedido_items_id_pedido_fkey FOREIGN KEY (id_pedido) REFERENCES public.pedidos_semana(id_pedido),
  CONSTRAINT pedido_items_id_producto_fkey FOREIGN KEY (id_producto) REFERENCES public.productos(id_producto)
);
CREATE TABLE public.pedidos_semana (
  id_pedido integer NOT NULL DEFAULT nextval('pedidos_semana_id_pedido_seq'::regclass),
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  semana_numero integer DEFAULT EXTRACT(week FROM CURRENT_DATE),
  anio integer DEFAULT EXTRACT(year FROM CURRENT_DATE),
  responsable text,
  estado text DEFAULT 'borrador'::text CHECK (estado = ANY (ARRAY['borrador'::text, 'confirmado'::text, 'completado'::text, 'cancelado'::text])),
  total_docenas integer DEFAULT 0,
  total_pares integer DEFAULT 0,
  notas text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT pedidos_semana_pkey PRIMARY KEY (id_pedido)
);
CREATE TABLE public.permisos_persona (
  id_permiso integer NOT NULL DEFAULT nextval('permisos_persona_id_permiso_seq'::regclass),
  id_persona integer NOT NULL,
  recurso text NOT NULL,
  nivel_acceso text NOT NULL DEFAULT 'ver'::text CHECK (nivel_acceso = ANY (ARRAY['ninguno'::text, 'ver'::text, 'registrar'::text, 'editar'::text, 'admin'::text])),
  scope jsonb DEFAULT '{}'::jsonb,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT permisos_persona_pkey PRIMARY KEY (id_permiso),
  CONSTRAINT permisos_persona_id_persona_fkey FOREIGN KEY (id_persona) REFERENCES public.personas_tienda(id_persona)
);
CREATE TABLE public.personas_tienda (
  id_persona integer NOT NULL DEFAULT nextval('personas_tienda_id_persona_seq'::regclass),
  nombre text NOT NULL UNIQUE,
  activa boolean NOT NULL DEFAULT true,
  pin text,
  rol text NOT NULL DEFAULT 'vendedora' CHECK (rol IN ('vendedora', 'admin', 'operador')),
  CONSTRAINT personas_tienda_pkey PRIMARY KEY (id_persona)
);
CREATE TABLE public.plan_cuentas (
  id_cuenta_contable integer NOT NULL DEFAULT nextval('plan_cuentas_id_cuenta_contable_seq'::regclass),
  codigo text NOT NULL UNIQUE,
  nombre text NOT NULL,
  descripcion text,
  id_padre integer,
  nivel integer NOT NULL DEFAULT 1 CHECK (nivel >= 1 AND nivel <= 5),
  seccion_pl text NOT NULL CHECK (seccion_pl = ANY (ARRAY['ingresos'::text, 'costo_ventas'::text, 'costo_produccion'::text, 'gastos_operativos'::text, 'gastos_personal'::text, 'gastos_financieros'::text, 'impuestos'::text, 'otros_ingresos'::text, 'otros_egresos'::text, 'sin_impacto'::text])),
  signo_pl integer NOT NULL DEFAULT 1 CHECK (signo_pl = ANY (ARRAY['-1'::integer, 1])),
  permite_movimientos boolean NOT NULL DEFAULT true,
  activa boolean NOT NULL DEFAULT true,
  orden integer DEFAULT 99,
  color_hex text,
  icono text,
  notas text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT plan_cuentas_pkey PRIMARY KEY (id_cuenta_contable),
  CONSTRAINT plan_cuentas_id_padre_fkey FOREIGN KEY (id_padre) REFERENCES public.plan_cuentas(id_cuenta_contable)
);
CREATE TABLE public.productos (
  id_producto integer NOT NULL DEFAULT nextval('productos_id_producto_seq'::regclass),
  id_categoria integer,
  nombre_modelo text NOT NULL,
  precio_venta_sugerido numeric NOT NULL,
  descripcion text,
  fecha_creacion timestamp with time zone DEFAULT now(),
  serie_default text,
  precio_grande numeric DEFAULT 0,
  precio_mediana numeric DEFAULT 0,
  precio_chica numeric DEFAULT 0,
  estado text DEFAULT 'Activo'::text,
  foto_url text,
  CONSTRAINT productos_pkey PRIMARY KEY (id_producto),
  CONSTRAINT productos_id_categoria_fkey FOREIGN KEY (id_categoria) REFERENCES public.categorias(id_categoria)
);
CREATE TABLE public.series_tallas (
  id_serie_tallas integer NOT NULL DEFAULT nextval('series_tallas_id_serie_tallas_seq'::regclass),
  nombre_serie text NOT NULL,
  talla integer NOT NULL,
  cantidad_por_serie integer NOT NULL,
  CONSTRAINT series_tallas_pkey PRIMARY KEY (id_serie_tallas)
);
CREATE TABLE public.tipos_movimiento_caja (
  id_tipo integer NOT NULL DEFAULT nextval('tipos_movimiento_caja_id_tipo_seq'::regclass),
  codigo text NOT NULL UNIQUE,
  nombre text NOT NULL,
  emoji text,
  categoria text NOT NULL,
  tipo_flujo text NOT NULL CHECK (tipo_flujo = ANY (ARRAY['egreso'::text, 'ingreso'::text, 'ambos'::text])),
  requiere_nota boolean DEFAULT false,
  activo boolean DEFAULT true,
  orden integer DEFAULT 99,
  CONSTRAINT tipos_movimiento_caja_pkey PRIMARY KEY (id_tipo)
);
CREATE TABLE public.trackeo_obligaciones (
  id integer NOT NULL DEFAULT nextval('trackeo_obligaciones_id_seq'::regclass),
  codigo text NOT NULL UNIQUE,
  nombre text NOT NULL,
  meta_total numeric,
  acumulado numeric DEFAULT 0,
  actualizado_en timestamp with time zone DEFAULT now(),
  CONSTRAINT trackeo_obligaciones_pkey PRIMARY KEY (id)
);
CREATE TABLE public.transferencias_internas (
  id_transferencia integer NOT NULL DEFAULT nextval('transferencias_internas_id_transferencia_seq'::regclass),
  fecha timestamp with time zone NOT NULL DEFAULT now(),
  id_cuenta_origen integer NOT NULL,
  id_cuenta_destino integer NOT NULL,
  monto numeric NOT NULL CHECK (monto > 0::numeric),
  concepto text,
  motivo text NOT NULL DEFAULT 'transferencia'::text CHECK (motivo = ANY (ARRAY['transferencia'::text, 'cierre_tienda'::text, 'prestamo_interno'::text, 'reembolso_prestamo'::text, 'ajuste'::text, 'reasignacion'::text, 'pago_deuda_origen'::text, 'aporte_pedido'::text])),
  es_reembolsable boolean DEFAULT false,
  fecha_reembolso_esperada date,
  reembolsado boolean DEFAULT false,
  fecha_reembolso_real date,
  id_transferencia_reembolso integer,
  id_caja_origen_dia integer,
  id_persona_origen integer,
  id_persona_destino integer,
  estado text NOT NULL DEFAULT 'confirmada'::text CHECK (estado = ANY (ARRAY['pendiente'::text, 'confirmada'::text, 'anulada'::text, 'corregida'::text])),
  aprobada_por integer,
  notas text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT transferencias_internas_pkey PRIMARY KEY (id_transferencia),
  CONSTRAINT transferencias_internas_id_cuenta_origen_fkey FOREIGN KEY (id_cuenta_origen) REFERENCES public.cuentas_financieras(id_cuenta),
  CONSTRAINT transferencias_internas_id_cuenta_destino_fkey FOREIGN KEY (id_cuenta_destino) REFERENCES public.cuentas_financieras(id_cuenta),
  CONSTRAINT transferencias_internas_id_transferencia_reembolso_fkey FOREIGN KEY (id_transferencia_reembolso) REFERENCES public.transferencias_internas(id_transferencia),
  CONSTRAINT transferencias_internas_id_caja_origen_dia_fkey FOREIGN KEY (id_caja_origen_dia) REFERENCES public.cajas(id_caja),
  CONSTRAINT transferencias_internas_id_persona_origen_fkey FOREIGN KEY (id_persona_origen) REFERENCES public.personas_tienda(id_persona),
  CONSTRAINT transferencias_internas_id_persona_destino_fkey FOREIGN KEY (id_persona_destino) REFERENCES public.personas_tienda(id_persona),
  CONSTRAINT transferencias_internas_aprobada_por_fkey FOREIGN KEY (aprobada_por) REFERENCES public.personas_tienda(id_persona)
);
CREATE TABLE public.ubicaciones (
  id_ubicacion integer NOT NULL DEFAULT nextval('ubicaciones_id_ubicacion_seq'::regclass),
  nombre text NOT NULL UNIQUE,
  pin text NOT NULL UNIQUE,
  rol text NOT NULL DEFAULT 'Tienda'::text CHECK (rol = ANY (ARRAY['Tienda'::text, 'Fabrica'::text])),
  activa boolean NOT NULL DEFAULT true,
  CONSTRAINT ubicaciones_pkey PRIMARY KEY (id_ubicacion)
);
CREATE TABLE public.ventas (
  id_venta integer NOT NULL DEFAULT nextval('ventas_id_venta_seq'::regclass),
  id_ubicacion integer,
  id_persona integer,
  nombre_vendedora text,
  fecha_hora timestamp with time zone,
  metodo_pago text NOT NULL,
  monto_total numeric NOT NULL,
  pago_efectivo numeric DEFAULT 0,
  pago_yape numeric DEFAULT 0,
  pago_plin numeric DEFAULT 0,
  pago_tarjeta numeric DEFAULT 0,
  descuento_aplicado numeric DEFAULT 0,
  tipo_venta text DEFAULT 'normal'::text,
  vuelto numeric DEFAULT 0,
  cliente_nombre text,
  cliente_telefono text,
  cliente_documento text,
  CONSTRAINT ventas_pkey PRIMARY KEY (id_venta),
  CONSTRAINT ventas_id_ubicacion_fkey FOREIGN KEY (id_ubicacion) REFERENCES public.ubicaciones(id_ubicacion),
  CONSTRAINT ventas_id_persona_fkey FOREIGN KEY (id_persona) REFERENCES public.personas_tienda(id_persona)
);
CREATE TABLE public.ventas_detalle (
  id_detalle integer NOT NULL DEFAULT nextval('ventas_detalle_id_detalle_seq'::regclass),
  id_venta integer,
  sku_id text,
  precio_final_venta numeric NOT NULL,
  descripcion_manual text,
  cantidad integer DEFAULT 1,
  talla integer,
  color text,
  id_producto integer,
  id_color integer,
  nombre_serie text CHECK (nombre_serie = ANY (ARRAY['Grande'::text, 'Mediana'::text, 'Pequeña'::text])),
  costo_estimado numeric DEFAULT 0,
  marca text,
  modelo text,
  CONSTRAINT ventas_detalle_pkey PRIMARY KEY (id_detalle),
  CONSTRAINT ventas_detalle_id_venta_fkey FOREIGN KEY (id_venta) REFERENCES public.ventas(id_venta),
  CONSTRAINT ventas_detalle_sku_id_fkey FOREIGN KEY (sku_id) REFERENCES public.inventario(sku_id),
  CONSTRAINT ventas_detalle_id_producto_fkey FOREIGN KEY (id_producto) REFERENCES public.productos(id_producto),
  CONSTRAINT ventas_detalle_id_color_fkey FOREIGN KEY (id_color) REFERENCES public.colores_modelos(id_color)
);
CREATE TABLE public.vistas_guardadas (
  id_vista integer NOT NULL DEFAULT nextval('vistas_guardadas_id_vista_seq'::regclass),
  id_persona integer,
  modulo text NOT NULL,
  nombre text NOT NULL,
  es_compartida boolean DEFAULT false,
  es_default boolean DEFAULT false,
  configuracion jsonb NOT NULL DEFAULT '{}'::jsonb,
  orden_display integer DEFAULT 99,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT vistas_guardadas_pkey PRIMARY KEY (id_vista),
  CONSTRAINT vistas_guardadas_id_persona_fkey FOREIGN KEY (id_persona) REFERENCES public.personas_tienda(id_persona)
);

-- Delta aplicado vía migración 20260412120000_finanzas_personas_caja_splits.sql (referencia):
-- ALTER TABLE personas_tienda ADD pin_hash text, ADD id_ubicacion_preferida integer REFERENCES ubicaciones(id_ubicacion);
-- ALTER TABLE movimiento_splits ADD id_ubicacion integer REFERENCES ubicaciones(id_ubicacion);
-- INSERT permisos_persona recurso 'caja' para vendedoras; INSERT configuracion_sistema finanzas_reglas_ritual / finanzas_cuentas_liquidez_lunes

-- ============================================================================
-- MIGRACIONES APLICADAS EN PRODUCCIÓN (Abril 2026)
-- ============================================================================

-- ── 20260414_01_personas_rol.sql ─────────────────────────────────────────────
-- ALTER TABLE personas_tienda
--   ADD COLUMN IF NOT EXISTS rol text NOT NULL DEFAULT 'vendedora'
--   CHECK (rol IN ('vendedora', 'admin', 'operador'));
-- UPDATE personas_tienda SET rol = 'admin' WHERE LOWER(nombre) LIKE '%mamá%' OR LOWER(nombre) LIKE '%mama%';
-- UPDATE personas_tienda SET rol = 'admin' WHERE LOWER(nombre) LIKE '%papá%' OR LOWER(nombre) LIKE '%papa%';

-- ── 20260414_02_costos_materiales_y_saldo_no_negativo.sql ───────────────────
-- CREATE OR REPLACE VIEW public.v_costos_materiales_modelo AS ...  (ver archivo de migración)
-- CREATE OR REPLACE FUNCTION public.fn_validar_saldo_cuenta_no_negativo() RETURNS trigger ...
-- CREATE TRIGGER trg_validar_saldo_cuenta_no_negativo
--   BEFORE INSERT OR UPDATE OF saldo_actual, tipo_cuenta ON public.cuentas_financieras
--   FOR EACH ROW EXECUTE FUNCTION public.fn_validar_saldo_cuenta_no_negativo();

-- ── 20260415_01_trabajadores_y_mapeo_cuenta.sql ──────────────────────────────
-- ALTER TABLE public.personas_tienda
--   ADD COLUMN IF NOT EXISTS tipo_contrato text DEFAULT 'fijo' CHECK (tipo_contrato IN ('fijo','destajo','mixto')),
--   ADD COLUMN IF NOT EXISTS area text DEFAULT 'tienda' CHECK (area IN ('taller','tienda','administracion')),
--   ADD COLUMN IF NOT EXISTS cargo text,
--   ADD COLUMN IF NOT EXISTS salario_base numeric,
--   ADD COLUMN IF NOT EXISTS frecuencia_pago text DEFAULT 'mensual' CHECK (frecuencia_pago IN ('semanal','quincenal','mensual')),
--   ADD COLUMN IF NOT EXISTS fecha_ingreso date,
--   ADD COLUMN IF NOT EXISTS telefono text,
--   ADD COLUMN IF NOT EXISTS notas_trabajador text;
--
-- CREATE TABLE IF NOT EXISTS public.mapeo_categoria_cuenta (
--   id serial PRIMARY KEY,
--   categoria_costo text NOT NULL,
--   ubicacion_rol text,    -- 'Tienda', 'Fabrica', NULL = todos
--   id_cuenta_contable integer REFERENCES public.plan_cuentas(id_cuenta_contable),
--   activo boolean NOT NULL DEFAULT true,
--   created_at timestamp with time zone NOT NULL DEFAULT now()
-- );
--
-- CREATE OR REPLACE VIEW public.v_nomina_resumen AS ... (ver archivo de migración)
-- GRANT SELECT ON public.v_nomina_resumen TO anon, authenticated;
--
-- ── 20260416_01_trabajadores_rotativo_multarea.sql (pendiente) ─────────────
-- ALTER TABLE public.personas_tienda
--   ADD COLUMN IF NOT EXISTS es_rotativo boolean NOT NULL DEFAULT false,
--   ADD COLUMN IF NOT EXISTS areas_adicionales text[] DEFAULT '{}';
--
-- ── 20260416_02_trabajadores_puestos_adicionales.sql (pendiente) ───────────
-- ALTER TABLE public.personas_tienda
--   ADD COLUMN IF NOT EXISTS puestos_adicionales jsonb NOT NULL DEFAULT '[]'::jsonb;--   ADD COLUMN IF NOT EXISTS puestos_adicionales jsonb NOT NULL DEFAULT '[]'::jsonb;

-- ── FASE 1 MOTOR TAXONOMÍA ──────────────────────────────────────────────────
-- Migrations: 20260418_01 through 20260418_14
-- Applied: 2026-04-18
-- ============================================================================

-- ── 20260418_01_catalogos_auxiliares.sql ────────────────────────────────────
-- catalogos_auxiliares: ELIMINADA en Fase 2 (ADR-002). Reemplazada por tablas dedicadas.
-- Ver migraciones 20260420_01 (catálogos) y 20260420_06 (DROP).

CREATE TABLE IF NOT EXISTS public.roles_persona (
  id_rol serial PRIMARY KEY,
  codigo text NOT NULL,
  nombre text NOT NULL,
  ambito text,
  activo boolean NOT NULL DEFAULT true,
  orden integer NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_roles_persona_codigo_ci
  ON public.roles_persona (lower(codigo));

-- ── 20260418_02_tipos_movimiento_extensiones.sql ────────────────────────────

ALTER TABLE public.tipos_movimiento_caja
  ADD COLUMN IF NOT EXISTS direccion text
    CHECK (direccion IN ('entrada','salida','transferencia')),
  ADD COLUMN IF NOT EXISTS id_cuenta_contable_default integer
    REFERENCES public.plan_cuentas(id_cuenta_contable),
  ADD COLUMN IF NOT EXISTS id_cuenta_financiera_default integer
    REFERENCES public.cuentas_financieras(id_cuenta_financiera),
  ADD COLUMN IF NOT EXISTS id_cuenta_origen_default integer
    REFERENCES public.cuentas_financieras(id_cuenta_financiera),
  ADD COLUMN IF NOT EXISTS id_cuenta_destino_default integer
    REFERENCES public.cuentas_financieras(id_cuenta_financiera),
  ADD COLUMN IF NOT EXISTS scope text[] NOT NULL DEFAULT '{manual}',
  ADD COLUMN IF NOT EXISTS comportamientos text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS campos_requeridos jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS afecta_patrimonio boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS color_hex text,
  ADD COLUMN IF NOT EXISTS solo_admin boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS naturaleza text,
  ADD COLUMN IF NOT EXISTS moneda char(3) NOT NULL DEFAULT 'PEN';

CREATE INDEX IF NOT EXISTS idx_tipos_movimiento_caja_scope
  ON public.tipos_movimiento_caja USING gin (scope);

-- ── 20260418_03_plantillas_recurrentes.sql ──────────────────────────────────

CREATE TABLE IF NOT EXISTS public.plantillas_recurrentes (
  id_plantilla serial PRIMARY KEY,
  codigo text NOT NULL,
  nombre text NOT NULL,
  id_tipo integer NOT NULL REFERENCES public.tipos_movimiento_caja(id_tipo),
  id_ubicacion integer REFERENCES public.ubicaciones(id_ubicacion),
  id_cuenta_contable integer REFERENCES public.plan_cuentas(id_cuenta_contable),
  id_cuenta_financiera_default integer REFERENCES public.cuentas_financieras(id_cuenta),
  direccion text,
  monto_estimado numeric(14,2),
  frecuencia text NOT NULL CHECK (frecuencia IN ('mensual','quincenal','semanal','unico')),
  dia_referencia integer,
  comportamientos text[] NOT NULL DEFAULT '{}',
  id_plantilla_objetivo integer REFERENCES public.plantillas_recurrentes(id_plantilla),
  tarifa_por_unidad numeric(14,2),
  estado text NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa','pausada','archivada')),
  activo boolean NOT NULL DEFAULT true,
  datos_extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_plantillas_recurrentes_codigo_ci
  ON public.plantillas_recurrentes (lower(codigo));
CREATE INDEX IF NOT EXISTS idx_plantillas_recurrentes_ubicacion
  ON public.plantillas_recurrentes(id_ubicacion) WHERE id_ubicacion IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_plantillas_recurrentes_tipo
  ON public.plantillas_recurrentes(id_tipo);
CREATE INDEX IF NOT EXISTS idx_plantillas_recurrentes_estado
  ON public.plantillas_recurrentes(estado) WHERE activo = true;

CREATE TABLE IF NOT EXISTS public.plantilla_ejecuciones (
  id_ejecucion serial PRIMARY KEY,
  id_plantilla integer NOT NULL
    REFERENCES public.plantillas_recurrentes(id_plantilla) ON DELETE CASCADE,
  periodo text NOT NULL,
  fecha_generada timestamptz NOT NULL DEFAULT now(),
  id_movimiento integer REFERENCES public.movimientos_caja(id_movimiento),
  id_persona_actor integer REFERENCES public.personas_tienda(id_persona),
  notas text,
  UNIQUE (id_plantilla, periodo)
);

CREATE INDEX IF NOT EXISTS idx_plantilla_ejecuciones_plantilla_periodo
  ON public.plantilla_ejecuciones(id_plantilla, periodo);

-- ── 20260418_04_mapeo_tipo_cuenta.sql ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.mapeo_tipo_cuenta (
  id_mapeo serial PRIMARY KEY,
  id_tipo integer NOT NULL
    REFERENCES public.tipos_movimiento_caja(id_tipo) ON DELETE CASCADE,
  ubicacion_rol text NOT NULL,
  id_cuenta_contable integer NOT NULL REFERENCES public.plan_cuentas(id_cuenta_contable),
  activo boolean NOT NULL DEFAULT true,
  UNIQUE (id_tipo, ubicacion_rol)
);

CREATE INDEX IF NOT EXISTS idx_mapeo_tipo_cuenta_tipo
  ON public.mapeo_tipo_cuenta(id_tipo);

-- ── 20260418_05_movimientos_fks_extra.sql ──────────────────────────────────

ALTER TABLE public.movimientos_caja
  ADD COLUMN IF NOT EXISTS id_plantilla_origen integer
    REFERENCES public.plantillas_recurrentes(id_plantilla),
  ADD COLUMN IF NOT EXISTS id_venta integer
    REFERENCES public.ventas(id_venta),
  ADD COLUMN IF NOT EXISTS id_lote_produccion integer
    REFERENCES public.lotes(id_lote),
  ADD COLUMN IF NOT EXISTS snapshot_tipo_nombre text,
  ADD COLUMN IF NOT EXISTS moneda char(3) NOT NULL DEFAULT 'PEN';

CREATE INDEX IF NOT EXISTS idx_movimientos_plantilla_origen
  ON public.movimientos_caja(id_plantilla_origen) WHERE id_plantilla_origen IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_movimientos_venta
  ON public.movimientos_caja(id_venta) WHERE id_venta IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_movimientos_lote
  ON public.movimientos_caja(id_lote_produccion) WHERE id_lote_produccion IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_movimientos_ubicacion_fecha
  ON public.movimientos_caja(id_ubicacion, fecha_movimiento DESC);

ALTER TABLE public.cuentas_financieras
  ADD COLUMN IF NOT EXISTS moneda char(3) NOT NULL DEFAULT 'PEN';

-- ── 20260418_06_periodos_contables.sql ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.periodos_contables (
  id_periodo serial PRIMARY KEY,
  year integer NOT NULL,
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  estado text NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto','cerrado')),
  cerrado_por integer REFERENCES public.personas_tienda(id_persona),
  cerrado_en timestamptz,
  motivo_reapertura text,
  UNIQUE (year, month)
);

-- ── 20260418_07_auditoria_eventos.sql ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tipo_eventos (
  id_evento serial PRIMARY KEY,
  id_tipo integer NOT NULL
    REFERENCES public.tipos_movimiento_caja(id_tipo) ON DELETE CASCADE,
  tipo_evento text NOT NULL,
  datos_antes jsonb,
  datos_despues jsonb,
  id_persona_actor integer REFERENCES public.personas_tienda(id_persona),
  notas text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tipo_eventos_tipo_fecha
  ON public.tipo_eventos(id_tipo, created_at DESC);

CREATE TABLE IF NOT EXISTS public.plantilla_eventos (
  id_evento serial PRIMARY KEY,
  id_plantilla integer NOT NULL
    REFERENCES public.plantillas_recurrentes(id_plantilla) ON DELETE CASCADE,
  tipo_evento text NOT NULL,
  datos_antes jsonb,
  datos_despues jsonb,
  id_persona_actor integer REFERENCES public.personas_tienda(id_persona),
  notas text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_plantilla_eventos_plantilla_fecha
  ON public.plantilla_eventos(id_plantilla, created_at DESC);

CREATE TABLE IF NOT EXISTS public.audit_log (
  id_audit bigserial PRIMARY KEY,
  tabla text NOT NULL,
  id_registro text NOT NULL,
  accion text NOT NULL CHECK (accion IN ('insert','update','delete')),
  datos_antes jsonb,
  datos_despues jsonb,
  id_persona_actor integer REFERENCES public.personas_tienda(id_persona),
  ip_origen text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_tabla_reg
  ON public.audit_log(tabla, id_registro, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor
  ON public.audit_log(id_persona_actor, created_at DESC);

-- Functions added in Fase 1 (see individual migration files for full definitions):
-- fn_bloquear_periodo_cerrado()              → 20260418_06
-- fn_bloquear_modificacion_audit()           → 20260418_07
-- fn_audit_generico()                        → 20260418_08
-- fn_snapshot_tipo_nombre()                  → 20260418_08
-- fn_validar_suma_splits()                   → 20260418_08
-- fn_resolver_cuenta_contable(integer, integer, integer) → 20260418_09
-- fn_registrar_hecho_economico(...)          → 20260418_10
-- fn_aplicar_splits(integer, jsonb)          → 20260418_10
-- fn_generar_movimiento_desde_plantilla(...) → 20260418_11

-- ── 20260418_12_vistas_observabilidad.sql ──────────────────────────────────
-- (also requires CREATE EXTENSION IF NOT EXISTS pg_trgm)

CREATE OR REPLACE VIEW public.v_sistema_salud AS
SELECT
  (SELECT count(*) FROM public.movimientos_caja WHERE id_tipo IS NULL)
    AS movimientos_sin_tipo,
  (SELECT count(*) FROM public.movimientos_caja WHERE id_cuenta_contable IS NULL)
    AS movimientos_sin_cuenta_contable,
  (SELECT count(*) FROM public.plantillas_recurrentes p
   WHERE p.activo AND p.estado = 'activa' AND p.frecuencia = 'mensual'
     AND NOT EXISTS (
       SELECT 1 FROM public.plantilla_ejecuciones e
       WHERE e.id_plantilla = p.id_plantilla
         AND e.periodo = to_char(now(), 'YYYY-MM')
     ))
    AS plantillas_mensuales_pendientes,
  (SELECT count(*) FROM (
     SELECT s.id_movimiento
     FROM public.movimiento_splits s
     GROUP BY s.id_movimiento
     HAVING SUM(s.monto) <> (
       SELECT m.monto FROM public.movimientos_caja m WHERE m.id_movimiento = s.id_movimiento
     )
   ) q)
    AS splits_desbalanceados;

-- ── 20260418_14_deprecate_legacy_checks.sql ────────────────────────────────
-- Renames legacy inline CHECK constraints to _deprecated_* prefix for safe
-- rollback. See migration file for full DO $$ block with IF EXISTS guards.
-- Constraints renamed:
--   personas_tienda_rol_check        → _deprecated_personas_tienda_rol_check
--   costos_fijos_categoria_check     → _deprecated_costos_fijos_categoria_check
--
-- ═══════════════════════════════════════════════════════════════════════════
-- FASE 1.5 — Cierre de Períodos Contables
-- Migraciones 20260419_01 al 20260419_06
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 20260419_01_cierres_periodo_tabla.sql ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cierres_periodo (
  id_cierre         serial PRIMARY KEY,
  id_periodo        integer NOT NULL REFERENCES public.periodos_contables(id_periodo) ON DELETE RESTRICT,
  version           integer NOT NULL DEFAULT 1,
  id_persona_cerro  integer NOT NULL REFERENCES public.personas_tienda(id_persona),
  cerrado_en        timestamptz NOT NULL DEFAULT now(),
  motivo_reapertura text,
  hash_sha256       text NOT NULL,
  url_storage       text NOT NULL,
  snapshot_kpis     jsonb NOT NULL DEFAULT '{}',
  checklist_salud   jsonb NOT NULL DEFAULT '{}',
  bytes_pdf         integer,
  id_organizacion   uuid,
  UNIQUE (id_periodo, version)
);

-- ── 20260419_02_fn_validar_cierre.sql ────────────────────────────────────
-- fn_validar_cierre(year, month) → jsonb con checklist de salud del período
-- Campos: movimientos_sin_tipo, movimientos_sin_cuenta_contable,
--         splits_desbalanceados, plantillas_mensuales_pendientes,
--         cuentas_con_saldo_negativo, bloqueante, warnings[]

-- ── 20260419_03_fn_cerrar_periodo.sql ────────────────────────────────────
-- fn_cerrar_periodo(...) → { ok, id_cierre, version }
-- Lock pesimista NOWAIT + verificación de nivel 'admin' en recurso 'cierres'

-- ── 20260419_04_fn_reabrir_periodo.sql ───────────────────────────────────
-- fn_reabrir_periodo(id_periodo, motivo, id_persona) → void
-- Motivo obligatorio + nivel 'admin' en recurso 'cierres'

-- ── 20260419_05_storage_bucket_cierres.sql ───────────────────────────────
-- Bucket privado 'cierres-mensuales' + RLS policies (SELECT/INSERT/DELETE)
-- max 20MB, solo application/pdf

-- ── 20260419_06_v_cierres_integridad.sql ─────────────────────────────────
-- Vista v_cierres_integridad: detecta cadena de hashes rota entre versiones
-- + seed de permisos: finanzas:admin → cierres:admin, finanzas:ver/registrar/editar → cierres:ver

-- ============================================================================
-- ── FASE 2 REDISEÑO GESTIÓN EMPRESARIAL ────────────────────────────────────
-- Migrations: 20260420_01 through 20260420_07
-- ============================================================================

-- ── 20260420_01_catalogos_dedicados.sql ────────────────────────────────────

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

CREATE TABLE IF NOT EXISTS public.areas (
    id_area      serial PRIMARY KEY,
    codigo       text NOT NULL UNIQUE,
    nombre       text NOT NULL,
    activo       boolean NOT NULL DEFAULT true,
    orden        integer NOT NULL DEFAULT 100,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

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

CREATE TABLE IF NOT EXISTS public.motivos_merma (
    id_motivo    serial PRIMARY KEY,
    codigo       text NOT NULL UNIQUE,
    nombre       text NOT NULL,
    activo       boolean NOT NULL DEFAULT true,
    orden        integer NOT NULL DEFAULT 100,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.motivos_ajuste (
    id_motivo    serial PRIMARY KEY,
    codigo       text NOT NULL UNIQUE,
    nombre       text NOT NULL,
    activo       boolean NOT NULL DEFAULT true,
    orden        integer NOT NULL DEFAULT 100,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.motivos_devolucion (
    id_motivo    serial PRIMARY KEY,
    codigo       text NOT NULL UNIQUE,
    nombre       text NOT NULL,
    activo       boolean NOT NULL DEFAULT true,
    orden        integer NOT NULL DEFAULT 100,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

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

-- ── 20260420_02_personas_cargo_area_fks.sql ────────────────────────────────
-- ALTER TABLE personas_tienda ADD id_cargo integer FK → cargos, id_area integer FK → areas
-- Columnas text 'cargo' y 'area' marcadas DEPRECATED (mantenidas para retrocompatibilidad)

-- ── 20260420_03_reglas_mapeo_sugerido.sql ──────────────────────────────────

CREATE TABLE IF NOT EXISTS public.reglas_mapeo_sugerido (
    id_regla                    serial PRIMARY KEY,
    categoria_macro             text NOT NULL CHECK (categoria_macro IN (
        'ingreso','gasto_operativo','pago_personas','inversion',
        'traslado','pago_deuda','compra_material'
    )),
    ubicacion_rol               text NOT NULL CHECK (ubicacion_rol IN ('*','Tienda','Fabrica','Administracion')),
    id_cuenta_contable_sugerida integer NOT NULL REFERENCES public.plan_cuentas(id_cuenta_contable),
    prioridad                   integer NOT NULL DEFAULT 100,
    activa                      boolean NOT NULL DEFAULT true,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (categoria_macro, ubicacion_rol)
);

-- fn_sugerir_cuenta_para_tipo(categoria_macro, ubicacion_rol) → integer
-- Busca regla por (categoria, rol) con fallback a wildcard '*'

-- ── 20260420_04_obligaciones_recurrentes.sql ───────────────────────────────

CREATE TABLE IF NOT EXISTS public.obligaciones_recurrentes (
    id_obligacion             serial PRIMARY KEY,
    codigo                    text NOT NULL UNIQUE,
    nombre                    text NOT NULL,
    emoji                     text,
    id_tipo                   integer REFERENCES public.tipos_movimiento_caja(id_tipo),
    id_ubicacion              integer REFERENCES public.ubicaciones(id_ubicacion),
    id_cuenta_origen          integer REFERENCES public.cuentas_financieras(id_cuenta),
    monto_estimado            numeric(12,2),
    monto_es_fijo             boolean NOT NULL DEFAULT false,
    frecuencia                text NOT NULL CHECK (frecuencia IN ('mensual','quincenal','semanal','diaria','anual','custom')),
    dia_del_periodo           integer,
    dias_anticipacion_aviso   integer NOT NULL DEFAULT 5,
    activa                    boolean NOT NULL DEFAULT true,
    notas                     text,
    created_at                timestamptz NOT NULL DEFAULT now(),
    updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.obligaciones_instancias (
    id_instancia              serial PRIMARY KEY,
    id_obligacion             integer NOT NULL REFERENCES public.obligaciones_recurrentes(id_obligacion) ON DELETE CASCADE,
    fecha_vencimiento         date NOT NULL,
    monto_proyectado          numeric(12,2),
    monto_confirmado          numeric(12,2),
    estado                    text NOT NULL DEFAULT 'proyectado' CHECK (estado IN (
        'proyectado','confirmado','vencido','pagado_completo','pagado_parcial','acumulado','cancelado'
    )),
    id_movimiento_resultante  integer REFERENCES public.movimientos_caja(id_movimiento),
    monto_pagado              numeric(12,2),
    saldo_pendiente           numeric(12,2),
    nota                      text,
    archivo_recibo_url        text,
    confirmada_por            integer REFERENCES public.personas_tienda(id_persona),
    confirmada_en             timestamptz,
    pagada_por                integer REFERENCES public.personas_tienda(id_persona),
    pagada_en                 timestamptz,
    created_at                timestamptz NOT NULL DEFAULT now(),
    updated_at                timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id_obligacion, fecha_vencimiento)
);

-- fn_confirmar_monto_obligacion(id_instancia, monto, id_persona, archivo_url) → integer
-- fn_pagar_obligacion(id_instancia, monto, id_cuenta, fecha, id_persona, modo) → integer
-- fn_generar_obligaciones_pendientes(horizonte_dias) → integer
-- fn_oblig_actualizar_estado_vencido() → trigger
-- v_obligaciones_bandeja: bandeja 3 pestañas con grupo (vencidas/estaSemana/proximas)

-- ── 20260420_05_activos_contratos.sql ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.activos_fijos (
    id_activo               serial PRIMARY KEY,
    codigo                  text NOT NULL UNIQUE,
    nombre                  text NOT NULL,
    descripcion             text,
    categoria               text NOT NULL CHECK (categoria IN (
        'maquinaria','mobiliario','equipos_computo','vehiculo','mejora_local','otro'
    )),
    id_ubicacion            integer REFERENCES public.ubicaciones(id_ubicacion),
    fecha_adquisicion       date NOT NULL,
    valor_adquisicion       numeric(12,2) NOT NULL CHECK (valor_adquisicion >= 0),
    vida_util_meses         integer NOT NULL DEFAULT 60 CHECK (vida_util_meses > 0),
    valor_residual          numeric(12,2) NOT NULL DEFAULT 0 CHECK (valor_residual >= 0),
    metodo_depreciacion     text NOT NULL DEFAULT 'lineal' CHECK (metodo_depreciacion IN ('lineal','acelerada')),
    id_cuenta_activo        integer REFERENCES public.plan_cuentas(id_cuenta_contable),
    id_cuenta_depreciacion  integer REFERENCES public.plan_cuentas(id_cuenta_contable),
    estado                  text NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','vendido','dado_de_baja')),
    fecha_baja              date,
    valor_venta             numeric(12,2),
    archivo_factura_url     text,
    serie_interna           text,
    proveedor               text,
    notas                   text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contratos (
    id_contrato               serial PRIMARY KEY,
    codigo                    text NOT NULL UNIQUE,
    nombre                    text NOT NULL,
    tipo                      text NOT NULL CHECK (tipo IN (
        'alquiler','servicio','licencia','seguro','comodato','otro'
    )),
    id_ubicacion              integer REFERENCES public.ubicaciones(id_ubicacion),
    contraparte_nombre        text NOT NULL,
    contraparte_ruc           text,
    fecha_inicio              date NOT NULL,
    fecha_fin                 date,
    monto_periodico           numeric(12,2),
    moneda                    text NOT NULL DEFAULT 'PEN',
    frecuencia_pago           text CHECK (frecuencia_pago IN ('mensual','trimestral','semestral','anual','unico')),
    dia_del_periodo           integer,
    id_cuenta_gasto           integer REFERENCES public.plan_cuentas(id_cuenta_contable),
    id_obligacion_recurrente  integer REFERENCES public.obligaciones_recurrentes(id_obligacion),
    archivo_contrato_url      text,
    estado                    text NOT NULL DEFAULT 'vigente' CHECK (estado IN ('vigente','por_vencer','vencido','rescindido')),
    notas                     text,
    created_at                timestamptz NOT NULL DEFAULT now(),
    updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.depreciacion_mensual (
    id_depreciacion    serial PRIMARY KEY,
    id_activo          integer NOT NULL REFERENCES public.activos_fijos(id_activo) ON DELETE CASCADE,
    anio               integer NOT NULL,
    mes                integer NOT NULL CHECK (mes BETWEEN 1 AND 12),
    monto_depreciacion numeric(12,2) NOT NULL,
    valor_neto_cierre  numeric(12,2) NOT NULL,
    id_movimiento      integer REFERENCES public.movimientos_caja(id_movimiento),
    generado_en        timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id_activo, anio, mes)
);

-- fn_generar_depreciacion_mensual(anio, mes) → integer
-- v_activos_con_valor_neto: activos con valor neto calculado
-- v_depreciacion_mensual_resumen: resumen por (anio, mes)

-- ── 20260420_06_drop_catalogos_auxiliares.sql ──────────────────────────────
-- DROP TABLE IF EXISTS public.catalogos_auxiliares CASCADE;

-- ── 20260420_07_hardening_auditoria.sql ────────────────────────────────────
-- 7.1: ventas + idempotency_key text UNIQUE parcial
-- 7.2: movimientos_caja + idempotency_key text UNIQUE parcial
-- 7.3: idx_obligaciones_instancias_bandeja (estado, fecha_vencimiento)
-- 7.4: FKs históricas ON DELETE RESTRICT (ventas, movimientos_caja, movimiento_splits)
-- 7.5: Verificación plantillas_recurrentes y vistas_guardadas (huérfanas)
