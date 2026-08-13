-- Mantém a proteção do último administrador na mesma transação da mutação.
-- Estas RPCs são chamadas exclusivamente pelos Route Handlers com service_role.

create or replace function public.admin_change_user_role(
  p_actor uuid,
  p_target uuid,
  p_next_role text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role public.user_role;
  v_target_role public.user_role;
  v_admin_count integer;
begin
  if p_next_role not in ('admin', 'comercial', 'controladoria', 'financeiro') then
    raise exception using errcode = '22023', message = 'Papel de usuário inválido.';
  end if;

  -- Serializa mudanças que podem reduzir o conjunto de administradores.
  perform 1
  from public.app_users
  where role = 'admin' or id in (p_actor, p_target)
  order by id
  for update;

  select role into v_actor_role
  from public.app_users
  where id = p_actor;

  if not found or v_actor_role <> 'admin' then
    raise exception using errcode = '42501', message = 'ADMIN_MUTATION_FORBIDDEN';
  end if;

  select role into v_target_role
  from public.app_users
  where id = p_target;

  if not found then
    raise exception using errcode = 'P0002', message = 'USER_NOT_FOUND';
  end if;

  select count(*) into v_admin_count
  from public.app_users
  where role = 'admin';

  if v_target_role = 'admin'
    and v_admin_count = 1
    and p_next_role <> 'admin' then
    raise exception using
      errcode = 'P0001',
      message = 'Não é possível remover o papel do último administrador.';
  end if;

  update public.app_users
  set role = p_next_role::public.user_role
  where id = p_target;

  return true;
end;
$$;

create or replace function public.admin_delete_user(
  p_actor uuid,
  p_target uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role public.user_role;
  v_target_role public.user_role;
  v_target_auth_user_id uuid;
  v_admin_count integer;
begin
  if p_actor = p_target then
    raise exception using
      errcode = 'P0001',
      message = 'Não é possível excluir a própria conta administrativa.';
  end if;

  -- Serializa exclusões e rebaixamentos de administradores concorrentes.
  perform 1
  from public.app_users
  where role = 'admin' or id in (p_actor, p_target)
  order by id
  for update;

  select role into v_actor_role
  from public.app_users
  where id = p_actor;

  if not found or v_actor_role <> 'admin' then
    raise exception using errcode = '42501', message = 'ADMIN_MUTATION_FORBIDDEN';
  end if;

  select role, auth_user_id
  into v_target_role, v_target_auth_user_id
  from public.app_users
  where id = p_target;

  if not found then
    raise exception using errcode = 'P0002', message = 'USER_NOT_FOUND';
  end if;

  select count(*) into v_admin_count
  from public.app_users
  where role = 'admin';

  if v_target_role = 'admin' and v_admin_count = 1 then
    raise exception using
      errcode = 'P0001',
      message = 'Não é possível excluir o último administrador.';
  end if;

  delete from public.app_users
  where id = p_target;

  return v_target_auth_user_id;
end;
$$;

revoke all on function public.admin_change_user_role(uuid, uuid, text)
from public, anon, authenticated;
revoke all on function public.admin_delete_user(uuid, uuid)
from public, anon, authenticated;

grant execute on function public.admin_change_user_role(uuid, uuid, text)
to service_role;
grant execute on function public.admin_delete_user(uuid, uuid)
to service_role;
