-- ===========================================================================
-- Quitar ordenes del historial SIN que figuren como anuladas.
-- Si ya corriste 00_INSTALAR.sql antes de este cambio, pega solo esto.
-- Se puede repetir sin romper nada.
-- ===========================================================================
--
-- POR QUE NO ES UN DELETE.
--
-- La orden queda en la base, marcada, y desaparece del historial, del cierre
-- y del Excel. No dice "anulada" en ninguna parte, que es lo que se pidio.
--
-- Borrar la fila de verdad convierte el arqueo en un adorno: quien cobra en
-- efectivo podria quedarse con la plata, borrar la orden, y la caja cuadraria
-- perfecto. Con la fila marcada el arqueo no cambia —la orden no cuenta— pero
-- queda de donde salio si algun dia hay que revisar. Ademas se puede
-- restaurar; un delete no.
--
-- Lo que se borra de verdad se borra con SQL, a mano, por el dueno. Ver
-- `LIMPIAR_PRUEBAS.sql`.

alter table orden add column if not exists oculta_at     timestamptz;
alter table orden add column if not exists oculta_por    text;
alter table orden add column if not exists oculta_motivo text;

-- El cierre filtra por esta columna en cada consulta del dia.
create index if not exists idx_orden_oculta on orden (oculta_at)
  where oculta_at is null;

-- Dos acciones nuevas en la bitacora. `add value` corre dentro de una
-- transaccion en Postgres 12+, asi que no rompe el editor de Supabase;
-- verificado contra 16.13.
alter type accion_auditoria add value if not exists 'exclusion';
alter type accion_auditoria add value if not exists 'restauracion';
