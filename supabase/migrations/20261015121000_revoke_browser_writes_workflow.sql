-- Escritas de workflow só pelos Route Handlers (service role + política crm-access-policy).
-- As policies de escrita destas tabelas (criadas fora do repositório) deixavam, por exemplo,
-- o comercial marcar a revisão do contrato como concluída ou mudar a etapa do lead direto
-- pelo PostgREST, pulando os gates de revisão e de etapa. Nenhum código de navegador escreve
-- nelas (verificado em 2026-10-15); leitura e realtime continuam.
-- crm_in_app_notifications fica de fora: lida_em é gravado pela sessão do usuário.
-- Versionada; NÃO aplicada no remoto nesta entrega. Conferir antes com:
--   select tablename, policyname, cmd from pg_policies
--   where schemaname = 'public' and tablename in
--     ('oportunidades','lead_intakes','field_values','transicoes_etapa','contract_review_tasks');

revoke insert, update, delete on table
  public.oportunidades,
  public.lead_intakes,
  public.field_values,
  public.transicoes_etapa,
  public.contract_review_tasks
from anon, authenticated;
