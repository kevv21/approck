-- ===========================================================================
-- Promociones de dos pizzas 14".
-- Si ya corriste 00_INSTALAR.sql antes de este cambio, pega solo esto.
-- Se puede repetir sin romper nada (`on conflict (nombre) do nothing`).
-- ===========================================================================
--
-- EL PRECIO. El dueno las fijo en C$500 que el cliente PAGA, con las cajas y
-- el IVA ya adentro. La columna `precio` guarda la BASE sin IVA, asi que aqui
-- NO van 50000: si fueran 50000, el motor les sumaria el 15% y el cliente
-- terminaria pagando C$575.
--
--   50000 / 1.15 = 43478.26 centavos  ->  se guarda 43478
--   43478 + 15%  = C$500.00 exactos en el ticket
--
-- Con dos promas en la misma linea da C$999.99 y no C$1000.00: 500/1.15 no
-- cae en centavos enteros. Esta fijado con una prueba a proposito; ver
-- `pricing.test.ts` > "dos promos dan C$999.99".
--
-- EL GRUPO es 'otro' y no 'pizza', y no es un descuido:
--   1. El empaque se cobra por PIZZA, y la promo ya trae sus cajas. Con
--      'pizza' se le sumarian C$30 encima de un precio que ya los incluye.
--   2. Un descuento de categoria "pizzas" no deberia caerle a una promo, que
--      ya es el descuento.
--   3. No aparece en el selector de mitad y mitad, que es lo correcto: una
--      promo de dos pizzas enteras no se parte.
--
-- CAMBIAR EL PRECIO: es un solo numero por fila. Para C$550 finales seria
-- round(55000 / 1.15) = 47826.

insert into producto (nombre, descripcion, categoria, grupo_descuento, precio, activo, orden) values
('Promo Jamón + Pepperoni', 'Dos pizzas 14", cajas e IVA incluidos.', 'Promociones', 'otro', 43478, true, 10),
('Promo Jamón + Hawaiana',  'Dos pizzas 14", cajas e IVA incluidos.', 'Promociones', 'otro', 43478, true, 20),
('Promo 2 Hawaianas',       'Dos pizzas 14", cajas e IVA incluidos.', 'Promociones', 'otro', 43478, true, 30)
on conflict (nombre) do nothing;
