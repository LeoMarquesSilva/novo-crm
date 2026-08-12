create extension if not exists btree_gist with schema extensions;

alter table public.contratos rename column status to status_assinatura;
alter table public.contratos alter column cliente_id drop not null;

create type public.contract_lifecycle_status as enum
  ('rascunho', 'em_revisao', 'ativo', 'suspenso', 'encerrado');
create type public.contract_version_status as enum
  ('rascunho', 'ativa', 'substituida', 'cancelada');
create type public.contract_closing_status as enum
  ('a_calcular', 'em_revisao', 'aprovado', 'lancado_vios', 'cancelado');

alter table public.contratos
  add column oportunidade_id uuid references public.oportunidades(id) on delete set null,
  add column status public.contract_lifecycle_status not null default 'rascunho',
  add column versao_ativa_id uuid,
  add column vigente_de date,
  add column vigente_ate date,
  add column prazo_indeterminado boolean not null default false,
  add column primeiro_vencimento date,
  add column dia_vencimento smallint,
  add column antecedencia_faturamento_dias integer not null default 10,
  add column data_base_renovacao date,
  add column data_alerta_renovacao date,
  add column indice_reajuste text,
  add column valor_anual_referencia numeric(15,2),
  add column valor_anual_override numeric(15,2),
  add column valor_anual_override_motivo text,
  add column etiquetas text[] not null default '{}',
  add column ignorar_painel_horas boolean not null default false,
  add column d4sign_document_id uuid references public.d4sign_documents(id) on delete set null,
  add column sharepoint_referencia text,
  add column sharepoint_url text,
  add column vios_referencia text,
  add column vios_url text,
  add column criado_por uuid references public.app_users(id) on delete set null,
  add column atualizado_por uuid references public.app_users(id) on delete set null,
  add column ativado_em timestamptz,
  add column ativado_por uuid references public.app_users(id) on delete set null,
  add column suspenso_em timestamptz,
  add column suspenso_por uuid references public.app_users(id) on delete set null,
  add column encerrado_em timestamptz,
  add column encerrado_por uuid references public.app_users(id) on delete set null,
  add constraint contratos_periodo_check
    check (vigente_ate is null or vigente_de is null or vigente_ate >= vigente_de),
  add constraint contratos_dia_vencimento_check
    check (dia_vencimento is null or dia_vencimento between 1 and 31),
  add constraint contratos_antecedencia_faturamento_check
    check (antecedencia_faturamento_dias >= 0),
  add constraint contratos_valor_anual_override_motivo_check
    check (valor_anual_override is null or nullif(btrim(valor_anual_override_motivo), '') is not null);

