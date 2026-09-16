alter table public.d4sign_documents
  add column if not exists mime_type text,
  add column if not exists size_bytes bigint,
  add column if not exists pages integer,
  add column if not exists status_comment text,
  add column if not exists who_canceled jsonb,
  add column if not exists last_synced_at timestamptz;

comment on column public.d4sign_documents.mime_type is
  'Mime type retornado pela listagem D4Sign (campo `type`).';
comment on column public.d4sign_documents.size_bytes is
  'Tamanho em bytes (campo `size` da D4Sign convertido).';
comment on column public.d4sign_documents.pages is
  'Quantidade de páginas (campo `pages`).';
comment on column public.d4sign_documents.status_comment is
  'Texto adicional do status (campo `statusComment`).';
comment on column public.d4sign_documents.who_canceled is
  'Objeto JSON com info de quem cancelou (campo `whoCanceled`).';
comment on column public.d4sign_documents.last_synced_at is
  'Última sincronização com a D4Sign (import ou cron).';
