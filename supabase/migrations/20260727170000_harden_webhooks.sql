alter table public.d4sign_webhook_events
  add column if not exists processing_status text not null default 'processing',
  add column if not exists attempt_count integer not null default 1,
  add column if not exists processed_at timestamptz,
  add column if not exists last_error text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'd4sign_webhook_events_processing_status_check'
      and conrelid = 'public.d4sign_webhook_events'::regclass
  ) then
    alter table public.d4sign_webhook_events
      add constraint d4sign_webhook_events_processing_status_check
      check (processing_status in ('processing', 'processed', 'failed'));
  end if;
end;
$$;

-- Preserva apenas o evento mais antigo de cada identidade lógica antes de
-- ampliar a idempotência para todos os tipos oficiais da D4Sign.
with ranked as (
  select
    id,
    row_number() over (
      partition by document_uuid, type_post, coalesce(lower(signer_email), '')
      order by created_at, id
    ) as occurrence
  from public.d4sign_webhook_events
)
delete from public.d4sign_webhook_events e
using ranked r
where e.id = r.id
  and r.occurrence > 1;

drop index if exists public.d4sign_webhook_events_finished_unique;

create unique index if not exists d4sign_webhook_events_identity_unique
  on public.d4sign_webhook_events (
    document_uuid,
    type_post,
    coalesce(lower(signer_email), '')
  );

create index if not exists d4sign_webhook_events_failed_retry_idx
  on public.d4sign_webhook_events (processing_status, created_at)
  where processing_status = 'failed';

create or replace function public.finalize_d4sign_opportunity(
  p_opportunity_id uuid,
  p_signers jsonb,
  p_now timestamptz
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_stage public.opportunity_stage;
  v_transition_id uuid;
begin
  select etapa
  into v_stage
  from public.oportunidades
  where id = p_opportunity_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'OPPORTUNITY_NOT_FOUND';
  end if;

  update public.oportunidades
  set
    d4sign_signers = p_signers,
    d4sign_updated_at = p_now,
    updated_at = p_now
  where id = p_opportunity_id;

  if v_stage = 'contrato_enviado'::public.opportunity_stage then
    update public.oportunidades
    set
      etapa = 'contrato_assinado'::public.opportunity_stage,
      updated_at = p_now
    where id = p_opportunity_id;

    insert into public.transicoes_etapa (
      oportunidade_id,
      etapa_origem,
      etapa_destino,
      alterado_por,
      observacao
    )
    values (
      p_opportunity_id,
      'contrato_enviado'::public.opportunity_stage,
      'contrato_assinado'::public.opportunity_stage,
      null,
      'Automático via webhook D4Sign (documento finalizado).'
    )
    returning id into v_transition_id;
  end if;

  return v_transition_id;
end;
$$;

revoke all on function public.finalize_d4sign_opportunity(uuid, jsonb, timestamptz)
from public, anon, authenticated;

grant execute on function public.finalize_d4sign_opportunity(uuid, jsonb, timestamptz)
to service_role;
