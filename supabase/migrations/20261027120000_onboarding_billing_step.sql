-- Pós-venda com o cadastro em paralelo (decisões de 27/10/2026):
-- 1. O responsável envia o cadastro em Aguardando Cadastro e o lead vai para Cadastro de Novo
--    Cliente (`submit_client_onboarding_atomic`, sem mudança).
-- 2. Operações Legais confere, cadastra no VIOS e conclui ou devolve apontando os campos, sem
--    mudar a etapa (`conclude_client_onboarding_v2_atomic`, `return_client_onboarding_v2_atomic`).
--    O responsável corrige e reenvia (`resubmit_client_onboarding_atomic`).
-- 3. O responsável envia os dados do faturamento e o lead vai para Inclusão no Faturamento
--    (`submit_client_billing_atomic`), sem esperar Operações Legais.
-- Funções novas: as antigas (que mudam a etapa) ficam como estão, para o código anterior seguir
-- funcionando até o deploy. O código novo usa as novas e, sem elas, cai nas antigas.

alter table public.lead_client_onboarding
  add column if not exists ajustes_solicitados jsonb not null default '[]'::jsonb;

comment on column public.lead_client_onboarding.ajustes_solicitados is
  'Campos que Operações Legais pediu para ajustar na última devolução: [{ campo, comentario }].';

