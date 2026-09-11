import type { ClauseRole, ContractClauseTemplate } from "./types";
import { toTitleCasePt } from "./title-case";

const LEGAL =
  "REQUIRES LEGAL DECISION — texto extraído dos modelos Word para revisão da equipe Societário. Não é cláusula oficial BP.";

function clause(
  stableKey: string,
  title: string,
  content: string,
  role: ClauseRole,
  extra: Partial<ContractClauseTemplate> = {},
): ContractClauseTemplate {
  return {
    stableKey,
    title: toTitleCasePt(title),
    content,
    role,
    category: extra.category ?? role,
    version: extra.version ?? 1,
    status: extra.status ?? "pending_legal_review",
    sortOrder: extra.sortOrder ?? 0,
    isRequired: extra.isRequired ?? false,
    placeholders: extra.placeholders ?? [],
    conflictsWithSubtypeIds: extra.conflictsWithSubtypeIds ?? [],
    legalReviewNote: extra.legalReviewNote ?? LEGAL,
  };
}

/** Subtipos do catálogo comercial usados nas regras de conflito. */
export const SCOPE_IDS = {
  auditoria: "auditoria_trabalhista",
  canal: "canal_de_denuncias_gestao_e_triagem",
  diagnostico: "diagnostico_organizacional_de_riscos_psicossociais_nr_1",
  contencioso: "contencioso_acompanhamento_de_acao_judicial",
  consultivo: "consultivo",
  civel: "um_processo",
  civelMaisUmProcesso: "mais_um_processo",
  contratual: "consultivo_revisao_e_elaboracao_de_contratos",
  tributario: "contencioso_execucoes_fiscais",
  reestruturacaoNegociacoes: "negociacoes_estrategicas",
  societarioDiagnostico: "diagnostico_estruturacao_e_protecao_patrimonial",
} as const;

