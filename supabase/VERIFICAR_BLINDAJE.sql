-- ===========================================================================
-- APPROCK — VERIFICAR EL BLINDAJE
--
-- Pega esto en Supabase y dale Run. Intenta 27 operaciones haciendose pasar
-- por `anon` (que es el rol de la clave publishable, la que viaja en el
-- navegador) y dice cuales pasan y cuales rebotan.
--
-- NO ENSUCIA NADA. Todo corre dentro de una transaccion que termina en
-- ROLLBACK, asi que las ordenes y los turnos de prueba desaparecen. Se puede
-- correr sobre la base de produccion y sobre una caja abierta.
--
-- Todas las filas tienen que salir con ✓. Una sola ✗ es un permiso que no
-- quedo como se penso, y el texto dice cual.
-- ===========================================================================

begin;

create temp table _resultado (n serial, caso text, esperado text, veredicto text)
  on commit drop;

-- Preparacion, todavia como dueño y DENTRO de la transaccion que se deshace.
-- Sin esto la prueba falla en una base viva por dos motivos que no tienen
-- nada que ver con los permisos:
--   - `un_solo_turno_abierto` impide abrir una caja si ya hay una abierta, y
--     en tu local casi siempre la hay.
--   - la orden de prueba usa un id fijo, para que los casos siguientes la
--     puedan referenciar.
-- Las dos cosas se revierten con el rollback del final.
update turno set cerrado_at = now() where cerrado_at is null;
delete from orden_item where orden_id = '33333333-3333-3333-3333-333333333333';
delete from orden      where id       = '33333333-3333-3333-3333-333333333333';

do $$
declare
  casos text[][] := array[
    -- [que se intenta, sql, que deberia pasar]

    -- ---- lo que la app hace todos los dias: TIENE que pasar ----
    ['leer el menú', 'select 1 from producto limit 1', 'PERMITIR'],
    ['abrir caja', $q$insert into turno (abierto_por, fondo_inicial) values ('_prueba_',1)$q$, 'PERMITIR'],
    ['crear una orden cobrada', $q$insert into orden (id, tipo, metodo_pago, estado, total, precio_mitades) values ('33333333-3333-3333-3333-333333333333','mesa','efectivo','pagada',40250,'promedio')$q$, 'PERMITIR'],
    ['guardar una línea mitad y mitad', $q$insert into orden_item (orden_id, producto_id, nombre_snapshot, precio_snapshot, grupo_snapshot, cantidad, mitades) values ('33333333-3333-3333-3333-333333333333',null,'_prueba_',35000,'pizza',1,'[{"n":"a"},{"n":"b"}]'::jsonb)$q$, 'PERMITIR'],
    ['leer una orden con sus líneas', $q$select 1 from orden o join orden_item i on i.orden_id=o.id limit 1$q$, 'PERMITIR'],
    ['encolar un ticket', $q$insert into print_job (payload_b64, preview) values ('AAA','_prueba_')$q$, 'PERMITIR'],
    ['marcar el ticket como impreso', $q$update print_job set estado='impreso', impreso_at=now() where preview='_prueba_'$q$, 'PERMITIR'],
    ['registrar el latido del puente', $q$insert into puente_latido (id,visto_at,detalle) values ('default',now(),'_prueba_') on conflict (id) do update set visto_at=excluded.visto_at, detalle=excluded.detalle$q$, 'PERMITIR'],
    ['escribir en la bitácora', $q$insert into audit_log (accion,usuario,motivo) values ('anulacion','_prueba_','x')$q$, 'PERMITIR'],
    ['anular una orden', $q$update orden set estado='anulada', anulada_por='_prueba_', anulada_motivo='x', anulada_at=now() where id='33333333-3333-3333-3333-333333333333'$q$, 'PERMITIR'],
    ['completar la unidad de un insumo', $q$update insumo set unidad=unidad where orden=120$q$, 'PERMITIR'],
    ['cambiar un ajuste del recibo', $q$update settings set ancho_papel=ancho_papel where id='default'$q$, 'PERMITIR'],
    ['cambiar el PIN', $q$update settings set pin_hash=pin_hash where id='default'$q$, 'PERMITIR'],
    ['guardar un conteo de inventario', $q$insert into conteo (realizado_por) values ('_prueba_')$q$, 'PERMITIR'],

    -- ---- lo que nadie debe poder hacer, ni con la clave en la mano ----
    ['BORRAR órdenes', $q$delete from orden$q$, 'BLOQUEAR'],
    ['BORRAR líneas de órdenes', $q$delete from orden_item$q$, 'BLOQUEAR'],
    ['BORRAR turnos de caja', $q$delete from turno$q$, 'BLOQUEAR'],
    ['BORRAR la bitácora', $q$delete from audit_log$q$, 'BLOQUEAR'],
    ['BORRAR el menú', $q$delete from producto$q$, 'BLOQUEAR'],
    ['cambiar el TOTAL de una orden', $q$update orden set total=0$q$, 'BLOQUEAR'],
    ['cambiar el método de pago', $q$update orden set metodo_pago='banpro'$q$, 'BLOQUEAR'],
    ['reescribir una línea ya vendida', $q$update orden_item set precio_snapshot=1$q$, 'BLOQUEAR'],
    ['cambiar el fondo inicial de una caja', $q$update turno set fondo_inicial=0$q$, 'BLOQUEAR'],
    ['editar la bitácora', $q$update audit_log set motivo='otro'$q$, 'BLOQUEAR'],
    ['cambiar un precio del menú', $q$update producto set precio=1$q$, 'BLOQUEAR'],
    ['meter un producto falso', $q$insert into producto (nombre,categoria,grupo_descuento,precio) values ('_x_','_y_','otro',1)$q$, 'BLOQUEAR'],
    ['meter un pago suelto', $q$insert into pago (orden_id,metodo,monto) values (null,'efectivo',1)$q$, 'BLOQUEAR']
  ];
  i int;
  afectadas int;
  v text;
begin
  for i in 1 .. array_length(casos, 1) loop
    begin
      set local role anon;
      execute casos[i][2];
      get diagnostics afectadas = row_count;
      -- Con RLS y sin politica, un update o un delete NO fallan: tocan 0
      -- filas y devuelven exito. Eso es un bloqueo igual, pero silencioso, y
      -- contarlo como "permitir" daba un falso positivo en la primera
      -- version de esta prueba.
      if casos[i][3] = 'BLOQUEAR' and afectadas = 0
         and (casos[i][2] like 'delete%' or casos[i][2] like 'update%') then
        v := 'BLOQUEAR (RLS: 0 filas)';
      else
        v := 'PERMITIR';
      end if;
    exception when others then
      v := 'BLOQUEAR (' || split_part(sqlerrm, E'\n', 1) || ')';
    end;
    reset role;   -- ANTES de grabar, o el propio registro se bloquea
    insert into _resultado (caso, esperado, veredicto)
    values (casos[i][1], casos[i][3], v);
  end loop;
end $$;

select
  case when veredicto like esperado || '%' then '✓' else '✗ ESPERABA ' || esperado end as ok,
  caso,
  veredicto
from _resultado order by n;

-- Nada de lo de arriba queda escrito.
rollback;
