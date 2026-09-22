-- ===========================================================================
-- BORRAR DE VERDAD las ordenes de prueba, antes de abrir al publico.
--
-- ESTO NO SE DESHACE. Correlo UNA VEZ, cuando termines de probar y antes del
-- primer dia real de ventas. Despues de esa fecha no vuelvas a correrlo:
-- borrar ventas reales deja el arqueo sin con que cuadrar.
--
-- Para el dia a dia NO uses esto. Usa el boton "Quitar del historial" de la
-- pantalla de Cierres: saca la orden del cierre igual, sin decir "anulada",
-- y se puede deshacer.
-- ===========================================================================

-- 1. MIRA PRIMERO QUE VAS A BORRAR. Cambia la fecha y corre solo esto.
--    Si el numero no es el que esperas, NO sigas.
select count(*) as ordenes_a_borrar,
       min(created_at) as desde,
       max(created_at) as hasta,
       sum(total) / 100.0 as cordobas
from orden
where created_at < '2026-10-01';   -- <<< AJUSTA ESTA FECHA

-- 2. Solo si el paso 1 mostro lo que esperabas, descomenta el bloque y correlo.
--    Las lineas se van solas por la llave foranea (on delete cascade); la
--    bitacora y la cola de impresion quedan con orden_id en NULL, no se borran.
--
-- begin;
--   delete from print_job where orden_id in (
--     select id from orden where created_at < '2026-10-01');
--   delete from orden where created_at < '2026-10-01';
--   -- Reinicia el correlativo para que la primera venta real sea la #1.
--   -- Quita esta linea si prefieres seguir numerando desde donde ibas.
--   alter sequence orden_numero_seq restart with 1;
-- commit;

-- 3. Comprueba que quedo vacio.
-- select count(*) as ordenes_restantes from orden;
