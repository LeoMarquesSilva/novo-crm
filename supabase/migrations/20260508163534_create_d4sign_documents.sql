create table d4sign_documents (
  id uuid primary key default gen_random_uuid(),
  uuid_doc text not null unique,
  name_document text,
  safe_uuid text not null default '',
  safe_name text,
  d4sign_status text,
  status_name text,
  oportunidade_id uuid references oportunidades(id) on delete set null,
  link_contrato text,
  created_at_d4sign timestamptz,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_d4sign_documents_uuid_doc on d4sign_documents(uuid_doc);
create index idx_d4sign_documents_oportunidade
  on d4sign_documents(oportunidade_id) where oportunidade_id is not null;
create index idx_d4sign_documents_status on d4sign_documents(d4sign_status);

create or replace function set_updated_at_d4sign_documents()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger trg_d4sign_documents_updated_at
  before update on d4sign_documents
  for each row execute function set_updated_at_d4sign_documents();

alter table d4sign_documents enable row level security;

create policy "authenticated can read d4sign_documents"
  on d4sign_documents for select to authenticated using (true);

create policy "admin comercial can write d4sign_documents"
  on d4sign_documents for all to authenticated
  using (
    exists (
      select 1 from app_users
      where id = auth.uid() and role in ('admin', 'comercial')
    )
  )
  with check (
    exists (
      select 1 from app_users
      where id = auth.uid() and role in ('admin', 'comercial')
    )
  );
