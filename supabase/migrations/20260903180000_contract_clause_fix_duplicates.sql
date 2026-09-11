-- Correção reportada pelo usuário no builder de contrato:
-- 1) "Vinculação das Partes" e "Irrevogabilidade" diziam basicamente a mesma
--    coisa e as duas entravam automaticamente em todo contrato — pareciam
--    cláusula duplicada. "Vinculação das Partes" deixa de ser automática
--    (is_required = false), continua disponível para seleção manual.
-- (A correção de campos duplicados no formulário — ex.: "Quantidade de ações"
-- aparecendo mesmo fora do Full Service — foi só em código, no motor de
-- resolução de objeto; não depende de dado no banco.)

update public.contract_clause_templates
set
  category = 'PADRÃO BP — OPCIONAL',
  is_required = false,
  legal_review_note = $n$Confirmado literalmente em 7 contratos reais de 4 áreas, mas diz basicamente a mesma coisa que 'Irrevogabilidade' (mesmo conceito, texto diferente) — os 2 juntos no mesmo contrato pareciam cláusula duplicada. Deixou de ser automática; disponível para seleção manual quando o time quiser reforçar o ponto.$n$,
  updated_at = now()
where stable_key = 'general_vinculacao_partes';
