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
create type accion_auditoria as enum (
  'anulacion', 'descuento', 'cambio_precio', 'reimpresion',
  'apertura_caja', 'cierre_caja', 'login_fallido'
);

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
create policy p_pago      on pago      for all using (true) with check (true);
-- La bitacora no se puede modificar ni borrar desde la app: solo insertar y
-- leer. Una bitacora que el cajero puede editar no sirve de nada.
create policy p_audit_ins on audit_log for insert with check (true);
create policy p_audit_sel on audit_log for select using (true);

-- ---------------------------------------------------------------------------
-- Acceso general (sin roles): un solo PIN compartido en settings y el nombre
-- de quien entra, que es lo que se guarda en la bitacora y sale en el recibo.
-- ---------------------------------------------------------------------------
alter table settings add column if not exists pin_hash text;
-- PIN inicial: 1234. Cambialo desde Configuracion.
update settings set pin_hash = '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'
  where id = 'default' and pin_hash is null;
