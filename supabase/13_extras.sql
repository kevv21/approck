-- ===========================================================================
-- Extras para las pizzas: bacon, chorizo, borde de queso...
-- Si ya corriste 00_INSTALAR.sql antes de este cambio, pega solo esto.
-- Se puede repetir sin romper nada (`on conflict (nombre) do nothing`).
-- ===========================================================================
--
-- POR QUE VAN EN `producto` Y NO EN UNA TABLA PROPIA. Una tabla nueva obliga a
-- tocar BLINDAR, PERMITIR_ANONIMO, EXIGIR_CUENTA, el diagnostico y la copia
-- offline del menu, y basta olvidar UNO para que en produccion el selector de
-- extras salga vacio sin ningun error. Como productos de la categoria
-- "Extras" heredan todo eso ya probado: se leen con el menu, se guardan para
-- tomar ordenes sin senal, y son de solo lectura para la app. La caja no los
-- muestra en la rejilla: solo dentro de cada pizza.
--
-- LOS NOMBRES LLEVAN "Extra" delante y no es adorno: `nombre` es unico, y la
-- pizza "Pepperoni" ya existe. Un extra llamado "Pepperoni" chocaria con ella
-- y el `on conflict do nothing` lo saltaria EN SILENCIO: el extra simplemente
-- no apareceria. Ademas es lo que se lee en el ticket, debajo de la pizza:
-- "+ Extra Bacon".
--
-- PRECIOS en centavos y SIN IVA, como el resto de la carta: C$60 de extra
-- terminan siendo C$69 para el cliente. Si la lista del dueno ya traia el IVA
-- adentro, cada precio se divide entre 1.15 (C$60 -> 5217).

insert into producto (nombre, descripcion, categoria, grupo_descuento, precio, activo, orden) values
('Extra Bacon',     null, 'Extras', 'otro', 6000, true, 10),
('Extra Chorizo',   null, 'Extras', 'otro', 6000, true, 20),
('Extra Piña',      null, 'Extras', 'otro', 6000, true, 30),
('Extra Queso',     null, 'Extras', 'otro', 7000, true, 40),
('Extra Aceitunas', null, 'Extras', 'otro', 6000, true, 50),
('Extra Brócoli',   null, 'Extras', 'otro', 6000, true, 60),
('Extra Hongos',    null, 'Extras', 'otro', 7000, true, 70),
('Extra Pepperoni', null, 'Extras', 'otro', 6000, true, 80),
('Borde de queso',  null, 'Extras', 'otro', 8500, true, 90)
on conflict (nombre) do nothing;
