-- ===========================================================================
-- Mitad y mitad, y PedidosYa fuera de los metodos de pago.
-- Solo hace falta si ya corriste el esquema antes de este cambio.
-- ===========================================================================

-- PedidosYa deja de ser metodo de pago: esa plata no pasa por la caja. Se
-- anota el total que reporta la plataforma al cerrar el turno.
alter table turno add column if not exists ventas_pedidosya integer not null default 0;

-- Pizza mitad y mitad. Las mitades se guardan en la linea, no como dos
-- lineas, porque es un solo producto que sale del horno.
alter table orden_item add column if not exists mitades jsonb;
alter table orden add column if not exists precio_mitades text not null default 'promedio';
alter table settings add column if not exists precio_mitades text not null default 'promedio';

-- Si el enum todavia tiene pedidosya, las ordenes viejas lo conservan: no se
-- borra el valor, solo se deja de ofrecer en la app.
