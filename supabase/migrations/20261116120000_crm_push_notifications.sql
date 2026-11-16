-- Push das notificações do CRM (16/11/2026).
--
-- 1. `crm_push_subscriptions`: uma linha por navegador/dispositivo que ativou o push
--    (endpoint + chaves do Web Push). Só o servidor (service role) lê e grava.
-- 2. Gatilho em `crm_in_app_notifications`: cada aviso novo chama, pelo pg_net, a rota
--    `POST /api/push/dispatch` do CRM, que manda o push para os dispositivos do usuário.
--    Assim todo caminho que grava um aviso (são mais de 15) ganha push sem mexer no código.
--
-- O gatilho lê a URL e o segredo do Vault. Sem os dois segredos ele não faz nada (o aviso
-- continua sendo gravado normalmente). Depois de aplicar, criar os segredos UMA vez:
--
--   select vault.create_secret('https://crm-indol-ten.vercel.app/api/push/dispatch', 'crm_push_dispatch_url');
--   select vault.create_secret('<mesmo valor de CRM_PUSH_DISPATCH_SECRET na Vercel>', 'crm_push_dispatch_secret');
--
-- Aplicada no remoto em 16/11/2026 (pg_net 0.20.0); segredos do Vault criados no mesmo dia.

create extension if not exists pg_net with schema extensions;

create table if not exists public.crm_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_success_at timestamptz,
  failure_count integer not null default 0
);

create unique index if not exists crm_push_subscriptions_endpoint_key
  on public.crm_push_subscriptions (endpoint);

create index if not exists crm_push_subscriptions_user_idx
  on public.crm_push_subscriptions (user_id);

alter table public.crm_push_subscriptions enable row level security;

-- Sem policies: navegador não lê nem grava direto; as rotas usam o service role.
revoke all on table public.crm_push_subscriptions from anon, authenticated;

comment on table public.crm_push_subscriptions is
  'Inscrições Web Push (uma por navegador/dispositivo). Gravadas por /api/crm/push/subscriptions.';

create or replace function public.crm_in_app_notification_push_dispatch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  -- Só chama a rota se o usuário tem algum dispositivo inscrito.
  if not exists (
    select 1 from public.crm_push_subscriptions s where s.user_id = new.user_id
  ) then
    return new;
  end if;

  select ds.decrypted_secret into v_url
    from vault.decrypted_secrets ds where ds.name = 'crm_push_dispatch_url' limit 1;
  select ds.decrypted_secret into v_secret
    from vault.decrypted_secrets ds where ds.name = 'crm_push_dispatch_secret' limit 1;

  if coalesce(v_url, '') = '' or coalesce(v_secret, '') = '' then
    return new;
  end if;

  perform net.http_post(
    url := v_url,
    body := jsonb_build_object(
      'notification', jsonb_build_object(
        'id', new.id,
        'user_id', new.user_id,
        'tipo', new.tipo,
        'payload', new.payload,
        'created_at', new.created_at
      )
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    timeout_milliseconds := 8000
  );

  return new;
exception when others then
  -- O push nunca pode impedir a gravação do aviso.
  raise warning '[crm-push] despacho não agendado: %', sqlerrm;
  return new;
end;
$$;

revoke all on function public.crm_in_app_notification_push_dispatch() from public, anon, authenticated;

drop trigger if exists crm_in_app_notifications_push_dispatch on public.crm_in_app_notifications;

create trigger crm_in_app_notifications_push_dispatch
  after insert on public.crm_in_app_notifications
  for each row
  execute function public.crm_in_app_notification_push_dispatch();
