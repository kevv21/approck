-- ===========================================================================
-- APPROCK — VERIFICAR EL BLINDAJE
--
-- Pega esto en Supabase y dale Run. Intenta 33 operaciones con los dos roles
-- que importan y dice cuales pasan y cuales rebotan:
--
--   authenticated  un aparato vinculado. Debe poder hacer su trabajo y nada
--                  mas. Estas 27 filas tienen que salir SIEMPRE en verde.
--   anon           la clave publishable a secas, la que cualquiera saca del
--                  codigo de la pagina. Estas 6 filas dependen de si corriste
--                  EXIGIR_CUENTA.sql; la salida dice cual es tu caso.
--
-- NO ENSUCIA NADA. Todo corre dentro de una transaccion que termina en
-- ROLLBACK, asi que las ordenes y los turnos de prueba desaparecen. Se puede
-- correr sobre la base de produccion y sobre una caja abierta.
--
-- Las 33 filas tienen que salir con ✓. Una sola ✗ es un permiso que no
-- quedo como se penso, y el texto dice cual.
-- ===========================================================================

begin;

create temp table _resultado (n serial, rol text, caso text, esperado text, veredicto text)
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
    -- [que se intenta, sql, que deberia pasar, con que rol]

    -- ---- lo que la app hace todos los dias: TIENE que pasar ----
    ['leer el menú', 'select 1 from producto limit 1', 'PERMITIR', 'authenticated'],
    ['abrir caja', $q$insert into turno (abierto_por, fondo_inicial) values ('_prueba_',1)$q$, 'PERMITIR', 'authenticated'],
    ['crear una orden cobrada', $q$insert into orden (id, tipo, metodo_pago, estado, total, precio_mitades) values ('33333333-3333-3333-3333-333333333333','mesa','efectivo','pagada',40250,'promedio')$q$, 'PERMITIR', 'authenticated'],
    ['guardar una línea mitad y mitad', $q$insert into orden_item (orden_id, producto_id, nombre_snapshot, precio_snapshot, grupo_snapshot, cantidad, mitades) values ('33333333-3333-3333-3333-333333333333',null,'_prueba_',35000,'pizza',1,'[{"n":"a"},{"n":"b"}]'::jsonb)$q$, 'PERMITIR', 'authenticated'],
    ['leer una orden con sus líneas', $q$select 1 from orden o join orden_item i on i.orden_id=o.id limit 1$q$, 'PERMITIR', 'authenticated'],
    ['encolar un ticket', $q$insert into print_job (payload_b64, preview) values ('AAA','_prueba_')$q$, 'PERMITIR', 'authenticated'],
    ['marcar el ticket como impreso', $q$update print_job set estado='impreso', impreso_at=now() where preview='_prueba_'$q$, 'PERMITIR', 'authenticated'],
    ['registrar el latido del puente', $q$insert into puente_latido (id,visto_at,detalle) values ('default',now(),'_prueba_') on conflict (id) do update set visto_at=excluded.visto_at, detalle=excluded.detalle$q$, 'PERMITIR', 'authenticated'],
    ['escribir en la bitácora', $q$insert into audit_log (accion,usuario,motivo) values ('anulacion','_prueba_','x')$q$, 'PERMITIR', 'authenticated'],
    ['anular una orden', $q$update orden set estado='anulada', anulada_por='_prueba_', anulada_motivo='x', anulada_at=now() where id='33333333-3333-3333-3333-333333333333'$q$, 'PERMITIR', 'authenticated'],
    ['completar la unidad de un insumo', $q$update insumo set unidad=unidad where orden=120$q$, 'PERMITIR', 'authenticated'],
    ['cambiar un ajuste del recibo', $q$update settings set ancho_papel=ancho_papel where id='default'$q$, 'PERMITIR', 'authenticated'],
    ['cambiar el PIN', $q$update settings set pin_hash=pin_hash where id='default'$q$, 'PERMITIR', 'authenticated'],
    ['guardar un conteo de inventario', $q$insert into conteo (realizado_por) values ('_prueba_')$q$, 'PERMITIR', 'authenticated'],

    -- ---- lo que nadie debe poder hacer, ni con la clave en la mano ----
    ['BORRAR órdenes', $q$delete from orden$q$, 'BLOQUEAR', 'authenticated'],
    ['BORRAR líneas de órdenes', $q$delete from orden_item$q$, 'BLOQUEAR', 'authenticated'],
    ['BORRAR turnos de caja', $q$delete from turno$q$, 'BLOQUEAR', 'authenticated'],
    ['BORRAR la bitácora', $q$delete from audit_log$q$, 'BLOQUEAR', 'authenticated'],
    ['BORRAR el menú', $q$delete from producto$q$, 'BLOQUEAR', 'authenticated'],
    ['cambiar el TOTAL de una orden', $q$update orden set total=0$q$, 'BLOQUEAR', 'authenticated'],
    ['cambiar el método de pago', $q$update orden set metodo_pago='banpro'$q$, 'BLOQUEAR', 'authenticated'],
    ['reescribir una línea ya vendida', $q$update orden_item set precio_snapshot=1$q$, 'BLOQUEAR', 'authenticated'],
    ['cambiar el fondo inicial de una caja', $q$update turno set fondo_inicial=0$q$, 'BLOQUEAR', 'authenticated'],
    ['editar la bitácora', $q$update audit_log set motivo='otro'$q$, 'BLOQUEAR', 'authenticated'],
    ['cambiar un precio del menú', $q$update producto set precio=1$q$, 'BLOQUEAR', 'authenticated'],
    ['meter un producto falso', $q$insert into producto (nombre,categoria,grupo_descuento,precio) values ('_x_','_y_','otro',1)$q$, 'BLOQUEAR', 'authenticated'],
    ['meter un pago suelto', $q$insert into pago (orden_id,metodo,monto) values (null,'efectivo',1)$q$, 'BLOQUEAR', 'authenticated'],

    -- ---- con la clave sola, sin vincular: no se ve NADA ----
    ['(anónimo) leer el menú', 'select 1 from producto limit 1', 'BLOQUEAR', 'anon'],
    ['(anónimo) leer las ventas', 'select 1 from orden limit 1', 'BLOQUEAR', 'anon'],
    ['(anónimo) leer los cierres de caja', 'select 1 from turno limit 1', 'BLOQUEAR', 'anon'],
    ['(anónimo) leer la bitácora', 'select 1 from audit_log limit 1', 'BLOQUEAR', 'anon'],
    ['(anónimo) leer el PIN del local', 'select 1 from settings limit 1', 'BLOQUEAR', 'anon'],
    ['(anónimo) meter una orden falsa', $q$insert into orden (tipo, metodo_pago, estado, total, precio_mitades) values ('mesa','efectivo','pagada',1,'promedio')$q$, 'BLOQUEAR', 'anon']
  ];
  i int;
  afectadas int;
  v text;
