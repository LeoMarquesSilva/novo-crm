-- Stage 2 do enriquecimento com contratos reais: correções e cláusulas opcionais
-- novas para a área Trabalhista, a partir de 3 documentos reais (Engefaz, Pague
-- Menos, modelo Mensal Full) comparados com os 5 perfis já existentes.
-- Modelos de Objeto (object-catalog.ts) continuam só no código — esta migration
-- só atualiza a tabela de cláusulas (contract_clause_templates).

-- Exclusão de Diagnóstico NR-1 ampliada (cobre também treinamentos/palestras/SST).
update public.contract_clause_templates
set
  content = $c$Não estão incluídos o mapeamento para diagnóstico de riscos psicossociais nos termos da NR-1, a condução de programas contínuos de treinamentos e palestras, nem a análise e reestruturação técnica de documentação de SST, salvo contratação expressa.$c$,
  legal_review_note = $n$Ampliado com base em contrato real (Engefaz): a exclusão trabalhista real cobre também treinamentos/palestras e documentação de SST, não só o diagnóstico NR-1 isolado — o perfil Diagnóstico NR-1 do sistema pode estar sub-modelado frente a isso (fica como próximo passo, não coberto nesta leva).$n$,
  updated_at = now()
where stable_key = 'exclusion_trabalhista_diagnostico';

-- Multa de mora: nota ajustada para refletir que 20% é padrão de tabela negociável
-- (contrato real de conta grande usou 10%), não um valor travado.
update public.contract_clause_templates
set
  content = $c$O atraso no pagamento facultará à Contratada cobrar multa equivalente a 20% (vinte por cento) do valor em mora, acrescida de juros de 1% (um por cento) ao mês, pro rata die, com atualização pela variação positiva do IPCA-E.$c$,
  legal_review_note = $n$20% + 1%/mês + IPCA-E é o padrão de tabela, confirmado literalmente em contratos reais (Auditoria/Engefaz, modelo Mensal Full). Porém, ao menos 1 contrato real de conta grande (Full Service/Pague Menos) negociou a multa para 10% — não é universal. Manter 20% como default, mas overridável por contrato (o builder já permite editar com justificativa); REQUIRES LEGAL DECISION apenas se deve haver um teto mínimo negociável.$n$,
  updated_at = now()
where stable_key = 'default_atraso_multa';

-- Despesas: texto completo confirmado em 2 contratos reais (antes era um resumo).
update public.contract_clause_templates
set
  content = $c$A remuneração avençada não abrange despesas extraordinárias necessárias à execução dos Serviços (custas, taxas, cópias, cartórios, viagens, hospedagens e demais encargos). Tais despesas serão reembolsadas mediante comprovação, previamente autorizadas por e-mail. Os custos suportados pelos prepostos da Contratada em diligências com uso de veículo próprio, incluindo alimentação, serão discriminados em relatório de despesas enviado quinzenalmente, contendo data, quilometragem, pedágios, alimentação, profissional responsável e trabalho realizado. Fica estabelecido o valor de R$ 2,00 (dois reais) por quilômetro rodado, medido pela distância entre a sede/filial da Contratada e o destino da diligência via Google Maps/Waze, reajustável consensualmente conforme a tabela de preço dos combustíveis. Diligências a mais de 150 (cento e cinquenta) quilômetros da sede/filial da Contratada poderão ser realizadas por correspondentes, com honorários custeados pela Contratante nos mesmos moldes.$c$,
  legal_review_note = $n$Texto ampliado com o bloco completo confirmado em 2 contratos reais (Auditoria/Engefaz, modelo Mensal Full): R$ 2,00/km + prazo de reembolso de 7 dias + regra dos 150 km para correspondentes. Não é universal: 1 contrato real de conta grande (Pague Menos) negociou R$ 1,85/km e prazo de 10 dias — manter R$ 2,00/7 dias como default overridável, não travado. REQUIRES LEGAL DECISION antes de tornar `approved`.$n$,
  updated_at = now()
where stable_key = 'expense_km';

