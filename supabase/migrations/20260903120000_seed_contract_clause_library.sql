-- Biblioteca admin = catálogo do motor (pending_legal_review).
-- Não inventa cláusulas de Cível/Societário/Tributário/Reestruturação.

drop index if exists public.contract_clause_templates_stable_key_uidx;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'contract_clause_templates_stable_key_key'
  ) then
    alter table public.contract_clause_templates
      add constraint contract_clause_templates_stable_key_key unique (stable_key);
  end if;
end $$;

insert into public.contract_clause_templates (
  stable_key, title, content, category, sort_order, role, is_required,
  placeholders, conflicts_json, legal_review_note, version, status, is_active
) values
(
  'object_auditoria',
  'Objeto — Auditoria Trabalhista',
  $c$O objeto do presente Contrato é a prestação de serviços advocatícios na área trabalhista, que consiste na realização de Auditoria Trabalhista, com o objetivo de identificar, mapear e mensurar riscos trabalhistas evidentes e ocultos, bem como oferecer recomendações estratégicas para mitigação de contingências jurídicas, financeiras e reputacionais.$c$,
  'AUDITORIA', 10, 'object', false, '{}'::text[], '[]'::jsonb,
  $n$REQUIRES LEGAL DECISION — texto extraído dos modelos Word para revisão da equipe Societário. Não é cláusula oficial BP.$n$,
  1, 'pending_legal_review', true
),
(
  'scope_auditoria',
  'Escopo — Auditoria Trabalhista',
  $c$A Auditoria Trabalhista será conduzida por meio de análise documental, entrevistas estruturadas, visita técnica in loco e elaboração de pareceres jurídicos e relatório executivo, seguindo metodologia baseada em programas de compliance trabalhista.$c$,
  'AUDITORIA', 11, 'scope', false, '{}'::text[], '[]'::jsonb,
  $n$REQUIRES LEGAL DECISION — texto extraído dos modelos Word para revisão da equipe Societário. Não é cláusula oficial BP.$n$,
  1, 'pending_legal_review', true
),
(
  'object_canal',
  'Objeto — Canal de Denúncias',
  $c$O objeto do presente Contrato consiste na disponibilização e operacionalização de plataforma de canal de denúncias pela Contratada, a ser disponibilizada pela Contratante aos seus colaboradores, por meio de link de acesso, destinada ao recebimento de relatos e denúncias relacionadas a condutas inadequadas no ambiente de trabalho.$c$,
  'CANAL', 20, 'object', false, '{}'::text[], '[]'::jsonb,
  $n$REQUIRES LEGAL DECISION — texto extraído dos modelos Word para revisão da equipe Societário. Não é cláusula oficial BP.$n$,
  1, 'pending_legal_review', true
),
(
  'scope_canal',
  'Escopo — Canal de Denúncias',
  $c$Os serviços compreendem: recebimento das denúncias; análise inicial e triagem; classificação e organização dos relatos; encaminhamento estruturado à Contratante; registro e controle para acompanhamento.$c$,
  'CANAL', 21, 'scope', false, '{}'::text[], '[]'::jsonb,
  $n$REQUIRES LEGAL DECISION — texto extraído dos modelos Word para revisão da equipe Societário. Não é cláusula oficial BP.$n$,
  1, 'pending_legal_review', true
),
(
  'limitation_canal',
  'Limites — Canal de Denúncias',
  $c$A atuação da Contratada limita-se ao gerenciamento, análise preliminar e encaminhamento das denúncias, não sendo de sua responsabilidade a investigação dos fatos, a adoção de medidas disciplinares, a condução de apurações formais, a tomada de decisões ou a implementação de plano de ação.$c$,
  'CANAL', 22, 'limitation', false, '{}'::text[], '[]'::jsonb,
  $n$REQUIRES LEGAL DECISION — texto extraído dos modelos Word para revisão da equipe Societário. Não é cláusula oficial BP.$n$,
  1, 'pending_legal_review', true
),
(
  'nature_canal',
  'Natureza — Canal de Denúncias',
  $c$O serviço prestado possui natureza estritamente administrativa e organizacional, consistindo no apoio à gestão e controle das informações recebidas, não se configurando como atividade investigativa, jurídica, decisória ou executiva.$c$,
  'CANAL', 23, 'nature', false, '{}'::text[], '[]'::jsonb,
  $n$REQUIRES LEGAL DECISION — texto extraído dos modelos Word para revisão da equipe Societário. Não é cláusula oficial BP.$n$,
  1, 'pending_legal_review', true
),
(
  'object_diagnostico',
  'Objeto — Diagnóstico NR-1',
  $c$O objeto do presente Contrato consiste na prestação de serviços voltados à identificação e mapeamento de fatores de riscos psicossociais relacionados ao trabalho, com enfoque nas diretrizes da NR-1.$c$,
  'DIAGNOSTICO', 30, 'object', false, '{}'::text[], '[]'::jsonb,
  $n$REQUIRES LEGAL DECISION — texto extraído dos modelos Word para revisão da equipe Societário. Não é cláusula oficial BP.$n$,
  1, 'pending_legal_review', true
),
(
  'scope_diagnostico',
  'Escopo — Diagnóstico NR-1',
  $c$Os serviços incluem diagnóstico organizacional por meio de: aplicação de questionário organizacional (HSE-IT); análise e validação dos resultados; entrega do relatório conclusivo para integração ao GRO e ao PGR da empresa.$c$,
  'DIAGNOSTICO', 31, 'scope', false, '{}'::text[], '[]'::jsonb,
  $n$REQUIRES LEGAL DECISION — texto extraído dos modelos Word para revisão da equipe Societário. Não é cláusula oficial BP.$n$,
  1, 'pending_legal_review', true
),
(
  'limitation_diagnostico',
  'Limites — Diagnóstico NR-1',
  $c$A implementação das medidas e planos de ação decorrentes do diagnóstico, além da consultoria jurídica de questões do dia a dia, não está incluída e poderá ser objeto de contratação complementar.$c$,
  'DIAGNOSTICO', 32, 'limitation', false, '{}'::text[], '[]'::jsonb,
  $n$REQUIRES LEGAL DECISION — texto extraído dos modelos Word para revisão da equipe Societário. Não é cláusula oficial BP.$n$,
  1, 'pending_legal_review', true
),
(
  'object_contencioso_trabalhista',
  'Objeto — Contencioso Trabalhista',
  $c$O objeto do presente Contrato inclui Assessoria Jurídica Trabalhista em contencioso: defesa dos interesses da Contratante nas demandas de natureza trabalhista já ajuizadas e nas que ainda serão ajuizadas.$c$,
  'CONTENCIOSO', 40, 'object', false, '{}'::text[], '[]'::jsonb,
  $n$REQUIRES LEGAL DECISION — texto extraído dos modelos Word para revisão da equipe Societário. Não é cláusula oficial BP.$n$,
  1, 'pending_legal_review', true
),
(
  'limitation_contencioso_trabalhista',
  'Limites — Contencioso Trabalhista',
  $c$A atuação contenciosa observa o limite de processos ativos informado nas condições comerciais. Processos excedentes poderão ensejar faturamento adicional, mediante aditivo.$c$,
  'CONTENCIOSO', 41, 'limitation', false, '{}'::text[], '[]'::jsonb,
  $n$REQUIRES LEGAL DECISION — texto extraído dos modelos Word para revisão da equipe Societário. Não é cláusula oficial BP.$n$,
  1, 'pending_legal_review', true
),
(
  'object_consultivo_trabalhista',
  'Objeto — Consultivo Trabalhista',
  $c$O objeto do presente Contrato inclui atuação consultiva trabalhista para gestão e prevenção de riscos ao patrimônio e ao fluxo de caixa da Contratante, observada a carga horária mensal definida nas condições comerciais.$c$,
  'CONSULTIVO', 50, 'object', false, '{}'::text[], '[]'::jsonb,
  $n$REQUIRES LEGAL DECISION — texto extraído dos modelos Word para revisão da equipe Societário. Não é cláusula oficial BP.$n$,
  1, 'pending_legal_review', true
),
(
  'exclusion_geral_base',
  'Atos jurídicos excluídos — base',
  $c$As atividades jurídicas contempladas estão delineadas no objeto. Dentre as matérias não relacionadas aos Serviços, o Contrato não abrange, em regra: condução de processos administrativos ou arbitrais; gestão eletrônica de contratos por plataformas terceirizadas; consultoria e implementação de procedimentos de LGPD; estruturação patrimonial por holdings ou planejamento familiar sucessório; atos regulatórios de mercado de capitais, licenças e alvarás — salvo se algum desses itens estiver expressamente contratado no objeto.$c$,
  'PADRÃO BP', 100, 'exclusion', true, '{}'::text[], '[]'::jsonb,
  $n$REQUIRES LEGAL DECISION — texto extraído dos modelos Word para revisão da equipe Societário. Não é cláusula oficial BP.$n$,
  1, 'pending_legal_review', true
),
(
  'exclusion_trabalhista_contencioso',
  'Exclusão — reclamações trabalhistas',
  $c$Não está incluída a atuação defensiva em reclamações trabalhistas, salvo contratação expressa.$c$,
  'PADRÃO BP', 101, 'exclusion', false, '{}'::text[], '["contencioso_acompanhamento_de_acao_judicial"]'::jsonb,
  $n$REQUIRES LEGAL DECISION — texto extraído dos modelos Word para revisão da equipe Societário. Não é cláusula oficial BP.$n$,
  1, 'pending_legal_review', true
),
(
  'exclusion_trabalhista_consultivo',
  'Exclusão — consultivo diário',
  $c$Não está incluída a condução consultiva de dúvidas diárias trabalhistas, salvo contratação expressa.$c$,
  'PADRÃO BP', 102, 'exclusion', false, '{}'::text[], '["consultivo"]'::jsonb,
  $n$REQUIRES LEGAL DECISION — texto extraído dos modelos Word para revisão da equipe Societário. Não é cláusula oficial BP.$n$,
  1, 'pending_legal_review', true
),
(
  'exclusion_trabalhista_auditoria',
  'Exclusão — Auditoria Trabalhista',
  $c$Não está incluída a realização de Auditoria Trabalhista para identificar, mapear e mensurar riscos trabalhistas, salvo contratação expressa.$c$,
  'PADRÃO BP', 103, 'exclusion', false, '{}'::text[], '["auditoria_trabalhista"]'::jsonb,
  $n$REQUIRES LEGAL DECISION — texto extraído dos modelos Word para revisão da equipe Societário. Não é cláusula oficial BP.$n$,
  1, 'pending_legal_review', true
),
(
  'exclusion_trabalhista_diagnostico',
  'Exclusão — Diagnóstico NR-1',
  $c$Não está incluído o mapeamento para diagnóstico de riscos psicossociais nos termos da NR-1, salvo contratação expressa.$c$,
  'PADRÃO BP', 104, 'exclusion', false, '{}'::text[], '["diagnostico_organizacional_de_riscos_psicossociais_nr_1"]'::jsonb,
  $n$REQUIRES LEGAL DECISION — texto extraído dos modelos Word para revisão da equipe Societário. Não é cláusula oficial BP.$n$,
  1, 'pending_legal_review', true
),
(
  'exclusion_trabalhista_canal',
  'Exclusão — Canal de Denúncias',
  $c$Não está incluída a disponibilização ou operacionalização de plataforma de canal de denúncias, salvo contratação expressa.$c$,
  'PADRÃO BP', 105, 'exclusion', false, '{}'::text[], '["canal_de_denuncias_gestao_e_triagem"]'::jsonb,
  $n$REQUIRES LEGAL DECISION — texto extraído dos modelos Word para revisão da equipe Societário. Não é cláusula oficial BP.$n$,
  1, 'pending_legal_review', true
),
(
  'exclusion_trabalhista_mpt',
  'Exclusão — MPT/MTE',
  $c$Não está incluída a atuação defensiva em procedimentos administrativos do Ministério Público do Trabalho e do Ministério do Trabalho e Emprego, salvo contratação expressa.$c$,
  'PADRÃO BP', 106, 'exclusion', false, '{}'::text[], '[]'::jsonb,
  $n$REQUIRES LEGAL DECISION — texto extraído dos modelos Word para revisão da equipe Societário. Não é cláusula oficial BP.$n$,
  1, 'pending_legal_review', true
),
(
  'exclusion_trabalhista_sustentacao',
  'Exclusão — sustentação oral',
  $c$Não está incluída a realização de sustentação oral nos Tribunais Regionais do Trabalho e no Tribunal Superior do Trabalho, salvo contratação expressa.$c$,
  'PADRÃO BP', 107, 'exclusion', false, '{}'::text[], '[]'::jsonb,
  $n$REQUIRES LEGAL DECISION — texto extraído dos modelos Word para revisão da equipe Societário. Não é cláusula oficial BP.$n$,
  1, 'pending_legal_review', true
),
(
  'exclusion_scope_change',
  'Alteração de escopo',
  $c$Eventual alteração ou acréscimo no escopo dos Serviços, inclusive a contratação de hipóteses excluídas, somente poderá ocorrer mediante aditivo contratual.$c$,
  'PADRÃO BP', 108, 'exclusion', true, '{}'::text[], '[]'::jsonb,
  $n$REQUIRES LEGAL DECISION — texto extraído dos modelos Word para revisão da equipe Societário. Não é cláusula oficial BP.$n$,
  1, 'pending_legal_review', true
),
(
  'default_inadimplemento',
  'Inadimplemento',
  $c$Na hipótese de inadimplemento dos honorários, a Contratada poderá: (i) interromper a execução dos Serviços, observadas as regras legais e profissionais, desde que encaminhada notificação prévia por e-mail; (ii) resilir o Contrato mediante notificação escrita por e-mail, com prazo de 10 (dez) dias de antecedência, sem prejuízo do recebimento do saldo residual.$c$,
  'PADRÃO BP', 200, 'default', true, '{}'::text[], '[]'::jsonb,
  $n$REQUIRES LEGAL DECISION — texto extraído dos modelos Word para revisão da equipe Societário. Não é cláusula oficial BP.$n$,
  1, 'pending_legal_review', true
),
(
  'default_atraso_multa',
  'Atraso no pagamento',
  $c$O atraso no pagamento facultará à Contratada cobrar multa equivalente a 20% (vinte por cento) do valor em mora, acrescida de juros de 1% (um por cento) ao mês, pro rata die, com atualização pela variação positiva do IPCA-E. REQUIRES LEGAL DECISION quanto à manutenção desta multa como padrão.$c$,
  'PADRÃO BP', 201, 'default', true, '{}'::text[], '[]'::jsonb,
  $n$REQUIRES LEGAL DECISION — texto extraído dos modelos Word para revisão da equipe Societário. Não é cláusula oficial BP.$n$,
  1, 'pending_legal_review', true
),
(
  'term_resolved',
  'Vigência',
  '[VIGENCIA_TEXTO]',
  'PADRÃO BP', 210, 'term', true, ARRAY['[VIGENCIA_TEXTO]']::text[], '[]'::jsonb,
  $n$REQUIRES LEGAL DECISION — texto extraído dos modelos Word para revisão da equipe Societário. Não é cláusula oficial BP.$n$,
  1, 'pending_legal_review', true
),
(
  'start_resolved',
  'Início do Contrato',
  '[INICIO_TEXTO]',
  'PADRÃO BP', 211, 'term', true, ARRAY['[INICIO_TEXTO]']::text[], '[]'::jsonb,
  $n$REQUIRES LEGAL DECISION — texto extraído dos modelos Word para revisão da equipe Societário. Não é cláusula oficial BP.$n$,
  1, 'pending_legal_review', true
),
(
  'termination_aviso',
  'Extinção do Contrato',
  $c$O Contrato pode ser resilido por qualquer das Partes, a qualquer tempo, desde que precedido de comunicação escrita por e-mail com antecedência mínima de 30 (trinta) dias, sem ônus, salvo regra específica de outro perfil.$c$,
  'PADRÃO BP', 220, 'termination', true, '{}'::text[], '[]'::jsonb,
  $n$REQUIRES LEGAL DECISION — texto extraído dos modelos Word para revisão da equipe Societário. Não é cláusula oficial BP.$n$,
  1, 'pending_legal_review', true
),
(
  'obligation_contracted_base',
  'Obrigações da Contratada',
  $c$A Contratada prestará os Serviços com zelo profissional, observando o Estatuto da Advocacia e o Código de Ética, e manterá a Contratante informada sobre atos relevantes da execução contratual.$c$,
  'PADRÃO BP', 230, 'contracted_obligation', true, '{}'::text[], '[]'::jsonb,
  $n$REQUIRES LEGAL DECISION — texto extraído dos modelos Word para revisão da equipe Societário. Não é cláusula oficial BP.$n$,
  1, 'pending_legal_review', true
),
(
  'obligation_contracting_base',
  'Obrigações da Contratante',
  $c$[A_CONTRATANTE] prestará as informações e documentos necessários à execução dos Serviços, efetuará os pagamentos nas datas pactuadas e indicará interlocutor para as comunicações do Contrato.$c$,
  'PADRÃO BP', 240, 'contracting_obligation', true, ARRAY['[A_CONTRATANTE]']::text[], '[]'::jsonb,
  $n$REQUIRES LEGAL DECISION — texto extraído dos modelos Word para revisão da equipe Societário. Não é cláusula oficial BP.$n$,
  1, 'pending_legal_review', true
),
(
  'expense_km',
  'Despesas',
  $c$Despesas extraordinárias necessárias à execução dos Serviços serão reembolsadas mediante comprovação. Os modelos mencionam R$ 2,00 por quilômetro — REQUIRES LEGAL DECISION se esse valor é padrão institucional.$c$,
  'PADRÃO BP', 250, 'expense', true, '{}'::text[], '[]'::jsonb,
  $n$REQUIRES LEGAL DECISION — texto extraído dos modelos Word para revisão da equipe Societário. Não é cláusula oficial BP.$n$,
  1, 'pending_legal_review', true
),
(
  'compliance_anticorrupcao',
  'Compliance e Lei Anticorrupção',
  $c$As Partes declaram conhecer e se obrigam a observar a legislação anticorrupção e de compliance aplicável, abstendo-se de qualquer ato que configure corrupção, fraude ou lavagem de dinheiro.$c$,
  'PADRÃO BP', 260, 'compliance', true, '{}'::text[], '[]'::jsonb,
  $n$REQUIRES LEGAL DECISION — texto extraído dos modelos Word para revisão da equipe Societário. Não é cláusula oficial BP.$n$,
  1, 'pending_legal_review', true
),
(
  'general_tributos',
  'Tributos',
  $c$A incidência de tributos sobre os honorários observa a condição comercial da proposta ([TRIBUTACAO]). REQUIRES LEGAL DECISION: os modelos às vezes afirmam que o valor engloba tributos mesmo quando a proposta diz o contrário.$c$,
  'PADRÃO BP', 270, 'general', true, ARRAY['[TRIBUTACAO]']::text[], '[]'::jsonb,
  $n$REQUIRES LEGAL DECISION — texto extraído dos modelos Word para revisão da equipe Societário. Não é cláusula oficial BP.$n$,
  1, 'pending_legal_review', true
),
(
  'general_foro',
  'Foro',
  $c$As Partes elegem o foro da Comarca de Campinas, Estado de São Paulo, para dirimir dúvidas deste Contrato, com renúncia a qualquer outro.$c$,
  'PADRÃO BP', 271, 'general', true, '{}'::text[], '[]'::jsonb,
  $n$REQUIRES LEGAL DECISION — texto extraído dos modelos Word para revisão da equipe Societário. Não é cláusula oficial BP.$n$,
  1, 'pending_legal_review', true
),
(
  'payment_boleto',
  'Forma de pagamento — boleto',
  $c$O pagamento será realizado via boleto bancário, a ser enviado com no mínimo 5 (cinco) dias de antecedência ao e-mail indicado pela Contratante. O não recebimento do boleto não exime a obrigação de pagamento na data pactuada.$c$,
  'PAGAMENTO', 180, 'special', false, '{}'::text[], '[]'::jsonb,
  $n$REQUIRES LEGAL DECISION — texto extraído dos modelos Word para revisão da equipe Societário. Não é cláusula oficial BP.$n$,
  1, 'pending_legal_review', true
),
(
  'payment_conta',
  'Forma de pagamento — transferência',
  $c$O pagamento deverá ser efetuado na conta bancária institucional da Contratada: Banco [BANCO], Agência [AGENCIA], Conta [CONTA], titular [TITULAR], CNPJ [CNPJ_FIRMA].$c$,
  'PAGAMENTO', 181, 'special', false,
  ARRAY['[BANCO]', '[AGENCIA]', '[CONTA]', '[TITULAR]', '[CNPJ_FIRMA]']::text[],
  '[]'::jsonb,
  $n$REQUIRES LEGAL DECISION — texto extraído dos modelos Word para revisão da equipe Societário. Não é cláusula oficial BP.$n$,
  1, 'pending_legal_review', true
),
(
  'payment_pix',
  'Forma de pagamento — PIX',
  $c$O pagamento poderá ser realizado via PIX para a chave institucional [PIX_FIRMA].$c$,
  'PAGAMENTO', 182, 'special', false, ARRAY['[PIX_FIRMA]']::text[], '[]'::jsonb,
  $n$REQUIRES LEGAL DECISION — texto extraído dos modelos Word para revisão da equipe Societário. Não é cláusula oficial BP.$n$,
  1, 'pending_legal_review', true
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
  is_active = true,
  updated_at = now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'contract_scope_profile_clauses_profile_key_key'
  ) then
    alter table public.contract_scope_profile_clauses
      add constraint contract_scope_profile_clauses_profile_key_key
      unique (profile_id, clause_stable_key);
  end if;
