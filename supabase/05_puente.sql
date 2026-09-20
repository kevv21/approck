-- ===========================================================================
-- Fase 4: puente de impresion.
-- El servicio de bridge/ registra un latido para que la caja pueda
-- distinguir "no hay tickets" de "el puente lleva horas caido".
-- ===========================================================================

create table if not exists puente_latido (
  id        text primary key default 'default',
  visto_at  timestamptz not null default now(),
  detalle   text
);

insert into puente_latido (id) values ('default') on conflict (id) do nothing;

alter table puente_latido enable row level security;
create policy p_puente_latido on puente_latido for all using (true) with check (true);

-- La app consulta esto seguido: indice por si crece el historico.
create index if not exists idx_puente_latido_visto on puente_latido (visto_at desc);
