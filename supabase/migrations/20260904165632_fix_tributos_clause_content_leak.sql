-- Corrige vazamento de nota interna de revisão jurídica para dentro do texto
-- renderizado da cláusula "Tributos" (stable_key general_tributos).
--
-- Achado real: o `content` (texto que vai pro contrato assinado pelo cliente)
-- continha "REQUIRES LEGAL DECISION: os modelos às vezes afirmam que o valor
-- engloba tributos mesmo quando a proposta diz o contrário." — diferente das
-- demais cláusulas "PADRÃO BP", onde essa nota fica só em `legal_review_note`
-- (campo interno, nunca renderizado). Espelha a correção já aplicada em
-- src/lib/crm/contract-engine/clause-catalog.ts nesta sessão.
update contract_clause_templates
set
  content = 'A incidência de tributos sobre os honorários observa a condição comercial da proposta ([TRIBUTACAO]).',
  legal_review_note = 'Os modelos Word às vezes afirmam que o valor engloba tributos mesmo quando a proposta diz o contrário — REQUIRES LEGAL DECISION sobre qual redação padronizar.'
where stable_key = 'general_tributos'
  and content = 'A incidência de tributos sobre os honorários observa a condição comercial da proposta ([TRIBUTACAO]). REQUIRES LEGAL DECISION: os modelos às vezes afirmam que o valor engloba tributos mesmo quando a proposta diz o contrário.';