end $$;

insert into public.contract_scope_profile_clauses (
  profile_id, clause_stable_key, role, sort_order, is_required
)
select
  p.id,
  v.clause_stable_key,
  v.role,
  v.sort_order,
  v.is_required
from public.contract_scope_profiles p
join (
  values
    ('auditoria_trabalhista', 'object_auditoria', 'object', 10, false),
    ('auditoria_trabalhista', 'scope_auditoria', 'scope', 20, false),
    ('auditoria_trabalhista', 'exclusion_trabalhista_contencioso', 'exclusion', 30, false),
    ('auditoria_trabalhista', 'exclusion_trabalhista_consultivo', 'exclusion', 40, false),
    ('auditoria_trabalhista', 'exclusion_trabalhista_diagnostico', 'exclusion', 50, false),
    ('auditoria_trabalhista', 'exclusion_trabalhista_canal', 'exclusion', 60, false),
    ('auditoria_trabalhista', 'exclusion_trabalhista_mpt', 'exclusion', 70, false),
    ('auditoria_trabalhista', 'exclusion_trabalhista_sustentacao', 'exclusion', 80, false),
    ('canal_de_denuncias_gestao_e_triagem', 'object_canal', 'object', 10, false),
    ('canal_de_denuncias_gestao_e_triagem', 'scope_canal', 'scope', 20, false),
    ('canal_de_denuncias_gestao_e_triagem', 'limitation_canal', 'limitation', 30, false),
    ('canal_de_denuncias_gestao_e_triagem', 'nature_canal', 'nature', 40, false),
    ('canal_de_denuncias_gestao_e_triagem', 'exclusion_trabalhista_contencioso', 'exclusion', 50, false),
    ('canal_de_denuncias_gestao_e_triagem', 'exclusion_trabalhista_consultivo', 'exclusion', 60, false),
    ('canal_de_denuncias_gestao_e_triagem', 'exclusion_trabalhista_auditoria', 'exclusion', 70, false),
    ('canal_de_denuncias_gestao_e_triagem', 'exclusion_trabalhista_diagnostico', 'exclusion', 80, false),
    ('canal_de_denuncias_gestao_e_triagem', 'exclusion_trabalhista_mpt', 'exclusion', 90, false),
    ('canal_de_denuncias_gestao_e_triagem', 'exclusion_trabalhista_sustentacao', 'exclusion', 100, false),
    ('diagnostico_organizacional_de_riscos_psicossociais_nr_1', 'object_diagnostico', 'object', 10, false),
    ('diagnostico_organizacional_de_riscos_psicossociais_nr_1', 'scope_diagnostico', 'scope', 20, false),
    ('diagnostico_organizacional_de_riscos_psicossociais_nr_1', 'limitation_diagnostico', 'limitation', 30, false),
    ('diagnostico_organizacional_de_riscos_psicossociais_nr_1', 'exclusion_trabalhista_contencioso', 'exclusion', 40, false),
    ('diagnostico_organizacional_de_riscos_psicossociais_nr_1', 'exclusion_trabalhista_consultivo', 'exclusion', 50, false),
    ('diagnostico_organizacional_de_riscos_psicossociais_nr_1', 'exclusion_trabalhista_auditoria', 'exclusion', 60, false),
    ('diagnostico_organizacional_de_riscos_psicossociais_nr_1', 'exclusion_trabalhista_canal', 'exclusion', 70, false),
    ('diagnostico_organizacional_de_riscos_psicossociais_nr_1', 'exclusion_trabalhista_mpt', 'exclusion', 80, false),
    ('diagnostico_organizacional_de_riscos_psicossociais_nr_1', 'exclusion_trabalhista_sustentacao', 'exclusion', 90, false),
    ('contencioso_acompanhamento_de_acao_judicial', 'object_contencioso_trabalhista', 'object', 10, false),
    ('contencioso_acompanhamento_de_acao_judicial', 'limitation_contencioso_trabalhista', 'limitation', 20, false),
    ('contencioso_acompanhamento_de_acao_judicial', 'exclusion_trabalhista_auditoria', 'exclusion', 30, false),
    ('contencioso_acompanhamento_de_acao_judicial', 'exclusion_trabalhista_diagnostico', 'exclusion', 40, false),
    ('contencioso_acompanhamento_de_acao_judicial', 'exclusion_trabalhista_canal', 'exclusion', 50, false),
    ('contencioso_acompanhamento_de_acao_judicial', 'exclusion_trabalhista_mpt', 'exclusion', 60, false),
    ('contencioso_acompanhamento_de_acao_judicial', 'exclusion_trabalhista_sustentacao', 'exclusion', 70, false),
    ('consultivo', 'object_consultivo_trabalhista', 'object', 10, false),
    ('consultivo', 'exclusion_trabalhista_auditoria', 'exclusion', 20, false),
    ('consultivo', 'exclusion_trabalhista_diagnostico', 'exclusion', 30, false),
    ('consultivo', 'exclusion_trabalhista_canal', 'exclusion', 40, false)
) as v(scope_subtype_key, clause_stable_key, role, sort_order, is_required)
  on p.scope_subtype_key = v.scope_subtype_key
on conflict (profile_id, clause_stable_key) do update set
  role = excluded.role,
  sort_order = excluded.sort_order,
  is_required = excluded.is_required;
