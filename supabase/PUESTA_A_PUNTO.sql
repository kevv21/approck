-- ===========================================================================
-- APPROCK — PUESTA A PUNTO
--
-- Pega esto en Supabase: SQL Editor -> New query -> Run.
-- Es corto a proposito: pegar el instalador de 34 KB se corta en el navegador.
-- Se puede correr las veces que haga falta, no rompe nada.
--
-- OJO: esto NO quita el "modo demo" ni hace imprimir. Eso no vive en la base:
--   - La app usa la base si existen NEXT_PUBLIC_SUPABASE_URL y
--     NEXT_PUBLIC_SUPABASE_ANON_KEY. Van en Vercel o en .env.local, no en SQL.
--   - El puente imprime si en bridge/.env pusiste SIMULAR=false y el PUERTO
--     correcto. Tampoco es SQL.
-- Lo que SI arregla esto es que la base acepte las ordenes y guarde la cola
-- de impresion. Al final hay un diagnostico que te dice como va todo.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. Esquema al dia  (OBLIGATORIO si instalaste antes del cambio de mitades)
-- ---------------------------------------------------------------------------
-- Sin estas cuatro columnas la base rechaza CUALQUIER orden, porque la app
-- escribe orden.precio_mitades en cada insercion.

alter table turno      add column if not exists ventas_pedidosya integer not null default 0;
alter table orden_item add column if not exists mitades jsonb;
alter table orden      add column if not exists precio_mitades text not null default 'promedio';
alter table settings   add column if not exists precio_mitades text not null default 'promedio';


-- ---------------------------------------------------------------------------
-- 2. Datos del negocio  (OPCIONAL — edita los valores y quita los guiones)
-- ---------------------------------------------------------------------------
-- Lo que sale impreso en el encabezado y el pie del recibo. Las lineas de RUC
-- y direccion solo se imprimen si tienen valor, asi que dejarlas en null es
-- una decision valida, no un olvido.
--
-- ancho_papel: 58 para la PT-210. Usa 80 solo si cambias de impresora.
-- tipo_cambio: centavos de C$ por 1 US$ (3680 = C$36.80). En 0 no se imprime
--              el equivalente en dolares.

-- update settings set
--   telefono     = '0000-0000',
--   ruc          = null,
--   direccion    = null,
--   ancho_papel  = 58,
--   pie_recibo   = '¡Gracias por su compra!',
--   tipo_cambio  = 0,
--   updated_at   = now()
-- where id = 'default';


-- ---------------------------------------------------------------------------
-- 3. Destrabar la cola de impresion  (OPCIONAL)
-- ---------------------------------------------------------------------------
-- Si hay trabajos colgados en 'error' o 'enviado' porque el puente estaba
-- apagado, esto los devuelve a la cola. Solo los de las ultimas 24 horas: no
-- tiene sentido reimprimir la comanda de anteayer.

-- update print_job set estado = 'pendiente', intentos = 0, error = null
-- where estado <> 'impreso' and created_at > now() - interval '24 hours';


-- ===========================================================================
-- 4. DIAGNOSTICO — esto es lo que ves en el panel de resultados
-- ===========================================================================
with columnas as (
  select count(*) filter (
    where (table_name, column_name) in (
      ('orden','precio_mitades'), ('orden_item','mitades'),
      ('turno','ventas_pedidosya'), ('settings','precio_mitades')
    )
  ) as al_dia
  from information_schema.columns where table_schema = 'public'
)
select * from (
  select 1 as n, 'Esquema' as que,
         case when al_dia = 4 then 'al día (4/4 columnas)'
              else 'FALTAN ' || (4 - al_dia) || ' columnas — vuelve a correr la parte 1' end as estado
  from columnas

  union all select 2, 'Menú',
    case when count(*) = 0 then 'VACÍO — no hay nada que vender, pega 00_INSTALAR.sql'
         else count(*) || ' productos' end
  from producto

  union all select 3, 'Insumos (inventario)', count(*) || ' insumos' from insumo

  union all select 4, 'Caja',
    coalesce((select 'ABIERTA por ' || abierto_por || ', desde ' ||
                     to_char(abierto_at, 'DD/MM HH24:MI')
              from turno where cerrado_at is null order by abierto_at desc limit 1),
             'cerrada — ábrela en Cierres antes del primer pedido')

  union all select 5, 'Órdenes guardadas',
    case when count(*) = 0 then 'ninguna todavía'
         else count(*) || ' en total, la última el ' ||
              to_char(max(created_at), 'DD/MM HH24:MI') end
  from orden

  union all select 6, 'Órdenes de hoy',
    count(*) || ' órdenes, C$ ' || to_char(coalesce(sum(total), 0) / 100.0, 'FM999G999G990D00')
  from orden where created_at::date = current_date and estado = 'pagada'

  union all select 7, 'Cola de impresión',
    case when count(*) = 0 then 'vacía'
         else 'pendientes: ' || count(*) filter (where estado = 'pendiente') ||
              ' · con error: ' || count(*) filter (where estado = 'error') ||
              ' · impresos: '  || count(*) filter (where estado = 'impreso') end
  from print_job

  -- `detalle` lo escribe SOLO el puente al latir. El instalador siembra la
  -- fila con now() y sin detalle, asi que mirar unicamente visto_at hacia que
  -- una base recien instalada dijera "CONECTADO" sin que nada estuviera
  -- corriendo. Un diagnostico que miente es peor que no tenerlo.
  union all select 8, 'Puente de impresión',
    coalesce((select case
                when detalle is null
                  then 'nunca se ha conectado — arranca `npm start` en bridge/'
                when visto_at > now() - interval '60 seconds'
                  then 'CONECTADO (' || detalle || ', visto hace ' ||
                       round(extract(epoch from now() - visto_at)) || ' s)'
                else 'SIN SEÑAL desde ' || to_char(visto_at, 'DD/MM HH24:MI') ||
                     ' — ¿está corriendo `npm start` en la PC de caja?'
              end
              from puente_latido where id = 'default'),
             'nunca se ha conectado — arranca `npm start` en bridge/')
) d order by n;
