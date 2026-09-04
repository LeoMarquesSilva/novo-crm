-- Liga cada cláusula do motor à Área/Subtipo real do catálogo de propostas
-- (proposal_scope_types / proposal_scope_subtypes), para permitir organizar e
-- filtrar o admin de cláusulas por Área → Tipo → Subtipo.
--
-- area_key: uma das 6 áreas de CRM_PRACTICE_AREAS; NULL = cláusula transversal
--   (vale para qualquer contrato, ex.: PADRÃO BP / PAGAMENTO).
-- scope_subtype_key: bate com proposal_scope_subtypes.subtype_key; NULL = cláusula
--   de área inteira (não amarrada a um subtipo específico) quando area_key está
--   preenchido, ou transversal quando ambos são NULL.
--
-- Sem FK rígida: os dois catálogos (proposta e motor de contratos) são
-- administrados em telas separadas, mesmo padrão "soft key" já usado em
-- contract_scope_profiles.scope_subtype_key.
--
-- Nota: a partir desta leva, o motor de geração (clause-engine.ts) já lê o
-- conteúdo desta tabela para as cláusulas de papel exclusion/payment/default/
-- term/termination/contracted_obligation/contracting_obligation/expense/
-- compliance/general (a maior parte do corpo do contrato). As linhas de papel
-- object/scope/limitation/nature continuam só para organização/consulta: o
-- texto realmente usado no Objeto do Contrato ainda vem do motor de Objeto
-- (object-catalog.ts, código), que tem prioridade quando há modelo estruturado
-- para o subtipo — isso é sinalizado na UI do admin.

alter table public.contract_clause_templates
  add column if not exists area_key text,
  add column if not exists scope_subtype_key text;

-- Trabalhista + auditoria_trabalhista
update public.contract_clause_templates
set area_key = 'Trabalhista', scope_subtype_key = 'auditoria_trabalhista'
where stable_key in ('object_auditoria', 'scope_auditoria');

-- Trabalhista + canal_de_denuncias_gestao_e_triagem
update public.contract_clause_templates
set area_key = 'Trabalhista', scope_subtype_key = 'canal_de_denuncias_gestao_e_triagem'
where stable_key in ('object_canal', 'scope_canal', 'limitation_canal', 'nature_canal');

-- Trabalhista + diagnostico_organizacional_de_riscos_psicossociais_nr_1
update public.contract_clause_templates
set area_key = 'Trabalhista',
    scope_subtype_key = 'diagnostico_organizacional_de_riscos_psicossociais_nr_1'
where stable_key in ('object_diagnostico', 'scope_diagnostico', 'limitation_diagnostico');

-- Trabalhista + contencioso_acompanhamento_de_acao_judicial
update public.contract_clause_templates
set area_key = 'Trabalhista', scope_subtype_key = 'contencioso_acompanhamento_de_acao_judicial'
where stable_key in ('object_contencioso_trabalhista', 'limitation_contencioso_trabalhista');

-- Trabalhista + consultivo
update public.contract_clause_templates
set area_key = 'Trabalhista', scope_subtype_key = 'consultivo'
where stable_key in ('object_consultivo_trabalhista');

-- Trabalhista, área inteira (exclusões cruzadas entre subtipos trabalhistas)
update public.contract_clause_templates
set area_key = 'Trabalhista', scope_subtype_key = null
where stable_key in (
  'exclusion_trabalhista_contencioso',
  'exclusion_trabalhista_consultivo',
  'exclusion_trabalhista_auditoria',
  'exclusion_trabalhista_diagnostico',
  'exclusion_trabalhista_canal',
  'exclusion_trabalhista_mpt',
  'exclusion_trabalhista_sustentacao'
);

-- Transversais (PADRÃO BP / PAGAMENTO) — area_key e scope_subtype_key ficam NULL
update public.contract_clause_templates
set area_key = null, scope_subtype_key = null
where stable_key in (
  'exclusion_geral_base',
  'exclusion_scope_change',
  'default_inadimplemento',
  'default_atraso_multa',
  'term_resolved',
  'start_resolved',
  'termination_aviso',
  'obligation_contracted_base',
  'obligation_contracting_base',
  'expense_km',
  'compliance_anticorrupcao',
  'general_tributos',
  'general_foro',
  'payment_boleto',
  'payment_conta',
  'payment_pix'
);
