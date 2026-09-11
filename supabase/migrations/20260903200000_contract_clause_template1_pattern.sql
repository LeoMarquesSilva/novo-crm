-- Adoção do padrão `contrato_honorarios_template_1.md`:
-- 1) nova cláusula transversal fixa "2.3" (demandas não contempladas:
--    arbitragem/regulatório/conselho de classe/ambiental) — decisão: transversal,
--    não amarrada a Cível (ver legal_review_note na própria linha).
-- 2) "Comunicações e Notificações" enriquecida (cartório/carta registrada/e-mail,
--    antes só e-mail) + nova cláusula "Mudança de Endereço".
-- 3) Novo perfil Societário "Consultivo, Revisão e Elaboração de Contratos"
--    (subtipo real: consultivo_revisao_e_elaboracao_de_contratos).
-- Campos de "valor excedente" obrigatório no Full Service Trabalhista são só
-- lógica de código (object-catalog.ts/scope-profiles.ts) — não geram linha nova
-- nesta tabela.

insert into public.contract_clause_templates (
  stable_key, title, content, category, sort_order, role, is_required,
  placeholders, conflicts_json, legal_review_note, version, status, is_active,
  area_key, scope_subtype_key
) values
(
  'exclusion_geral_extras',
  'Demandas não contempladas',
  $c$Este Contrato não contempla a atuação em demandas: a) de procedimentos de arbitragem; b) regulatórias e administrativas; c) de órgãos de conselho de classe; d) de matéria de direito ambiental.$c$,
  'PADRÃO BP', 109, 'exclusion', true, ARRAY[]::text[], '[]'::jsonb,
  $n$Cláusula 2.3 do padrão contrato_honorarios_template_1.md. Decisão (usuário + IA, nesta sessão): virou transversal fixa em vez de amarrada à área Cível, porque os 4 itens são limites gerais da atuação do escritório, não específicos de uma área — no contrato real da Ingevity esse conteúdo apareceu fundido dentro das Limitações da área Cível, mas isso foi tratado como conveniência de redação, não regra.$n$,
  1, 'pending_legal_review', true, null, null
),
(
  'general_mudanca_endereco',
  'Mudança de Endereço',
  $c$A mudança de endereço ou de qualquer das informações indicadas no preâmbulo deve ser prontamente comunicada por escrito às demais Partes, conforme aqui previsto; se dita comunicação deixar de ser realizada, qualquer aviso ou comunicação entregue às Partes ou nos endereços acima indicados será considerada como tendo sido regularmente feita e recebida.$c$,
  'PADRÃO BP', 289, 'general', true, ARRAY[]::text[], '[]'::jsonb,
  $n$Nova cláusula, extraída literalmente do padrão contrato_honorarios_template_1.md.$n$,
  1, 'pending_legal_review', true, null, null
),
(
  'object_societario_contratual',
  'Objeto — Consultivo, Revisão e Elaboração de Contratos',
  $c$Consultoria jurídica mensal com limitação de até [QTD_HORAS_SOCIETARIO] (por extenso) horas técnicas mensais, envolvendo a elaboração, revisão e negociação de contratos empresariais relacionados à atividade [DA_CONTRATANTE], tais como contratos de prestação de serviços, fornecimento e manutenção de equipamentos, acordos de confidencialidade (NDA), termos de parceria, representação, comodato, atas societárias, contrato social, acordo de sócios, entre outros. Compreende ainda a análise de riscos contratuais, com apresentação de sugestões de ajustes e medidas de mitigação, e a criação e revisão de modelos contratuais padronizados para uso interno. Horas excedentes ao limite mensal serão cobradas ao valor de [VALOR_EXCEDENTE_SOCIETARIO] por hora.$c$,
  'SOCIETÁRIO', 20, 'object', false,
  ARRAY['[DA_CONTRATANTE]', '[QTD_HORAS_SOCIETARIO]', '[VALOR_EXCEDENTE_SOCIETARIO]']::text[], '[]'::jsonb,
  $n$Extraído literalmente do padrão contrato_honorarios_template_1.md (subtipo real do catálogo: consultivo_revisao_e_elaboracao_de_contratos).$n$,
  1, 'pending_legal_review', true, 'Societário e Contratos', 'consultivo_revisao_e_elaboracao_de_contratos'
),
(
  'limitation_societario_contratual',
  'Limitações — Consultivo, Revisão e Elaboração de Contratos',
  $c$Não está incluso na proposta atos societários complexos, assim considerados aqueles que envolvam fusão, incorporação, cisão, compra e venda de empresas, joint venture, entre outros. Nesses casos, será necessária contratação específica.$c$,
  'SOCIETÁRIO', 21, 'limitation', false, ARRAY[]::text[], '[]'::jsonb,
  $n$Confirmado literalmente no padrão contrato_honorarios_template_1.md.$n$,
  1, 'pending_legal_review', true, 'Societário e Contratos', 'consultivo_revisao_e_elaboracao_de_contratos'
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

-- Enriquece a cláusula existente (não é insert novo, é update do texto).
update public.contract_clause_templates
set
  title = 'Comunicações e Notificações',
  content = $c$Todas as notificações e demais comunicações a serem feitas com relação ao presente Contrato serão elaboradas por escrito e enviadas para os endereços listados no preâmbulo deste Contrato, ou para outros que venham a ser indicados pelas Partes através de: (i) cartório de Títulos e Documentos; (ii) carta registrada; ou (iii) e-mail.$c$,
  legal_review_note = $n$Texto ampliado conforme contrato_honorarios_template_1.md (antes só citava e-mail; o padrão real inclui também cartório de Títulos e Documentos e carta registrada como formas válidas de notificação).$n$,
  updated_at = now()
where stable_key = 'general_comunicacao';
