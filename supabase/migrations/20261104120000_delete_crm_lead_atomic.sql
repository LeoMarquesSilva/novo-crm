-- Exclusão de lead pelo CRM (botão "Excluir lead", DELETE /api/crm/leads/[id]).
--
-- A função foi escrita em 20260727171000_atomic_crm_mutations.sql, mas aquele arquivo nunca foi
-- aplicado no remoto: a transition_opportunity_atomic chegou ao banco por migrations posteriores
-- (com mais parâmetros) e a delete_crm_lead_atomic ficou de fora, então o botão respondia 500
-- ("Could not find the function public.delete_crm_lead_atomic"). Esta migration cria só a função
-- de exclusão, sem reaplicar o arquivo de julho (que voltaria a transição à versão antiga).
--
-- Só exclui lead cadastrado pelo formulário do CRM (com lead_intakes); lead vindo do RD é recusado.
-- Em 04/11/2026 todas as FKs para oportunidades são ON DELETE CASCADE (lead_intakes, transições,
-- tarefas da DUE, documentos, notas, eventos, cadastro do cliente…) ou SET NULL (contratos,
-- contatos_cliente, d4sign_documents, rd_deal_reconciliacao).

create or replace function public.delete_crm_lead_atomic(
  p_opportunity_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform 1
  from public.oportunidades
  where id = p_opportunity_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'OPPORTUNITY_NOT_FOUND';
  end if;

  if not exists (
    select 1
    from public.lead_intakes
    where oportunidade_id = p_opportunity_id
  ) then
    raise exception using
      errcode = '42501',
      message = 'LEAD_NOT_CREATED_IN_CRM';
  end if;

  delete from public.field_values
  where entity_name = 'oportunidade'
    and entity_record_id = p_opportunity_id;

  delete from public.oportunidades
  where id = p_opportunity_id;

  return true;
end;
$$;

revoke all on function public.delete_crm_lead_atomic(uuid)
from public, anon, authenticated;

grant execute on function public.delete_crm_lead_atomic(uuid)
to service_role;

notify pgrst, 'reload schema';
