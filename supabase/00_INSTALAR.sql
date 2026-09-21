-- ===========================================================================
-- APPROCK — INSTALACIÓN COMPLETA
--
-- Pega TODO este archivo en el SQL Editor de Supabase y dale Run. Una sola
-- vez, un solo paste. Reemplaza a los ocho archivos numerados, que quedan
-- como historial de los cambios.
--
-- Se puede volver a ejecutar sin romper nada: los tipos, las políticas y los
-- índices están protegidos contra duplicados.
--
-- Al terminar deberías ver 57 productos en la tabla `producto` y 59 insumos
-- en `insumo`.
--
-- OJO CON EL PEGADO. Son unos 34 KB. Si se corta a la mitad, Postgres
-- responde algo como:
--
--     ERROR: 42601: syntax error at or near "'Carne molida'"
--     LINE 1: ('Carne molida', 'Lb', 260),
--
-- Ese «LINE 1» es la pista: significa que lo que se ejecutó EMPEZABA ahí, o
-- sea que le falta el encabezado `insert into ... values`. No es un error del
-- archivo: es que llegó incompleto. Comprueba que la última línea del editor
-- sea la última de este archivo, y que no tengas texto seleccionado (el
-- editor de Supabase ejecuta solo la selección cuando hay una).
--
-- SI YA TENÍAS LA BASE INSTALADA y solo quieres ponerla al día, no repitas
-- todo esto: pega `supabase/09_mitades_pedidosya.sql`, que son cuatro líneas.
-- ===========================================================================


-- ===== 01_schema.sql ====================================
-- ===========================================================================
-- APPROCK - esquema POS
-- Ejecutar en Supabase: SQL Editor -> pegar -> Run
-- Todo el dinero se guarda como ENTEROS de centavos (C$260.00 -> 26000).
-- Los precios NO incluyen IVA; el 15% se suma al cobrar.
-- ===========================================================================

do $$ begin
  create type grupo_descuento as enum ('pizza', 'bebida', 'otro');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type tipo_orden      as enum ('mesa', 'para_llevar', 'delivery', 'retiro');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type metodo_pago     as enum ('efectivo', 'banpro', 'bac');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type estado_orden    as enum ('abierta', 'pagada', 'anulada');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type estado_job      as enum ('pendiente', 'imprimiendo', 'impreso', 'error');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type tipo_job        as enum ('cliente', 'cocina', 'prueba', 'precuenta');
exception when duplicate_object then null;
end $$;

-- --------------------------------------------------------------- catalogo --
create table if not exists producto (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null unique,
  descripcion     text,
  categoria       text not null,
  grupo_descuento grupo_descuento not null default 'otro',
  precio          integer not null check (precio >= 0),  -- centavos, SIN IVA
  activo          boolean not null default true,
  orden           integer not null default 0,
  created_at      timestamptz not null default now()
);
create index if not exists idx_producto_categoria_orden on producto (categoria, orden);

-- ------------------------------------------------------------------ turno --
create table if not exists turno (
  id              uuid primary key default gen_random_uuid(),
  abierto_por     text not null,
  abierto_at      timestamptz not null default now(),
  cerrado_at      timestamptz,
  fondo_inicial   integer not null default 0,
  efectivo_contado integer,
  notas           text
);
create unique index if not exists un_solo_turno_abierto on turno ((cerrado_at is null)) where cerrado_at is null;

-- ----------------------------------------------------------------- ordenes --
create sequence if not exists orden_numero_seq;

