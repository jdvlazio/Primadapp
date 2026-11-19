-- Latido del keep-alive (nov 2026). Supabase pausó el proyecto aunque la Action leía cada 2 días
-- (lectura anónima con 200 el día anterior): leer no le bastó como "actividad". Ahora la Action ESCRIBE
-- un latido diario. La tabla no la ve ni la toca nadie más (RLS sin políticas); solo esta función
-- SECURITY DEFINER, que anon puede ejecutar y que únicamente actualiza una fila con la hora.
-- Correr UNA vez en Supabase › SQL Editor. Es idempotente.
create table if not exists public.keepalive (
  id int primary key default 1 check (id = 1),
  latido timestamptz not null default now()
);
alter table public.keepalive enable row level security;

create or replace function public.keepalive_latido()
returns timestamptz
language sql
security definer
set search_path = public
as $$
  insert into public.keepalive (id, latido) values (1, now())
  on conflict (id) do update set latido = excluded.latido
  returning latido;
$$;

revoke all on function public.keepalive_latido() from public;
grant execute on function public.keepalive_latido() to anon, authenticated;
