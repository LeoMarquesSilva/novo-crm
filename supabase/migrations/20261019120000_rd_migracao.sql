-- Migração dos negócios em andamento do RD Station para o CRM (virada, decisão de 19/10/2026).
-- Antes da virada cada responsável preenche, na fila "Migrar do RD", os campos que o CRM pede
-- e o RD não tem (rascunho em rd_migracoes.payload). No dia, o admin congela o sync do RD
-- (rd_virada) e converte os negócios: o lead passa a andar no CRM (oportunidades.rd_migrado_em)
-- e o histórico do RD continua em rd_deal_reconciliacao. RLS ativo sem policies: só service
-- role, atrás das rotas /api/crm/rd-migration/*.
-- Versionada; NÃO aplicada no remoto nesta entrega.

-- Lead do RD convertido: deixa de ser só leitura e o sync do RD não o altera mais.
alter table public.oportunidades
  add column if not exists rd_migrado_em timestamptz;

comment on column public.oportunidades.rd_migrado_em is
  'Quando o negócio do RD virou lead do CRM (migração da virada). Nulo = lead do RD (só leitura) ou lead nativo do CRM.';

create table if not exists public.rd_migracoes (
  oportunidade_id uuid primary key references public.oportunidades (id) on delete cascade,
  rd_deal_id text not null,
  -- pendente: rascunho antes da virada; convertida: lead do CRM com pendências da migração
  -- (não avança); concluida: migração completa; fora: admin tirou o negócio da migração.
  status text not null default 'pendente'
    check (status in ('pendente', 'convertida', 'concluida', 'fora')),
  -- Escolhido pelo admin; vazio = Solicitante do RD / dono do negócio, resolvido na leitura.
  responsavel_app_user_id uuid references public.app_users (id) on delete set null,
  schema_version smallint not null default 1,
  payload jsonb not null default '{}'::jsonb,
  etapa_rd text,
  etapa_destino public.opportunity_stage,
  motivo_fora text,
  atualizado_por uuid references public.app_users (id) on delete set null,
  convertida_em timestamptz,
  convertida_por uuid references public.app_users (id) on delete set null,
  concluida_em timestamptz,
  concluida_por uuid references public.app_users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.rd_migracoes is
  'Fila "Migrar do RD": rascunho do formulário de migração por negócio e estado da conversão. Escrita só via service role.';

create index if not exists idx_rd_migracoes_status on public.rd_migracoes (status);
create index if not exists idx_rd_migracoes_responsavel on public.rd_migracoes (responsavel_app_user_id);
create unique index if not exists uq_rd_migracoes_rd_deal on public.rd_migracoes (rd_deal_id);

drop trigger if exists set_updated_at on public.rd_migracoes;
create trigger set_updated_at
  before update on public.rd_migracoes
  for each row execute function public.set_updated_at();

alter table public.rd_migracoes enable row level security;
revoke all on public.rd_migracoes from anon, authenticated;
grant select, insert, update, delete on public.rd_migracoes to service_role;

-- Estado da virada (uma linha). congelado_em preenchido = webhook e cron do RD ignorados.
create table if not exists public.rd_virada (
  id smallint primary key default 1 check (id = 1),
  congelado_em timestamptz,
  congelado_por uuid references public.app_users (id) on delete set null,
  convertido_em timestamptz,
  convertido_por uuid references public.app_users (id) on delete set null,
  ultimo_resumo jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.rd_virada is
  'Virada RD → CRM: congelamento do sync do RD e última conversão em lote. Escrita só via service role.';

insert into public.rd_virada (id) values (1) on conflict (id) do nothing;

drop trigger if exists set_updated_at on public.rd_virada;
create trigger set_updated_at
  before update on public.rd_virada
  for each row execute function public.set_updated_at();

alter table public.rd_virada enable row level security;
revoke all on public.rd_virada from anon, authenticated;
grant select, insert, update, delete on public.rd_virada to service_role;
