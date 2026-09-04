-- Perfil "um_processo" (Cível, 1 processo isolado, sem escalonamento) — derivado
-- do mesmo contrato real usado em "+1 processo" (ação de cobrança), removendo a
-- frase de escalonamento ("limita a 1 processo ativo, com faturamento adicional
-- por novos processos"), que é o que caracteriza especificamente o subtipo
-- "+1 processo". Adaptação conservadora do mesmo texto-fonte, a pedido do usuário.

insert into public.contract_clause_templates (
  stable_key, title, content, category, sort_order, role, is_required,
  placeholders, conflicts_json, legal_review_note, version, status, is_active,
  area_key, scope_subtype_key
) values
(
  'object_civel_um_processo',
  'Objeto — Contencioso Cível (1 processo)',
  $c$O presente Contrato tem por objeto a prestação de serviços advocatícios na área Cível, abrangendo a condução e representação [DA_CONTRATANTE] nos autos da ação nº [NUMERO_PROCESSO], em trâmite perante [VARA_TRIBUNAL].$c$,
  'CÍVEL', 8, 'object', false, ARRAY['[DA_CONTRATANTE]', '[NUMERO_PROCESSO]', '[VARA_TRIBUNAL]']::text[], '[]'::jsonb,
  $n$Derivado do mesmo contrato real usado em '+1 processo' (ação de cobrança), removendo a frase de escalonamento ('limita a 1 processo ativo, com faturamento adicional por novos processos') — adaptação conservadora do mesmo texto-fonte, não texto novo inventado.$n$,
  1, 'pending_legal_review', true, 'Cível', 'um_processo'
),
(
  'nature_civel_um_processo',
  'Natureza — Contencioso Cível',
  $c$O presente Contrato possui natureza de prestação de serviços com escopo determinado e prazo estimado para execução, não sendo admitida sua rescisão imotivada por qualquer das Partes após o início da execução dos trabalhos.$c$,
  'CÍVEL', 9, 'nature', false, ARRAY[]::text[], '[]'::jsonb,
  $n$Mesmo texto do subtipo '+1 processo' (bloco compartilhado do documento-fonte, não específico do número de processos).$n$,
  1, 'pending_legal_review', true, 'Cível', 'um_processo'
)
on conflict (stable_key) do update set
  title = excluded.title,
  content = excluded.content,
  category = excluded.category,
  sort_order = excluded.sort_order,
  role = excluded.role,
  is_required = excluded.is_required,
  placeholders = excluded.placeholders,
  conflicts_json = excluded.conflicts_json,
  legal_review_note = excluded.legal_review_note,
  version = excluded.version,
  status = excluded.status,
  is_active = excluded.is_active,
  area_key = excluded.area_key,
  scope_subtype_key = excluded.scope_subtype_key,
  updated_at = now();
