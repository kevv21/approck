-- ===========================================================================
-- APPROCK - esquema POS
-- Ejecutar en Supabase: SQL Editor -> pegar -> Run
-- Todo el dinero se guarda como ENTEROS de centavos (C$260.00 -> 26000).
-- Los precios NO incluyen IVA; el 15% se suma al cobrar.
-- ===========================================================================

create type grupo_descuento as enum ('pizza', 'bebida', 'otro');
create type tipo_orden      as enum ('mesa', 'para_llevar', 'delivery', 'retiro');
create type metodo_pago     as enum ('efectivo', 'tarjeta', 'transferencia', 'mixto');
create type estado_orden    as enum ('abierta', 'pagada', 'anulada');
create type estado_job      as enum ('pendiente', 'imprimiendo', 'impreso', 'error');
create type tipo_job        as enum ('cliente', 'cocina', 'prueba');

-- --------------------------------------------------------------- catalogo --
create table producto (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null,
  descripcion     text,
  categoria       text not null,
  grupo_descuento grupo_descuento not null default 'otro',
  precio          integer not null check (precio >= 0),  -- centavos, SIN IVA
  activo          boolean not null default true,
  orden           integer not null default 0,
  created_at      timestamptz not null default now()
);
create index on producto (categoria, orden);

-- ------------------------------------------------------------------ turno --
create table turno (
  id              uuid primary key default gen_random_uuid(),
  abierto_por     text not null,
  abierto_at      timestamptz not null default now(),
  cerrado_at      timestamptz,
  fondo_inicial   integer not null default 0,
  efectivo_contado integer,
  notas           text
);
create unique index un_solo_turno_abierto on turno ((cerrado_at is null)) where cerrado_at is null;

-- ----------------------------------------------------------------- ordenes --
create sequence orden_numero_seq;

create table orden (
  id              uuid primary key default gen_random_uuid(),
  numero          integer not null default nextval('orden_numero_seq'),
  turno_id        uuid references turno(id) on delete set null,

  tipo            tipo_orden not null,
  mesa            text,
  cliente         text,
  telefono_cliente text,
  direccion       text,
  notas           text,
  atendio         text,

  -- Snapshot de la configuracion con la que se calculo esta orden.
  -- Si manana cambia el IVA o la politica de propina, los cierres
  -- historicos siguen cuadrando.
  iva_bps         integer not null default 1500,
  propina_bps     integer not null default 1000,
  propina_sobre   text    not null default 'base',

  -- Descuentos (porcentaje en bps o monto en centavos)
  desc_general_tipo    text,
  desc_general_valor   integer not null default 0,
  desc_pizza_tipo      text,
  desc_pizza_valor     integer not null default 0,
  desc_bebida_tipo     text,
  desc_bebida_valor    integer not null default 0,
  desc_motivo          text,

  -- Totales calculados, en centavos
  subtotal_bruto  integer not null default 0,
  desc_pizzas     integer not null default 0,
  desc_bebidas    integer not null default 0,
  desc_general    integer not null default 0,
  desc_total      integer not null default 0,
  base_productos  integer not null default 0,
  costo_envio     integer not null default 0,
  base_gravable   integer not null default 0,
  iva             integer not null default 0,
  propina         integer not null default 0,
  total           integer not null default 0,

  metodo_pago     metodo_pago,
  recibido        integer,
  cambio          integer,

  estado          estado_orden not null default 'abierta',
  created_at      timestamptz not null default now(),
  cerrada_at      timestamptz
);
create index on orden (turno_id);
create index on orden (created_at desc);
create index on orden (estado);

-- ------------------------------------------------------------ items orden --
create table orden_item (
  id              uuid primary key default gen_random_uuid(),
  orden_id        uuid not null references orden(id) on delete cascade,
  producto_id     uuid references producto(id) on delete set null,

  -- OBLIGATORIO: si el precio del catalogo cambia manana, los cierres
  -- historicos NO deben cambiar. Nunca leas el precio via FK para reportes.
  nombre_snapshot text not null,
  precio_snapshot integer not null,
  grupo_snapshot  grupo_descuento not null,

  cantidad        integer not null check (cantidad > 0),
  notas           text,

  bruto           integer not null default 0,
  desc_categoria  integer not null default 0,
  desc_general    integer not null default 0,
  desc_total      integer not null default 0,
  neto            integer not null default 0
);
create index on orden_item (orden_id);

-- --------------------------------------------------- cola de impresion ----
-- El corazon de la arquitectura: cualquier dispositivo (incluido un iPhone)
-- escribe aqui; solo el Android de caja lee y manda a la PT-210 por Bluetooth.
create table print_job (
  id            uuid primary key default gen_random_uuid(),
  orden_id      uuid references orden(id) on delete cascade,
  tipo          tipo_job not null default 'cliente',
  -- Bytes ESC/POS ya maquetados, en base64.
  payload_b64   text not null,
  -- Texto plano de respaldo, para diagnosticar sin descodificar.
  preview       text,
  estado        estado_job not null default 'pendiente',
  intentos      integer not null default 0,
  error         text,
  created_at    timestamptz not null default now(),
  impreso_at    timestamptz
);
create index on print_job (estado, created_at);

-- Que la estacion reciba los trabajos por realtime en vez de solo polling.
alter publication supabase_realtime add table print_job;
