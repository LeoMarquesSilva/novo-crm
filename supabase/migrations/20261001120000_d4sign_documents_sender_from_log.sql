-- Remetente e data real de envio dos documentos D4Sign, lidos do log de
-- eventos do PDF ("Assinaturas iniciadas por ..."). A API da D4Sign não
-- informa quem criou/enviou. Documentos enviados pelo CRM continuam com
-- `sent_by_app_user_id`.
alter table public.d4sign_documents
  add column if not exists sent_by_name text,
  add column if not exists sent_by_email text,
  add column if not exists sent_at timestamptz,
  add column if not exists log_parsed_at timestamptz;

comment on column public.d4sign_documents.sent_by_name is
  'Quem enviou para assinatura, pelo log do PDF da D4Sign (fallback: quem criou).';
comment on column public.d4sign_documents.sent_by_email is
  'E-mail de quem enviou para assinatura, pelo log do PDF da D4Sign.';
comment on column public.d4sign_documents.sent_at is
  'Data real do envio para assinatura, pelo log do PDF da D4Sign.';
comment on column public.d4sign_documents.log_parsed_at is
  'Quando o log do PDF foi lido; null = ainda não lido (fila do sync).';

create index if not exists d4sign_documents_log_pending_idx
  on public.d4sign_documents (created_at_d4sign desc)
  where log_parsed_at is null;
