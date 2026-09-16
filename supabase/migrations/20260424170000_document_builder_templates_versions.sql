-- Migration-base recuperada a partir do schema e dos dados canônicos do projeto.
-- O SQL original foi aplicado fora do histórico de supabase_migrations; todas as
-- operações abaixo são idempotentes para permitir reconstrução de novos ambientes.

create table if not exists public.document_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  document_type text not null default 'proposta',
  template_path text not null default '',
  is_active boolean not null default true,
  version integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.document_template_fields (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.document_templates(id) on delete cascade,
  field_code text not null,
  label text not null,
  field_type text not null default 'text',
  is_required boolean not null default false,
  section text not null default 'geral',
  sort_order integer not null default 0,
  source text not null default 'crm',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_id, field_code)
);

create table if not exists public.document_instances (
  id uuid primary key default gen_random_uuid(),
  oportunidade_id uuid not null references public.oportunidades(id) on delete cascade,
  template_id uuid not null references public.document_templates(id),
  status text not null default 'draft',
  current_version integer not null default 0,
  data_json jsonb not null default '{}'::jsonb,
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (oportunidade_id, template_id)
);

create table if not exists public.document_versions (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references public.document_instances(id) on delete cascade,
  version_number integer not null,
  data_snapshot jsonb not null default '{}'::jsonb,
  generated_file_path text,
  generated_by uuid references public.app_users(id) on delete set null,
  generated_at timestamptz not null default now(),
  unique (instance_id, version_number)
);

create index if not exists document_template_fields_template_idx
  on public.document_template_fields(template_id, sort_order);
create index if not exists document_instances_opportunity_idx
  on public.document_instances(oportunidade_id);
create index if not exists document_versions_instance_idx
  on public.document_versions(instance_id, version_number desc);

drop trigger if exists document_templates_set_updated_at on public.document_templates;
create trigger document_templates_set_updated_at
  before update on public.document_templates
  for each row execute function public.set_updated_at();
drop trigger if exists document_template_fields_set_updated_at on public.document_template_fields;
create trigger document_template_fields_set_updated_at
  before update on public.document_template_fields
  for each row execute function public.set_updated_at();
drop trigger if exists document_instances_set_updated_at on public.document_instances;
create trigger document_instances_set_updated_at
  before update on public.document_instances
  for each row execute function public.set_updated_at();

alter table public.document_templates enable row level security;
alter table public.document_template_fields enable row level security;
alter table public.document_instances enable row level security;
alter table public.document_versions enable row level security;

drop policy if exists "document_templates: leitura autenticada" on public.document_templates;
create policy "document_templates: leitura autenticada"
  on public.document_templates for select to authenticated using (true);
drop policy if exists "document_template_fields: leitura autenticada" on public.document_template_fields;
create policy "document_template_fields: leitura autenticada"
  on public.document_template_fields for select to authenticated using (true);
drop policy if exists "document_instances: leitura autenticada" on public.document_instances;
create policy "document_instances: leitura autenticada"
  on public.document_instances for select to authenticated using (true);
drop policy if exists "document_versions: leitura autenticada" on public.document_versions;
create policy "document_versions: leitura autenticada"
  on public.document_versions for select to authenticated using (true);

insert into public.document_templates (
  id, name, document_type, template_path, is_active, version, metadata
)
values (
  'c5fd71b6-0dd6-42d8-b639-3ecf77ee3732',
  'Proposta padrão',
  'proposta',
  'MODELO-PROPOSTA-1.docx',
  true,
  1,
  '{"description":"Modelo legado migrado para o construtor de propostas."}'::jsonb
)
on conflict (id) do nothing;

insert into public.document_template_fields (
  id, template_id, field_code, label, field_type, is_required, section, sort_order, source
)
values
  ('e57ed52a-70dc-47fd-9bdb-10950201fe6b', 'c5fd71b6-0dd6-42d8-b639-3ecf77ee3732', 'cp_proposta_empresas_json', 'Dados do cliente', 'textarea', true, 'cliente', 10, 'crm'),
  ('a0a1a258-83d0-4820-87ba-a749083283d2', 'c5fd71b6-0dd6-42d8-b639-3ecf77ee3732', 'cp_cliente_cep', 'CEP', 'text', true, 'cliente', 20, 'crm'),
  ('5bf9a33e-6480-42b3-ad49-7b2dc3208dd7', 'c5fd71b6-0dd6-42d8-b639-3ecf77ee3732', 'cp_cliente_cidade', 'Cidade', 'text', true, 'cliente', 30, 'crm'),
  ('95f2c2b3-1f55-4630-8e39-8a9bae4ee3ad', 'c5fd71b6-0dd6-42d8-b639-3ecf77ee3732', 'cp_cliente_uf', 'UF', 'text', true, 'cliente', 40, 'crm'),
  ('413afedb-964c-477f-87bb-bf4a58a2392c', 'c5fd71b6-0dd6-42d8-b639-3ecf77ee3732', 'cp_cliente_numero', 'Número', 'text', true, 'cliente', 50, 'crm'),
  ('038dbd1c-65c3-47ef-b453-3b122d79b24c', 'c5fd71b6-0dd6-42d8-b639-3ecf77ee3732', 'cp_qualificacao', 'Qualificações', 'textarea', true, 'objeto', 60, 'crm'),
  ('38e3be0e-d3d0-44fe-8ee5-1f1a565deace', 'c5fd71b6-0dd6-42d8-b639-3ecf77ee3732', 'cp_objeto_proposta', 'Objeto da proposta', 'textarea', false, 'objeto', 70, 'crm'),
  ('be841f64-f1cb-4146-b433-d7d59cda9bf5', 'c5fd71b6-0dd6-42d8-b639-3ecf77ee3732', 'cp_areas_objeto', 'Áreas de escopo', 'textarea', true, 'escopo', 80, 'crm'),
  ('dffac3ba-46af-4331-bfb1-516fc405c8cd', 'c5fd71b6-0dd6-42d8-b639-3ecf77ee3732', 'cp_escopo_detalhe_json', 'Escopo detalhado por área', 'textarea', true, 'escopo', 90, 'crm'),
  ('76854a15-7068-4be3-a4c3-a4e0e9875f08', 'c5fd71b6-0dd6-42d8-b639-3ecf77ee3732', 'cp_tributacao', 'Tributação', 'text', false, 'condicoes', 100, 'crm'),
  ('022577ae-e9fa-43fa-aa7e-280baca48329', 'c5fd71b6-0dd6-42d8-b639-3ecf77ee3732', 'cp_primeiro_vencimento', 'Primeiro vencimento', 'date', false, 'condicoes', 110, 'crm'),
  ('f36a9bad-c05a-4c41-99cb-887b2232b9ed', 'c5fd71b6-0dd6-42d8-b639-3ecf77ee3732', 'cp_prazo_entrega', 'Prazo de entrega', 'date', false, 'condicoes', 120, 'crm'),
  ('b2faf4a0-3eb4-45d9-8248-b4ba7a195ed7', 'c5fd71b6-0dd6-42d8-b639-3ecf77ee3732', 'cp_info_adicionais', 'Informações adicionais', 'textarea', false, 'revisao', 130, 'crm')
on conflict (id) do nothing;
