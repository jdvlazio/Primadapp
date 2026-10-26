-- Llave Bre-B editable por CUALQUIER usuario con sesión, y nada más de la ficha (oct 2026).
-- La tabla personas sigue con UPDATE solo-admin: nombre y estado deciden quién entra al reparto.
-- Esta función SECURITY DEFINER toca únicamente la columna breb.
-- Correr UNA vez en Supabase › SQL Editor. Es idempotente (create or replace).
create or replace function public.set_llave_persona(p_id text, p_breb text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authorized';
  end if;
  update public.personas
     set breb = nullif(btrim(coalesce(p_breb, '')), ''),
         updated_at = now()
   where id = p_id;
end;
$$;

revoke all on function public.set_llave_persona(text, text) from public;
revoke all on function public.set_llave_persona(text, text) from anon;
grant execute on function public.set_llave_persona(text, text) to authenticated;
