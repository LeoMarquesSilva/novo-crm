-- Sync D4Sign sem regravar documento que não mudou.
--
-- Fases, raiz e pastas fazem upsert de todo documento listado, com as mesmas
-- colunas e o valor do banco no que não veio da D4Sign: em 24h, 341 de 342
-- linhas foram regravadas sem mudança. Cada regravação vira evento do Realtime,
-- e as telas que escutam `d4sign_documents` (painel de contratos, assinaturas dos
-- sócios) recarregavam a página no servidor a cada lote.
--
-- O gatilho pula o UPDATE quando só `updated_at` e `last_synced_at` mudariam e a
-- última confirmação tem menos de 1 hora. `last_synced_at` ("Sync há X" no painel,
-- alerta de documento sem sync há 12h) segue avançando, no máximo uma vez por hora
-- por documento parado. Qualquer outra coluna diferente (status, signatários,
-- `details_fetched_at` da fila de signatários, pasta, remetente) grava na hora.
--
-- Nome em ordem alfabética antes de `trg_d4sign_documents_updated_at`: roda primeiro.

create or replace function public.d4sign_documents_skip_unchanged()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (to_jsonb(new) - array['updated_at', 'last_synced_at'])
       = (to_jsonb(old) - array['updated_at', 'last_synced_at'])
     and old.last_synced_at is not null
     and new.last_synced_at is not null
     and new.last_synced_at < old.last_synced_at + interval '1 hour' then
    return null;
  end if;
  return new;
end;
$$;

comment on function public.d4sign_documents_skip_unchanged() is
  'Pula UPDATE de d4sign_documents sem mudança real (só updated_at/last_synced_at) quando a última confirmação tem menos de 1h.';

drop trigger if exists trg_d4sign_documents_skip_unchanged on public.d4sign_documents;
create trigger trg_d4sign_documents_skip_unchanged
  before update on public.d4sign_documents
  for each row execute function public.d4sign_documents_skip_unchanged();

-- Para desfazer:
--   drop trigger if exists trg_d4sign_documents_skip_unchanged on public.d4sign_documents;
--   drop function if exists public.d4sign_documents_skip_unchanged();
