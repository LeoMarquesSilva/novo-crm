alter table public.d4sign_documents
  add column if not exists sent_by_app_user_id uuid
  references public.app_users(id) on delete set null;

comment on column public.d4sign_documents.sent_by_app_user_id
  is 'Usuário do CRM que enviou o documento para assinatura via D4Sign. NULL = importado do cofre ou enviado externamente.';
