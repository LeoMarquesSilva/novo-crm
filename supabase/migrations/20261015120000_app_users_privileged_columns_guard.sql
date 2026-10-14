-- Trava de papel/área em app_users.
-- A policy de UPDATE "próprio ou admin" (criada antes deste repositório) deixava o usuário
-- logado trocar o próprio role/area pelo client do navegador. Desde 2026-10-15 o perfil
-- grava por PATCH /api/crm/profile (só nome e foto) e o admin por /api/admin/users/*,
-- ambos com service role; nenhum código de navegador escreve em app_users.
-- Versionada; NÃO aplicada no remoto nesta entrega. Aplicar depois do deploy do código.

revoke insert, update, delete on table public.app_users from anon, authenticated;
-- SELECT continua (getCurrentUserProfile, proxy, realtime).

create or replace function public.app_users_guard_privileged_columns()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- current_user = 'authenticated'/'anon' só em sessão PostgREST do usuário. service_role,
  -- postgres e as RPCs admin_* (SECURITY DEFINER) passam. Admin também não tem exceção aqui:
  -- toda mudança de admin passa pelas rotas de servidor e pela trava de último admin.
  if current_user in ('authenticated', 'anon') and (
       new.role is distinct from old.role
    or new.area is distinct from old.area
    or new.auth_user_id is distinct from old.auth_user_id
    or new.id is distinct from old.id
  ) then
    raise exception using errcode = '42501', message = 'APP_USER_PRIVILEGED_COLUMN';
  end if;
  return new;
end;
$$;

revoke execute on function public.app_users_guard_privileged_columns() from public, anon, authenticated;

drop trigger if exists app_users_guard_privileged_columns on public.app_users;
create trigger app_users_guard_privileged_columns
  before update on public.app_users
  for each row execute function public.app_users_guard_privileged_columns();

-- Conferência depois de aplicar (rollback no fim):
-- begin;
-- set local role authenticated;
-- select set_config('request.jwt.claims', '{"sub":"<uid não-admin>","role":"authenticated"}', true);
-- update public.app_users set role = 'admin' where auth_user_id = '<uid>';  -- espera 42501
-- rollback;