begin
  for i in 1 .. array_length(casos, 1) loop
    begin
      execute format('set local role %I', casos[i][4]);
      execute casos[i][2];
      get diagnostics afectadas = row_count;
      -- Con RLS y sin politica, un update o un delete NO fallan: tocan 0
      -- filas y devuelven exito. Eso es un bloqueo igual, pero silencioso, y
      -- contarlo como "permitir" daba un falso positivo en la primera
      -- version de esta prueba.
      if casos[i][3] = 'BLOQUEAR' and afectadas = 0
         and (casos[i][2] like 'delete%' or casos[i][2] like 'update%'
              or casos[i][2] like 'select%') then
        v := 'BLOQUEAR (RLS: 0 filas)';
      else
        v := 'PERMITIR';
      end if;
    exception when others then
      v := 'BLOQUEAR (' || split_part(sqlerrm, E'\n', 1) || ')';
    end;
    reset role;   -- ANTES de grabar, o el propio registro se bloquea
    insert into _resultado (rol, caso, esperado, veredicto)
    values (casos[i][4], casos[i][1], casos[i][3], v);
  end loop;
end $$;

-- Si la clave a secas puede leer el menu, es que NO se corrio
-- EXIGIR_CUENTA.sql. No es un fallo: es la otra configuracion, y entonces lo
-- que se espera de las filas anonimas es justo lo contrario.
with modo as (
  select exists (
    select 1 from _resultado
    where rol = 'anon' and veredicto like 'PERMITIR%'
  ) as anonimo_abierto
)
select
  r.rol,
  case
    when r.rol = 'authenticated' and r.veredicto like r.esperado || '%' then '✓'
    when r.rol = 'authenticated' then '✗ ESPERABA ' || r.esperado
    -- anon: se acepta cualquiera de los dos modos, pero se dice cual.
    when m.anonimo_abierto and r.veredicto like 'PERMITIR%' then '· abierto'
    when not m.anonimo_abierto and r.veredicto like 'BLOQUEAR%' then '✓ cerrado'
    else '✗ incoherente'
  end as ok,
  r.caso,
  r.veredicto
from _resultado r cross join modo m order by r.n;

-- Resumen en una linea.
select case when exists (
    select 1 from _resultado where rol = 'anon' and veredicto like 'PERMITIR%')
  then 'Acceso anónimo ABIERTO: cualquiera con la dirección de la app puede leer '
       || 'las ventas y crear órdenes. Borrar y adulterar siguen cerrados. '
       || 'Para cerrarlo: supabase/EXIGIR_CUENTA.sql'
  else 'Acceso anónimo CERRADO: la clave sola no abre nada. Cada aparato pide '
       || 'la cuenta del local una vez. Para abrirlo: supabase/PERMITIR_ANONIMO.sql'
  end as modo;

-- Nada de lo de arriba queda escrito.
rollback;
