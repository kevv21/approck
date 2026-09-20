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

create type estado_conteo as enum ('abierto', 'cerrado');

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
create policy p_insumo      on insumo      for all using (true) with check (true);
create policy p_conteo      on conteo      for all using (true) with check (true);
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
