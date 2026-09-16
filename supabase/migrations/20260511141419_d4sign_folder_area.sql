alter table public.d4sign_documents
  add column if not exists folder_area text;

comment on column public.d4sign_documents.folder_area
  is 'Área jurídica do cofre D4Sign (Cível, Trabalhista, Tributário…). '
     'Obtida fazendo walk da pasta-área (L1) — se recursivo retorna todos os docs filhos. '
     'NULL = área não identificada ainda.';

create index if not exists idx_d4sign_documents_folder_area
  on public.d4sign_documents(folder_area)
  where folder_area is not null;
