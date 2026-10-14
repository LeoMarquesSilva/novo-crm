-- Cadastro do novo cliente: enviar (responsável → Operações Legais), devolver para ajuste
-- e concluir (cria/vincula cliente, grupo e contatos e leva o lead para Inclusão no
-- Faturamento), cada um numa transação. Depende de 20261015124000 (lead_client_onboarding).
-- Versionada; NÃO aplicada no remoto nesta entrega. Sem ela as rotas respondem 409
-- ("migration pendente").

-- ---------------------------------------------------------------------------
-- Enviar: Aguardando Cadastro → Cadastro de Novo Cliente.
-- ---------------------------------------------------------------------------
create or replace function public.submit_client_onboarding_atomic(
  p_opportunity_id uuid,
  p_actor uuid,
  p_payload jsonb,
  p_schema_version smallint,
  p_now timestamptz
)
returns table (transition_id uuid, submission_count integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_stage public.opportunity_stage;
  v_status text;
  v_transition_id uuid;
  v_count integer;
begin
  select etapa into v_stage from public.oportunidades where id = p_opportunity_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'OPPORTUNITY_NOT_FOUND';
  end if;
  if v_stage <> 'aguardando_cadastro'::public.opportunity_stage then
    raise exception using errcode = '40001', message = 'OPPORTUNITY_STAGE_CONFLICT';
  end if;

  select status into v_status
  from public.lead_client_onboarding
  where oportunidade_id = p_opportunity_id
  for update;
  if v_status is not null and v_status not in ('rascunho', 'devolvido') then
    raise exception using errcode = '40001', message = 'ONBOARDING_STATUS_CONFLICT';
  end if;

  insert into public.lead_client_onboarding (
    oportunidade_id, status, schema_version, payload, submitted_payload, submission_count,
    submitted_at, submitted_by, updated_by, created_at, updated_at
  )
  values (
    p_opportunity_id, 'enviado', p_schema_version, p_payload, p_payload, 1,
    p_now, p_actor, p_actor, p_now, p_now
  )
  on conflict (oportunidade_id) do update set
    status = 'enviado',
    schema_version = excluded.schema_version,
    payload = excluded.payload,
    submitted_payload = excluded.submitted_payload,
    submission_count = lead_client_onboarding.submission_count + 1,
    submitted_at = p_now,
    submitted_by = p_actor,
    updated_by = p_actor,
    updated_at = p_now
  returning lead_client_onboarding.submission_count into v_count;

  update public.oportunidades
  set etapa = 'cadastro_novo_cliente'::public.opportunity_stage, updated_at = p_now
  where id = p_opportunity_id;

  insert into public.transicoes_etapa (oportunidade_id, etapa_origem, etapa_destino, alterado_por, observacao)
  values (
    p_opportunity_id,
    'aguardando_cadastro'::public.opportunity_stage,
    'cadastro_novo_cliente'::public.opportunity_stage,
    p_actor,
    'Cadastro do cliente enviado para Operações Legais.'
  )
  returning id into v_transition_id;

  return query select v_transition_id, v_count;
end;
$$;

revoke all on function public.submit_client_onboarding_atomic(uuid, uuid, jsonb, smallint, timestamptz)
from public, anon, authenticated;
grant execute on function public.submit_client_onboarding_atomic(uuid, uuid, jsonb, smallint, timestamptz)
to service_role;

-- ---------------------------------------------------------------------------
-- Devolver: Cadastro de Novo Cliente → Aguardando Cadastro, com comentário.
-- ---------------------------------------------------------------------------
create or replace function public.return_client_onboarding_atomic(
  p_opportunity_id uuid,
  p_actor uuid,
  p_comment text,
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
  select etapa into v_stage from public.oportunidades where id = p_opportunity_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'OPPORTUNITY_NOT_FOUND';
  end if;
  if v_stage <> 'cadastro_novo_cliente'::public.opportunity_stage then
    raise exception using errcode = '40001', message = 'OPPORTUNITY_STAGE_CONFLICT';
  end if;

  update public.lead_client_onboarding
  set
    status = 'devolvido',
    returned_at = p_now,
    returned_by = p_actor,
    return_comment = p_comment,
    updated_by = p_actor,
    updated_at = p_now
  where oportunidade_id = p_opportunity_id
    and status = 'enviado';
  if not found then
    raise exception using errcode = '40001', message = 'ONBOARDING_STATUS_CONFLICT';
  end if;

  update public.oportunidades
  set etapa = 'aguardando_cadastro'::public.opportunity_stage, updated_at = p_now
  where id = p_opportunity_id;

  insert into public.transicoes_etapa (oportunidade_id, etapa_origem, etapa_destino, alterado_por, observacao)
  values (
    p_opportunity_id,
    'cadastro_novo_cliente'::public.opportunity_stage,
    'aguardando_cadastro'::public.opportunity_stage,
    p_actor,
    'Cadastro devolvido por Operações Legais: ' || left(coalesce(p_comment, ''), 400)
  )
  returning id into v_transition_id;

  return v_transition_id;
end;
$$;

revoke all on function public.return_client_onboarding_atomic(uuid, uuid, text, timestamptz)
from public, anon, authenticated;
grant execute on function public.return_client_onboarding_atomic(uuid, uuid, text, timestamptz)
to service_role;

-- ---------------------------------------------------------------------------
-- Concluir: cria ou vincula grupo (chave estável), cliente (CPF/CNPJ) e contatos,
-- liga o lead e o contrato ao cliente/grupo e move para Inclusão no Faturamento.
-- p_cliente: { razao_social, documento, logradouro, numero, complemento, bairro,
--              cidade, uf, cep, email_principal, telefone_principal }
-- p_contatos: [{ nome, cargo, email, telefone, papel }]
-- ---------------------------------------------------------------------------
create or replace function public.conclude_client_onboarding_atomic(
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
returns table (transition_id uuid, cliente_id uuid, grupo_id uuid, contract_id uuid)
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
  v_transition_id uuid;
  v_contato jsonb;
begin
  select etapa into v_stage from public.oportunidades where id = p_opportunity_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'OPPORTUNITY_NOT_FOUND';
  end if;
  if v_stage <> 'cadastro_novo_cliente'::public.opportunity_stage then
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

  -- Contatos (financeiro, ponto focal) sem duplicar por nome + e-mail.
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
    updated_by = p_actor,
    updated_at = p_now
  where oportunidade_id = p_opportunity_id;

  update public.oportunidades
  set etapa = 'inclusao_faturamento'::public.opportunity_stage, updated_at = p_now
  where id = p_opportunity_id;

  insert into public.transicoes_etapa (oportunidade_id, etapa_origem, etapa_destino, alterado_por, observacao)
  values (
    p_opportunity_id,
    'cadastro_novo_cliente'::public.opportunity_stage,
    'inclusao_faturamento'::public.opportunity_stage,
    p_actor,
    'Cadastro do cliente concluído por Operações Legais.'
  )
  returning id into v_transition_id;

  return query select v_transition_id, v_cliente_id, v_grupo_id, v_contract_id;
end;
$$;

revoke all on function public.conclude_client_onboarding_atomic(
  uuid, uuid, jsonb, uuid, text, text, uuid, jsonb, jsonb, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.conclude_client_onboarding_atomic(
  uuid, uuid, jsonb, uuid, text, text, uuid, jsonb, jsonb, text, timestamptz
) to service_role;
