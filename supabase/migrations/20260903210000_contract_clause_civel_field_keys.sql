-- Correção de bug real: os campos "Número do processo"/"Vara / Tribunal" do
-- Cível usavam as MESMAS chaves (numero_processo/vara_tribunal) do Contencioso
-- Trabalhista. Quando um contrato tinha as duas áreas ao mesmo tempo (caso real:
-- lead Ingevity), o valor de uma área sobrescrevia o da outra no mapa de
-- placeholders, e o formulário mostrava duas entradas React com a mesma key
-- ("Vara / Tribunal *"). Chaves do Cível agora têm sufixo _CIVEL, próprio.

update public.contract_clause_templates
set
  content = $c$O presente Contrato tem por objeto a prestação de serviços advocatícios na área Cível, abrangendo a condução e representação [DA_CONTRATANTE] nos autos da ação nº [NUMERO_PROCESSO_CIVEL], em trâmite perante [VARA_TRIBUNAL_CIVEL].$c$,
  placeholders = ARRAY['[DA_CONTRATANTE]', '[NUMERO_PROCESSO_CIVEL]', '[VARA_TRIBUNAL_CIVEL]']::text[],
  updated_at = now()
where stable_key = 'object_civel_um_processo';

update public.contract_clause_templates
set
  content = $c$O presente Contrato tem por objeto a prestação de serviços advocatícios na área Cível, abrangendo a condução e representação [DA_CONTRATANTE] nos autos da ação nº [NUMERO_PROCESSO_CIVEL], em trâmite perante [VARA_TRIBUNAL_CIVEL]. O Contrato limita a atuação a 1 (um) processo ativo, com faturamento adicional por novos processos.$c$,
  placeholders = ARRAY['[DA_CONTRATANTE]', '[NUMERO_PROCESSO_CIVEL]', '[VARA_TRIBUNAL_CIVEL]']::text[],
  updated_at = now()
where stable_key = 'object_civel_mais_um_processo';
