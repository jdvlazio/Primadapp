-- ============================================================
-- La Primada — RPC delete_own_account()  (Apple App Store 5.1.1(v))
-- ------------------------------------------------------------
-- CÓMO APLICAR: pegar TODO este archivo en el SQL Editor de Supabase
-- (proyecto de La Primada) y ejecutar. Es idempotente (CREATE OR REPLACE).
-- NO lo aplica el frontend; es un cambio de PRODUCCIÓN que corre el admin.
-- ------------------------------------------------------------
-- QUÉ HACE (diseño aprobado — "conservar + anonimizar"):
--   El usuario en sesión borra SU PROPIO login. Se CONSERVA todo el libro
--   colectivo (personas, primadas, consumos) → los saldos de las primadas
--   cerradas quedan IDÉNTICOS (respeta el invariante de inmutabilidad).
--   Lo único que cambia: la auditoría "quién apuntó" de esa persona pasa a
--   anónima (su apuntado_por queda en NULL; la fila de consumo NO se borra).
--
--   Pasos, para auth.uid() (el que llama):
--     1) UPDATE consumos SET apuntado_por = NULL  -- anonimiza, fila intacta
--        (también neutraliza cualquier FK consumos.apuntado_por→auth.users
--         antes de borrar el usuario; ese FK JAMÁS debe ser ON DELETE CASCADE)
--     2) DELETE FROM profiles    -- quita rol/email
--     3) DELETE FROM auth.users  -- revoca el acceso (login)
--
--   BLOQUEO DEL ÚLTIMO ADMIN: si el que llama es el único admin, lanza error
--   (no dejar al grupo sin control de settings/personas).
-- ============================================================

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid          uuid := auth.uid();
  es_admin     boolean;
  n_admins     int;
begin
  if uid is null then
    raise exception 'No hay sesión activa';
  end if;

  -- ¿el que llama es admin? (misma fuente que is_admin(): profiles.role)
  select coalesce(p.role = 'admin', false)
    into es_admin
    from public.profiles p
   where p.user_id = uid;

  -- Bloqueo del ÚLTIMO admin: si es admin y es el único, no permitir.
  if es_admin then
    select count(*) into n_admins from public.profiles where role = 'admin';
    if n_admins <= 1 then
      raise exception 'No puedes borrar la única cuenta admin';
    end if;
  end if;

  -- 1) Anonimiza la auditoría (las filas de consumo se CONSERVAN → saldos intactos).
  update public.consumos set apuntado_por = null where apuntado_por = uid;

  -- 2) Quita el perfil (rol/email).
  delete from public.profiles where user_id = uid;

  -- 3) Revoca el acceso (login). SECURITY DEFINER permite tocar auth.users.
  delete from auth.users where id = uid;
end;
$$;

-- Solo autenticados pueden ejecutarla; cada uno borra SOLO lo suyo (auth.uid()).
revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;

-- ------------------------------------------------------------
-- VERIFICACIÓN del FK de auditoría (correr una vez; debe ser SET NULL o no existir,
-- NUNCA CASCADE — si fuera CASCADE, borraría consumos y rompería primadas cerradas):
--   select conname, confdeltype  -- confdeltype: 'n'=SET NULL, 'a'=NO ACTION, 'c'=CASCADE
--     from pg_constraint
--    where conrelid = 'public.consumos'::regclass and contype = 'f';
-- El paso 1 (UPDATE ... NULL) hace el borrado seguro aunque el FK sea NO ACTION/RESTRICT.
-- ------------------------------------------------------------
