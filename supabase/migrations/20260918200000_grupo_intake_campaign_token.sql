-- Adapta tokens 1 linha por grupo → 1 token de campanha para a grade inteira.
-- Idempotente. Versionada localmente; NÃO aplicar no remoto nesta entrega.

alter table public.grupo_intake_tokens
  add column if not exists scope text;

update public.grupo_intake_tokens
  set scope = 'carteira'
  where scope is null or btrim(scope) = '';

alter table public.grupo_intake_tokens
  alter column scope set default 'carteira';

alter table public.grupo_intake_tokens
  alter column scope set not null;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'grupo_intake_tokens'
      and column_name = 'grupo_id'
      and is_nullable = 'NO'
  ) then
    alter table public.grupo_intake_tokens alter column grupo_id drop not null;
  end if;
end $$;

-- Tokens pontuais por grupo deixam de valer: o link público passa a ser único.
update public.grupo_intake_tokens
  set expires_at = least(expires_at, now())
  where grupo_id is not null
    and expires_at > now();

comment on table public.grupo_intake_tokens is
  'Token opaco de campanha (hash SHA-256) para a grade pública /preencher/carteira/[token]. Um token lista todos os grupos. Service role only.';

create index if not exists grupo_intake_tokens_scope_expires_idx
  on public.grupo_intake_tokens (scope, expires_at desc);
