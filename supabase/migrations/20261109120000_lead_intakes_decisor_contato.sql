-- Contato do decisor no cadastro do lead (09/11/2026): o Novo lead passa a exigir o nome do decisor e
-- pelo menos telefone ou e-mail. Antes o lead chegava ao pós-venda sem contato do cliente.
-- O CRM grava esses campos num update à parte (`/api/leads/new`): sem as colunas, o lead é criado
-- e um aviso pede para anotar o contato na ficha.

alter table public.lead_intakes
  add column if not exists decisor_telefone text,
  add column if not exists decisor_email text;

comment on column public.lead_intakes.decisor_telefone is 'Telefone do decisor informado no Novo lead (com DDD).';
comment on column public.lead_intakes.decisor_email is 'E-mail do decisor informado no Novo lead.';

notify pgrst, 'reload schema';
