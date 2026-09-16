alter table d4sign_documents
  add column if not exists signers jsonb not null default '[]';

alter table oportunidades
  add column if not exists d4sign_signers jsonb not null default '[]';
