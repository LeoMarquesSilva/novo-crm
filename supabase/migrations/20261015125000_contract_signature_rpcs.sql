-- Envio do contrato para assinatura e conclusão da assinatura, numa transação cada.
-- Depende de 20261015123000 (venda_fechada_em) e 20261015124000 (lead_client_onboarding).
-- Versionada; NÃO aplicada no remoto nesta entrega. Sem ela, o código usa o caminho antigo
-- (finalize_d4sign_opportunity + transition_opportunity_atomic).

-- ---------------------------------------------------------------------------
-- register_contract_sent_atomic: grava o documento enviado e move
-- contrato_elaborado → contrato_enviado (primeiro envio). No reenvio (lead já em
-- contrato_enviado) só troca o documento, exigindo que o anterior seja o atual.
-- ---------------------------------------------------------------------------
create or replace function public.register_contract_sent_atomic(
  p_opportunity_id uuid,
  p_expected_stage public.opportunity_stage,
  p_document_uuid text,
  p_link_contrato text,
  p_signers jsonb,
  p_previous_document_uuid text,
  p_actor uuid,
  p_now timestamptz
)
returns table (transition_id uuid, stage public.opportunity_stage)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_opp public.oportunidades;
  v_transition_id uuid;
begin
  select * into v_opp
  from public.oportunidades
  where id = p_opportunity_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'OPPORTUNITY_NOT_FOUND';
  end if;

  if v_opp.etapa <> p_expected_stage
    or p_expected_stage not in (
      'contrato_elaborado'::public.opportunity_stage,
      'contrato_enviado'::public.opportunity_stage
    )
  then
    raise exception using errcode = '40001', message = 'OPPORTUNITY_STAGE_CONFLICT';
  end if;

  if p_expected_stage = 'contrato_enviado'::public.opportunity_stage
    and v_opp.d4sign_document_uuid is distinct from p_previous_document_uuid
  then
    raise exception using errcode = '40001', message = 'CONTRACT_DOCUMENT_CONFLICT';
  end if;

  update public.oportunidades
  set
    d4sign_document_uuid = p_document_uuid,
    d4sign_status = 'sent',
    d4sign_signers = coalesce(p_signers, '[]'::jsonb),
    d4sign_updated_at = p_now,
    link_contrato = coalesce(p_link_contrato, oportunidades.link_contrato),
    etapa = 'contrato_enviado'::public.opportunity_stage,
    updated_at = p_now
  where id = p_opportunity_id;

  if p_expected_stage = 'contrato_elaborado'::public.opportunity_stage then
    insert into public.transicoes_etapa (oportunidade_id, etapa_origem, etapa_destino, alterado_por, observacao)
    values (
      p_opportunity_id,
      'contrato_elaborado'::public.opportunity_stage,
      'contrato_enviado'::public.opportunity_stage,
      p_actor,
      'Contrato enviado para assinatura D4Sign.'
    )
    returning id into v_transition_id;
  end if;

  return query select v_transition_id, 'contrato_enviado'::public.opportunity_stage;
end;
$$;

revoke all on function public.register_contract_sent_atomic(
  uuid, public.opportunity_stage, text, text, jsonb, text, uuid, timestamptz
) from public, anon, authenticated;
grant execute on function public.register_contract_sent_atomic(
  uuid, public.opportunity_stage, text, text, jsonb, text, uuid, timestamptz
) to service_role;

