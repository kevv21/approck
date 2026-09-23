-- ===========================================================================
-- Promociones de dos pizzas 14".
-- Si ya corriste 00_INSTALAR.sql antes de este cambio, pega solo esto.
-- Se puede repetir sin romper nada (`on conflict (nombre) do nothing`).
-- ===========================================================================
--
-- EL PRECIO. C$500 que el cliente PAGA, con cajas e IVA adentro. Se guarda
-- 50000 con `precio_incluye_iva = true`: el motor saca el IVA de adentro en
-- vez de sumarlo, asi que el recibo muestra la promo a C$500 y la linea «IVA»
-- lleva solo el IVA de lo demas. Dos promos son C$1000.00 exactos.
--
-- (Una version anterior guardaba la base, 43478, y le sumaba el 15%. El total
-- daba igual, pero el recibo mostraba la promo a C$434.78 y parecia que se
-- le cobraba IVA. Ver 14_iva_incluido.sql, que tambien corrige las ya
-- cargadas.)
--
-- EL GRUPO es 'otro' y no 'pizza', y no es un descuido:
--   1. El empaque se cobra por PIZZA, y la promo ya trae sus cajas.
--   2. Un descuento de categoria "pizzas" no deberia caerle a una promo.
--   3. No aparece en el selector de mitad y mitad: dos pizzas enteras no se
--      parten.
--
-- CAMBIAR EL PRECIO: es el precio final, tal cual. Para C$550, 55000.

alter table producto add column if not exists precio_incluye_iva boolean not null default false;

insert into producto (nombre, descripcion, categoria, grupo_descuento, precio, precio_incluye_iva, activo, orden) values
('Promo Jamón + Pepperoni', 'Dos pizzas 14", cajas e IVA incluidos.', 'Promociones', 'otro', 50000, true, true, 10),
('Promo Jamón + Hawaiana',  'Dos pizzas 14", cajas e IVA incluidos.', 'Promociones', 'otro', 50000, true, true, 20),
('Promo 2 Hawaianas',       'Dos pizzas 14", cajas e IVA incluidos.', 'Promociones', 'otro', 50000, true, true, 30)
on conflict (nombre) do nothing;