export const CONTRACT_CLAUSE_CATALOG: ContractClauseTemplate[] = [
  clause(
    "object_auditoria",
    "Objeto — Auditoria Trabalhista",
    "O objeto do presente Contrato é a prestação de serviços advocatícios na área trabalhista, que consiste na realização de Auditoria Trabalhista, com o objetivo de identificar, mapear e mensurar riscos trabalhistas evidentes e ocultos, bem como oferecer recomendações estratégicas para mitigação de contingências jurídicas, financeiras e reputacionais.",
    "object",
    { category: "AUDITORIA", sortOrder: 10 },
  ),
  clause(
    "scope_auditoria",
    "Escopo — Auditoria Trabalhista",
    "A Auditoria Trabalhista será conduzida por meio de análise documental, entrevistas estruturadas, visita técnica in loco e elaboração de pareceres jurídicos e relatório executivo, seguindo metodologia baseada em programas de compliance trabalhista.",
    "scope",
    { category: "AUDITORIA", sortOrder: 11 },
  ),
  clause(
    "object_canal",
    "Objeto — Canal de Denúncias",
    "O objeto do presente Contrato consiste na disponibilização e operacionalização de plataforma de canal de denúncias pela Contratada, a ser disponibilizada pela Contratante aos seus colaboradores, por meio de link de acesso, destinada ao recebimento de relatos e denúncias relacionadas a condutas inadequadas no ambiente de trabalho.",
    "object",
    { category: "CANAL", sortOrder: 20 },
  ),
  clause(
    "scope_canal",
    "Escopo — Canal de Denúncias",
    "Os serviços compreendem: recebimento das denúncias; análise inicial e triagem; classificação e organização dos relatos; encaminhamento estruturado à Contratante; registro e controle para acompanhamento.",
    "scope",
    { category: "CANAL", sortOrder: 21 },
  ),
  clause(
    "limitation_canal",
    "Limites — Canal de Denúncias",
    "A atuação da Contratada limita-se ao gerenciamento, análise preliminar e encaminhamento das denúncias, não sendo de sua responsabilidade a investigação dos fatos, a adoção de medidas disciplinares, a condução de apurações formais, a tomada de decisões ou a implementação de plano de ação.",
    "limitation",
    { category: "CANAL", sortOrder: 22 },
  ),
  clause(
    "nature_canal",
    "Natureza — Canal de Denúncias",
    "O serviço prestado possui natureza estritamente administrativa e organizacional, consistindo no apoio à gestão e controle das informações recebidas, não se configurando como atividade investigativa, jurídica, decisória ou executiva.",
    "nature",
    { category: "CANAL", sortOrder: 23 },
  ),
  clause(
    "object_diagnostico",
    "Objeto — Diagnóstico NR-1",
    "O objeto do presente Contrato consiste na prestação de serviços voltados à identificação e mapeamento de fatores de riscos psicossociais relacionados ao trabalho, com enfoque nas diretrizes da NR-1.",
    "object",
    { category: "DIAGNOSTICO", sortOrder: 30 },
  ),
  clause(
    "scope_diagnostico",
    "Escopo — Diagnóstico NR-1",
    "Os serviços incluem diagnóstico organizacional por meio de: aplicação de questionário organizacional (HSE-IT); análise e validação dos resultados; entrega do relatório conclusivo para integração ao GRO e ao PGR da empresa.",
    "scope",
    { category: "DIAGNOSTICO", sortOrder: 31 },
  ),
  clause(
    "limitation_diagnostico",
    "Limites — Diagnóstico NR-1",
    "A implementação das medidas e planos de ação decorrentes do diagnóstico, além da consultoria jurídica de questões do dia a dia, não está incluída e poderá ser objeto de contratação complementar.",
    "limitation",
    { category: "DIAGNOSTICO", sortOrder: 32 },
  ),
  clause(
    "object_contencioso_trabalhista",
    "Objeto — Contencioso Trabalhista",
    "O objeto do presente Contrato inclui Assessoria Jurídica Trabalhista em contencioso: defesa dos interesses da Contratante nas demandas de natureza trabalhista já ajuizadas e nas que ainda serão ajuizadas.",
    "object",
    { category: "CONTENCIOSO", sortOrder: 40 },
  ),
  clause(
    "limitation_contencioso_trabalhista",
    "Limites — Contencioso Trabalhista",
    "A atuação contenciosa observa o limite de processos ativos informado nas condições comerciais. Processos excedentes poderão ensejar faturamento adicional, mediante aditivo.",
    "limitation",
    { category: "CONTENCIOSO", sortOrder: 41 },
  ),
  clause(
    "object_consultivo_trabalhista",
    "Objeto — Consultivo Trabalhista",
    "O objeto do presente Contrato inclui atuação consultiva trabalhista para gestão e prevenção de riscos ao patrimônio e ao fluxo de caixa da Contratante, observada a carga horária mensal definida nas condições comerciais.",
    "object",
    { category: "CONSULTIVO", sortOrder: 50 },
  ),

  clause(
    "exclusion_geral_base",
    "Atos jurídicos excluídos — base",
    "As atividades jurídicas contempladas estão delineadas no objeto. Dentre as matérias não relacionadas aos Serviços, o Contrato não abrange, em regra: condução de processos administrativos ou arbitrais; gestão eletrônica de contratos por plataformas terceirizadas; consultoria e implementação de procedimentos de LGPD; estruturação patrimonial por holdings ou planejamento familiar sucessório; atos regulatórios de mercado de capitais, licenças e alvarás — salvo se algum desses itens estiver expressamente contratado no objeto.",
    "exclusion",
    { category: "PADRÃO BP", sortOrder: 100, isRequired: true },
  ),
  clause(
    "exclusion_trabalhista_contencioso",
    "Exclusão — reclamações trabalhistas",
    "Não está incluída a atuação defensiva em reclamações trabalhistas, salvo contratação expressa.",
    "exclusion",
    { category: "PADRÃO BP", sortOrder: 101, conflictsWithSubtypeIds: [SCOPE_IDS.contencioso] },
  ),
  clause(
    "exclusion_trabalhista_consultivo",
    "Exclusão — consultivo diário",
    "Não está incluída a condução consultiva de dúvidas diárias trabalhistas, salvo contratação expressa.",
    "exclusion",
    { category: "PADRÃO BP", sortOrder: 102, conflictsWithSubtypeIds: [SCOPE_IDS.consultivo] },
  ),
  clause(
    "exclusion_trabalhista_auditoria",
    "Exclusão — Auditoria Trabalhista",
    "Não está incluída a realização de Auditoria Trabalhista para identificar, mapear e mensurar riscos trabalhistas, salvo contratação expressa.",
    "exclusion",
    { category: "PADRÃO BP", sortOrder: 103, conflictsWithSubtypeIds: [SCOPE_IDS.auditoria] },
  ),
  clause(
    "exclusion_trabalhista_diagnostico",
    "Exclusão — Diagnóstico NR-1",
    "Não estão incluídos o mapeamento para diagnóstico de riscos psicossociais nos termos da NR-1, a condução de programas contínuos de treinamentos e palestras, nem a análise e reestruturação técnica de documentação de SST, salvo contratação expressa.",
    "exclusion",
    {
      category: "PADRÃO BP",
      sortOrder: 104,
      conflictsWithSubtypeIds: [SCOPE_IDS.diagnostico],
      legalReviewNote:
        "Ampliado com base em contrato real (Engefaz): a exclusão trabalhista real cobre também treinamentos/palestras e documentação de SST, não só o diagnóstico NR-1 isolado — o perfil Diagnóstico NR-1 do sistema pode estar sub-modelado frente a isso (fica como próximo passo, não coberto nesta leva).",
    },
  ),
  clause(
    "exclusion_trabalhista_canal",
    "Exclusão — Canal de Denúncias",
    "Não está incluída a disponibilização ou operacionalização de plataforma de canal de denúncias, salvo contratação expressa.",
    "exclusion",
    { category: "PADRÃO BP", sortOrder: 105, conflictsWithSubtypeIds: [SCOPE_IDS.canal] },
  ),
  clause(
    "exclusion_trabalhista_mpt",
    "Exclusão — MPT/MTE",
    "Não está incluída a atuação defensiva em procedimentos administrativos do Ministério Público do Trabalho e do Ministério do Trabalho e Emprego, salvo contratação expressa.",
    "exclusion",
    { category: "PADRÃO BP", sortOrder: 106 },
  ),
  clause(
    "exclusion_trabalhista_sustentacao",
    "Exclusão — sustentação oral",
    "Não está incluída a realização de sustentação oral nos Tribunais Regionais do Trabalho e no Tribunal Superior do Trabalho, salvo contratação expressa.",
    "exclusion",
    { category: "PADRÃO BP", sortOrder: 107 },
  ),
  clause(
    "exclusion_scope_change",
    "Alteração de escopo",
    "Eventual alteração ou acréscimo no escopo dos Serviços, inclusive a contratação de hipóteses excluídas, somente poderá ocorrer mediante aditivo contratual.",
    "exclusion",
    { category: "PADRÃO BP", sortOrder: 108, isRequired: true },
  ),
  clause(
    "exclusion_geral_extras",
    "Demandas não contempladas",
    "Este Contrato não contempla a atuação em demandas: a) de procedimentos de arbitragem; b) regulatórias e administrativas; c) de órgãos de conselho de classe; d) de matéria de direito ambiental.",
    "exclusion",
    {
      category: "PADRÃO BP",
      sortOrder: 109,
      isRequired: true,
      legalReviewNote:
        "Cláusula 2.3 do padrão `contrato_honorarios_template_1.md`. Decisão (usuário + IA, nesta sessão): virou transversal fixa em vez de amarrada à área Cível, porque os 4 itens (arbitragem, regulatório, conselho de classe, ambiental) são limites gerais da atuação do escritório, não específicos de uma área — no contrato real da Ingevity esse conteúdo apareceu fundido dentro das Limitações da área Cível, mas isso foi tratado como conveniência de redação, não regra.",
    },
  ),

  clause(
    "default_inadimplemento",
    "Inadimplemento",
    "Na hipótese de inadimplemento dos honorários, a Contratada poderá: (i) interromper a execução dos Serviços, observadas as regras legais e profissionais, desde que encaminhada notificação prévia por e-mail; (ii) resilir o Contrato mediante notificação escrita por e-mail, com prazo de 10 (dez) dias de antecedência, sem prejuízo do recebimento do saldo residual.",
    "default",
    { category: "PADRÃO BP", sortOrder: 200, isRequired: true },
  ),
  clause(
    "default_atraso_multa",
    "Atraso no pagamento",
    "O atraso no pagamento facultará à Contratada cobrar multa equivalente a 20% (vinte por cento) do valor em mora, acrescida de juros de 1% (um por cento) ao mês, pro rata die, com atualização pela variação positiva do IPCA-E.",
    "default",
    {
      category: "PADRÃO BP",
      sortOrder: 201,
      isRequired: true,
      legalReviewNote:
        "20% + 1%/mês + IPCA-E é o padrão de tabela, confirmado literalmente em contratos reais (Auditoria/Engefaz, modelo Mensal Full). Porém, ao menos 1 contrato real de conta grande (Full Service/Pague Menos) negociou a multa para 10% — não é universal. Manter 20% como default, mas overridável por contrato (o builder já permite editar com justificativa); REQUIRES LEGAL DECISION apenas se deve haver um teto mínimo negociável.",
    },
  ),
  clause(
    "term_resolved",
    "Vigência",
    "[VIGENCIA_TEXTO]",
    "term",
    { category: "PADRÃO BP", sortOrder: 210, isRequired: true, placeholders: ["[VIGENCIA_TEXTO]"] },
  ),
  clause(
    "start_resolved",
    "Início do Contrato",
    "[INICIO_TEXTO]",
    "term",
    { category: "PADRÃO BP", sortOrder: 211, isRequired: true, placeholders: ["[INICIO_TEXTO]"] },
  ),
  clause(
    "termination_aviso",
    "Extinção do Contrato",
    "O Contrato pode ser resilido por qualquer das Partes, a qualquer tempo, desde que precedido de comunicação escrita por e-mail com antecedência mínima de 30 (trinta) dias, sem ônus, salvo regra específica de outro perfil.",
    "termination",
    { category: "PADRÃO BP", sortOrder: 220, isRequired: true },
  ),
  clause(
    "obligation_contracted_base",
    "Obrigações da Contratada",
    "A Contratada prestará os Serviços com zelo profissional, observando o Estatuto da Advocacia e o Código de Ética, e manterá a Contratante informada sobre atos relevantes da execução contratual.",
    "contracted_obligation",
    { category: "PADRÃO BP", sortOrder: 230, isRequired: true },
  ),
  clause(
    "obligation_contracting_base",
    "Obrigações da Contratante",
    "[A_CONTRATANTE] prestará as informações e documentos necessários à execução dos Serviços, efetuará os pagamentos nas datas pactuadas e indicará interlocutor para as comunicações do Contrato.",
    "contracting_obligation",
    {
      category: "PADRÃO BP",
      sortOrder: 240,
      isRequired: true,
      placeholders: ["[A_CONTRATANTE]"],
    },
  ),
  clause(
    "expense_km",
    "Despesas",
    "A remuneração avençada não abrange despesas extraordinárias necessárias à execução dos Serviços (custas, taxas, cópias, cartórios, viagens, hospedagens e demais encargos). Tais despesas serão reembolsadas mediante comprovação, previamente autorizadas por e-mail. Os custos suportados pelos prepostos da Contratada em diligências com uso de veículo próprio, incluindo alimentação, serão discriminados em relatório de despesas enviado quinzenalmente, contendo data, quilometragem, pedágios, alimentação, profissional responsável e trabalho realizado. Fica estabelecido o valor de R$ 2,00 (dois reais) por quilômetro rodado, medido pela distância entre a sede/filial da Contratada e o destino da diligência via Google Maps/Waze, reajustável consensualmente conforme a tabela de preço dos combustíveis. Diligências a mais de 150 (cento e cinquenta) quilômetros da sede/filial da Contratada poderão ser realizadas por correspondentes, com honorários custeados pela Contratante nos mesmos moldes.",
    "expense",
    {
      category: "PADRÃO BP",
      sortOrder: 250,
      isRequired: true,
      legalReviewNote:
        "Texto ampliado com o bloco completo confirmado em 2 contratos reais (Auditoria/Engefaz, modelo Mensal Full): R$ 2,00/km + prazo de reembolso de 7 dias + regra dos 150 km para correspondentes. Não é universal: 1 contrato real de conta grande (Pague Menos) negociou R$ 1,85/km e prazo de 10 dias — manter R$ 2,00/7 dias como default overridável, não travado. Prazo de 7 dias para pagamento do relatório de despesas não incluído no texto acima por ainda não ter um placeholder de prazo — REQUIRES LEGAL DECISION antes de tornar `approved`.",
    },
  ),
  clause(
    "compliance_anticorrupcao",
    "Compliance e Lei Anticorrupção",
    "As Partes declaram conhecer e se obrigam a observar a legislação anticorrupção e de compliance aplicável, abstendo-se de qualquer ato que configure corrupção, fraude ou lavagem de dinheiro.",
    "compliance",
    { category: "PADRÃO BP", sortOrder: 260, isRequired: true },
  ),
  clause(
    "general_tributos",
    "Tributos",
    "A incidência de tributos sobre os honorários observa a condição comercial da proposta ([TRIBUTACAO]).",
    "general",
    {
      category: "PADRÃO BP",
      sortOrder: 270,
      isRequired: true,
      placeholders: ["[TRIBUTACAO]"],
      legalReviewNote:
        "Os modelos Word às vezes afirmam que o valor engloba tributos mesmo quando a proposta diz o contrário — REQUIRES LEGAL DECISION sobre qual redação padronizar.",
    },
  ),
  clause(
    "general_foro",
    "Foro",
    "As Partes elegem o foro da Comarca de Campinas, Estado de São Paulo, para dirimir dúvidas deste Contrato, com renúncia a qualquer outro.",
    "general",
    { category: "PADRÃO BP", sortOrder: 271, isRequired: true },
  ),
  clause(
    "general_irrevogabilidade",
    "Irrevogabilidade",
    "Este Contrato é celebrado em caráter irrevogável e irretratável e obriga as Partes e seus herdeiros e sucessores, a qualquer título, e somente poderá ser alterado através de aditivo por escrito, devidamente assinado por todas as Partes.",
    "general",
    {
      category: "PADRÃO BP",
      sortOrder: 280,
      isRequired: true,
      legalReviewNote:
        "Confirmado literalmente em 7 contratos reais de 4 áreas (Cível, Reestruturação, Societário, Trabalhista) — alta confiança.",
    },
  ),
  clause(
    "general_independencia_disposicoes",
    "Independência das Disposições",
    "A invalidade ou ineficácia, no todo ou em parte, de qualquer das cláusulas deste Contrato não afetará as demais, que permanecerão sempre válidas e eficazes até o cumprimento, pelas Partes, de todas as suas obrigações aqui previstas.",
    "general",
    {
      category: "PADRÃO BP",
      sortOrder: 281,
      isRequired: true,
      legalReviewNote:
        "Confirmado literalmente em 7 contratos reais de 4 áreas — alta confiança.",
    },
  ),
  clause(
    "general_acordo_integral",
    "Acordo Integral",
    "O presente Contrato constitui o acordo integral entre as Partes sobre as matérias nele contidas, substituindo todas e quaisquer tratativas, comunicações, propostas, instrumentos e/ou documentos anteriores à presente data (inclusive). Em caso de divergência entre o presente Contrato e a Proposta de Prestação de Serviços Advocatícios que o antecedeu, prevalecerão integralmente os termos deste Contrato, notadamente quanto aos honorários.",
    "general",
    {
      category: "PADRÃO BP",
      sortOrder: 282,
      isRequired: true,
      legalReviewNote:
        "Primeira frase confirmada em 7 contratos reais; a frase de prevalência sobre a proposta aparece em ao menos 1 contrato real (Reestruturação) — mantida por ser prática de proteção institucional útil, REQUIRES LEGAL DECISION se deve ser padrão em todas as áreas.",
    },
  ),
  clause(
    "general_comunicacao",
    "Comunicações e Notificações",
    "Todas as notificações e demais comunicações a serem feitas com relação ao presente Contrato serão elaboradas por escrito e enviadas para os endereços listados no preâmbulo deste Contrato, ou para outros que venham a ser indicados pelas Partes através de: (i) cartório de Títulos e Documentos; (ii) carta registrada; ou (iii) e-mail.",
    "general",
    {
      category: "PADRÃO BP",
      sortOrder: 283,
      isRequired: true,
      legalReviewNote:
        "Texto ampliado conforme `contrato_honorarios_template_1.md` (antes só citava e-mail; o padrão real inclui também cartório de Títulos e Documentos e carta registrada como formas válidas de notificação).",
    },
  ),
  clause(
    "general_mudanca_endereco",
    "Mudança de Endereço",
    "A mudança de endereço ou de qualquer das informações indicadas no preâmbulo deve ser prontamente comunicada por escrito às demais Partes, conforme aqui previsto; se dita comunicação deixar de ser realizada, qualquer aviso ou comunicação entregue às Partes ou nos endereços acima indicados será considerada como tendo sido regularmente feita e recebida.",
    "general",
    {
      category: "PADRÃO BP",
      sortOrder: 289,
      isRequired: true,
      legalReviewNote: "Nova cláusula, extraída literalmente do padrão `contrato_honorarios_template_1.md`.",
    },
  ),
  clause(
    "general_vinculacao_partes",
    "Vinculação das Partes",
    "Obrigam-se as Partes, por si, seus herdeiros, sucessores e cessionários autorizados, a qualquer título, a todo o tempo, visto que o fazem em caráter irrevogável e irretratável, não havendo em nenhuma hipótese condição de arrependimento.",
    "general",
    {
      category: "PADRÃO BP — OPCIONAL",
      sortOrder: 284,
      isRequired: false,
      legalReviewNote:
        "Confirmado literalmente em 7 contratos reais de 4 áreas, mas diz basicamente a mesma coisa que 'Irrevogabilidade' (mesmo conceito, texto diferente) — os 2 juntos no mesmo contrato pareciam cláusula duplicada. Deixou de ser automática; disponível para seleção manual quando o time quiser reforçar o ponto.",
    },
  ),
  clause(
    "general_legislacao_aplicavel",
    "Legislação Aplicável",
    "Este Contrato será regido e interpretado de acordo com as Leis da República Federativa do Brasil.",
    "general",
    {
      category: "PADRÃO BP",
      sortOrder: 285,
      isRequired: true,
      legalReviewNote:
        "Confirmado literalmente em 7 contratos reais de 4 áreas — alta confiança.",
    },
  ),
  clause(
    "general_responsabilidade_isencao",
    "Responsabilidade",
    "A Contratada ficará isenta de qualquer responsabilidade em caso de não fornecimento de subsídios adequados para o respectivo ato, bem como em caso de encaminhamento de documento ou prestação de informações falsas, alteradas, ou de qualquer forma insuficientes a efetiva execução dos Serviços, tal como em caso de atraso ou falta de pagamento de despesas procedimentais.",
    "general",
    {
      category: "PADRÃO BP",
      sortOrder: 286,
      isRequired: true,
      legalReviewNote:
        "Confirmado literalmente em 7 contratos reais de 4 áreas — alta confiança. Nota: pelo menos 1 contrato real (Reestruturação, Le Blog) substitui a limitação de responsabilidade da Contratada por responsabilidade ampla por dolo/culpa comprovados, sem teto — variação negociada caso a caso, não capturada aqui.",
    },
  ),
  clause(
    "general_utilizacao_marca",
    "Utilização de Marca",
    "[A_CONTRATANTE] autoriza expressamente que a Contratada utilize a sua marca em seus materiais de divulgação comercial.",
    "general",
    {
      category: "PADRÃO BP",
      sortOrder: 287,
      isRequired: false,
      placeholders: ["[A_CONTRATANTE]"],
      legalReviewNote:
        "Confirmado literalmente em 7 contratos reais de 4 áreas, inclusive para cliente pessoa física — marcada como não obrigatória por ser cláusula de marketing/divulgação, opt-out razoável conforme o cliente.",
    },
  ),
  clause(
    "general_assinaturas_titulo_executivo",
    "Assinaturas",
    "As Partes, devidamente qualificadas no preâmbulo, reconhecem que este Contrato tem plena validade em formato físico ou eletrônico, dispensando-se a assinatura de testemunhas nos moldes do art. 24 do Estatuto da Advocacia (Lei n. 8.906/94) e do art. 784, § 4º, do Código de Processo Civil, constituindo, portanto, título executivo extrajudicial.",
    "general",
    {
      category: "PADRÃO BP",
      sortOrder: 288,
      isRequired: true,
      legalReviewNote:
        "Confirmado literalmente em 7 contratos reais de 4 áreas — fundamenta a assinatura eletrônica sem testemunhas usada no fluxo D4Sign. Alta confiança.",
    },
  ),
  clause(
    "sucumbencia_trabalhista",
    "Honorários de Sucumbência",
    "Eventuais honorários de sucumbência serão de titularidade da Contratada a partir do início da condução dos serviços jurídicos nos processos objeto do presente escopo contratual e pertencerão à Contratada, sem exclusão dos que ora são pactuados no presente Contrato, de conformidade com os arts. 23 da Lei nº 8.906/94 e 35, § 1º, do Código de Ética e Disciplina da Ordem dos Advogados do Brasil. Caso se aplique, serão preservados os direitos aos honorários sucumbenciais titularizados por patronos anteriores, na proporção de sua atuação, nos termos dos arts. 22 e seguintes do Estatuto de Ética da OAB.",
    "special",
    {
      category: "TRABALHISTA — OPCIONAL",
      sortOrder: 300,
      isRequired: false,
      legalReviewNote:
        "Cláusula real (modelo Mensal Full), ausente dos 2 contratos assinados de contencioso/full service revisados — não entra automaticamente em nenhum perfil; disponível para seleção manual no builder quando fizer sentido (contencioso com sucumbência recíproca).",
    },
  ),
  clause(
    "compensacao_valores_trabalhista",
    "Compensação",
    "Fica autorizada a compensação de valores devidos à Contratante, que sejam levantados ou recebidos pela Contratada, nos termos dos arts. 664 do Código Civil e art. 35, § 2º do Código de Ética e Disciplina da Ordem dos Advogados do Brasil, caso configurada a inadimplência referente aos valores de honorários advocatícios pactuados no presente Contrato, bem como de despesas inerentes à prestação do serviço contratado.",
    "special",
    {
      category: "TRABALHISTA — OPCIONAL",
      sortOrder: 301,
      isRequired: false,
      legalReviewNote:
        "Cláusula real (modelo Mensal Full), ausente dos 2 contratos assinados revisados — disponível para seleção manual no builder. Nota: em outra área (Reestruturação), o mesmo tipo de cláusula apareceu em 2 versões bem diferentes (ampla vs. restrita a créditos líquidos/certos/incontroversos) — negociação caso a caso, texto aqui é só o ponto de partida.",
    },
  ),
  clause(
    "sla_indicadores_desempenho_trabalhista",
    "Indicadores de Desempenho e Eficiência",
    "A Contratante poderá monitorar e mensurar a eficiência operacional dos serviços jurídicos prestados pela Contratada, mediante solicitação periódica de relatório de desempenho, contendo indicadores relacionados ao cumprimento de prazos processuais, tempestividade de respostas às demandas da Contratante, observância dos níveis de serviço acordados (SLA), qualidade dos reportes, atualização do sistema de gestão processual e demais métricas operacionais aplicáveis. Os indicadores mínimos incluem: (i) resposta a consultas jurídicas em até 5 (cinco) dias úteis, salvo situações de maior complexidade devidamente justificadas; (ii) encaminhamento de minutas de defesas sujeitas à validação prévia da Contratante com antecedência mínima de 2 (dois) dias úteis em relação ao prazo processual, ressalvadas urgências; (iii) cadastramento e atualização das informações processuais no sistema de gestão em até 2 (dois) dias úteis do evento relevante; (iv) encaminhamento de relatórios gerenciais nos formatos e periodicidade definidos pela Contratante. O desempenho da Contratada será aferido exclusivamente com base nesses indicadores operacionais e de qualidade, não sendo utilizados como critério de avaliação índices de êxito processual, condenações, acordos, improcedências ou quaisquer resultados processuais que dependam de fatores externos à atuação da Contratada.",
    "special",
    {
      category: "TRABALHISTA — OPCIONAL",
      sortOrder: 302,
      isRequired: false,
      legalReviewNote:
        "Bloco de SLA/KPI confirmado literalmente em contrato real de Full Service de grande conta (Pague Menos), ausente dos demais documentos — típico de contas grandes com carteira de processos. Disponível para seleção manual, não obrigatório. Fora de escopo desta leva: modelar os indicadores como dados estruturados (hoje é só texto de cláusula).",
    },
  ),
  clause(
    "object_civel_um_processo",
    "Objeto — Contencioso Cível (1 processo)",
    "O presente Contrato tem por objeto a prestação de serviços advocatícios na área Cível, abrangendo a condução e representação [DA_CONTRATANTE] nos autos da ação nº [NUMERO_PROCESSO_CIVEL], em trâmite perante [VARA_TRIBUNAL_CIVEL].",
    "object",
    {
      category: "CÍVEL",
      sortOrder: 8,
      placeholders: ["[DA_CONTRATANTE]", "[NUMERO_PROCESSO_CIVEL]", "[VARA_TRIBUNAL_CIVEL]"],
      legalReviewNote:
        "Derivado do mesmo contrato real usado em '+1 processo' (ação de cobrança), removendo a frase de escalonamento ('limita a 1 processo ativo, com faturamento adicional por novos processos') — adaptação conservadora do mesmo texto-fonte, não texto novo inventado.",
    },
  ),
  clause(
    "nature_civel_um_processo",
    "Natureza — Contencioso Cível",
    "O presente Contrato possui natureza de prestação de serviços com escopo determinado e prazo estimado para execução, não sendo admitida sua rescisão imotivada por qualquer das Partes após o início da execução dos trabalhos.",
    "nature",
    { category: "CÍVEL", sortOrder: 9 },
  ),
  clause(
    "object_civel_mais_um_processo",
    "Objeto — Contencioso Cível (+1 processo)",
    "O presente Contrato tem por objeto a prestação de serviços advocatícios na área Cível, abrangendo a condução e representação [DA_CONTRATANTE] nos autos da ação nº [NUMERO_PROCESSO_CIVEL], em trâmite perante [VARA_TRIBUNAL_CIVEL]. O Contrato limita a atuação a 1 (um) processo ativo, com faturamento adicional por novos processos.",
    "object",
    {
      category: "CÍVEL",
      sortOrder: 10,
      placeholders: ["[DA_CONTRATANTE]", "[NUMERO_PROCESSO_CIVEL]", "[VARA_TRIBUNAL_CIVEL]"],
      legalReviewNote:
        "Extraído de contrato real (ação de cobrança, confirmado pelo usuário como exemplo do subtipo '+1 processo' — a atuação começa em 1 processo ativo com faturamento adicional por novos processos, diferente do subtipo 'um_processo' isolado, que ainda não tem exemplo). Objeto real não nomeia parte contrária nem valor da causa.",
    },
  ),
  clause(
    "nature_civel_mais_um_processo",
    "Natureza — Contencioso Cível",
    "O presente Contrato possui natureza de prestação de serviços com escopo determinado e prazo estimado para execução, não sendo admitida sua rescisão imotivada por qualquer das Partes após o início da execução dos trabalhos.",
    "nature",
    { category: "CÍVEL", sortOrder: 11 },
  ),
  clause(
    "sucumbencia_civel",
    "Honorários de Sucumbência",
    "Os honorários de sucumbência serão de titularidade da Contratada a partir do início da condução dos serviços jurídicos nos processos objeto do presente escopo contratual e pertencerão à Contratada, sem exclusão dos que ora são pactuados no presente Contrato, de conformidade com os arts. 23 da Lei nº 8.906/94 e 35, § 1º, do Código de Ética e Disciplina da Ordem dos Advogados do Brasil. Caso se aplique, serão preservados os direitos aos honorários sucumbenciais titularizados por patronos anteriores, na proporção de sua atuação, nos termos dos arts. 22 e seguintes do Estatuto de Ética da OAB.",
    "special",
    {
      category: "CÍVEL — OPCIONAL",
      sortOrder: 310,
      isRequired: false,
      legalReviewNote: "Confirmado literalmente em contrato real (ação de cobrança) — disponível para seleção manual.",
    },
  ),
  clause(
    "compensacao_valores_civel",
    "Compensação",
    "Fica autorizada a compensação de valores devidos à Contratante, que sejam levantados ou recebidos pela Contratada, nos termos dos arts. 664 do Código Civil e art. 35, § 2º do Código de Ética e Disciplina da Ordem dos Advogados do Brasil, caso configurada a inadimplência referente aos valores de honorários advocatícios pactuados no presente Contrato, bem como de despesas inerentes à prestação do serviço contratado.",
    "special",
    {
      category: "CÍVEL — OPCIONAL",
      sortOrder: 311,
      isRequired: false,
      legalReviewNote: "Confirmado literalmente em contrato real (ação de cobrança) — disponível para seleção manual.",
    },
  ),
  clause(
    "object_reestruturacao_negociacoes",
    "Objeto — Negociações Estratégicas (Reestruturação)",
    "O presente Contrato tem por objeto a análise, pela Contratada, de toda a documentação necessária para a definição da melhor estratégia a ser adotada para a reestruturação financeira [DA_CONTRATANTE], considerando inclusive a possibilidade de recuperação extrajudicial ou judicial, incluindo preparação, ajuizamento e representação em medida cautelar, mediação com credores, recuperação judicial ou extrajudicial e demais medidas necessárias.",
    "object",
    { category: "REESTRUTURAÇÃO", sortOrder: 10 },
  ),
  clause(
    "scope_reestruturacao_negociacoes",
    "Escopo — Negociações Estratégicas (Reestruturação)",
    "Compreende interação com sócios/executivos e representantes da Contratante, participação em reuniões com credores e investidores, preparação de minutas e representação em juízo e perante o Administrador Judicial, e acompanhamento de todos os processos, recursos e incidentes até o trânsito em julgado.",
    "scope",
    { category: "REESTRUTURAÇÃO", sortOrder: 11 },
  ),
  clause(
    "exclusion_reestruturacao_consultoria_correlata",
    "Exclusão — consultoria correlata (Reestruturação)",
    "Dentre as matérias não relacionadas aos Serviços, o presente Contrato também não abrange: consultoria em direito tributário, societário ou regulatório; elaboração de pareceres técnicos; e realização de sustentação oral nos Tribunais Regionais do Trabalho e Tribunal Superior do Trabalho, salvo contratação expressa.",
    "exclusion",
    {
      category: "REESTRUTURAÇÃO",
      sortOrder: 12,
      legalReviewNote:
        "Confirmado em 2 contratos reais. A menção a TRT/TST é textualmente estranha a um contrato de Reestruturação (parece herança de template trabalhista) — mantida por fidelidade à prática real; REQUIRES LEGAL DECISION se deve ser removida.",
    },
  ),
  clause(
    "object_societario_diagnostico",
    "Objeto — Diagnóstico, Estruturação e Proteção Patrimonial",
    "O Contrato tem por objeto a prestação de serviços advocatícios especializados em 5 etapas: Diagnóstico dos Contratos Sociais e atos constitutivos; Estruturação dos Cenários de reorganização societária; Validação Tributária/Contábil dos cenários; Parecer Jurídico Conclusivo com recomendação técnica; e Elaboração da Estrutura Jurídica (redação dos instrumentos societários pertinentes). O resultado é a entrega do relatório diagnóstico, parecer comparativo e minutas finais dos instrumentos, prontas para registro.",
    "object",
    {
      category: "SOCIETÁRIO",
      sortOrder: 10,
      legalReviewNote:
        "Mapeamento de subtipo (diagnostico_estruturacao_e_protecao_patrimonial vs. planejamento_sucessorio_e_societario) confirmado com o time do CRM — ver nota completa em object-catalog.ts.",
    },
  ),
  clause(
    "object_societario_contratual",
    "Objeto — Consultivo, Revisão e Elaboração de Contratos",
    "Consultoria jurídica mensal com limitação de até [QTD_HORAS_SOCIETARIO] (por extenso) horas técnicas mensais, envolvendo a elaboração, revisão e negociação de contratos empresariais relacionados à atividade [DA_CONTRATANTE], tais como contratos de prestação de serviços, fornecimento e manutenção de equipamentos, acordos de confidencialidade (NDA), termos de parceria, representação, comodato, atas societárias, contrato social, acordo de sócios, entre outros. Compreende ainda a análise de riscos contratuais, com apresentação de sugestões de ajustes e medidas de mitigação, e a criação e revisão de modelos contratuais padronizados para uso interno. Horas excedentes ao limite mensal serão cobradas ao valor de [VALOR_EXCEDENTE_SOCIETARIO] por hora.",
    "object",
    {
      category: "SOCIETÁRIO",
      sortOrder: 20,
      placeholders: ["[DA_CONTRATANTE]", "[QTD_HORAS_SOCIETARIO]", "[VALOR_EXCEDENTE_SOCIETARIO]"],
      legalReviewNote:
        "Extraído literalmente do padrão `contrato_honorarios_template_1.md` (subtipo real do catálogo: consultivo_revisao_e_elaboracao_de_contratos).",
    },
  ),
  clause(
    "limitation_societario_contratual",
    "Limitações — Consultivo, Revisão e Elaboração de Contratos",
    "Não está incluso na proposta atos societários complexos, assim considerados aqueles que envolvam fusão, incorporação, cisão, compra e venda de empresas, joint venture, entre outros. Nesses casos, será necessária contratação específica.",
    "limitation",
    { category: "SOCIETÁRIO", sortOrder: 21 },
  ),
  clause(
    "payment_boleto",
    "Forma de pagamento — boleto",
    "O pagamento será realizado via boleto bancário, a ser enviado com no mínimo 5 (cinco) dias de antecedência ao e-mail indicado pela Contratante. O não recebimento do boleto não exime a obrigação de pagamento na data pactuada.",
    "special",
    { category: "PAGAMENTO", sortOrder: 180 },
  ),
  clause(
    "payment_conta",
    "Forma de pagamento — transferência",
    "O pagamento deverá ser efetuado na conta bancária institucional da Contratada: Banco [BANCO], Agência [AGENCIA], Conta [CONTA], titular [TITULAR], CNPJ [CNPJ_FIRMA].",
    "special",
    {
      category: "PAGAMENTO",
      sortOrder: 181,
      placeholders: ["[BANCO]", "[AGENCIA]", "[CONTA]", "[TITULAR]", "[CNPJ_FIRMA]"],
    },
  ),
  clause(
    "payment_pix",
    "Forma de pagamento — PIX",
    "O pagamento poderá ser realizado via PIX para a chave institucional [PIX_FIRMA].",
    "special",
    { category: "PAGAMENTO", sortOrder: 182, placeholders: ["[PIX_FIRMA]"] },
  ),
];

const byKey = new Map(CONTRACT_CLAUSE_CATALOG.map((c) => [c.stableKey, c]));

export function getClauseTemplate(stableKey: string): ContractClauseTemplate | undefined {
  return byKey.get(stableKey);
}

export function listRequiredStandardClauses(): ContractClauseTemplate[] {
  return CONTRACT_CLAUSE_CATALOG.filter((c) => c.isRequired);
}
