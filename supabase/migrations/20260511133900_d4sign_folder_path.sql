alter table public.d4sign_documents
  add column if not exists folder_path text;

comment on column public.d4sign_documents.folder_path
  is 'Caminho completo da pasta no cofre D4Sign, ex: "Trabalhista / ClienteXYZ". '
     'Calculado no import concatenando nomes da hierarquia via parent_uuid. '
     'NULL = raiz do cofre (sem pasta). Separador: " / ".';

create index if not exists idx_d4sign_documents_folder_path
  on public.d4sign_documents(folder_path)
  where folder_path is not null;