create table public.contrato_responsaveis (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references public.contratos(id) on delete cascade,
  papel text not null,
  app_user_id uuid references public.app_users(id) on delete set null,
  nome text not null,
  email text,
  telefone text,
  cargo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.contrato_versoes (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references public.contratos(id) on delete cascade,
  numero integer not null,
  status public.contract_version_status not null default 'rascunho',
  vigente_de date,
  vigente_ate date,
  origem_snapshot jsonb not null default '{}'::jsonb,
  ativada_em timestamptz,
  ativada_por uuid references public.app_users(id) on delete set null,
  substituida_em timestamptz,
  substituida_por uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  criado_por uuid references public.app_users(id) on delete set null,
  updated_at timestamptz not null default now(),
  atualizado_por uuid references public.app_users(id) on delete set null,
  constraint contrato_versoes_numero_check check (numero > 0),
  constraint contrato_versoes_periodo_check
    check (vigente_ate is null or vigente_de is null or vigente_ate >= vigente_de),
  constraint contrato_versoes_ativa_vigente_de_check
    check (status <> 'ativa'::public.contract_version_status or vigente_de is not null),
  constraint contrato_versoes_contrato_numero_key unique (contrato_id, numero)
);

alter table public.contratos
  add constraint contratos_versao_ativa_id_fkey
  foreign key (versao_ativa_id) references public.contrato_versoes(id) on delete set null;

alter table public.aditivos
  add column versao_origem_id uuid references public.contrato_versoes(id) on delete set null,
  add column versao_resultante_id uuid references public.contrato_versoes(id) on delete set null;

create table public.contrato_areas (
  id uuid primary key default gen_random_uuid(),
  versao_id uuid not null references public.contrato_versoes(id) on delete cascade,
  area_key text not null,
  processos_incluidos numeric(15,4),
  horas_incluidas numeric(15,4),
  valor_excedente_processo numeric(15,2),
  valor_excedente_hora numeric(15,2),
  valor_km numeric(15,2),
  acompanha_processos boolean not null default false,
  acompanha_horas boolean not null default false,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contrato_areas_versao_area_key unique (versao_id, area_key),
  constraint contrato_areas_quantidades_check check (
    (processos_incluidos is null or processos_incluidos >= 0)
    and (horas_incluidas is null or horas_incluidas >= 0)
  )
);

create table public.contrato_componentes_cobranca (
  id uuid primary key default gen_random_uuid(),
  versao_id uuid not null references public.contrato_versoes(id) on delete cascade,
  area_id uuid references public.contrato_areas(id) on delete set null,
  grupo_faixa_id uuid,
  tipo text not null,
  descricao text not null,
  recorrencia text,
  periodo_inicio date,
  periodo_fim date,
  valor_fixo numeric(15,2),
  valor_unitario numeric(15,2),
  quantidade_incluida numeric(15,4),
  percentual numeric(9,4),
  base_calculo text,
  modo_cobranca_variavel text,
  liberacao_manual_necessaria boolean not null default false,
  condicao_liberacao text,
  liberado_em timestamptz,
  liberado_por uuid references public.app_users(id) on delete set null,
  tratamento_tributario text,
  elegivel_rateio boolean not null default true,
  elegivel_participacao boolean not null default true,
  elegivel_comissao boolean not null default true,
  ordem integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contrato_componentes_tipo_check check (tipo in (
    'mensal_fixo', 'mensal_preco_fechado', 'mensal_escalonado',
    'variavel_processo', 'variavel_hora', 'mensal_condicionado', 'spot',
    'manutencao', 'exito_percentual', 'exito_valor_fixo', 'acordo',
    'despesa_km', 'reembolso', 'ajuste'
  )),
  constraint contrato_componentes_modo_variavel_check check (
    modo_cobranca_variavel is null
    or modo_cobranca_variavel in ('quantidade_total', 'excedente')
  ),
  constraint contrato_componentes_periodo_check
    check (periodo_fim is null or periodo_inicio is null or periodo_fim >= periodo_inicio),
  constraint contrato_componentes_percentual_check
    check (percentual is null or percentual between 0 and 100),
  constraint contrato_componentes_quantidade_check
    check (quantidade_incluida is null or quantidade_incluida >= 0)
);

create table public.contrato_parcelas (
  id uuid primary key default gen_random_uuid(),
  componente_id uuid not null references public.contrato_componentes_cobranca(id) on delete cascade,
  numero integer not null,
  competencia date not null,
  vencimento date not null,
  valor numeric(15,2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contrato_parcelas_numero_check check (numero > 0),
  constraint contrato_parcelas_componente_numero_key unique (componente_id, numero),
  constraint contrato_parcelas_competencia_first_day_check
    check (date_trunc('month', competencia)::date = competencia)
);

create table public.contrato_rateios_area (
  id uuid primary key default gen_random_uuid(),
  versao_id uuid not null references public.contrato_versoes(id) on delete cascade,
  componente_id uuid references public.contrato_componentes_cobranca(id) on delete cascade,
  area_id uuid not null references public.contrato_areas(id) on delete cascade,
  modo text not null,
  percentual numeric(9,4),
  valor numeric(15,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contrato_rateios_area_modo_check check (modo in ('percentual', 'valor'))
);

alter table public.contrato_rateios_area add constraint contrato_rateio_one_value_check
  check (
    (modo = 'percentual' and percentual is not null and valor is null)
    or (modo = 'valor' and valor is not null and percentual is null)
  );

create table public.contrato_participacoes_socios (
  id uuid primary key default gen_random_uuid(),
  versao_id uuid not null references public.contrato_versoes(id) on delete cascade,
  componente_id uuid references public.contrato_componentes_cobranca(id) on delete cascade,
  socio_app_user_id uuid references public.app_users(id) on delete set null,
  socio_nome text not null,
  percentual numeric(9,4) not null,
  regra_sugerida text,
  override_motivo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contrato_participacoes_percentual_check check (percentual between 0 and 100)
);

create table public.contrato_comissoes (
  id uuid primary key default gen_random_uuid(),
  versao_id uuid not null references public.contrato_versoes(id) on delete cascade,
  componente_id uuid references public.contrato_componentes_cobranca(id) on delete cascade,
  beneficiario_app_user_id uuid references public.app_users(id) on delete set null,
  beneficiario_nome text not null,
  percentual numeric(9,4),
  valor numeric(15,2),
  periodo_inicio date,
  periodo_fim date,
  base_calculo text not null,
  motivo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contrato_comissoes_one_value_check check (
    (percentual is not null and valor is null)
    or (valor is not null and percentual is null)
  ),
  constraint contrato_comissoes_percentual_check
    check (percentual is null or percentual between 0 and 100),
  constraint contrato_comissoes_periodo_check
    check (periodo_fim is null or periodo_inicio is null or periodo_fim >= periodo_inicio)
);

create table public.contrato_consumos_mensais (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references public.contratos(id) on delete cascade,
  versao_id uuid not null references public.contrato_versoes(id) on delete restrict,
  competencia date not null,
  componente_id uuid references public.contrato_componentes_cobranca(id) on delete set null,
  area_id uuid references public.contrato_areas(id) on delete set null,
  tipo text not null,
  quantidade numeric(15,4),
  valor numeric(15,2),
  evidencia_url text,
  observacao text,
  informado_por uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contrato_consumos_tipo_check
    check (tipo in ('processo', 'hora', 'quilometro', 'valor_manual')),
  constraint contrato_consumos_competencia_first_day_check
    check (date_trunc('month', competencia)::date = competencia),
  constraint contrato_consumos_one_value_check check (
    (tipo = 'valor_manual' and valor is not null and quantidade is null)
    or (tipo <> 'valor_manual' and quantidade is not null and valor is null)
  )
);

create table public.contrato_resolucoes_mensais (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references public.contratos(id) on delete cascade,
  versao_id uuid not null references public.contrato_versoes(id) on delete restrict,
  componente_id uuid not null references public.contrato_componentes_cobranca(id) on delete cascade,
  competencia date not null,
  liberado boolean not null default false,
  valor numeric(15,2),
  base_calculo numeric(15,2),
  motivo text,
  informado_por uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contrato_resolucoes_competencia_first_day_check check (date_trunc('month', competencia)::date = competencia),
  constraint contrato_resolucoes_mensais_unique unique (versao_id, componente_id, competencia)
);

create table public.contrato_fechamentos (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references public.contratos(id) on delete cascade,
  versao_id uuid not null references public.contrato_versoes(id) on delete restrict,
  competencia date not null,
  revisao_atual_id uuid,
  status public.contract_closing_status not null default 'a_calcular',
  preparado_em timestamptz,
  preparado_por uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index contrato_fechamentos_competencia_unique
  on public.contrato_fechamentos (contrato_id, competencia);

alter table public.contrato_fechamentos add constraint competencia_first_day_check
  check (date_trunc('month', competencia)::date = competencia);

create table public.contrato_fechamento_revisoes (
  id uuid primary key default gen_random_uuid(),
  fechamento_id uuid not null references public.contrato_fechamentos(id) on delete cascade,
  numero integer not null,
  revisao_anterior_id uuid references public.contrato_fechamento_revisoes(id) on delete restrict,
  status public.contract_closing_status not null default 'a_calcular',
  total_honorarios numeric(15,2) not null default 0,
  total_tributos numeric(15,2) not null default 0,
  total_reembolsos numeric(15,2) not null default 0,
  total_geral numeric(15,2) not null default 0,
  calculada_em timestamptz,
  calculada_por uuid references public.app_users(id) on delete set null,
  aprovada_em timestamptz,
  aprovada_por uuid references public.app_users(id) on delete set null,
  vios_referencia text,
  vios_url text,
  lancada_vios_em timestamptz,
  lancada_vios_por uuid references public.app_users(id) on delete set null,
  motivo_correcao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contrato_fechamento_revisoes_numero_check check (numero > 0),
  constraint contrato_fechamento_revisoes_fechamento_numero_key
    unique (fechamento_id, numero),
  constraint contrato_fechamento_revisoes_vios_check check (
    status <> 'lancado_vios'::public.contract_closing_status
    or (
      nullif(btrim(vios_referencia), '') is not null
      and lancada_vios_em is not null
      and lancada_vios_por is not null
    )
  )
);

alter table public.contrato_fechamentos
  add constraint contrato_fechamentos_revisao_atual_id_fkey
  foreign key (revisao_atual_id)
  references public.contrato_fechamento_revisoes(id) on delete set null;

create table public.contrato_fechamento_itens (
  id uuid primary key default gen_random_uuid(),
  revisao_id uuid not null references public.contrato_fechamento_revisoes(id) on delete cascade,
  tipo text not null,
  componente_id uuid references public.contrato_componentes_cobranca(id) on delete set null,
  area_id uuid references public.contrato_areas(id) on delete set null,
  descricao text not null,
  quantidade numeric(15,4),
  tarifa numeric(15,2),
  percentual numeric(9,4),
  valor numeric(15,2) not null default 0,
  elegivel_rateio boolean not null default true,
  elegivel_participacao boolean not null default true,
  elegivel_comissao boolean not null default true,
  bloqueante boolean not null default false,
  bloqueio_tipo text,
  bloqueio_descricao text,
  resolvido_em timestamptz,
  resolvido_por uuid references public.app_users(id) on delete set null,
  resolucao text,
  metadados jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.contrato_alertas (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references public.contratos(id) on delete cascade,
  fechamento_id uuid references public.contrato_fechamentos(id) on delete cascade,
  tipo text not null,
  data_base date,
  data_vencimento date,
  status text not null default 'aberto',
  responsavel_app_user_id uuid references public.app_users(id) on delete set null,
  cliente_notificado_em timestamptz,
  cliente_notificado_por uuid references public.app_users(id) on delete set null,
  decisao text,
  resolucao text,
  resolvido_em timestamptz,
  resolvido_por uuid references public.app_users(id) on delete set null,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.contrato_eventos (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references public.contratos(id) on delete cascade,
  tipo text not null,
  titulo text not null,
  detalhe text,
  ator_app_user_id uuid references public.app_users(id) on delete set null,
  origem text,
  idempotency_key text unique,
  metadados_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index contratos_oportunidade_unique
  on public.contratos (oportunidade_id)
  where oportunidade_id is not null;

create unique index contrato_responsaveis_identidade_unique
  on public.contrato_responsaveis (
    contrato_id,
    papel,
    coalesce(app_user_id::text, lower(coalesce(email, nome)))
  );

create unique index contrato_rateios_area_logical_unique
  on public.contrato_rateios_area (
    versao_id,
    coalesce(componente_id, '00000000-0000-0000-0000-000000000000'::uuid),
    area_id
  );

alter table public.contrato_versoes
  add constraint contrato_versoes_ativas_sem_sobreposicao
  exclude using gist (
    contrato_id with =,
    daterange(vigente_de, coalesce(vigente_ate, 'infinity'::date), '[]') with &&
  )
  where (status = 'ativa'::public.contract_version_status);

create index contratos_cliente_id_idx on public.contratos (cliente_id);
create index contratos_oportunidade_id_idx on public.contratos (oportunidade_id);
create index contratos_versao_ativa_id_idx on public.contratos (versao_ativa_id);
create index contratos_d4sign_document_id_idx on public.contratos (d4sign_document_id);
create index contratos_criado_por_idx on public.contratos (criado_por);
create index contratos_atualizado_por_idx on public.contratos (atualizado_por);
create index contratos_ativado_por_idx on public.contratos (ativado_por);
create index contratos_suspenso_por_idx on public.contratos (suspenso_por);
create index contratos_encerrado_por_idx on public.contratos (encerrado_por);
create index aditivos_versao_origem_id_idx on public.aditivos (versao_origem_id);
create index aditivos_versao_resultante_id_idx on public.aditivos (versao_resultante_id);
create index contrato_responsaveis_app_user_id_idx on public.contrato_responsaveis (app_user_id);
create index contrato_versoes_ativada_por_idx on public.contrato_versoes (ativada_por);
create index contrato_versoes_substituida_por_idx on public.contrato_versoes (substituida_por);
create index contrato_versoes_criado_por_idx on public.contrato_versoes (criado_por);
create index contrato_versoes_atualizado_por_idx on public.contrato_versoes (atualizado_por);
create index contrato_componentes_area_id_idx on public.contrato_componentes_cobranca (area_id);
create index contrato_componentes_liberado_por_idx on public.contrato_componentes_cobranca (liberado_por);
create index contrato_parcelas_componente_id_idx on public.contrato_parcelas (componente_id);
create index contrato_rateios_componente_id_idx on public.contrato_rateios_area (componente_id);
create index contrato_rateios_area_id_idx on public.contrato_rateios_area (area_id);
create index contrato_participacoes_versao_id_idx on public.contrato_participacoes_socios (versao_id);
create index contrato_participacoes_componente_id_idx on public.contrato_participacoes_socios (componente_id);
create index contrato_participacoes_socio_idx on public.contrato_participacoes_socios (socio_app_user_id);
create index contrato_comissoes_versao_id_idx on public.contrato_comissoes (versao_id);
create index contrato_comissoes_componente_id_idx on public.contrato_comissoes (componente_id);
create index contrato_comissoes_beneficiario_idx on public.contrato_comissoes (beneficiario_app_user_id);
create index contrato_consumos_contrato_id_idx on public.contrato_consumos_mensais (contrato_id);
create index contrato_consumos_versao_id_idx on public.contrato_consumos_mensais (versao_id);
create index contrato_consumos_componente_id_idx on public.contrato_consumos_mensais (componente_id);
create index contrato_consumos_area_id_idx on public.contrato_consumos_mensais (area_id);
create index contrato_consumos_informado_por_idx on public.contrato_consumos_mensais (informado_por);
create index contrato_resolucoes_contrato_competencia_idx on public.contrato_resolucoes_mensais (contrato_id, competencia);
create index contrato_fechamentos_versao_id_idx on public.contrato_fechamentos (versao_id);
create index contrato_fechamentos_revisao_atual_id_idx on public.contrato_fechamentos (revisao_atual_id);
create index contrato_fechamentos_preparado_por_idx on public.contrato_fechamentos (preparado_por);
create index contrato_revisoes_revisao_anterior_id_idx on public.contrato_fechamento_revisoes (revisao_anterior_id);
create index contrato_revisoes_calculada_por_idx on public.contrato_fechamento_revisoes (calculada_por);
create index contrato_revisoes_aprovada_por_idx on public.contrato_fechamento_revisoes (aprovada_por);
create index contrato_revisoes_lancada_vios_por_idx on public.contrato_fechamento_revisoes (lancada_vios_por);
create index contrato_itens_revisao_id_idx on public.contrato_fechamento_itens (revisao_id);
create index contrato_itens_componente_id_idx on public.contrato_fechamento_itens (componente_id);
create index contrato_itens_area_id_idx on public.contrato_fechamento_itens (area_id);
create index contrato_itens_resolvido_por_idx on public.contrato_fechamento_itens (resolvido_por);
create index contrato_alertas_contrato_id_idx on public.contrato_alertas (contrato_id);
create index contrato_alertas_fechamento_id_idx on public.contrato_alertas (fechamento_id);
create index contrato_alertas_responsavel_idx on public.contrato_alertas (responsavel_app_user_id);
create index contrato_alertas_cliente_notificado_por_idx on public.contrato_alertas (cliente_notificado_por);
create index contrato_alertas_resolvido_por_idx on public.contrato_alertas (resolvido_por);
create index contrato_eventos_contrato_id_idx on public.contrato_eventos (contrato_id);
create index contrato_eventos_ator_idx on public.contrato_eventos (ator_app_user_id);

create or replace function public.set_contract_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.guard_active_contract_version_immutability()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'ativa'::public.contract_version_status then
    raise exception using
      errcode = '55000',
      message = 'ACTIVE_CONTRACT_VERSION_IS_IMMUTABLE';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.guard_approved_contract_closing_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
    and old.status in (
      'aprovado'::public.contract_closing_status,
      'lancado_vios'::public.contract_closing_status
    ) then
    raise exception using
      errcode = '55000',
      message = 'APPROVED_CONTRACT_CLOSING_REVISION_IS_IMMUTABLE';
  end if;

  if tg_op = 'UPDATE' and old.status = 'lancado_vios'::public.contract_closing_status then
    raise exception using
      errcode = '55000',
      message = 'VIOS_CONTRACT_CLOSING_REVISION_IS_IMMUTABLE';
  end if;

  if tg_op = 'UPDATE' and old.status = 'aprovado'::public.contract_closing_status then
    if current_setting('app.contract_closing_vios_rpc', true) is distinct from 'on'
      or new.status <> 'lancado_vios'::public.contract_closing_status
      or nullif(btrim(new.vios_referencia), '') is null
      or new.lancada_vios_em is null
      or new.lancada_vios_por is null
      or (
        to_jsonb(new) - array[
          'status', 'vios_referencia', 'vios_url', 'lancada_vios_em',
          'lancada_vios_por', 'updated_at'
        ]
      ) is distinct from (
        to_jsonb(old) - array[
          'status', 'vios_referencia', 'vios_url', 'lancada_vios_em',
          'lancada_vios_por', 'updated_at'
        ]
      )
    then
      raise exception using
        errcode = '55000',
        message = 'APPROVED_CONTRACT_CLOSING_REVISION_IS_IMMUTABLE';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger contrato_versoes_guard_immutability
before update or delete on public.contrato_versoes
for each row execute function public.guard_active_contract_version_immutability();

create trigger contrato_fechamento_revisoes_guard_immutability
before update or delete on public.contrato_fechamento_revisoes
for each row execute function public.guard_approved_contract_closing_revision();

create trigger contrato_responsaveis_set_updated_at before update on public.contrato_responsaveis
for each row execute function public.set_contract_updated_at();
create trigger contrato_versoes_set_updated_at before update on public.contrato_versoes
for each row execute function public.set_contract_updated_at();
create trigger contrato_areas_set_updated_at before update on public.contrato_areas
for each row execute function public.set_contract_updated_at();
create trigger contrato_componentes_set_updated_at before update on public.contrato_componentes_cobranca
for each row execute function public.set_contract_updated_at();
create trigger contrato_parcelas_set_updated_at before update on public.contrato_parcelas
for each row execute function public.set_contract_updated_at();
create trigger contrato_rateios_set_updated_at before update on public.contrato_rateios_area
for each row execute function public.set_contract_updated_at();
create trigger contrato_participacoes_set_updated_at before update on public.contrato_participacoes_socios
for each row execute function public.set_contract_updated_at();
create trigger contrato_comissoes_set_updated_at before update on public.contrato_comissoes
for each row execute function public.set_contract_updated_at();
create trigger contrato_consumos_set_updated_at before update on public.contrato_consumos_mensais
for each row execute function public.set_contract_updated_at();
create trigger contrato_resolucoes_set_updated_at before update on public.contrato_resolucoes_mensais
for each row execute function public.set_contract_updated_at();
create trigger contrato_fechamentos_set_updated_at before update on public.contrato_fechamentos
for each row execute function public.set_contract_updated_at();
create trigger contrato_fechamento_revisoes_set_updated_at before update on public.contrato_fechamento_revisoes
for each row execute function public.set_contract_updated_at();
create trigger contrato_fechamento_itens_set_updated_at before update on public.contrato_fechamento_itens
for each row execute function public.set_contract_updated_at();
create trigger contrato_alertas_set_updated_at before update on public.contrato_alertas
for each row execute function public.set_contract_updated_at();
create trigger contrato_eventos_set_updated_at before update on public.contrato_eventos
for each row execute function public.set_contract_updated_at();

create or replace function public.registrar_lancamento_vios_fechamento(
  p_revisao_id uuid,
  p_vios_referencia text,
  p_vios_url text,
  p_lancado_por uuid,
  p_lancado_em timestamptz default now()
)
returns public.contrato_fechamento_revisoes
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_revisao public.contrato_fechamento_revisoes;
begin
  if nullif(btrim(p_vios_referencia), '') is null
    or p_lancado_por is null
    or p_lancado_em is null
  then
    raise exception using
      errcode = '22023',
      message = 'VIOS_REFERENCE_DATE_AND_ACTOR_ARE_REQUIRED';
  end if;

  perform set_config('app.contract_closing_vios_rpc', 'on', true);

  update public.contrato_fechamento_revisoes
  set
    status = 'lancado_vios'::public.contract_closing_status,
    vios_referencia = btrim(p_vios_referencia),
    vios_url = nullif(btrim(p_vios_url), ''),
    lancada_vios_em = p_lancado_em,
    lancada_vios_por = p_lancado_por,
    updated_at = now()
  where id = p_revisao_id
    and status = 'aprovado'::public.contract_closing_status
  returning * into v_revisao;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'APPROVED_CONTRACT_CLOSING_REVISION_NOT_FOUND';
  end if;

  update public.contrato_fechamentos
  set status = 'lancado_vios'::public.contract_closing_status
  where id = v_revisao.fechamento_id
    and revisao_atual_id = v_revisao.id;

  return v_revisao;
end;
$$;

revoke execute on function public.set_contract_updated_at()
from public, anon, authenticated;
revoke execute on function public.guard_active_contract_version_immutability()
from public, anon, authenticated;
revoke execute on function public.guard_approved_contract_closing_revision()
from public, anon, authenticated;
revoke all on function public.registrar_lancamento_vios_fechamento(
  uuid, text, text, uuid, timestamptz
) from public, anon, authenticated;
grant execute on function public.registrar_lancamento_vios_fechamento(
  uuid, text, text, uuid, timestamptz
) to service_role;
