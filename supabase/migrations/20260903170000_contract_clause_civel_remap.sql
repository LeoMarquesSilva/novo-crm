-- Correção: o contrato real da Andreia (ação de cobrança) é exemplo do subtipo
-- Cível "+1 processo" (mais_um_processo) — atuação começa em 1 processo ativo com
-- faturamento adicional por novos processos — e não do subtipo "um_processo"
-- isolado, como havia sido mapeado inicialmente. "um_processo" volta a ficar sem
-- perfil (sem exemplo próprio ainda). Corrigido a pedido do usuário, que confirmou
-- o documento-fonte de cada subtipo.

update public.contract_clause_templates
set
  stable_key = 'object_civel_mais_um_processo',
  title = 'Objeto — Contencioso Cível (+1 processo)',
  scope_subtype_key = 'mais_um_processo',
  legal_review_note = $n$Extraído de contrato real (ação de cobrança, confirmado pelo usuário como exemplo do subtipo '+1 processo' — a atuação começa em 1 processo ativo com faturamento adicional por novos processos, diferente do subtipo 'um_processo' isolado, que ainda não tem exemplo). Objeto real não nomeia parte contrária nem valor da causa.$n$,
  updated_at = now()
where stable_key = 'object_civel_um_processo';

update public.contract_clause_templates
set
  stable_key = 'nature_civel_mais_um_processo',
  scope_subtype_key = 'mais_um_processo',
  updated_at = now()
where stable_key = 'nature_civel_um_processo';
