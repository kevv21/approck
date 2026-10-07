-- ===========================================================================
-- APPROCK — GUARDAR UNA ORDEN DE UNA SOLA VEZ
--
-- Ya incluido en 00_INSTALAR.sql. Idempotente: se puede correr varias veces.
--
-- POR QUE
--
-- Antes la app guardaba la orden y despues sus lineas, en dos pedidos
-- separados a la base. Dos fallos salian de ahi:
--
-- 1. ORDEN SIN LINEAS. Si la orden entraba y las lineas no (se cae la senal
--    entre un pedido y otro), quedaba una orden con total y sin productos,
--    contada en el cierre. El reintento la encontraba por `id_local` y la
--    daba por buena sin agregarle las lineas.
-- 2. DOBLE COBRO. Cada toque en «Cobrar» inventaba un `id_local` nuevo. Si
--    la orden entraba pero la respuesta se perdia, el segundo toque creaba
--    OTRA orden: la venta salia dos veces en el cierre.
--
-- Esta funcion guarda orden y lineas en una sola transaccion (todo o nada) y
-- es idempotente respecto de `id_local`: la segunda llamada con el mismo
-- `id_local` devuelve la orden que ya existe, con `ya_existia = true`. Si esa
-- orden quedo sin lineas por el fallo viejo, se las completa.
--
-- Dos llamadas simultaneas con el mismo `id_local` tampoco duplican: el
-- indice unico hace esperar a la segunda, y el `on conflict` la convierte en
-- «ya existia».
-- ===========================================================================

create or replace function crear_orden(p_orden jsonb, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r      orden;   -- lo que manda la app
  nueva  orden;
  previa orden;
begin
  r := jsonb_populate_record(null::orden, p_orden);

  if r.id_local is null or btrim(r.id_local) = '' then
    raise exception 'Falta id_local: sin el no se puede evitar una orden duplicada.';
  end if;
  if r.estado is null or r.estado not in ('abierta', 'pagada') then
    raise exception 'Estado no valido para una orden nueva: %', r.estado;
  end if;
  if coalesce(jsonb_array_length(p_items), 0) = 0 then
    raise exception 'Una orden sin lineas no se guarda.';
  end if;

  insert into orden (
    id_local, creada_offline, tomada_at, iva_bps, precios_incluyen_iva,
    precio_mitades, tipo_cambio,
    turno_id, tipo, mesa, cliente, telefono_cliente, direccion, notas,
    atendio, mesero, cajero,
    empaque_por_pizza, empaque_gravado, empaque, envio_gravado,
    propina_bps, propina_sobre,
    desc_general_tipo, desc_general_valor, desc_pizza_tipo, desc_pizza_valor,
    desc_bebida_tipo, desc_bebida_valor, desc_motivo,
    subtotal_bruto, desc_pizzas, desc_bebidas, desc_general, desc_total,
    desc_lineas, base_productos, costo_envio, base_gravable, base_exenta,
    iva, propina, total, total_usd,
    metodo_pago, recibido, cambio, estado, cerrada_at
  ) values (
    r.id_local, coalesce(r.creada_offline, false), coalesce(r.tomada_at, now()),
    r.iva_bps, coalesce(r.precios_incluyen_iva, false),
    coalesce(r.precio_mitades, 'promedio'), coalesce(r.tipo_cambio, 0),
    r.turno_id, r.tipo, r.mesa, r.cliente, r.telefono_cliente, r.direccion, r.notas,
    r.atendio, r.mesero, r.cajero,
    coalesce(r.empaque_por_pizza, 0), coalesce(r.empaque_gravado, true),
    coalesce(r.empaque, 0), coalesce(r.envio_gravado, false),
    r.propina_bps, r.propina_sobre,
    r.desc_general_tipo, coalesce(r.desc_general_valor, 0),
    r.desc_pizza_tipo, coalesce(r.desc_pizza_valor, 0),
    r.desc_bebida_tipo, coalesce(r.desc_bebida_valor, 0), r.desc_motivo,
    r.subtotal_bruto, r.desc_pizzas, r.desc_bebidas, r.desc_general, r.desc_total,
    coalesce(r.desc_lineas, 0), r.base_productos, r.costo_envio, r.base_gravable,
    r.base_exenta, r.iva, r.propina, r.total, r.total_usd,
    r.metodo_pago, r.recibido, r.cambio, r.estado, r.cerrada_at
  )
  on conflict (id_local) where id_local is not null do nothing
  returning * into nueva;

  if nueva.id is null then
    -- Ya existia: un reintento cuya primera respuesta se perdio.
    select * into previa from orden where id_local = r.id_local;
    if not exists (select 1 from orden_item where orden_id = previa.id) then
      -- Quedo sin lineas por el fallo de antes de esta funcion: se completan.
      perform crear_orden_lineas(previa.id, p_items);
    end if;
    return jsonb_build_object('orden', to_jsonb(previa), 'ya_existia', true);
  end if;

  perform crear_orden_lineas(nueva.id, p_items);
  return jsonb_build_object('orden', to_jsonb(nueva), 'ya_existia', false);
end $$;

-- Las lineas, aparte porque las usan los dos caminos de arriba. La lista de
-- columnas es la misma que la de editar_orden; instalador.test.ts exige que
-- cubra todo lo que la app escribe.
create or replace function crear_orden_lineas(p_orden_id uuid, p_items jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into orden_item (
    orden_id, producto_id, nombre_snapshot, precio_snapshot, grupo_snapshot,
    aplica_iva_snapshot, iva_incluido_snapshot, cantidad, notas, modificadores,
    mitades, desc_linea_tipo, desc_linea_valor, bruto, desc_linea,
    desc_categoria, desc_general, desc_total, neto, base, iva
  )
  select
    p_orden_id, x.producto_id, x.nombre_snapshot, x.precio_snapshot, x.grupo_snapshot,
    coalesce(x.aplica_iva_snapshot, true), coalesce(x.iva_incluido_snapshot, false),
    x.cantidad, x.notas, x.modificadores,
    x.mitades, x.desc_linea_tipo, coalesce(x.desc_linea_valor, 0), x.bruto,
    coalesce(x.desc_linea, 0), x.desc_categoria, x.desc_general, x.desc_total,
    x.neto, coalesce(x.base, 0), coalesce(x.iva, 0)
  from jsonb_populate_recordset(null::orden_item, p_items) x;
$$;

-- Permisos: igual que editar_orden. `crear_orden_lineas` no se expone: solo
-- la llama `crear_orden`, que corre con los permisos de su dueño.
revoke all on function crear_orden(jsonb, jsonb) from public;
revoke all on function crear_orden_lineas(uuid, jsonb) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function crear_orden(jsonb, jsonb) to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon')
     and has_table_privilege('anon', 'public.orden', 'SELECT') then
    grant execute on function crear_orden(jsonb, jsonb) to anon;
  end if;
end $$;

notify pgrst, 'reload schema';
