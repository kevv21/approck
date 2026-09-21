-- ===========================================================================
-- Empaque por pizza, y el pedido de reposicion del inventario.
-- Si ya corriste 00_INSTALAR.sql antes de este cambio, pega solo esto.
-- Se puede repetir sin romper nada.
-- ===========================================================================

-- --- empaque -------------------------------------------------------------
-- Se cobra por PIZZA cuando la orden sale del local: para llevar, delivery y
-- retiro. En mesa no hay caja que pagar.
--
-- Se guarda la TARIFA USADA en cada orden, no solo el monto: si mañana el
-- empaque sube a C$40, la reimpresion de una orden de ayer tiene que seguir
-- dando C$30. Sin esto, cambiar el ajuste reescribe el pasado.
alter table orden add column if not exists empaque_por_pizza integer not null default 0;
alter table orden add column if not exists empaque_gravado   boolean not null default true;
alter table orden add column if not exists empaque           integer not null default 0;

-- La tarifa vigente, que es la que propone la pantalla al tomar una orden.
alter table settings add column if not exists empaque_por_pizza integer not null default 3000;
alter table settings add column if not exists empaque_gravado   boolean not null default true;

-- --- pedido de reposicion ------------------------------------------------
-- Cuanto hay que PEDIR de cada insumo. Va junto al conteo porque se decide
-- mirando lo que se conto: es la misma hoja y el mismo momento.
-- numeric y no centavos: aca 2.5 Lb es una cantidad legitima.
alter table conteo_item add column if not exists pedido numeric(12,3);
