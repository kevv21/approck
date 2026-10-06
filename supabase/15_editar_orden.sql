-- ===========================================================================
-- APPROCK — EDITAR UNA ORDEN YA GUARDADA
--
-- Ya incluido en 00_INSTALAR.sql. Idempotente: se puede correr varias veces.
--
-- POR QUE UNA FUNCION Y NO PERMISOS
--
-- BLINDAR.sql congela el total y las lineas de una orden: nadie con la clave
-- publica puede hacer `update orden set total = 0` despues de cobrar. Eso no
-- se toca. Lo que se agrega es UN camino controlado para corregir una orden,
-- que hace todo junto o nada:
--
--   - reemplaza las lineas y los totales en una sola transaccion (si algo
--     falla, la orden queda como estaba, nunca a medias);
--   - se niega a tocar una orden anulada;
--   - se niega a tocar una orden COBRADA de un turno ya cerrado: ese efectivo
--     ya se conto y se firmo, y cambiarla descuadraria un cierre impreso;
--   - una orden cobrada no puede volver a quedar "abierta" (sin cobrar);
--   - editar una orden cobrada exige motivo y deja en la bitacora el total,
--     el metodo y las lineas de ANTES y de DESPUES. Bajar el total de una
--     venta en efectivo despues de cobrarla es la forma clasica de quedarse
--     con la diferencia; con esto se puede, pero queda escrito quien y cuanto.
--
-- Una orden ABIERTA (guardada sin cobrar) se edita libremente y sin
-- bitacora: todavia no es plata. Al cobrarla pasa a 'pagada' por aqui mismo.
-- ===========================================================================

alter type accion_auditoria add value if not exists 'edicion';

create or replace function editar_orden(
  p_id uuid, p_orden jsonb, p_items jsonb, p_motivo text default null
) returns orden
language plpgsql
security definer
set search_path = public
as $$
declare
  v      orden;   -- como estaba
  r      orden;   -- lo que manda la app
  nuevo  orden;   -- como queda
  turno_cerrado boolean;
  antes  jsonb;