-- ---------------------------------------------------------------------------
-- complete_contract_signature_atomic: todos assinaram o documento atual.
-- contrato_enviado → contrato_assinado, rascunho do contrato garantido com a data de
-- assinatura, venda encerrada como ganha e, com p_auto_advance, o pós-venda começa
-- (contrato_assinado → aguardando_cadastro + linha do cadastro do cliente).
-- Idempotente: a segunda chamada (webhook × sync) devolve 'already_completed'.
-- ---------------------------------------------------------------------------
create or replace function public.complete_contract_signature_atomic(
  p_opportunity_id uuid,
  p_document_uuid text,
  p_signers jsonb,
  p_signed_at timestamptz,
  p_actor uuid,
  p_source text,
  p_auto_advance boolean,
  p_now timestamptz
)
returns table (
  outcome text,
  signed_transition_id uuid,
  postsale_transition_id uuid,
  sale_closed boolean,
  contract_id uuid,
  stage public.opportunity_stage
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_opp public.oportunidades;
  v_stage public.opportunity_stage;
  v_signed_transition uuid;
  v_postsale_transition uuid;
  v_sale_closed boolean := false;
  v_contract_id uuid;
  v_d4sign_document_id uuid;
begin
  select * into v_opp
  from public.oportunidades
  where id = p_opportunity_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'OPPORTUNITY_NOT_FOUND';
  end if;

  if v_opp.d4sign_document_uuid is not null
    and p_document_uuid is not null
    and v_opp.d4sign_document_uuid <> p_document_uuid
  then
    return query select 'not_current_document'::text, null::uuid, null::uuid, false, null::uuid, v_opp.etapa;
    return;
  end if;

  if v_opp.encerramento = 'perdido' then
    return query select 'lead_lost'::text, null::uuid, null::uuid, false, null::uuid, v_opp.etapa;
    return;
  end if;

  update public.oportunidades
  set
    d4sign_signers = coalesce(p_signers, oportunidades.d4sign_signers),
    d4sign_status = '1',
    d4sign_document_uuid = coalesce(oportunidades.d4sign_document_uuid, p_document_uuid),
    d4sign_updated_at = p_now,
    updated_at = p_now
  where id = p_opportunity_id;

  v_stage := v_opp.etapa;

  if v_stage = 'contrato_enviado'::public.opportunity_stage then
    update public.oportunidades
    set etapa = 'contrato_assinado'::public.opportunity_stage, updated_at = p_now
    where id = p_opportunity_id;

    insert into public.transicoes_etapa (oportunidade_id, etapa_origem, etapa_destino, alterado_por, observacao)
    values (
      p_opportunity_id,
      'contrato_enviado'::public.opportunity_stage,
      'contrato_assinado'::public.opportunity_stage,
      p_actor,
      'Assinatura concluída na D4Sign (' || coalesce(p_source, 'sistema') || ').'
    )
    returning id into v_signed_transition;

    v_stage := 'contrato_assinado'::public.opportunity_stage;
  end if;

  if v_stage not in (
    'contrato_assinado'::public.opportunity_stage,
    'aguardando_cadastro'::public.opportunity_stage,
    'cadastro_novo_cliente'::public.opportunity_stage,
    'inclusao_faturamento'::public.opportunity_stage,
    'boas_vindas'::public.opportunity_stage,
    'reuniao_kickoff'::public.opportunity_stage
  ) then
    return query select 'stage_not_eligible'::text, null::uuid, null::uuid, false, null::uuid, v_stage;
    return;
  end if;

  v_contract_id := public.ensure_contract_draft_for_opportunity(p_opportunity_id, p_now);

  select id into v_d4sign_document_id
  from public.d4sign_documents
  where uuid_doc = p_document_uuid
  limit 1;

  update public.contratos
  set
    data_assinatura = coalesce(contratos.data_assinatura, (p_signed_at at time zone 'America/Sao_Paulo')::date),
    d4sign_document_id = coalesce(v_d4sign_document_id, contratos.d4sign_document_id),
    updated_at = p_now
  where id = v_contract_id;

  if v_opp.encerramento is distinct from 'ganho' then
    update public.oportunidades
    set
      encerramento = 'ganho',
      venda_fechada_em = coalesce(oportunidades.venda_fechada_em, p_signed_at, p_now),
      updated_at = p_now
    where id = p_opportunity_id;
    v_sale_closed := true;
  end if;

  if p_auto_advance and v_stage = 'contrato_assinado'::public.opportunity_stage then
    update public.oportunidades
    set etapa = 'aguardando_cadastro'::public.opportunity_stage, updated_at = p_now
    where id = p_opportunity_id;

    insert into public.transicoes_etapa (oportunidade_id, etapa_origem, etapa_destino, alterado_por, observacao)
    values (
      p_opportunity_id,
      'contrato_assinado'::public.opportunity_stage,
      'aguardando_cadastro'::public.opportunity_stage,
      p_actor,
      'Pós-venda iniciado automaticamente após a assinatura.'
    )
    returning id into v_postsale_transition;

    v_stage := 'aguardando_cadastro'::public.opportunity_stage;
  end if;

  if v_stage = 'aguardando_cadastro'::public.opportunity_stage then
    insert into public.lead_client_onboarding (oportunidade_id, status, created_at, updated_at)
    values (p_opportunity_id, 'rascunho', p_now, p_now)
    on conflict (oportunidade_id) do nothing;
  end if;

  return query select
    case
      when v_signed_transition is null and v_postsale_transition is null and not v_sale_closed
        then 'already_completed'
      else 'completed'
    end::text,
    v_signed_transition,
    v_postsale_transition,
    v_sale_closed,
    v_contract_id,
    v_stage;
end;
$$;

revoke all on function public.complete_contract_signature_atomic(
  uuid, text, jsonb, timestamptz, uuid, text, boolean, timestamptz
) from public, anon, authenticated;
grant execute on function public.complete_contract_signature_atomic(
  uuid, text, jsonb, timestamptz, uuid, text, boolean, timestamptz
) to service_role;
