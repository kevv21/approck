-- ===========================================================================
-- Fase 2 del spec: productos exentos, modo "precios con IVA incluido",
-- envio gravado opcional, multimoneda y descuento por linea.
-- Ejecutar DESPUES de 01..03.
-- ===========================================================================

-- Productos exentos de IVA (el spec pide "IVA solo a items gravados").
alter table producto add column if not exists aplica_iva boolean not null default true;

-- Snapshot de la politica de cobro con la que se calculo cada orden.
-- Sin esto, cambiar un ajuste manana descuadra los cierres de ayer.
alter table orden add column if not exists precios_incluyen_iva boolean not null default false;
alter table orden add column if not exists envio_gravado        boolean not null default false;
alter table orden add column if not exists tipo_cambio          integer not null default 0;
alter table orden add column if not exists base_exenta          integer not null default 0;
alter table orden add column if not exists desc_lineas          integer not null default 0;
alter table orden add column if not exists total_usd            integer;

-- Descuento manual por linea y desglose fiscal de la linea.
alter table orden_item add column if not exists aplica_iva_snapshot boolean not null default true;
alter table orden_item add column if not exists desc_linea_tipo     text;
alter table orden_item add column if not exists desc_linea_valor    integer not null default 0;
alter table orden_item add column if not exists desc_linea          integer not null default 0;
alter table orden_item add column if not exists base                integer not null default 0;
alter table orden_item add column if not exists iva                 integer not null default 0;
alter table orden_item add column if not exists modificadores       jsonb;

-- Ajustes del negocio. El spec exige que nada fiscal este hardcodeado.
create table if not exists settings (
  id            text primary key default 'default',
  nombre        text not null default 'Rock Munchies',
  ruc           text,              -- PENDIENTE de llenar
  direccion     text,              -- PENDIENTE de llenar
  telefono      text,              -- PENDIENTE de llenar
  iva_bps       integer not null default 1500,
  precios_incluyen_iva boolean not null default false,
  propina_bps   integer not null default 1000,
  propina_sobre text    not null default 'base',
  cobrar_propina_por_defecto boolean not null default false,
  -- Decision fiscal pendiente de validar con contador: el spec deja el envio
  -- fuera del IVA, pero el delivery es un servicio. Queda como ajuste.
  envio_gravado boolean not null default false,
  tipo_cambio   integer not null default 0,   -- centavos de C$ por 1 US$
  ancho_papel   integer not null default 58,  -- 58 u 80 mm
  pie_recibo    text not null default '¡Gracias por su compra!',
  descuento_max_caja_bps integer not null default 0, -- [X]% del spec, PENDIENTE
  updated_at    timestamptz not null default now()
);

insert into settings (id) values ('default') on conflict (id) do nothing;

alter table settings enable row level security;
create policy p_settings on settings for all using (true) with check (true);

-- La pre-cuenta es un documento mas que puede ir a la cola de impresion.
alter type tipo_job add value if not exists 'precuenta';
