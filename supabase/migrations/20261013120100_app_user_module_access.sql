-- Liberação de módulos por usuário (checkbox em Configurações → Usuários).
-- Primeiro módulo: 'icp' (perfil de cliente ideal). Admin sempre vê todos os módulos;
-- os demais papéis só veem o módulo com uma linha aqui.
-- Tabela separada de app_users de propósito: a policy de UPDATE de app_users é
-- "próprio ou admin" (o /crm/perfil grava pelo client do browser), então uma coluna lá
-- permitiria o próprio usuário se liberar. Aqui não há policies: só a service role
-- (API de admin) escreve.
-- Aplicada no remoto CRM-BP em 13/10/2026 (SQL Editor).
create table if not exists public.app_user_module_access (
  app_user_id uuid not null references public.app_users (id) on delete cascade,
  module text not null check (module in ('icp')),
  granted_by uuid references public.app_users (id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (app_user_id, module)
);

comment on table public.app_user_module_access is
  'Módulos liberados por usuário (ex.: icp). Admin vê tudo sem linha aqui. Escrita só via service role (API /api/admin/users/[id]/modules).';

alter table public.app_user_module_access enable row level security;
revoke all on public.app_user_module_access from anon, authenticated;
grant select, insert, update, delete on public.app_user_module_access to service_role;