-- ---------------------------------------------------------------------------
-- Concluir (v2): cria ou vincula grupo, cliente e contatos (sócios e, se já informado, o
-- financeiro), liga lead e contrato ao cliente/grupo e marca o cadastro como concluído, sem
-- mudar a etapa. Vale em Cadastro de Novo Cliente ou depois (o lead pode ter avançado).
-- p_cliente: { razao_social, documento, logradouro, numero, complemento, bairro,
--              cidade, uf, cep, email_principal, telefone_principal }
-- p_contatos: [{ nome, cargo, email, telefone, papel }]
-- ---------------------------------------------------------------------------
create or replace function public.conclude_client_onboarding_v2_atomic(
  p_opportunity_id uuid,
  p_actor uuid,
  p_checklist jsonb,
  p_grupo_id uuid,
  p_grupo_nome text,
  p_grupo_chave text,
  p_cliente_id uuid,
  p_cliente jsonb,
  p_contatos jsonb,
  p_vios_referencia text,
  p_now timestamptz
)
returns table (cliente_id uuid, grupo_id uuid, contract_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_stage public.opportunity_stage;
  v_grupo_id uuid;
  v_cliente_id uuid;
  v_cliente_grupo uuid;
  v_doc text;
  v_contract_id uuid;
  v_contato jsonb;
begin
  select etapa into v_stage from public.oportunidades where id = p_opportunity_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'OPPORTUNITY_NOT_FOUND';
  end if;
  if v_stage not in (
    'cadastro_novo_cliente'::public.opportunity_stage,
    'inclusao_faturamento'::public.opportunity_stage,
    'boas_vindas'::public.opportunity_stage,
    'reuniao_kickoff'::public.opportunity_stage
  ) then
    raise exception using errcode = '40001', message = 'OPPORTUNITY_STAGE_CONFLICT';
  end if;

  perform 1 from public.lead_client_onboarding
  where oportunidade_id = p_opportunity_id and status = 'enviado'
  for update;
  if not found then
    raise exception using errcode = '40001', message = 'ONBOARDING_STATUS_CONFLICT';
  end if;

  -- Grupo econômico: o escolhido, ou cria/acha pela chave estável do nome.
  if p_grupo_id is not null then
    select id into v_grupo_id from public.grupos_economicos where id = p_grupo_id;
    if not found then
      raise exception using errcode = 'P0002', message = 'GRUPO_NOT_FOUND';
    end if;
  else
    if coalesce(btrim(p_grupo_nome), '') = '' or coalesce(btrim(p_grupo_chave), '') = '' then
      raise exception using errcode = '22023', message = 'GRUPO_NOME_REQUIRED';
    end if;
    insert into public.grupos_economicos (nome, chave_estavel, created_at, updated_at)
    values (btrim(p_grupo_nome), p_grupo_chave, p_now, p_now)
    on conflict (chave_estavel) do update set updated_at = grupos_economicos.updated_at
    returning id into v_grupo_id;
  end if;

  -- Cliente: o escolhido, ou o já cadastrado com o mesmo CPF/CNPJ, ou um novo.
  v_doc := regexp_replace(coalesce(p_cliente ->> 'documento', ''), '\D', '', 'g');
  if p_cliente_id is not null then
    select id, clientes.grupo_id into v_cliente_id, v_cliente_grupo from public.clientes where id = p_cliente_id;
    if not found then
      raise exception using errcode = 'P0002', message = 'CLIENTE_NOT_FOUND';
    end if;
  elsif v_doc <> '' then
    select c.id, c.grupo_id into v_cliente_id, v_cliente_grupo
    from public.clientes c
    where regexp_replace(coalesce(c.documento, ''), '\D', '', 'g') = v_doc
    order by (c.grupo_id is not null) desc, (c.orqestrai_company_id is not null) desc, c.created_at desc
    limit 1;
  end if;

  if v_cliente_id is not null then
    if v_cliente_grupo is not null and v_cliente_grupo <> v_grupo_id then
      raise exception using errcode = '23514', message = 'CLIENTE_GRUPO_CONFLICT';
    end if;
    -- Só completa o que está vazio: o cadastro existente (OrquestrAI/SIOE) prevalece.
    update public.clientes c
    set
      grupo_id = coalesce(c.grupo_id, v_grupo_id),
      logradouro = coalesce(nullif(c.logradouro, ''), nullif(p_cliente ->> 'logradouro', '')),
      numero = coalesce(nullif(c.numero, ''), nullif(p_cliente ->> 'numero', '')),
      complemento = coalesce(nullif(c.complemento, ''), nullif(p_cliente ->> 'complemento', '')),
      bairro = coalesce(nullif(c.bairro, ''), nullif(p_cliente ->> 'bairro', '')),
      cidade = coalesce(nullif(c.cidade, ''), nullif(p_cliente ->> 'cidade', '')),
      uf = coalesce(nullif(c.uf, ''), nullif(p_cliente ->> 'uf', '')),
      cep = coalesce(nullif(c.cep, ''), nullif(p_cliente ->> 'cep', '')),
      email_principal = coalesce(nullif(c.email_principal, ''), nullif(p_cliente ->> 'email_principal', '')),
      telefone_principal = coalesce(nullif(c.telefone_principal, ''), nullif(p_cliente ->> 'telefone_principal', ''))
    where c.id = v_cliente_id;
  else
    if coalesce(btrim(p_cliente ->> 'razao_social'), '') = '' or v_doc = '' then
      raise exception using errcode = '22023', message = 'CLIENTE_DATA_REQUIRED';
    end if;
    insert into public.clientes (
      razao_social, documento, logradouro, numero, complemento, bairro, cidade, uf, cep,
      email_principal, telefone_principal, grupo_id
    )
    values (
      btrim(p_cliente ->> 'razao_social'),
      p_cliente ->> 'documento',
      nullif(p_cliente ->> 'logradouro', ''),
      nullif(p_cliente ->> 'numero', ''),
      nullif(p_cliente ->> 'complemento', ''),
      nullif(p_cliente ->> 'bairro', ''),
      nullif(p_cliente ->> 'cidade', ''),
      nullif(p_cliente ->> 'uf', ''),
      nullif(p_cliente ->> 'cep', ''),
      nullif(p_cliente ->> 'email_principal', ''),
      nullif(p_cliente ->> 'telefone_principal', ''),
      v_grupo_id
    )
    returning id into v_cliente_id;
  end if;

  -- Contatos (sócios e financeiro) sem duplicar por nome + e-mail.
  for v_contato in select * from jsonb_array_elements(coalesce(p_contatos, '[]'::jsonb)) loop
    if coalesce(btrim(v_contato ->> 'nome'), '') = '' then
      continue;
    end if;
    if not exists (
      select 1 from public.contatos_cliente cc
      where cc.cliente_id = v_cliente_id
        and lower(cc.nome) = lower(btrim(v_contato ->> 'nome'))
        and lower(coalesce(cc.email, '')) = lower(coalesce(v_contato ->> 'email', ''))
    ) then
      insert into public.contatos_cliente (cliente_id, nome, cargo, email, telefone, papel, oportunidade_id)
      values (
        v_cliente_id,
        btrim(v_contato ->> 'nome'),
        nullif(v_contato ->> 'cargo', ''),
        nullif(v_contato ->> 'email', ''),
        nullif(v_contato ->> 'telefone', ''),
        nullif(v_contato ->> 'papel', ''),
        p_opportunity_id
      );
    end if;
  end loop;

  update public.oportunidades o
  set cliente_id = coalesce(o.cliente_id, v_cliente_id), updated_at = p_now
  where o.id = p_opportunity_id;

  v_contract_id := public.ensure_contract_draft_for_opportunity(p_opportunity_id, p_now);
  update public.contratos c
  set
    cliente_id = coalesce(c.cliente_id, v_cliente_id),
    grupo_id = coalesce(c.grupo_id, v_grupo_id),
    updated_at = p_now
  where c.id = v_contract_id;

  update public.lead_client_onboarding
  set
    status = 'concluido',
    ops_checklist = coalesce(p_checklist, '{}'::jsonb),
    grupo_nome = (select g.nome from public.grupos_economicos g where g.id = v_grupo_id),
    vios_referencia = nullif(btrim(coalesce(p_vios_referencia, '')), ''),
    concluded_at = p_now,
    concluded_by = p_actor,
    cliente_id = v_cliente_id,
    grupo_id = v_grupo_id,
    ajustes_solicitados = '[]'::jsonb,
    updated_by = p_actor,
    updated_at = p_now
  where oportunidade_id = p_opportunity_id;

  return query select v_cliente_id, v_grupo_id, v_contract_id;
end;
$$;

revoke all on function public.conclude_client_onboarding_v2_atomic(
  uuid, uuid, jsonb, uuid, text, text, uuid, jsonb, jsonb, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.conclude_client_onboarding_v2_atomic(
  uuid, uuid, jsonb, uuid, text, text, uuid, jsonb, jsonb, text, timestamptz
) to service_role;

-- ---------------------------------------------------------------------------
-- Dados do faturamento: o responsável envia em Cadastro de Novo Cliente, com Operações Legais
-- ainda conferindo ou não; grava o cadastro (com o faturamento), o contato financeiro no cliente
-- (se o cadastro já criou o cliente) e leva o lead para Inclusão no Faturamento.
-- p_contato: { nome, cargo, email, telefone }
-- ---------------------------------------------------------------------------
create or replace function public.submit_client_billing_atomic(
  p_opportunity_id uuid,
  p_actor uuid,
  p_payload jsonb,
  p_contato jsonb,
  p_now timestamptz
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_stage public.opportunity_stage;
  v_cliente_id uuid;
  v_transition_id uuid;
begin
  select etapa into v_stage from public.oportunidades where id = p_opportunity_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'OPPORTUNITY_NOT_FOUND';
  end if;
  if v_stage <> 'cadastro_novo_cliente'::public.opportunity_stage then
    raise exception using errcode = '40001', message = 'OPPORTUNITY_STAGE_CONFLICT';
  end if;

  select o.cliente_id into v_cliente_id
  from public.lead_client_onboarding o
  where o.oportunidade_id = p_opportunity_id and o.status in ('enviado', 'devolvido', 'concluido')
  for update;
  if not found then
    raise exception using errcode = '40001', message = 'ONBOARDING_STATUS_CONFLICT';
  end if;

  update public.lead_client_onboarding
  set payload = p_payload, updated_by = p_actor, updated_at = p_now
  where oportunidade_id = p_opportunity_id;

  if v_cliente_id is not null
    and coalesce(btrim(p_contato ->> 'nome'), '') <> ''
    and not exists (
      select 1 from public.contatos_cliente cc
      where cc.cliente_id = v_cliente_id
        and lower(cc.nome) = lower(btrim(p_contato ->> 'nome'))
        and lower(coalesce(cc.email, '')) = lower(coalesce(p_contato ->> 'email', ''))
    )
  then
    insert into public.contatos_cliente (cliente_id, nome, cargo, email, telefone, papel, oportunidade_id)
    values (
      v_cliente_id,
      btrim(p_contato ->> 'nome'),
      nullif(p_contato ->> 'cargo', ''),
      nullif(p_contato ->> 'email', ''),
      nullif(p_contato ->> 'telefone', ''),
      'financeiro',
      p_opportunity_id
    );
  end if;

  update public.oportunidades
  set etapa = 'inclusao_faturamento'::public.opportunity_stage, updated_at = p_now
  where id = p_opportunity_id;

  insert into public.transicoes_etapa (oportunidade_id, etapa_origem, etapa_destino, alterado_por, observacao)
  values (
    p_opportunity_id,
    'cadastro_novo_cliente'::public.opportunity_stage,
    'inclusao_faturamento'::public.opportunity_stage,
    p_actor,
    'Dados do faturamento enviados pelo responsável.'
  )
  returning id into v_transition_id;

  return v_transition_id;
end;
$$;

revoke all on function public.submit_client_billing_atomic(uuid, uuid, jsonb, jsonb, timestamptz)
from public, anon, authenticated;
grant execute on function public.submit_client_billing_atomic(uuid, uuid, jsonb, jsonb, timestamptz)
to service_role;

-- ---------------------------------------------------------------------------
-- Devolver (v2): Operações Legais aponta os campos a ajustar; o lead fica na etapa em que está.
-- p_ajustes: [{ campo, comentario }]
-- ---------------------------------------------------------------------------
create or replace function public.return_client_onboarding_v2_atomic(
  p_opportunity_id uuid,
  p_actor uuid,
  p_comment text,
  p_ajustes jsonb,
  p_now timestamptz
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_stage public.opportunity_stage;
begin
  select etapa into v_stage from public.oportunidades where id = p_opportunity_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'OPPORTUNITY_NOT_FOUND';
  end if;
  if v_stage not in (
    'cadastro_novo_cliente'::public.opportunity_stage,
    'inclusao_faturamento'::public.opportunity_stage,
    'boas_vindas'::public.opportunity_stage,
    'reuniao_kickoff'::public.opportunity_stage
  ) then
    raise exception using errcode = '40001', message = 'OPPORTUNITY_STAGE_CONFLICT';
  end if;

  update public.lead_client_onboarding
  set
    status = 'devolvido',
    returned_at = p_now,
    returned_by = p_actor,
    return_comment = p_comment,
    ajustes_solicitados = coalesce(p_ajustes, '[]'::jsonb),
    updated_by = p_actor,
    updated_at = p_now
  where oportunidade_id = p_opportunity_id
    and status = 'enviado';
  if not found then
    raise exception using errcode = '40001', message = 'ONBOARDING_STATUS_CONFLICT';
  end if;
end;
$$;

revoke all on function public.return_client_onboarding_v2_atomic(uuid, uuid, text, jsonb, timestamptz)
from public, anon, authenticated;
grant execute on function public.return_client_onboarding_v2_atomic(uuid, uuid, text, jsonb, timestamptz)
to service_role;

-- ---------------------------------------------------------------------------
-- Reenviar: o responsável corrige o cadastro devolvido e manda de novo para Operações Legais,
-- sem mudar a etapa.
-- ---------------------------------------------------------------------------
create or replace function public.resubmit_client_onboarding_atomic(
  p_opportunity_id uuid,
  p_actor uuid,
  p_payload jsonb,
  p_now timestamptz
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_stage public.opportunity_stage;
  v_count integer;
begin
  select etapa into v_stage from public.oportunidades where id = p_opportunity_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'OPPORTUNITY_NOT_FOUND';
  end if;
  if v_stage not in (
    'cadastro_novo_cliente'::public.opportunity_stage,
    'inclusao_faturamento'::public.opportunity_stage,
    'boas_vindas'::public.opportunity_stage,
    'reuniao_kickoff'::public.opportunity_stage
  ) then
    raise exception using errcode = '40001', message = 'OPPORTUNITY_STAGE_CONFLICT';
  end if;

  update public.lead_client_onboarding
  set
    status = 'enviado',
    payload = p_payload,
    submitted_payload = p_payload,
    submission_count = submission_count + 1,
    submitted_at = p_now,
    submitted_by = p_actor,
    ajustes_solicitados = '[]'::jsonb,
    updated_by = p_actor,
    updated_at = p_now
  where oportunidade_id = p_opportunity_id
    and status = 'devolvido'
  returning submission_count into v_count;
  if not found then
    raise exception using errcode = '40001', message = 'ONBOARDING_STATUS_CONFLICT';
  end if;
  return v_count;
end;
$$;

revoke all on function public.resubmit_client_onboarding_atomic(uuid, uuid, jsonb, timestamptz)
from public, anon, authenticated;
grant execute on function public.resubmit_client_onboarding_atomic(uuid, uuid, jsonb, timestamptz)
to service_role;
