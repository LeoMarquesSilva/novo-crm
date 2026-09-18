-- Carteira de grupos econômicos (identidade OrquestrAI email_* + títulos SIOE)
-- + importação de contratos PDF. Aplicada no remoto CRM-BP em 17/09/2026.

create type public.grupo_carteira_status as enum
  ('ativo_aberto', 'ativo_pago', 'inativo');

create table public.grupos_economicos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  chave_estavel text not null unique,
  orqestrai_id text,
  status public.grupo_carteira_status not null default 'inativo',
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.grupos_economicos is
  'Grupo econômico espelhado de ORQESTRAI.email_client_groups (origem SIOE grupo_cliente). CRM não emite título.';

create index grupos_economicos_status_idx
  on public.grupos_economicos (status, nome);

create unique index grupos_economicos_orqestrai_id_uidx
  on public.grupos_economicos (orqestrai_id)
  where orqestrai_id is not null;

alter table public.clientes
  add column if not exists grupo_id uuid references public.grupos_economicos(id) on delete set null,
  add column if not exists sioe_pessoa_id uuid,
  add column if not exists orqestrai_company_id uuid,
  add column if not exists orqestrai_person_id uuid,
  add column if not exists tipo text,
  add column if not exists logradouro text,
  add column if not exists numero text,
  add column if not exists complemento text,
  add column if not exists bairro text,
  add column if not exists cidade text,
  add column if not exists uf text,
  add column if not exists cep text;

alter table public.clientes
  alter column email_principal drop not null;

create unique index if not exists clientes_sioe_pessoa_id_uidx
  on public.clientes (sioe_pessoa_id)
  where sioe_pessoa_id is not null;

create unique index if not exists clientes_orqestrai_company_id_uidx
  on public.clientes (orqestrai_company_id)
  where orqestrai_company_id is not null;

create unique index if not exists clientes_orqestrai_person_id_uidx
  on public.clientes (orqestrai_person_id)
  where orqestrai_person_id is not null;

create index if not exists clientes_grupo_id_idx
  on public.clientes (grupo_id);

create index if not exists clientes_documento_digits_idx
  on public.clientes ((regexp_replace(documento, '\D', '', 'g')));

create table public.grupo_titulos_resumo (
  grupo_id uuid primary key references public.grupos_economicos(id) on delete cascade,
  titulos_abertos integer not null default 0,
  titulos_pagos integer not null default 0,
  valor_aberto numeric(15,2) not null default 0,
  valor_pago numeric(15,2) not null default 0,
  ultima_competencia text,
  last_synced_at timestamptz not null default now()
);

comment on table public.grupo_titulos_resumo is
  'Resumo de títulos SIOE (ABERTO/PAGO) por grupo. Somente referência; o CRM não emite título.';

alter table public.contratos
  add column if not exists grupo_id uuid references public.grupos_economicos(id) on delete set null,
  add column if not exists origem_importacao text;

create index if not exists contratos_grupo_id_idx
  on public.contratos (grupo_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'contract-import-documents',
  'contract-import-documents',
  false,
  26214400,
  array['application/pdf']::text[]
)
on conflict (id) do nothing;

create table public.contract_import_batches (
  id uuid primary key default gen_random_uuid(),
  created_by uuid null references public.app_users(id) on delete set null,
  status text not null default 'aberto',
  document_count integer not null default 0,
  processed_count integer not null default 0,
  error_count integer not null default 0,
  started_at timestamptz null,
  finished_at timestamptz null,
  created_at timestamptz not null default now()
);

comment on table public.contract_import_batches is
  'Lote de importação de contratos PDF já assinados para pré-preencher o gerenciador financeiro.';

create table public.contract_import_documents (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.contract_import_batches(id) on delete cascade,
  storage_bucket text not null default 'contract-import-documents',
  storage_path text not null,
  original_filename text not null,
  content_type text null,
  byte_size bigint null,
  status text not null default 'aguardando_upload',
  error_message text null,
  page_count integer null,
  extracted_chars integer null,
  extraction_json jsonb not null default '{}'::jsonb,
  d4sign_uuid text null,
  matched_grupo_id uuid null references public.grupos_economicos(id) on delete set null,
  matched_cliente_id uuid null references public.clientes(id) on delete set null,
  contrato_id uuid null references public.contratos(id) on delete set null,
  uploaded_by_app_user_id uuid null references public.app_users(id) on delete set null,
  reviewed_by uuid null references public.app_users(id) on delete set null,
  reviewed_at timestamptz null,
  processed_at timestamptz null,
  created_at timestamptz not null default now()
);

comment on table public.contract_import_documents is
  'PDF de contrato fechado enviado para extração IA e revisão humana antes de gravar rascunho.';

create index contract_import_documents_batch_status_idx
  on public.contract_import_documents (batch_id, status);

create index contract_import_documents_d4sign_uuid_idx
  on public.contract_import_documents (d4sign_uuid)
  where d4sign_uuid is not null;

alter table public.grupos_economicos enable row level security;
alter table public.grupo_titulos_resumo enable row level security;
alter table public.contract_import_batches enable row level security;
alter table public.contract_import_documents enable row level security;