begin
  select * into v from orden where id = p_id for update;
  if not found then
    raise exception 'La orden no existe.';
  end if;
  if v.estado = 'anulada' then
    raise exception 'La orden #% esta anulada: no se puede editar.', v.numero;
  end if;

  r := jsonb_populate_record(null::orden, p_orden);

  if r.estado is null or r.estado not in ('abierta', 'pagada') then
    raise exception 'Estado no valido para editar: %', r.estado;
  end if;
  if v.estado = 'pagada' and r.estado <> 'pagada' then
    raise exception 'La orden #% ya esta cobrada: no puede volver a quedar sin cobrar.', v.numero;
  end if;
  if coalesce(jsonb_array_length(p_items), 0) = 0 then
    raise exception 'Una orden sin lineas no se guarda. Para quitarla, anulala.';
  end if;

  if v.estado = 'pagada' then
    select t.cerrado_at is not null into turno_cerrado from turno t where t.id = v.turno_id;
    if coalesce(turno_cerrado, false) then
      raise exception 'La orden #% es de un turno ya cerrado. Su efectivo ya se conto: para corregirla, anulala y cargala de nuevo.', v.numero;
    end if;
    if coalesce(btrim(p_motivo), '') = '' then
      raise exception 'Editar una orden cobrada necesita un motivo.';
    end if;
    antes := jsonb_build_object(
      'total', v.total, 'metodo_pago', v.metodo_pago, 'recibido', v.recibido,
      'lineas', (select jsonb_agg(jsonb_build_object(
                   'nombre', i.nombre_snapshot, 'cantidad', i.cantidad, 'neto', i.neto))
                 from orden_item i where i.orden_id = p_id));
  end if;

  -- Columnas que se pueden cambiar. Las que congelan la politica del dia
  -- (iva_bps, precios_incluyen_iva, precio_mitades, tipo_cambio) y las de
  -- identidad (numero, id_local, created_at) no estan en esta lista.
  update orden set
    tipo = r.tipo, mesa = r.mesa, cliente = r.cliente,
    telefono_cliente = r.telefono_cliente, direccion = r.direccion,
    notas = r.notas, atendio = r.atendio, mesero = r.mesero, cajero = r.cajero,
    -- Una orden cobrada se queda en el turno donde entro la plata.
    turno_id = case when v.estado = 'pagada' then v.turno_id else r.turno_id end,
    empaque_por_pizza = r.empaque_por_pizza, empaque_gravado = r.empaque_gravado,
    empaque = r.empaque, envio_gravado = r.envio_gravado,
    propina_bps = r.propina_bps, propina_sobre = r.propina_sobre,
    desc_general_tipo = r.desc_general_tipo, desc_general_valor = r.desc_general_valor,
    desc_pizza_tipo = r.desc_pizza_tipo, desc_pizza_valor = r.desc_pizza_valor,
    desc_bebida_tipo = r.desc_bebida_tipo, desc_bebida_valor = r.desc_bebida_valor,
    desc_motivo = r.desc_motivo,
    subtotal_bruto = r.subtotal_bruto, desc_pizzas = r.desc_pizzas,
    desc_bebidas = r.desc_bebidas, desc_general = r.desc_general,
    desc_total = r.desc_total, desc_lineas = r.desc_lineas,
    base_productos = r.base_productos, costo_envio = r.costo_envio,
    base_gravable = r.base_gravable, base_exenta = r.base_exenta,
    iva = r.iva, propina = r.propina, total = r.total, total_usd = r.total_usd,
    metodo_pago = r.metodo_pago, recibido = r.recibido, cambio = r.cambio,
    estado = r.estado,
    cerrada_at = case when v.estado = 'pagada' then v.cerrada_at else r.cerrada_at end
  where id = p_id
  returning * into nuevo;

  delete from orden_item where orden_id = p_id;
  insert into orden_item (
    orden_id, producto_id, nombre_snapshot, precio_snapshot, grupo_snapshot,
    aplica_iva_snapshot, iva_incluido_snapshot, cantidad, notas, modificadores,
    mitades, desc_linea_tipo, desc_linea_valor, bruto, desc_linea,
    desc_categoria, desc_general, desc_total, neto, base, iva
  )
  select
    p_id, x.producto_id, x.nombre_snapshot, x.precio_snapshot, x.grupo_snapshot,
    coalesce(x.aplica_iva_snapshot, true), coalesce(x.iva_incluido_snapshot, false),
    x.cantidad, x.notas, x.modificadores,
    x.mitades, x.desc_linea_tipo, coalesce(x.desc_linea_valor, 0), x.bruto,
    coalesce(x.desc_linea, 0), x.desc_categoria, x.desc_general, x.desc_total,
    x.neto, coalesce(x.base, 0), coalesce(x.iva, 0)
  from jsonb_populate_recordset(null::orden_item, p_items) x;

  if v.estado = 'pagada' then
    insert into audit_log (accion, usuario, motivo, orden_id, turno_id, detalle)
    values (
      'edicion',
      coalesce(nullif(r.cajero, ''), '(sin sesion)'),
      btrim(p_motivo),
      p_id,
      nuevo.turno_id,
      jsonb_build_object(
        'orden', v.numero,
        'antes', antes,
        'despues', jsonb_build_object(
          'total', nuevo.total, 'metodo_pago', nuevo.metodo_pago,
          'recibido', nuevo.recibido),
        'diferencia', nuevo.total - v.total)
    );
  end if;

  return nuevo;
end $$;

-- Las funciones nacen ejecutables por PUBLIC. Se cierra y se abre a mano:
-- a `authenticated` siempre, y a `anon` solo si hoy la base admite el modo
-- sin cuenta. Asi correr esto no reabre lo que cerro EXIGIR_CUENTA.sql.
revoke all on function editar_orden(uuid, jsonb, jsonb, text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function editar_orden(uuid, jsonb, jsonb, text) to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon')
     and has_table_privilege('anon', 'public.orden', 'SELECT') then
    grant execute on function editar_orden(uuid, jsonb, jsonb, text) to anon;
  end if;
end $$;

-- PostgREST guarda en cache las funciones que existen. Sin esto, la app
-- puede tardar en ver editar_orden y responder «function not found».
notify pgrst, 'reload schema';
