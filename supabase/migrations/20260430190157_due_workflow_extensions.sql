-- Extensões do fluxo DUE: levantamento (sem processos), marcos temporais na oportunidade,
-- documentos no Storage, tarefas formais de revisão por área.

alter table public.due_area_tasks
  add column if not exists sem_processos_ativos boolean not null default false;
alter table public.due_area_tasks
  add column if not exists observacao_sem_processos text;
alter table public.due_area_tasks
  add column if not exists iniciado_em timestamptz;

comment on column public.due_area_tasks.sem_processos_ativos is
  'Área não encontrou processos ativos; conta como entrega válida para liberar compilação.';
comment on column public.due_area_tasks.observacao_sem_processos is
  'Observação opcional quando sem_processos_ativos é verdadeiro.';
comment on column public.due_area_tasks.iniciado_em is
  'Primeira vez que a área marcou em_andamento.';

alter table public.oportunidades
  add column if not exists due_compilacao_entrada_em timestamptz;
alter table public.oportunidades
  add column if not exists due_revisao_entrada_em timestamptz;
alter table public.oportunidades
  add column if not exists due_revision_cycle integer not null default 0;

comment on column public.oportunidades.due_compilacao_entrada_em is
  'Momento em que a negociação entrou em Compilação (manual ou automático após levantamento).';
comment on column public.oportunidades.due_revisao_entrada_em is
  'Último momento em que a negociação entrou na etapa Revisão.';
comment on column public.oportunidades.due_revision_cycle is
  'Incrementado a cada entrada em Revisão a partir de Compilação; amarra ciclos de tarefas de revisão.';

create table if not exists public.due_documents (
  id uuid primary key default gen_random_uuid(),
  oportunidade_id uuid not null references public.oportunidades (id) on delete cascade,
  document_kind text not null default 'ppt_compilacao'
    check (document_kind in ('ppt_compilacao', 'outro')),
  storage_bucket text not null default 'due-documents',
  storage_path text not null,
  original_filename text not null,
  content_type text,
  byte_size bigint,
  uploaded_by_app_user_id uuid references public.app_users (id) on delete set null,
  uploaded_at timestamptz not null default now(),
  unique (storage_bucket, storage_path)
);

create index if not exists due_documents_op_idx
  on public.due_documents (oportunidade_id, uploaded_at desc);
create index if not exists due_documents_kind_idx
  on public.due_documents (oportunidade_id, document_kind);

alter table public.due_documents enable row level security;

drop policy if exists "due_documents_select_authenticated" on public.due_documents;
create policy "due_documents_select_authenticated"
  on public.due_documents for select
  using ((select auth.uid()) is not null);

drop policy if exists "due_documents_insert_comercial_admin" on public.due_documents;
create policy "due_documents_insert_comercial_admin"
  on public.due_documents for insert
  with check ((select public.auth_user_role()) in ('admin', 'comercial'));

drop policy if exists "due_documents_delete_comercial_admin" on public.due_documents;
create policy "due_documents_delete_comercial_admin"
  on public.due_documents for delete
  using ((select public.auth_user_role()) in ('admin', 'comercial'));

comment on table public.due_documents is
  'Metadados de arquivos da Due Diligence armazenados no Supabase Storage.';

create table if not exists public.due_area_review_tasks (
  id uuid primary key default gen_random_uuid(),
  oportunidade_id uuid not null references public.oportunidades (id) on delete cascade,
  revision_cycle integer not null,
  area_key text not null,
  responsavel_app_user_id uuid references public.app_users (id) on delete set null,
  prazo_ate timestamptz,
  status text not null default 'pendente'
    check (status in ('pendente', 'ok', 'ajustes_solicitados')),
  observacao_ajustes text,
  responded_at timestamptz,
  responded_by_app_user_id uuid references public.app_users (id) on delete set null,
  notificado_em timestamptz,
  email_enviado_em timestamptz,
  ultimo_erro_canais text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (oportunidade_id, revision_cycle, area_key)
);

create index if not exists due_area_review_tasks_op_idx
  on public.due_area_review_tasks (oportunidade_id, revision_cycle);

drop trigger if exists due_area_review_tasks_set_updated_at on public.due_area_review_tasks;
create trigger due_area_review_tasks_set_updated_at
  before update on public.due_area_review_tasks
  for each row execute function public.set_updated_at();

alter table public.due_area_review_tasks enable row level security;

drop policy if exists "due_area_review_tasks_select" on public.due_area_review_tasks;
create policy "due_area_review_tasks_select"
  on public.due_area_review_tasks for select
  using (
    (select auth.uid()) is not null
    and (
      (select public.auth_user_role()) in ('admin', 'comercial')
      or exists (
        select 1
        from public.app_users u
        where u.id = due_area_review_tasks.responsavel_app_user_id
          and u.auth_user_id = (select auth.uid())
      )
    )
  );

drop policy if exists "due_area_review_tasks_insert_admin_comercial" on public.due_area_review_tasks;
create policy "due_area_review_tasks_insert_admin_comercial"
  on public.due_area_review_tasks for insert
  with check ((select public.auth_user_role()) in ('admin', 'comercial'));

drop policy if exists "due_area_review_tasks_update" on public.due_area_review_tasks;
create policy "due_area_review_tasks_update"
  on public.due_area_review_tasks for update
  using (
    (select public.auth_user_role()) in ('admin', 'comercial')
    or exists (
      select 1
      from public.app_users u
      where u.id = due_area_review_tasks.responsavel_app_user_id
        and u.auth_user_id = (select auth.uid())
    )
  );

comment on table public.due_area_review_tasks is
  'Revisão formal da DUE por área após compilação; OK ou solicitação de ajustes.';

insert into storage.buckets (id, name, public)
values ('due-documents', 'due-documents', false)
on conflict (id) do nothing;

drop policy if exists "due_documents_storage_select_authenticated" on storage.objects;
create policy "due_documents_storage_select_authenticated"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'due-documents');

drop policy if exists "due_documents_storage_insert_authenticated_comercial" on storage.objects;
create policy "due_documents_storage_insert_authenticated_comercial"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'due-documents'
    and (select public.auth_user_role()) in ('admin', 'comercial')
  );

drop policy if exists "due_documents_storage_delete_authenticated_comercial" on storage.objects;
create policy "due_documents_storage_delete_authenticated_comercial"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'due-documents'
    and (select public.auth_user_role()) in ('admin', 'comercial')
  );
