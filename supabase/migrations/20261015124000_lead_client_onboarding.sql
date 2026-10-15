-- Cadastro do cliente no pós-venda.
-- Aguardando Cadastro: o responsável do lead preenche (dados de cadastro + dados para o
-- financeiro/gestão de contratos) e envia. Cadastro de Novo Cliente: Operações Legais confere,
-- cadastra no VIOS e nos sistemas legados, define o nome do grupo e conclui; o CRM cria/vincula
-- cliente, grupo e contatos. Um registro por lead. RLS ativo sem policies: só service role,
-- atrás das rotas /api/crm/leads/[id]/onboarding/*.
-- Versionada; NÃO aplicada no remoto nesta entrega.

create table if not exists public.lead_client_onboarding (
  id uuid primary key default gen_random_uuid(),
  oportunidade_id uuid not null unique references public.oportunidades (id) on delete cascade,
  status text not null default 'rascunho'
    check (status in ('rascunho', 'enviado', 'devolvido', 'concluido')),
  schema_version smallint not null default 1,
  payload jsonb not null default '{}'::jsonb,
  submitted_payload jsonb,
  ops_checklist jsonb not null default '{}'::jsonb,
  grupo_nome text,
  vios_referencia text,
  submission_count integer not null default 0,
  submitted_at timestamptz,
  submitted_by uuid references public.app_users (id) on delete set null,
  returned_at timestamptz,
  returned_by uuid references public.app_users (id) on delete set null,
  return_comment text,
  concluded_at timestamptz,
  concluded_by uuid references public.app_users (id) on delete set null,
  cliente_id uuid references public.clientes (id) on delete set null,
  grupo_id uuid references public.grupos_economicos (id) on delete set null,
  updated_by uuid references public.app_users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.lead_client_onboarding is
  'Cadastro do novo cliente no pós-venda (responsável do lead → Operações Legais). Escrita só via service role.';

create index if not exists idx_lead_client_onboarding_status
  on public.lead_client_onboarding (status);
create index if not exists idx_lead_client_onboarding_cliente
  on public.lead_client_onboarding (cliente_id);
create index if not exists idx_lead_client_onboarding_grupo
  on public.lead_client_onboarding (grupo_id);

drop trigger if exists set_updated_at on public.lead_client_onboarding;
create trigger set_updated_at
  before update on public.lead_client_onboarding
  for each row execute function public.set_updated_at();

alter table public.lead_client_onboarding enable row level security;
revoke all on public.lead_client_onboarding from anon, authenticated;
grant select, insert, update, delete on public.lead_client_onboarding to service_role;

-- Contatos do cliente vindos do cadastro (financeiro, ponto focal).
alter table public.contatos_cliente
  add column if not exists papel text,
  add column if not exists oportunidade_id uuid references public.oportunidades (id) on delete set null;

create index if not exists idx_contatos_cliente_cliente on public.contatos_cliente (cliente_id);
