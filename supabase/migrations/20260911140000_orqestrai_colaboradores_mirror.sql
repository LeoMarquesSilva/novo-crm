-- Espelho local do quadro de colaboradores do ORQESTRAI (projeto Supabase
-- separado, qwihfvagemzlyypeohpc, tabela hr_employees). Sincronizado 1x/dia
-- via cron (/api/cron/orqestrai-colaboradores-sync) — nunca consultado ao
-- vivo no caminho de uma requisição de usuário, pra não deixar a UI do CRM
-- refém da disponibilidade/latência de outro projeto.
create table public.orqestrai_colaboradores (
  id uuid primary key,
  full_name text not null,
  email text,
  department text,
  position text,
  employment_type text,
  is_active boolean not null default true,
  admission_date date,
  termination_date date,
  last_synced_at timestamptz not null default now()
);

create index orqestrai_colaboradores_email_idx
  on public.orqestrai_colaboradores (lower(email));

comment on table public.orqestrai_colaboradores is
  'Espelho diário de hr_employees do ORQESTRAI (colaboradores ativos e inativos, cargo, área). Sincronizado via cron; leitura sempre server-side (service role).';

alter table public.orqestrai_colaboradores enable row level security;
-- Sem policies: leitura/escrita só via service role (mesmo padrão de app_users).
