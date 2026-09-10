-- Padroniza o casing dos títulos de cláusula em Title Case (pt-BR): primeira
-- letra de cada palavra maiúscula, exceto conectivos (de, do, não, e, ...)
-- quando não são a primeira palavra — ex.: "Atos Jurídicos Excluídos",
-- "Demandas não Contempladas".
--
-- Espelha a normalização aplicada em runtime por
-- src/lib/crm/contract-engine/title-case.ts (toTitleCasePt), agora usada nos
-- helpers de catálogo (clause-catalog.ts, object-catalog.ts), no merge com o
-- banco (clause-library.ts) e nas rotas de admin de cláusulas. Esta migration
-- só corrige os dados já persistidos — sem ela, um ambiente recriado a partir
-- do zero das migrations ficaria com o casing antigo destas 11 linhas.
update contract_clause_templates set title = 'Atraso no Pagamento'
  where stable_key = 'default_atraso_multa' and title = 'Atraso no pagamento';

update contract_clause_templates set title = 'Demandas não Contempladas'
  where stable_key = 'exclusion_geral_extras' and title = 'Demandas não contempladas';

update contract_clause_templates set title = 'Exclusão — Consultivo Diário'
  where stable_key = 'exclusion_trabalhista_consultivo' and title = 'Exclusão — consultivo diário';

update contract_clause_templates set title = 'Exclusão — Consultoria Correlata (Reestruturação)'
  where stable_key = 'exclusion_reestruturacao_consultoria_correlata' and title = 'Exclusão — consultoria correlata (Reestruturação)';

update contract_clause_templates set title = 'Exclusão — Reclamações Trabalhistas'
  where stable_key = 'exclusion_trabalhista_contencioso' and title = 'Exclusão — reclamações trabalhistas';

update contract_clause_templates set title = 'Exclusão — Sustentação Oral'
  where stable_key = 'exclusion_trabalhista_sustentacao' and title = 'Exclusão — sustentação oral';

update contract_clause_templates set title = 'Forma de Pagamento — Boleto'
  where stable_key = 'payment_boleto' and title = 'Forma de pagamento — boleto';

update contract_clause_templates set title = 'Forma de Pagamento — PIX'
  where stable_key = 'payment_pix' and title = 'Forma de pagamento — PIX';

update contract_clause_templates set title = 'Forma de Pagamento — Transferência'
  where stable_key = 'payment_conta' and title = 'Forma de pagamento — transferência';

update contract_clause_templates set title = 'Objeto — Contencioso Cível (+1 Processo)'
  where stable_key = 'object_civel_mais_um_processo' and title = 'Objeto — Contencioso Cível (+1 processo)';

update contract_clause_templates set title = 'Objeto — Contencioso Cível (1 Processo)'
  where stable_key = 'object_civel_um_processo' and title = 'Objeto — Contencioso Cível (1 processo)';
