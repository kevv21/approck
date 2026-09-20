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
