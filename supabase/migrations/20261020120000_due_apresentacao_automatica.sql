-- Apresentação automática da DUE (out/2026):
--   * planilhas de levantamento por área e logo do cliente em due_documents;
--   * rascunho da apresentação por oportunidade (escolhas, textos editados, formulário da Reestruturação);
--   * modelos de apresentação (PPT com marcadores) enviados pelo admin.

alter table public.due_documents
  add column if not exists area_key text;

comment on column public.due_documents.area_key is
  'Área da DUE da planilha (document_kind = planilha_area): reestruturacao | rec_cred | civel | trabalhista | tributario.';

alter table public.due_documents
  drop constraint if exists due_documents_document_kind_check;
alter table public.due_documents
  add constraint due_documents_document_kind_check
  check (document_kind in ('ppt_compilacao', 'outro', 'planilha_area', 'logo_cliente'));

alter table public.due_documents
  drop constraint if exists due_documents_area_key_check;
alter table public.due_documents
  add constraint due_documents_area_key_check
  check (
    area_key is null
    or area_key in ('reestruturacao', 'rec_cred', 'civel', 'trabalhista', 'tributario')
  );

create index if not exists due_documents_area_idx
  on public.due_documents (oportunidade_id, document_kind, area_key);

-- Rascunho da apresentação ----------------------------------------------------

create table if not exists public.due_apresentacoes (
  oportunidade_id uuid primary key references public.oportunidades (id) on delete cascade,
  dados jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now(),
  atualizado_por_app_user_id uuid references public.app_users (id) on delete set null,
  gerado_em timestamptz,
  gerado_por_app_user_id uuid references public.app_users (id) on delete set null,
  gerado_documento_id uuid references public.due_documents (id) on delete set null
);

comment on table public.due_apresentacoes is
  'Rascunho da apresentação da DUE: escolhas por área, textos editados e formulário da Reestruturação. Os números vêm das planilhas em due_documents.';

alter table public.due_apresentacoes enable row level security;

drop policy if exists "due_apresentacoes_select_comercial_admin" on public.due_apresentacoes;
create policy "due_apresentacoes_select_comercial_admin"
  on public.due_apresentacoes for select
  using ((select public.auth_user_role()) in ('admin', 'comercial'));

-- Modelos de apresentação -----------------------------------------------------

create table if not exists public.due_modelos_apresentacao (
  id uuid primary key default gen_random_uuid(),
  nome_arquivo text not null,
  storage_path text not null unique,
  byte_size bigint,
  observacao text,
  ativo boolean not null default false,
  enviado_por_app_user_id uuid references public.app_users (id) on delete set null,
  enviado_em timestamptz not null default now()
);

create unique index if not exists due_modelos_apresentacao_um_ativo
  on public.due_modelos_apresentacao (ativo)
  where ativo;

comment on table public.due_modelos_apresentacao is
  'Modelos (PPT com marcadores {{...}} e shapes SLIDE_*) usados pelo gerador da apresentação da DUE. Um ativo por vez; arquivo no bucket due-documents, pasta modelos/.';

alter table public.due_modelos_apresentacao enable row level security;

drop policy if exists "due_modelos_apresentacao_select_authenticated" on public.due_modelos_apresentacao;
create policy "due_modelos_apresentacao_select_authenticated"
  on public.due_modelos_apresentacao for select
  using ((select auth.uid()) is not null);