create table if not exists orden (
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
create index if not exists idx_orden_turno_id on orden (turno_id);
create index if not exists idx_orden_created_at_desc on orden (created_at desc);
create index if not exists idx_orden_estado on orden (estado);

-- ------------------------------------------------------------ items orden --
create table if not exists orden_item (
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
create index if not exists idx_orden_item_orden_id on orden_item (orden_id);

-- --------------------------------------------------- cola de impresion ----
-- El corazon de la arquitectura: cualquier dispositivo (incluido un iPhone)
-- escribe aqui; solo el Android de caja lee y manda a la PT-210 por Bluetooth.
create table if not exists print_job (
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
create index if not exists idx_print_job_estado_created_at on print_job (estado, created_at);

-- Que la estacion reciba los trabajos por realtime en vez de solo polling.
-- Envuelto porque la publicacion solo existe en Supabase: en un Postgres
-- comun este ALTER aborta el script entero y deja media base instalada.
-- Ademas el realtime es un lujo: la estacion consulta la cola igual.
do $$ begin
  alter publication supabase_realtime add table print_job;
exception
  when undefined_object then raise notice 'sin supabase_realtime: la estación usará polling';
  when duplicate_object then null;
end $$;

-- ===== 02_rls.sql =======================================
-- ===========================================================================
-- RLS
--
-- ALCANCE REAL: esto abre las tablas a la clave anon. Es adecuado para UN
-- local, en la red del negocio, con la URL no publicada. NO es seguridad
-- para internet abierto: cualquiera con la URL y la anon key puede escribir.
--
-- Cuando el negocio lo amerite, el upgrade es Clerk (gratis en el GitHub
-- Student Pack) y cambiar `using (true)` por `using (auth.role() = ...)`.
-- ===========================================================================

alter table producto   enable row level security;
alter table turno      enable row level security;
alter table orden      enable row level security;
alter table orden_item enable row level security;
alter table print_job  enable row level security;

drop policy if exists p_producto on producto;
create policy p_producto on producto   for all using (true) with check (true);
drop policy if exists p_turno on turno;
create policy p_turno on turno      for all using (true) with check (true);
drop policy if exists p_orden on orden;
create policy p_orden on orden      for all using (true) with check (true);
drop policy if exists p_orden_item on orden_item;
create policy p_orden_item on orden_item for all using (true) with check (true);
drop policy if exists p_print_job on print_job;
create policy p_print_job on print_job  for all using (true) with check (true);

-- ===== 03_seed_menu.sql =================================
-- ===========================================================================
-- Menu de Rock Munchies transcrito de la carta fisica.
-- precio en CENTAVOS y SIN IVA (C$260.00 -> 26000).
-- Los items tachados en la carta quedan con activo = false: siguen en el
-- catalogo para que los cierres historicos no pierdan el nombre, pero no
-- aparecen al tomar una orden.
-- ===========================================================================

insert into producto (nombre, descripcion, categoria, grupo_descuento, precio, activo, orden) values
-- Pizzas Clasicas 14"
('Jamón',                    null,                                                        'Pizzas Clásicas',  'pizza', 26000, true, 10),
('Pepperoni',                null,                                                        'Pizzas Clásicas',  'pizza', 27000, true, 20),
('Hawaiana',                 'Jamón y piña',                                              'Pizzas Clásicas',  'pizza', 29000, true, 30),
('Margarita',                'Tomate y albahaca',                                         'Pizzas Clásicas',  'pizza', 29000, true, 40),

-- Pizzas Old School
('Diabla',                   'Aceituna negra, cebolla, pepperoni y chile seco',           'Pizzas Old School','pizza', 30000, true, 10),
('Rock Munchies',            'Chiltoma, jamón, salchicha italiana y hongos',              'Pizzas Old School','pizza', 34000, true, 20),
('Trebolactea',              'Mozarella, parmesano y gorgonzola',                         'Pizzas Old School','pizza', 34000, true, 30),
('No Hay Primavera',         'Chiltoma, cebolla, aceituna negra y verde',                 'Pizzas Old School','pizza', 30000, true, 40),
('Aaaay Chorizo',            'Chorizo alemán, español, italiano, pepperoni y pimienta',   'Pizzas Old School','pizza', 37000, true, 50),
('Mare Rosso',               'Tomate y anchoas',                                          'Pizzas Old School','pizza', 40000, true, 60),

-- Pizzas New School
('Española',                 'Tomate confitado, aceituna verde y chorizo español',        'Pizzas New School','pizza', 37000, true, 10),
('Pesto',                    'Salsa pesto, brócoli y chiltoma',                           'Pizzas New School','pizza', 37000, true, 20),
('4 Estaciones Remix',       'Prosciutto, hongos, aceitunas negras y tomate',             'Pizzas New School','pizza', 40000, true, 30),
('Carnicera',                'Bacon, carne molida, salchicha italiana, pepperoni y chimichurri', 'Pizzas New School','pizza', 40000, true, 40),
('Veggie',                   'Brócoli, hongos, chiltoma y espinacas',                     'Pizzas New School','pizza', 37000, true, 50),

-- Pizzas Especiales
('Hawaiana Super Saiyajin',  'Jamón, pepperoni, bacon y piña',                            'Pizzas Especiales','pizza', 44000, true, 10),
('Cordobesa',                'Aceitunas negras, jamón, hongos y ajo',                     'Pizzas Especiales','pizza', 44000, true, 20),
('Chicken Little',           'Salsa pesto, tomate y pollo',                               'Pizzas Especiales','pizza', 44000, true, 30),
('Fugazza',                  'Parmesano, orégano y cebolla',                              'Pizzas Especiales','pizza', 40000, true, 40),
('La Fabulosa',              'Mariscos, cebolla morada, gorgonzola y ajo',                'Pizzas Especiales','pizza', 45000, true, 50),
('Búffalo Chicken',          'Chunks de pollo, salsa buffalo, apio y salsa ranch',        'Pizzas Especiales','pizza', 44000, true, 60),
('Green Day',                'Alcachofa, aceitunas negras, parmesano y albahaca',         'Pizzas Especiales','pizza', 44000, true, 70),
('Brocoletta',               'Brócoli, piña y hongos',                                    'Pizzas Especiales','pizza', 40000, true, 80),
('Brisket',                  'Brisket deshilachada, piña, cebollín y gravy',              'Pizzas Especiales','pizza', 46000, true, 90),

-- Pizzas Pinoleras
('Criolla',                  'Chorizo criollo, cebolla y jalapeños sobre frijoles molidos','Pizzas Pinoleras','pizza', 25000, true, 10),
('Tocineta',                 'Huevo, bacon y espinaca sobre frijoles molidos',            'Pizzas Pinoleras', 'pizza', 25000, true, 20),

-- Entradas
('Munchies Roll Trebolácteo',null,                                                        'Entradas',         'otro',  18000, true,  10),
('Munchies Roll Pepperoni',  null,                                                        'Entradas',         'otro',  18000, true,  20),
('Hummus',                   null,                                                        'Entradas',         'otro',  20000, false, 30),
('Churros de Queso',         null,                                                        'Entradas',         'otro',  12500, true,  40),

-- Pastas
('Fetuccini Trebolácteo',    null,                                                        'Pastas',           'otro',  30000, true, 10),
('Fetuccini Carnicero',      null,                                                        'Pastas',           'otro',  30000, true, 20),

-- Ensaladas (tachadas en la carta)
('Ensalada César',           null,                                                        'Ensaladas',        'otro',  25000, false, 10),
('Ensalada Rock Munchies',   null,                                                        'Ensaladas',        'otro',  28000, false, 20),

-- Bebidas
('Agua Fuente Pura',         null,                                                        'Bebidas',          'bebida', 3500, true,  10),
('Agua Gasificada',          null,                                                        'Bebidas',          'bebida', 4000, true,  20),
('Gaseosa',                  null,                                                        'Bebidas',          'bebida', 4000, true,  30),
('Jugo Natural',             null,                                                        'Bebidas',          'bebida', 4500, false, 40),
('Té Frío',                  null,                                                        'Bebidas',          'bebida', 3500, true,  50),

-- Cervezas nacionales
('Victoria Frost',           null,                                                        'Cervezas',         'bebida', 5200, true,  10),
('Victoria Clásica',         null,                                                        'Cervezas',         'bebida', 6000, true,  20),
('Toña',                     null,                                                        'Cervezas',         'bebida', 6000, true,  30),
('Toña Ultra',               null,                                                        'Cervezas',         'bebida', 6000, false, 40),
('Toña Light',               null,                                                        'Cervezas',         'bebida', 6000, false, 50),

-- Cervezas internacionales
('Miller Lite',              null,                                                        'Cervezas',         'bebida', 6500, true,  60),
('Sol',                      null,                                                        'Cervezas',         'bebida', 8400, true,  70),
('Heineken',                 null,                                                        'Cervezas',         'bebida', 8900, true,  80),
('Heineken 0.0',             null,                                                        'Cervezas',         'bebida', 8900, true,  90),
('Paulaner',                 null,                                                        'Cervezas',         'bebida',10000, true, 100),

-- RTD / Seltzer / Bar
('Smirnoff Ice',             null,                                                        'RTD y Seltzer',    'bebida',10000, false, 10),
('Bliss',                    null,                                                        'RTD y Seltzer',    'bebida', 9300, true,  20),
('Bamboo',                   null,                                                        'RTD y Seltzer',    'bebida', 6900, false, 30),
('Bamboo Sandía',            null,                                                        'RTD y Seltzer',    'bebida', 7500, false, 40),
('Fusión',                   null,                                                        'RTD y Seltzer',    'bebida', 7400, true,  50),
('Spark Hard Seltzer',       null,                                                        'RTD y Seltzer',    'bebida', 6000, true,  60),
('Mix de Michelada',         null,                                                        'Bar',              'bebida', 6000, true,  10),
('Copa de Sangría',          null,                                                        'Bar',              'bebida',10000, true,  20)
on conflict (nombre) do nothing;

-- ===== 04_spec_fase2.sql ================================
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
drop policy if exists p_settings on settings;
create policy p_settings on settings for all using (true) with check (true);

-- La pre-cuenta es un documento mas que puede ir a la cola de impresion.

-- ===== 05_puente.sql ====================================
-- ===========================================================================
-- Fase 4: puente de impresion.
-- El servicio de bridge/ registra un latido para que la caja pueda
-- distinguir "no hay tickets" de "el puente lleva horas caido".
-- ===========================================================================

create table if not exists puente_latido (
  id        text primary key default 'default',
  visto_at  timestamptz not null default now(),
  detalle   text
);

insert into puente_latido (id) values ('default') on conflict (id) do nothing;

alter table puente_latido enable row level security;
drop policy if exists p_puente_latido on puente_latido;
create policy p_puente_latido on puente_latido for all using (true) with check (true);

-- La app consulta esto seguido: indice por si crece el historico.
create index if not exists idx_puente_latido_visto on puente_latido (visto_at desc);

-- ===== 06_offline.sql ===================================
-- ===========================================================================
-- Fase 6: soporte offline.
--
-- La pieza critica es `id_local`: el UUID que el dispositivo le pone a la
-- orden ANTES de tener conexion.
--
-- Sin esto existe un fallo que cobra dos veces: si la orden sube bien pero la
-- conexion se corta antes de que el dispositivo reciba la respuesta, el
-- siguiente intento crea una orden duplicada. Con `id_local` unico, el
-- reintento choca contra la restriccion y el cliente recupera la orden que ya
-- existia en vez de crear otra.
-- ===========================================================================

alter table orden add column if not exists id_local text;

create unique index if not exists un_orden_id_local
  on orden (id_local) where id_local is not null;

-- Marca de que la orden se tomo sin conexion, util para auditar despues.
alter table orden add column if not exists creada_offline boolean not null default false;
-- Momento real en que el mesero la tomo, que puede ser muy anterior a la
-- subida. Los reportes por hora deben usar esta, no created_at.
alter table orden add column if not exists tomada_at timestamptz;

create index if not exists idx_orden_tomada_at on orden (tomada_at desc);

-- ===== 07_inventario.sql ================================
-- ===========================================================================
-- Inventario: insumos transcritos de Plantilla_Inventario.xlsx, sin cambios.
--
-- OJO: 37 de los 59 insumos vienen SIN unidad de medida en la plantilla, y
-- 'Unidad' y 'UND' conviven como dos nombres de lo mismo. No se inventan:
-- se siembran tal cual y la app marca los que faltan, para que alguien que
-- conozca la cocina los complete una sola vez. Sin unidad, dos conteos del
-- mismo insumo no se pueden comparar, que es para lo que sirve el inventario.
-- ===========================================================================

create table if not exists insumo (
  id        uuid primary key default gen_random_uuid(),
  nombre    text not null unique,
  unidad    text,                    -- null = pendiente de definir
  orden     integer not null default 0,
  activo    boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_insumo_orden on insumo (orden);

do $$ begin
  create type estado_conteo as enum ('abierto', 'cerrado');
exception when duplicate_object then null;
end $$;

create table if not exists conteo (
  id            uuid primary key default gen_random_uuid(),
  fecha         date not null default current_date,
  realizado_por text,
  notas         text,
  estado        estado_conteo not null default 'abierto',
  created_at    timestamptz not null default now(),
  cerrado_at    timestamptz
);
create index if not exists idx_conteo_fecha on conteo (fecha desc);

create table if not exists conteo_item (
  id           uuid primary key default gen_random_uuid(),
  conteo_id    uuid not null references conteo(id) on delete cascade,
  insumo_id    uuid references insumo(id) on delete set null,
  -- Snapshot, igual que en las ordenes: si manana renombran un insumo o le
  -- cambian la unidad, los conteos viejos no deben cambiar solos.
  nombre_snapshot text not null,
  unidad_snapshot text,
  -- numeric, NO centavos: aca 2.5 Lb es una cantidad legitima. numeric es
  -- decimal exacto en Postgres, no float, asi que no hay error de redondeo.
  cantidad     numeric(12,3),
  unique (conteo_id, insumo_id)
);
create index if not exists idx_conteo_item_conteo on conteo_item (conteo_id);

alter table insumo      enable row level security;
alter table conteo      enable row level security;
alter table conteo_item enable row level security;
drop policy if exists p_insumo on insumo;
create policy p_insumo on insumo      for all using (true) with check (true);
drop policy if exists p_conteo on conteo;
create policy p_conteo on conteo      for all using (true) with check (true);
drop policy if exists p_conteo_item on conteo_item;
create policy p_conteo_item on conteo_item for all using (true) with check (true);

insert into insumo (nombre, unidad, orden) values
('Harina', 'Arroba', 10),
('Jamón', 'Lb', 20),
('pepperoni', 'Lb', 30),
('Bacon', 'Lb', 40),
('Levadura', 'Unidad', 50),
('Hongos', 'Lb', 60),
('Aceitunas negras', 'Lb', 70),
('Aceitunas verdes', 'Lb', 80),
('Queso mozzarella', 'Lb', 90),
('Queso parmesano', 'Lb', 100),
('Queso Gorgonzola', 'Lb', 110),
('Queso monte Jack', null, 120),
('chorizo parrillero', 'Lb', 130),
('Chorizo criollo', null, 140),
('Chile', null, 150),
('Orégano', null, 160),
('Tomillo', null, 170),
('Te', null, 180),
('Pomodoro', null, 190),
('Salsa de tomate', null, 200),
('Pasta de tomate', null, 210),
('Azúcar', 'Lb', 220),
('Sal', 'UND', 230),
('Aceite de oliva', null, 240),
('Aceite vegetal', 'Galon', 250),
('Carne molida', 'Lb', 260),
('Albahaca', null, 270),
('Pimienta negra', null, 280),
('Chimichurri', null, 290),
('Crema Acida', null, 300),
('Espinaca', null, 310),
('Brócoli', null, 320),
('Chile jalapeño', null, 330),
('Maní', null, 340),
('Pollo', 'Lb', 350),
('Prosciutto', 'Lb', 360),
('Anchoas', 'UND', 370),
('Queso crema', null, 380),
('Manzana', null, 390),
('Piña', 'Lb', 400),
('Caja 18"', null, 410),
('Caja 14"', 'UND', 420),
('Caja 12"', null, 430),
('Gabacha grande', null, 440),
('Gabachas pequeñas', null, 450),
('Jabón', null, 460),
('Bolsa grande', null, 470),
('Bolsa jardin', null, 480),
('Papel higiénico', null, 490),
('Papel aluminio', null, 500),
('Ajo', null, 510),
('bolsas de helado', null, 520),
('Servilletas', null, 530),
('Empaques mr', 'UND', 540),
('Empaques Lasaña', null, 550),
('Empaques Salsa', null, 560),
('Alcachofas', null, 570),
('Mantequilla', null, 580),
('Mantequilla ajo', null, 590)
on conflict (nombre) do nothing;

-- ===== 08_roles_auditoria.sql ===========================
-- ===========================================================================
-- Fase 1 y 7: acceso general, pagos como entidad propia y bitacora de
-- auditoria.
--
-- No hay tabla de usuarios ni matriz de roles: el dueno pidio un acceso
-- general. Un PIN compartido en `settings` y el nombre de quien entra, que
-- es lo que queda en la bitacora y sale impreso en el recibo. Para un local
-- de este tamano, eso es la trazabilidad que sirve cuando falta plata.
-- ===========================================================================

-- --------------------------------------------------------------- pagos ----
-- El spec pide pagos como entidad propia: una orden puede pagarse en varios
-- metodos y en dos monedas a la vez (mitad efectivo en cordobas, mitad
-- tarjeta). Tenerlo como un campo de `orden` no lo permite.
create table if not exists pago (
  id           uuid primary key default gen_random_uuid(),
  orden_id     uuid not null references orden(id) on delete cascade,
  metodo       metodo_pago not null,
  moneda       text not null default 'NIO' check (moneda in ('NIO', 'USD')),
  -- Centavos de la moneda indicada.
  monto        integer not null check (monto >= 0),
  -- Centavos de C$ por 1 US$ al momento del pago. Congelado: el tipo de
  -- cambio de hoy no debe alterar el arqueo de ayer.
  tipo_cambio  integer not null default 0,
  /** Equivalente en centavos de C$, para sumar sin reconvertir. */
  monto_nio    integer not null default 0,
  referencia   text,
  created_at   timestamptz not null default now()
);
create index if not exists idx_pago_orden on pago (orden_id);

-- ------------------------------------------------- arqueo por denominacion --
alter table turno add column if not exists cerrado_por text;
alter table turno add column if not exists efectivo_contado_usd integer;
alter table turno add column if not exists diferencia integer;
-- {"NIO":{"500":3,"100":12,...},"USD":{"20":2,...}}
alter table turno add column if not exists denominaciones jsonb;
alter table turno add column if not exists numero integer;

create sequence if not exists turno_numero_seq;
alter table turno alter column numero set default nextval('turno_numero_seq');

-- ----------------------------------------------------------- auditoria ----
do $$ begin
  create type accion_auditoria as enum (
    'anulacion', 'descuento', 'cambio_precio', 'reimpresion',
    'apertura_caja', 'cierre_caja', 'login_fallido'
  );
exception when duplicate_object then null;
end $$;

create table if not exists audit_log (
  id          uuid primary key default gen_random_uuid(),
  accion      accion_auditoria not null,
  usuario     text not null,
  -- Motivo OBLIGATORIO para anulaciones y descuentos: lo exige el spec y es
  -- lo unico que convierte la bitacora en algo util para el dueno.
  motivo      text,
  orden_id    uuid references orden(id) on delete set null,
  turno_id    uuid references turno(id) on delete set null,
  -- Contexto libre: montos, valores anterior y nuevo, etc.
  detalle     jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists idx_audit_fecha on audit_log (created_at desc);
create index if not exists idx_audit_accion on audit_log (accion, created_at desc);

-- Quien cobro y quien anulo cada orden.
alter table orden add column if not exists mesero      text;
alter table orden add column if not exists cajero      text;
alter table orden add column if not exists anulada_por text;
alter table orden add column if not exists anulada_motivo text;
alter table orden add column if not exists anulada_at  timestamptz;

alter table pago      enable row level security;
alter table audit_log enable row level security;
drop policy if exists p_pago on pago;
create policy p_pago on pago      for all using (true) with check (true);
-- La bitacora no se puede modificar ni borrar desde la app: solo insertar y
-- leer. Una bitacora que el cajero puede editar no sirve de nada.
drop policy if exists p_audit_ins on audit_log;
create policy p_audit_ins on audit_log for insert with check (true);
drop policy if exists p_audit_sel on audit_log;
create policy p_audit_sel on audit_log for select using (true);

-- ---------------------------------------------------------------------------
-- Acceso general (sin roles): un solo PIN compartido en settings y el nombre
-- de quien entra, que es lo que se guarda en la bitacora y sale en el recibo.
-- ---------------------------------------------------------------------------
alter table settings add column if not exists pin_hash text;
-- PIN inicial: 1234. Cámbialo desde Configuracion.
update settings set pin_hash = '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'
  where id = 'default' and pin_hash is null;


-- ===== 09_mitades_pedidosya.sql =========================
-- ---------------------------------------------------------------------------
-- Pizza mitad y mitad, y PedidosYa fuera de los metodos de pago.
--
-- Esto ANTES vivia solo en el archivo numerado 09, que este instalador no
-- aplicaba. Quien pegaba unicamente 00_INSTALAR.sql terminaba con una base
-- donde NINGUNA orden se podia guardar, porque la app escribe
-- orden.precio_mitades en cada insercion. Va aca.
-- ---------------------------------------------------------------------------

-- PedidosYa deja de ser metodo de pago: esa plata no pasa por la caja. La
-- plataforma cobra, descuenta comision y deposita dias despues. Se anota el
-- total que ella reporta al cerrar el turno, y se informa aparte.
alter table turno add column if not exists ventas_pedidosya integer not null default 0;

-- Las dos mitades se guardan EN LA LINEA, no como dos lineas: es un solo
-- producto que sale del horno, y partirlo en dos descuadraria el conteo de
-- pizzas del cierre.
alter table orden_item add column if not exists mitades jsonb;

-- Con que regla se cobro la mitad y mitad. Se guarda por orden para que un
-- cambio de politica manana no reescriba lo que ya se cobro ayer.
alter table orden      add column if not exists precio_mitades text not null default 'promedio';
alter table settings   add column if not exists precio_mitades text not null default 'promedio';

-- Una linea de mitad y mitad no sale del catalogo: es una combinacion. Su
-- producto_id queda NULL, que es justo lo que permite la FK.