-- Cláusulas opcionais novas (não obrigatórias, disponíveis para seleção manual no
-- builder) — area_key = Trabalhista, scope_subtype_key nulo (área inteira).
insert into public.contract_clause_templates (
  stable_key, title, content, category, sort_order, role, is_required,
  placeholders, conflicts_json, legal_review_note, version, status, is_active,
  area_key, scope_subtype_key
) values
(
  'sucumbencia_trabalhista',
  'Honorários de Sucumbência',
  $c$Eventuais honorários de sucumbência serão de titularidade da Contratada a partir do início da condução dos serviços jurídicos nos processos objeto do presente escopo contratual e pertencerão à Contratada, sem exclusão dos que ora são pactuados no presente Contrato, de conformidade com os arts. 23 da Lei nº 8.906/94 e 35, § 1º, do Código de Ética e Disciplina da Ordem dos Advogados do Brasil. Caso se aplique, serão preservados os direitos aos honorários sucumbenciais titularizados por patronos anteriores, na proporção de sua atuação, nos termos dos arts. 22 e seguintes do Estatuto de Ética da OAB.$c$,
  'TRABALHISTA — OPCIONAL', 300, 'special', false, ARRAY[]::text[], '[]'::jsonb,
  $n$Cláusula real (modelo Mensal Full), ausente dos 2 contratos assinados de contencioso/full service revisados — não entra automaticamente em nenhum perfil; disponível para seleção manual no builder quando fizer sentido (contencioso com sucumbência recíproca).$n$,
  1, 'pending_legal_review', true, 'Trabalhista', null
),
(
  'compensacao_valores_trabalhista',
  'Compensação',
  $c$Fica autorizada a compensação de valores devidos à Contratante, que sejam levantados ou recebidos pela Contratada, nos termos dos arts. 664 do Código Civil e art. 35, § 2º do Código de Ética e Disciplina da Ordem dos Advogados do Brasil, caso configurada a inadimplência referente aos valores de honorários advocatícios pactuados no presente Contrato, bem como de despesas inerentes à prestação do serviço contratado.$c$,
  'TRABALHISTA — OPCIONAL', 301, 'special', false, ARRAY[]::text[], '[]'::jsonb,
  $n$Cláusula real (modelo Mensal Full), ausente dos 2 contratos assinados revisados — disponível para seleção manual no builder. Nota: em outra área (Reestruturação), o mesmo tipo de cláusula apareceu em 2 versões bem diferentes (ampla vs. restrita a créditos líquidos/certos/incontroversos) — negociação caso a caso, texto aqui é só o ponto de partida.$n$,
  1, 'pending_legal_review', true, 'Trabalhista', null
),
(
  'sla_indicadores_desempenho_trabalhista',
  'Indicadores de Desempenho e Eficiência',
  $c$A Contratante poderá monitorar e mensurar a eficiência operacional dos serviços jurídicos prestados pela Contratada, mediante solicitação periódica de relatório de desempenho, contendo indicadores relacionados ao cumprimento de prazos processuais, tempestividade de respostas às demandas da Contratante, observância dos níveis de serviço acordados (SLA), qualidade dos reportes, atualização do sistema de gestão processual e demais métricas operacionais aplicáveis. Os indicadores mínimos incluem: (i) resposta a consultas jurídicas em até 5 (cinco) dias úteis, salvo situações de maior complexidade devidamente justificadas; (ii) encaminhamento de minutas de defesas sujeitas à validação prévia da Contratante com antecedência mínima de 2 (dois) dias úteis em relação ao prazo processual, ressalvadas urgências; (iii) cadastramento e atualização das informações processuais no sistema de gestão em até 2 (dois) dias úteis do evento relevante; (iv) encaminhamento de relatórios gerenciais nos formatos e periodicidade definidos pela Contratante. O desempenho da Contratada será aferido exclusivamente com base nesses indicadores operacionais e de qualidade, não sendo utilizados como critério de avaliação índices de êxito processual, condenações, acordos, improcedências ou quaisquer resultados processuais que dependam de fatores externos à atuação da Contratada.$c$,
  'TRABALHISTA — OPCIONAL', 302, 'special', false, ARRAY[]::text[], '[]'::jsonb,
  $n$Bloco de SLA/KPI confirmado literalmente em contrato real de Full Service de grande conta (Pague Menos), ausente dos demais documentos — típico de contas grandes com carteira de processos. Disponível para seleção manual, não obrigatório. Fora de escopo desta leva: modelar os indicadores como dados estruturados (hoje é só texto de cláusula).$n$,
  1, 'pending_legal_review', true, 'Trabalhista', null
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
