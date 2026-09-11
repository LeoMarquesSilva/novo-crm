-- Motor de contratos a partir da proposta: perfis, metadados de cláusula e revisão por versão.

alter table public.contract_clause_templates
  add column if not exists stable_key text,
  add column if not exists version integer not null default 1,
  add column if not exists status text not null default 'pending_legal_review',
  add column if not exists role text,
  add column if not exists is_required boolean not null default false,
  add column if not exists placeholders text[] not null default '{}',
  add column if not exists conflicts_json jsonb not null default '[]'::jsonb,
  add column if not exists legal_review_note text;

create unique index if not exists contract_clause_templates_stable_key_uidx
  on public.contract_clause_templates (stable_key)
  where stable_key is not null;

alter table public.contract_review_tasks
  add column if not exists document_version_id uuid references public.document_versions(id) on delete set null,
  add column if not exists document_hash text,
  add column if not exists approved_by uuid references public.app_users(id) on delete set null;

alter table public.document_versions
  add column if not exists sha256 text,
  add column if not exists file_size integer,
  add column if not exists mime_type text;

create table if not exists public.contract_scope_profiles (
  id uuid primary key default gen_random_uuid(),
  scope_subtype_key text not null unique,
  label text not null,
  instrument_type text,
  default_term_rule_json jsonb not null default '{}'::jsonb,
  default_start_rule_json jsonb not null default '{}'::jsonb,
  status text not null default 'pending_legal_review',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contract_scope_profile_clauses (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.contract_scope_profiles(id) on delete cascade,
  clause_stable_key text not null,
  role text not null,
  sort_order integer not null default 0,
  is_required boolean not null default false,
  conditions_json jsonb not null default '{}'::jsonb
);

create index if not exists contract_scope_profile_clauses_profile_idx
  on public.contract_scope_profile_clauses (profile_id);

alter table public.contract_scope_profiles enable row level security;
alter table public.contract_scope_profile_clauses enable row level security;

drop policy if exists "Authenticated users can read contract scope profiles"
  on public.contract_scope_profiles;
create policy "Authenticated users can read contract scope profiles"
  on public.contract_scope_profiles
  for select
  to authenticated
  using (true);

drop policy if exists "Admins can manage contract scope profiles"
  on public.contract_scope_profiles;
create policy "Admins can manage contract scope profiles"
  on public.contract_scope_profiles
  for all
  to authenticated
  using (
    exists (
      select 1 from public.app_users u
      where u.auth_user_id = (select auth.uid())
        and u.role = 'admin'::public.user_role
    )
  )
  with check (
    exists (
      select 1 from public.app_users u
      where u.auth_user_id = (select auth.uid())
        and u.role = 'admin'::public.user_role
    )
  );

drop policy if exists "Authenticated users can read contract scope profile clauses"
  on public.contract_scope_profile_clauses;
create policy "Authenticated users can read contract scope profile clauses"
  on public.contract_scope_profile_clauses
  for select
  to authenticated
  using (true);

drop policy if exists "Admins can manage contract scope profile clauses"
  on public.contract_scope_profile_clauses;
create policy "Admins can manage contract scope profile clauses"
  on public.contract_scope_profile_clauses
  for all
  to authenticated
  using (
    exists (
      select 1 from public.app_users u
      where u.auth_user_id = (select auth.uid())
        and u.role = 'admin'::public.user_role
    )
  )
  with check (
    exists (
      select 1 from public.app_users u
      where u.auth_user_id = (select auth.uid())
        and u.role = 'admin'::public.user_role
    )
  );

insert into public.contract_scope_profiles (
  scope_subtype_key, label, instrument_type, default_term_rule_json, default_start_rule_json, status
) values
  (
    'auditoria_trabalhista',
    'Auditoria Trabalhista',
    'Contrato de Prestação de Serviços Advocatícios',
    '{"kind":"until_deliverable_with_estimate","deliverable":"Relatório Conclusivo da Auditoria Trabalhista","months":4}'::jsonb,
    '{"kind":"on_signature"}'::jsonb,
    'pending_legal_review'
  ),
  (
    'canal_de_denuncias_gestao_e_triagem',
    'Canal de Denúncias - Gestão e Triagem',
    'Contrato de Prestação de Serviços',
    '{"kind":"fixed_months","months":12}'::jsonb,
    '{"kind":"on_first_payment"}'::jsonb,
    'pending_legal_review'
  ),
  (
    'diagnostico_organizacional_de_riscos_psicossociais_nr_1',
    'Diagnóstico Organizacional de Riscos Psicossociais (NR-1)',
    'Contrato de Prestação de Serviços',
    '{"kind":"until_deliverable_with_estimate","deliverable":"laudo conclusivo do diagnóstico dos riscos psicossociais","days":30}'::jsonb,
    '{"kind":"on_first_payment"}'::jsonb,
    'pending_legal_review'
  ),
  (
    'contencioso_acompanhamento_de_acao_judicial',
    'Contencioso - Acompanhamento de Ação Judicial',
    'Contrato de Prestação de Serviços Advocatícios',
    '{"kind":"indefinite"}'::jsonb,
    '{"kind":"on_signature"}'::jsonb,
    'pending_legal_review'
  ),
  (
    'consultivo',
    'Consultivo',
    'Contrato de Prestação de Serviços Advocatícios',
    '{"kind":"indefinite"}'::jsonb,
    '{"kind":"on_signature"}'::jsonb,
    'pending_legal_review'
  )
on conflict (scope_subtype_key) do update
set
  label = excluded.label,
  instrument_type = excluded.instrument_type,
  default_term_rule_json = excluded.default_term_rule_json,
  default_start_rule_json = excluded.default_start_rule_json,
  updated_at = now();
