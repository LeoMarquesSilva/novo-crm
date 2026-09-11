-- Stage 3 do enriquecimento com contratos reais: primeiros perfis reais para
-- Cível (um_processo), Reestruturação e Insolvência (negociacoes_estrategicas) e
-- Societário e Contratos (diagnostico_estruturacao_e_protecao_patrimonial), a
-- partir de 4 contratos reais assinados. Modelos de Objeto (object-catalog.ts)
-- continuam só no código; esta migration sincroniza a tabela de cláusulas
-- (contract_clause_templates) com o mesmo conteúdo, para exibição/organização no
-- admin de cláusulas.

insert into public.contract_clause_templates (
  stable_key, title, content, category, sort_order, role, is_required,
  placeholders, conflicts_json, legal_review_note, version, status, is_active,
  area_key, scope_subtype_key
) values
(
  'object_civel_um_processo',
  'Objeto — Contencioso Cível (1 processo)',
  $c$O presente Contrato tem por objeto a prestação de serviços advocatícios na área Cível, abrangendo a condução e representação [DA_CONTRATANTE] nos autos da ação nº [NUMERO_PROCESSO], em trâmite perante [VARA_TRIBUNAL]. O Contrato limita a atuação a 1 (um) processo ativo, com faturamento adicional por novos processos.$c$,
  'CÍVEL', 10, 'object', false, ARRAY['[DA_CONTRATANTE]', '[NUMERO_PROCESSO]', '[VARA_TRIBUNAL]']::text[], '[]'::jsonb,
  $n$Extraído de contrato real (ação de cobrança). Diferente do padrão trabalhista, o objeto real não nomeia parte contrária nem valor da causa — mantido fiel ao documento-fonte, sem inventar esses campos.$n$,
  1, 'pending_legal_review', true, 'Cível', 'um_processo'
),
(
  'nature_civel_um_processo',
  'Natureza — Contencioso Cível',
  $c$O presente Contrato possui natureza de prestação de serviços com escopo determinado e prazo estimado para execução, não sendo admitida sua rescisão imotivada por qualquer das Partes após o início da execução dos trabalhos.$c$,
  'CÍVEL', 11, 'nature', false, ARRAY[]::text[], '[]'::jsonb,
  $n$Extraído literalmente de contrato real. O mesmo documento também declara 'Prazo: indeterminado' na cláusula de vigência — tensão textual entre as duas cláusulas não resolvida no documento-fonte, reportada como está.$n$,
  1, 'pending_legal_review', true, 'Cível', 'um_processo'
),
(
  'sucumbencia_civel',
  'Honorários de Sucumbência',
  $c$Os honorários de sucumbência serão de titularidade da Contratada a partir do início da condução dos serviços jurídicos nos processos objeto do presente escopo contratual e pertencerão à Contratada, sem exclusão dos que ora são pactuados no presente Contrato, de conformidade com os arts. 23 da Lei nº 8.906/94 e 35, § 1º, do Código de Ética e Disciplina da Ordem dos Advogados do Brasil. Caso se aplique, serão preservados os direitos aos honorários sucumbenciais titularizados por patronos anteriores, na proporção de sua atuação, nos termos dos arts. 22 e seguintes do Estatuto de Ética da OAB.$c$,
  'CÍVEL — OPCIONAL', 310, 'special', false, ARRAY[]::text[], '[]'::jsonb,
  $n$Confirmado literalmente em contrato real (ação de cobrança) — disponível para seleção manual.$n$,
  1, 'pending_legal_review', true, 'Cível', null
),
(
  'compensacao_valores_civel',
  'Compensação',
  $c$Fica autorizada a compensação de valores devidos à Contratante, que sejam levantados ou recebidos pela Contratada, nos termos dos arts. 664 do Código Civil e art. 35, § 2º do Código de Ética e Disciplina da Ordem dos Advogados do Brasil, caso configurada a inadimplência referente aos valores de honorários advocatícios pactuados no presente Contrato, bem como de despesas inerentes à prestação do serviço contratado.$c$,
  'CÍVEL — OPCIONAL', 311, 'special', false, ARRAY[]::text[], '[]'::jsonb,
  $n$Confirmado literalmente em contrato real (ação de cobrança) — disponível para seleção manual.$n$,
  1, 'pending_legal_review', true, 'Cível', null
),
(
  'object_reestruturacao_negociacoes',
  'Objeto — Negociações Estratégicas (Reestruturação)',
  $c$O presente Contrato tem por objeto a análise, pela Contratada, de toda a documentação necessária para a definição da melhor estratégia a ser adotada para a reestruturação financeira [DA_CONTRATANTE], considerando inclusive a possibilidade de recuperação extrajudicial ou judicial, incluindo preparação, ajuizamento e representação em medida cautelar, mediação com credores, recuperação judicial ou extrajudicial e demais medidas necessárias.$c$,
  'REESTRUTURAÇÃO', 10, 'object', false, ARRAY['[DA_CONTRATANTE]']::text[], '[]'::jsonb,
  $n$Texto quase idêntico confirmado em 2 contratos reais (grupos econômicos distintos) — alta confiança na redação-base.$n$,
  1, 'pending_legal_review', true, 'Reestruturação e Insolvência', 'negociacoes_estrategicas'
),
(
  'scope_reestruturacao_negociacoes',
  'Escopo — Negociações Estratégicas (Reestruturação)',
  $c$Compreende interação com sócios/executivos e representantes da Contratante, participação em reuniões com credores e investidores, preparação de minutas e representação em juízo e perante o Administrador Judicial, e acompanhamento de todos os processos, recursos e incidentes até o trânsito em julgado.$c$,
  'REESTRUTURAÇÃO', 11, 'scope', false, ARRAY[]::text[], '[]'::jsonb,
  $n$Texto idêntico confirmado em 2 contratos reais — alta confiança.$n$,
  1, 'pending_legal_review', true, 'Reestruturação e Insolvência', 'negociacoes_estrategicas'
),
(
  'exclusion_reestruturacao_consultoria_correlata',
  'Exclusão — consultoria correlata (Reestruturação)',
  $c$Dentre as matérias não relacionadas aos Serviços, o presente Contrato também não abrange: consultoria em direito tributário, societário ou regulatório; elaboração de pareceres técnicos; e realização de sustentação oral nos Tribunais Regionais do Trabalho e Tribunal Superior do Trabalho, salvo contratação expressa.$c$,
  'REESTRUTURAÇÃO', 12, 'exclusion', false, ARRAY[]::text[], '[]'::jsonb,
  $n$Confirmado em 2 contratos reais. A menção a TRT/TST é textualmente estranha a um contrato de Reestruturação (parece herança de template trabalhista) — mantida por fidelidade à prática real; REQUIRES LEGAL DECISION se deve ser removida.$n$,
  1, 'pending_legal_review', true, 'Reestruturação e Insolvência', 'negociacoes_estrategicas'
),
(
  'object_societario_diagnostico',
  'Objeto — Diagnóstico, Estruturação e Proteção Patrimonial',
  $c$O Contrato tem por objeto a prestação de serviços advocatícios especializados em 5 etapas: Diagnóstico dos Contratos Sociais e atos constitutivos; Estruturação dos Cenários de reorganização societária; Validação Tributária/Contábil dos cenários; Parecer Jurídico Conclusivo com recomendação técnica; e Elaboração da Estrutura Jurídica (redação dos instrumentos societários pertinentes). O resultado é a entrega do relatório diagnóstico, parecer comparativo e minutas finais dos instrumentos, prontas para registro.$c$,
  'SOCIETÁRIO', 10, 'object', false, ARRAY[]::text[], '[]'::jsonb,
  $n$Mapeamento de subtipo (diagnostico_estruturacao_e_protecao_patrimonial vs. planejamento_sucessorio_e_societario) confirmado com o time do CRM. Extraído literalmente de contrato real de diagnóstico societário.$n$,
  1, 'pending_legal_review', true, 'Societário e Contratos', 'diagnostico_estruturacao_e_protecao_patrimonial'
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
