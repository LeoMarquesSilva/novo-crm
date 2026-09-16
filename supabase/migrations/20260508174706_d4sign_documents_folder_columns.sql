alter table public.d4sign_documents
  add column if not exists folder_uuid text,
  add column if not exists folder_name text,
  add column if not exists details_fetched_at timestamptz;

create index if not exists idx_d4sign_documents_folder
  on public.d4sign_documents(folder_uuid)
  where folder_uuid is not null;

create index if not exists idx_d4sign_documents_needs_details
  on public.d4sign_documents(uuid_doc)
  where name_document is null or details_fetched_at is null;

comment on column public.d4sign_documents.folder_uuid is
  'UUID da pasta no cofre D4Sign (NULL = raiz do cofre).';
comment on column public.d4sign_documents.folder_name is
  'Nome da pasta no momento do import (cache).';
comment on column public.d4sign_documents.details_fetched_at is
  'Timestamp da última chamada bem-sucedida em GET /documents/{uuid} (enriquece nome).';
