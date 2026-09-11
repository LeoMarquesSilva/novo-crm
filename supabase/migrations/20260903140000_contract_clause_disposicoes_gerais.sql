-- Stage 1 do enriquecimento com contratos reais (public/contrato): bloco
-- institucional "Disposições Gerais", confirmado literalmente em 7 contratos reais
-- assinados de 4 áreas diferentes (Cível, Reestruturação, Societário, Trabalhista).
-- Cláusulas transversais: area_key e scope_subtype_key ficam NULL (valem para
-- qualquer contrato, igual PADRÃO BP / PAGAMENTO já existentes).

insert into public.contract_clause_templates (
  stable_key, title, content, category, sort_order, role, is_required,
  placeholders, conflicts_json, legal_review_note, version, status, is_active,
  area_key, scope_subtype_key
) values
(
  'general_irrevogabilidade',
  'Irrevogabilidade',
  $c$Este Contrato é celebrado em caráter irrevogável e irretratável e obriga as Partes e seus herdeiros e sucessores, a qualquer título, e somente poderá ser alterado através de aditivo por escrito, devidamente assinado por todas as Partes.$c$,
  'PADRÃO BP', 280, 'general', true, ARRAY[]::text[], '[]'::jsonb,
  $n$Confirmado literalmente em 7 contratos reais de 4 áreas (Cível, Reestruturação, Societário, Trabalhista) — alta confiança.$n$,
  1, 'pending_legal_review', true, null, null
),
(
  'general_independencia_disposicoes',
  'Independência das Disposições',
  $c$A invalidade ou ineficácia, no todo ou em parte, de qualquer das cláusulas deste Contrato não afetará as demais, que permanecerão sempre válidas e eficazes até o cumprimento, pelas Partes, de todas as suas obrigações aqui previstas.$c$,
  'PADRÃO BP', 281, 'general', true, ARRAY[]::text[], '[]'::jsonb,
  $n$Confirmado literalmente em 7 contratos reais de 4 áreas — alta confiança.$n$,
  1, 'pending_legal_review', true, null, null
),
(
  'general_acordo_integral',
  'Acordo Integral',
  $c$O presente Contrato constitui o acordo integral entre as Partes sobre as matérias nele contidas, substituindo todas e quaisquer tratativas, comunicações, propostas, instrumentos e/ou documentos anteriores à presente data (inclusive). Em caso de divergência entre o presente Contrato e a Proposta de Prestação de Serviços Advocatícios que o antecedeu, prevalecerão integralmente os termos deste Contrato, notadamente quanto aos honorários.$c$,
  'PADRÃO BP', 282, 'general', true, ARRAY[]::text[], '[]'::jsonb,
  $n$Primeira frase confirmada em 7 contratos reais; a frase de prevalência sobre a proposta aparece em ao menos 1 contrato real (Reestruturação) — REQUIRES LEGAL DECISION se deve ser padrão em todas as áreas.$n$,
  1, 'pending_legal_review', true, null, null
),
(
  'general_comunicacao',
  'Comunicação',
  $c$As comunicações entre as Partes poderão ser feitas por e-mail, com confirmação de leitura ou envio.$c$,
  'PADRÃO BP', 283, 'general', true, ARRAY[]::text[], '[]'::jsonb,
  $n$Confirmado literalmente em 7 contratos reais de 4 áreas — alta confiança.$n$,
  1, 'pending_legal_review', true, null, null
),
(
  'general_vinculacao_partes',
  'Vinculação das Partes',
  $c$Obrigam-se as Partes, por si, seus herdeiros, sucessores e cessionários autorizados, a qualquer título, a todo o tempo, visto que o fazem em caráter irrevogável e irretratável, não havendo em nenhuma hipótese condição de arrependimento.$c$,
  'PADRÃO BP', 284, 'general', true, ARRAY[]::text[], '[]'::jsonb,
  $n$Confirmado literalmente em 7 contratos reais de 4 áreas — alta confiança. Redundante com 'Irrevogabilidade'; mantido porque aparece como cláusula própria em todos os documentos-fonte.$n$,
  1, 'pending_legal_review', true, null, null
),
(
  'general_legislacao_aplicavel',
  'Legislação Aplicável',
  $c$Este Contrato será regido e interpretado de acordo com as Leis da República Federativa do Brasil.$c$,
  'PADRÃO BP', 285, 'general', true, ARRAY[]::text[], '[]'::jsonb,
  $n$Confirmado literalmente em 7 contratos reais de 4 áreas — alta confiança.$n$,
  1, 'pending_legal_review', true, null, null
),
(
  'general_responsabilidade_isencao',
  'Responsabilidade',
  $c$A Contratada ficará isenta de qualquer responsabilidade em caso de não fornecimento de subsídios adequados para o respectivo ato, bem como em caso de encaminhamento de documento ou prestação de informações falsas, alteradas, ou de qualquer forma insuficientes a efetiva execução dos Serviços, tal como em caso de atraso ou falta de pagamento de despesas procedimentais.$c$,
  'PADRÃO BP', 286, 'general', true, ARRAY[]::text[], '[]'::jsonb,
  $n$Confirmado literalmente em 7 contratos reais de 4 áreas — alta confiança. Nota: ao menos 1 contrato real (Reestruturação, Le Blog) substitui a limitação de responsabilidade da Contratada por responsabilidade ampla por dolo/culpa comprovados, sem teto — variação negociada caso a caso, não capturada aqui.$n$,
  1, 'pending_legal_review', true, null, null
),
(
  'general_utilizacao_marca',
  'Utilização de Marca',
  $c$[A_CONTRATANTE] autoriza expressamente que a Contratada utilize a sua marca em seus materiais de divulgação comercial.$c$,
  'PADRÃO BP', 287, 'general', false, ARRAY['[A_CONTRATANTE]']::text[], '[]'::jsonb,
  $n$Confirmado literalmente em 7 contratos reais de 4 áreas, inclusive para cliente pessoa física — marcada como não obrigatória por ser cláusula de marketing/divulgação, opt-out razoável conforme o cliente.$n$,
  1, 'pending_legal_review', true, null, null
),
(
  'general_assinaturas_titulo_executivo',
  'Assinaturas',
  $c$As Partes, devidamente qualificadas no preâmbulo, reconhecem que este Contrato tem plena validade em formato físico ou eletrônico, dispensando-se a assinatura de testemunhas nos moldes do art. 24 do Estatuto da Advocacia (Lei n. 8.906/94) e do art. 784, § 4º, do Código de Processo Civil, constituindo, portanto, título executivo extrajudicial.$c$,
  'PADRÃO BP', 288, 'general', true, ARRAY[]::text[], '[]'::jsonb,
  $n$Confirmado literalmente em 7 contratos reais de 4 áreas — fundamenta a assinatura eletrônica sem testemunhas usada no fluxo D4Sign. Alta confiança.$n$,
  1, 'pending_legal_review', true, null, null
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
