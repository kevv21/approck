-- ===========================================================================
-- Precio con IVA incluido, por producto: las promociones.
-- Si ya corriste 00_INSTALAR.sql antes de este cambio, pega solo esto.
-- Se puede repetir sin romper nada.
-- ===========================================================================
--
-- El dueno pidio que la promo salga «de un solo 500» y que el IVA se cobre
-- solo a lo demas. Al cliente ya se le cobraba eso; lo que estaba mal era
-- COMO se mostraba: la promo se guardaba a su base (C$434.78) y el motor le
-- sumaba el 15%, asi que el recibo ponia la promo a 434.78 y metia sus C$65.22
-- en la linea «IVA». Con una gaseosa salia «IVA 71.22»: parecia que a la
-- promo le habian cobrado IVA.
--
-- Ahora la promo guarda C$500 de verdad, marcada como «precio con IVA
-- incluido», y el motor saca el IVA de adentro en vez de sumarlo. El recibo
-- la muestra a 500 y la linea «IVA» lleva solo el IVA que se suma.
--
-- El IVA de adentro (C$65.22 por promo) SIGUE declarandose en el cierre: el
-- dueno dijo que la promo incluye el IVA. Si el contador dice que es exenta:
--   update producto set aplica_iva = false where categoria = 'Promociones';
-- y el cliente paga exactamente lo mismo.

alter table producto   add column if not exists precio_incluye_iva    boolean not null default false;

-- Se guarda en cada linea vendida, como `aplica_iva_snapshot`: sin esto, una
-- reimpresion recalculaba la promo como base + 15% y salia a C$575.
alter table orden_item add column if not exists iva_incluido_snapshot boolean not null default false;

-- Las promos que ya estaban cargadas a su base pasan a C$500 con IVA
-- incluido. Solo si siguen en 43478: si alguien ya les cambio el precio, no
-- se pisa.
update producto
   set precio = 50000, precio_incluye_iva = true
 where categoria = 'Promociones' and precio = 43478;
