-- ===========================================================================
-- RLS
--
-- ALCANCE REAL: esto abre las tablas a la clave anon. Es adecuado para UN
-- local, en la red del negocio, con la URL no publicada. NO es seguridad
-- para internet abierto: cualquiera con la URL y la anon key puede escribir.
--
-- Cuando el negocio lo amerite, el upgrade es Clerk (gratis en el GitHub
-- Student Pack) y cambiar `using (true)` por `using (auth.role() = ...)`.
-- ===========================================================================

alter table producto   enable row level security;
alter table turno      enable row level security;
alter table orden      enable row level security;
alter table orden_item enable row level security;
alter table print_job  enable row level security;

create policy p_producto   on producto   for all using (true) with check (true);
create policy p_turno      on turno      for all using (true) with check (true);
create policy p_orden      on orden      for all using (true) with check (true);
create policy p_orden_item on orden_item for all using (true) with check (true);
create policy p_print_job  on print_job  for all using (true) with check (true);
