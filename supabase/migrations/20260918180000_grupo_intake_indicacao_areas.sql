-- Grade pública de preenchimento da carteira (um token lista todos os grupos):
-- origem/indicação (mesmo vocabulário do lead) + áreas de atuação.
-- Versionada localmente; NÃO aplicada no remoto nesta entrega.

alter table public.grupos_economicos
  add column if not exists tipo_lead text,
  add column if not exists tipo_indicacao text,
  add column if not exists nome_indicacao text,
  add column if not exists areas_atuacao jsonb not null default '[]'::jsonb,
  add column if not exists intake_filled_at timestamptz,
  add column if not exists intake_updated_at timestamptz;

comment on column public.grupos_economicos.tipo_lead is
  'Tipo de origem comercial, mesmas chaves de lead_intakes.tipo_lead (Indicacao, Lead Ativa, …).';
comment on column public.grupos_economicos.tipo_indicacao is
  'Subtipo de indicação quando tipo_lead = Indicacao; mesmas chaves de lead_intakes.tipo_indicacao.';
comment on column public.grupos_economicos.nome_indicacao is
  'Nome de quem indicou, quando tipo_lead = Indicacao.';
comment on column public.grupos_economicos.areas_atuacao is
  'Áreas canónicas do CRM com fontes rateio|pasta|manual. Ex.: [{"areaKey":"Trabalhista","sources":["pasta"]}].';

create table public.grupo_intake_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  scope text not null default 'carteira' check (scope = 'carteira'),
  grupo_id uuid null references public.grupos_economicos(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_by uuid null references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);

comment on table public.grupo_intake_tokens is
  'Token opaco de campanha (hash SHA-256) para a grade pública /preencher/carteira/[token]. Um token lista todos os grupos. Service role only.';

create index grupo_intake_tokens_scope_expires_idx
  on public.grupo_intake_tokens (scope, expires_at desc);

create index grupo_intake_tokens_grupo_id_idx
  on public.grupo_intake_tokens (grupo_id, expires_at desc)
  where grupo_id is not null;

create index grupo_intake_tokens_expires_at_idx
  on public.grupo_intake_tokens (expires_at);

alter table public.grupo_intake_tokens enable row level security;
