import type {
  ClauseCatalogStatus,
  ContractObjectBlockKind,
  ContractObjectListStyle,
} from "./types";

const LEGAL =
  "REQUIRES LEGAL DECISION — texto extraído dos modelos/contratos reais para revisão da equipe Societário. Não é cláusula oficial BP.";

export type ContractObjectTemplate = {
  stableKey: string;
  title: string;
  kind: ContractObjectBlockKind;
  content: string;
  intro?: string;
  items?: string[];
  listStyle?: ContractObjectListStyle;
  requiredPlaceholders: string[];
  optionalPlaceholders: string[];
  version: number;
  status: ClauseCatalogStatus;
  legalReviewNote: string;
  order: number;
};

function objectTemplate(
  stableKey: string,
  title: string,
  kind: ContractObjectBlockKind,
  content: string,
  extra: Partial<ContractObjectTemplate> = {},
): ContractObjectTemplate {
  return {
    stableKey,
    title,
    kind,
    content,
    requiredPlaceholders: extra.requiredPlaceholders ?? [],
    optionalPlaceholders: extra.optionalPlaceholders ?? [],
    version: extra.version ?? 1,
    status: extra.status ?? "pending_legal_review",
    legalReviewNote: extra.legalReviewNote ?? LEGAL,
    order: extra.order ?? 0,
    intro: extra.intro,
    items: extra.items,
    listStyle: extra.listStyle,
  };
}

/**
 * Catálogo de redação do Objeto. Stable keys versionadas.
 * Textos jurídicos = pending_legal_review até validação humana.
 */
export const CONTRACT_OBJECT_CATALOG: ContractObjectTemplate[] = [
  objectTemplate(
    "object.trabalhista.contencioso.single_case",
    "Objeto",
    "paragraph",
    "O objeto deste Contrato é a prestação de serviços advocatícios na área trabalhista, consistindo na defesa dos interesses [DA_CONTRATANTE] nos autos da reclamação trabalhista nº [NUMERO_PROCESSO], movida por [PARTE_CONTRARIA], em trâmite perante [VARA_TRIBUNAL][VALOR_CAUSA_CLAUSE].",
    {
      requiredPlaceholders: ["NUMERO_PROCESSO", "PARTE_CONTRARIA", "VARA_TRIBUNAL"],
      optionalPlaceholders: ["VALOR_CAUSA", "VALOR_CAUSA_CLAUSE"],
      order: 10,
    },
  ),
  objectTemplate(
    "object.trabalhista.auditoria",
    "Objeto",
    "paragraph",
    "O objeto do presente Contrato é a prestação de serviços advocatícios na área trabalhista, que consiste na realização de Auditoria Trabalhista, com o objetivo de identificar, mapear e mensurar riscos trabalhistas evidentes e ocultos, bem como oferecer recomendações estratégicas para mitigação de contingências jurídicas, financeiras e reputacionais.",
    { order: 30 },
  ),
  objectTemplate(
    "object.trabalhista.auditoria.scope",
    "Escopo",
    "paragraph",
    "A Auditoria Trabalhista será conduzida por meio de análise documental, entrevistas estruturadas, visita técnica in loco e elaboração de pareceres jurídicos e relatório executivo, seguindo metodologia baseada em programas de compliance trabalhista.",
    { order: 31 },
  ),
  objectTemplate(
    "object.trabalhista.canal_denuncias",
    "Objeto",
    "paragraph",
    "O objeto do presente Contrato consiste na disponibilização e operacionalização de plataforma de canal de denúncias pela Contratada, a ser disponibilizada [PELA_CONTRATANTE] aos seus colaboradores, por meio de link de acesso, destinada ao recebimento de relatos e denúncias relacionadas a condutas inadequadas no ambiente de trabalho.",
    { order: 40 },
  ),
  objectTemplate(
    "object.trabalhista.canal_denuncias.scope",
    "Escopo",
    "paragraph",
    "Os serviços compreendem: recebimento das denúncias; análise inicial e triagem; classificação e organização dos relatos; encaminhamento estruturado [A_CONTRATANTE]; registro e controle para acompanhamento.",
    { order: 41 },
  ),
  objectTemplate(
    "object.trabalhista.canal_denuncias.limitation",
    "Limites",
    "limitation",
    "A atuação da Contratada limita-se ao gerenciamento, análise preliminar e encaminhamento das denúncias, não sendo de sua responsabilidade a investigação dos fatos, a adoção de medidas disciplinares, a condução de apurações formais, a tomada de decisões ou a implementação de plano de ação.",
    { order: 42 },
  ),
  objectTemplate(
    "object.trabalhista.canal_denuncias.nature",
    "Natureza",
    "paragraph",
    "O serviço prestado possui natureza estritamente administrativa e organizacional, consistindo no apoio à gestão e controle das informações recebidas, não se configurando como atividade investigativa, jurídica, decisória ou executiva.",
    { order: 43 },
  ),
  objectTemplate(
    "object.trabalhista.diagnostico_nr1",
    "Objeto",
    "paragraph",
    "O objeto do presente Contrato consiste na prestação de serviços voltados à identificação e mapeamento de fatores de riscos psicossociais relacionados ao trabalho, com enfoque nas diretrizes da NR-1.",
    { order: 50 },
  ),
  objectTemplate(
    "object.trabalhista.diagnostico_nr1.scope",
    "Escopo",
    "paragraph",
    "Os serviços incluem diagnóstico organizacional por meio de: aplicação de questionário organizacional (HSE-IT); análise e validação dos resultados; entrega do relatório conclusivo para integração ao GRO e ao PGR da empresa.",
    { order: 51 },
  ),
  objectTemplate(
    "object.trabalhista.diagnostico_nr1.limitation",
    "Limites",
    "limitation",
    "A implementação das medidas e planos de ação decorrentes do diagnóstico, além da consultoria jurídica de questões do dia a dia, não está incluída e poderá ser objeto de contratação complementar.",
    { order: 52 },
  ),
  objectTemplate(
    "object.trabalhista.full_service.general",
    "Objeto",
    "paragraph",
    "O objeto deste Contrato é a prestação mensal de serviços advocatícios na área trabalhista, em regime de full service, [A_CONTRATANTE] e demais empresas por ela indicadas, incluindo filiais, unidades e estabelecimentos atualmente existentes, bem como aqueles que venham a ser constituídos, adquiridos, incorporados ou integrados durante a vigência deste Contrato, compreendendo os subescopos abaixo.",
    {
      requiredPlaceholders: [],
      optionalPlaceholders: [],
      order: 5,
      legalReviewNote:
        "Enriquecido com base em contrato real de Full Service Trabalhista (conta com grupo econômico): o objeto real estende expressamente a cobertura a empresas do grupo, filiais e aquisições futuras. REQUIRES LEGAL DECISION: confirmar se essa extensão deve ser padrão em todo Full Service ou só quando há grupo econômico evidenciado.",
    },
  ),
  objectTemplate(
    "object.trabalhista.full_service.paragraph_unique",
    "Parágrafo único",
    "paragraph_unique",
    "As empresas, filiais, unidades ou estabelecimentos que passarem a integrar a Contratante e/ou o grupo econômico ao qual pertence após a assinatura deste Contrato serão automaticamente abrangidos pelos serviços ora contratados, sem necessidade de aditamento contratual, observadas as demais condições estabelecidas neste instrumento.",
    {
      order: 90,
      legalReviewNote:
        "Corrigido a partir de contrato real de Full Service Trabalhista assinado: o parágrafo único trata da extensão automática a empresas do grupo, não de limites quantitativos/faturamento excedente (esse conteúdo foi movido para dentro dos subescopos de Contencioso/Consultivo, onde de fato aparece nos documentos reais — ver 'limitada a [N] ações'/'limitada a [N] horas mensais').",
    },
  ),
  objectTemplate(
    "object.trabalhista.contencioso.subscope",
    "Contencioso Trabalhista",
    "subscope",
    "Defesa dos interesses [DA_CONTRATANTE] nas demandas de natureza trabalhista já ajuizadas e nas que ainda vierem a ser ajuizadas[QTD_ACOES_CLAUSE], compreendendo: realização de audiências, elaboração de defesas, recursos e demais peças processuais perante a 1ª e 2ª instâncias e Tribunais Superiores; defesa em autos de infração e respectivos desdobramentos administrativos e judiciais; elaboração de relatórios processuais; acompanhamento e mediação junto aos órgãos trabalhistas, inclusive termos de ajustamento de conduta (TAC); identificação de oportunidades de acordo; condução de negociações coletivas e participação em mesas de composição e entendimento.",
    {
      requiredPlaceholders: ["VALOR_EXCEDENTE_TRABALHISTA_CONTENCIOSO"],
      optionalPlaceholders: ["QTD_ACOES", "QTD_ACOES_CLAUSE"],
      order: 11,
      legalReviewNote:
        "Reescrito a partir de contrato real de Full Service Trabalhista assinado (não é mais o mesmo texto do caso único — full service cobre uma carteira de processos, não 1 processo identificado por número/parte/vara, então esses 3 campos deixaram de ser exigidos aqui). Lista de atividades e o limite quantitativo ('limitada a N ações') vêm literalmente do contrato real. Valor do processo excedente passou a ser obrigatório (padrão do `contrato_honorarios_template_1.md`) — embutido no texto via QTD_ACOES_CLAUSE, não como token solto.",
    },
  ),
  objectTemplate(
    "object.trabalhista.consultivo",
    "Consultivo Trabalhista",
    "paragraph",
    "O objeto do presente Contrato inclui atuação consultiva trabalhista para gestão e prevenção de riscos ao patrimônio e ao fluxo de caixa [DA_CONTRATANTE], observada a carga horária mensal definida nas condições comerciais. Compreende emissão de pareceres, orientações e consultas jurídicas relacionadas à legislação trabalhista e às atividades desenvolvidas [PELA_CONTRATANTE]. A atuação consultiva compreende a elaboração de pareceres e estratégias jurídicas preventivas e eficientes, com foco na gestão organizacional e na solução extrajudicial, a fim de mitigar riscos e evitar demandas trabalhistas, incluindo exame e revisão da integridade, confiabilidade e cumprimento da legislação, políticas internas, normas coletivas, contratos trabalhistas e demais regulamentos relacionados aos sistemas de trabalho implementados [PELA_CONTRATANTE], com o objetivo de identificar potenciais riscos trabalhistas antes que se materializem em demandas judiciais e/ou administrativas.",
    {
      order: 20,
      legalReviewNote:
        "Enriquecido com os parágrafos adicionais sobre a natureza da atuação preventiva, presentes literalmente no modelo real 'Mensal Full' do escritório.",
    },
  ),
  objectTemplate(
    "object.trabalhista.consultivo.subscope",
    "Consultivo Trabalhista",
    "subscope",
    "Emissão de pareceres, orientações e consultas jurídicas relacionadas à legislação trabalhista e às atividades desenvolvidas [PELA_CONTRATANTE][QTD_HORAS_TRABALHISTA_CLAUSE]. A atuação consultiva compreende a elaboração de pareceres e estratégias jurídicas preventivas e eficientes, com foco na gestão organizacional e na solução extrajudicial, a fim de mitigar riscos e evitar demandas trabalhistas, incluindo exame e revisão da integridade, confiabilidade e cumprimento da legislação, políticas internas, normas coletivas, contratos trabalhistas e demais regulamentos relacionados aos sistemas de trabalho implementados [PELA_CONTRATANTE].",
    {
      requiredPlaceholders: ["VALOR_EXCEDENTE_TRABALHISTA_CONSULTIVO"],
      optionalPlaceholders: ["QTD_HORAS_TRABALHISTA", "QTD_HORAS_TRABALHISTA_CLAUSE"],
      order: 21,
      legalReviewNote:
        "Enriquecido com os parágrafos do modelo real 'Mensal Full'; ganhou o limite de carga horária mensal ('limitada a N horas mensais') como no documento real. Valor da hora excedente passou a ser obrigatório (padrão do `contrato_honorarios_template_1.md`).",
    },
  ),

  // ── Cível — um_processo ────────────────────────────────────────────────
  objectTemplate(
    "object.civel.um_processo",
    "Objeto",
    "paragraph",
    "O presente Contrato tem por objeto a prestação de serviços advocatícios na área Cível, abrangendo a condução e representação [DA_CONTRATANTE] nos autos da ação nº [NUMERO_PROCESSO_CIVEL], em trâmite perante [VARA_TRIBUNAL_CIVEL].",
    {
      requiredPlaceholders: ["NUMERO_PROCESSO_CIVEL", "VARA_TRIBUNAL_CIVEL"],
      order: 10,
      legalReviewNote:
        "Derivado do mesmo contrato real usado em '+1 processo' (ação de cobrança), removendo a frase de escalonamento ('limita a 1 processo ativo, com faturamento adicional por novos processos') — essa frase é o que caracteriza o subtipo '+1 processo'; 'um_processo' isolado (sem escalonamento) ainda não tem contrato de exemplo próprio, esta é uma adaptação conservadora do mesmo texto-fonte, não um texto novo inventado. Campos com sufixo _CIVEL (não os mesmos do Contencioso Trabalhista): um contrato pode ter as duas áreas ao mesmo tempo, cada uma com seu próprio processo.",
    },
  ),
  objectTemplate(
    "object.civel.um_processo.nature",
    "Natureza",
    "paragraph",
    "O presente Contrato possui natureza de prestação de serviços com escopo determinado e prazo estimado para execução, não sendo admitida sua rescisão imotivada por qualquer das Partes após o início da execução dos trabalhos.",
    {
      order: 11,
      legalReviewNote:
        "Mesmo texto do subtipo '+1 processo' (bloco compartilhado do documento-fonte, não específico do número de processos).",
    },
  ),
  objectTemplate(
    "object.civel.mais_um_processo",
    "Objeto",
    "paragraph",
    "O presente Contrato tem por objeto a prestação de serviços advocatícios na área Cível, abrangendo a condução e representação [DA_CONTRATANTE] nos autos da ação nº [NUMERO_PROCESSO_CIVEL], em trâmite perante [VARA_TRIBUNAL_CIVEL]. O Contrato limita a atuação a 1 (um) processo ativo, com faturamento adicional por novos processos.",
    {
      requiredPlaceholders: ["NUMERO_PROCESSO_CIVEL", "VARA_TRIBUNAL_CIVEL"],
      order: 10,
      legalReviewNote:
        "Extraído de contrato real (ação de cobrança, confirmado pelo usuário como exemplo do subtipo '+1 processo' — atuação começa em 1 processo ativo com faturamento adicional por novos processos; 'um_processo' isolado ainda não tem exemplo). Diferente do padrão trabalhista, o objeto real não nomeia parte contrária nem valor da causa — mantido fiel ao documento-fonte, sem inventar esses campos. Campos com sufixo _CIVEL: um contrato pode ter Trabalhista + Cível ao mesmo tempo, cada um com seu próprio processo — chaves iguais faziam um valor sobrescrever o outro.",
    },
  ),
  objectTemplate(
    "object.civel.mais_um_processo.nature",
    "Natureza",
    "paragraph",
    "O presente Contrato possui natureza de prestação de serviços com escopo determinado e prazo estimado para execução, não sendo admitida sua rescisão imotivada por qualquer das Partes após o início da execução dos trabalhos.",
    {
      order: 11,
      legalReviewNote:
        "Extraído literalmente de contrato real. O mesmo documento também declara 'Prazo: indeterminado' na cláusula de vigência — tensão textual entre as duas cláusulas não resolvida no documento-fonte, reportada como está.",
    },
  ),

  // ── Reestruturação e Insolvência — negociacoes_estrategicas ────────────
  objectTemplate(
    "object.reestruturacao.negociacoes_estrategicas",
    "Objeto",
    "paragraph",
    "O presente Contrato tem por objeto a análise, pela Contratada, de toda a documentação necessária para a definição da melhor estratégia a ser adotada para a reestruturação financeira [DA_CONTRATANTE], de modo a auxiliá-la na reestruturação da sua dívida, considerando inclusive a possibilidade de recuperação extrajudicial ou judicial. A Contratada se compromete a representar [A_CONTRATANTE] em toda e qualquer medida que integre a estratégia definida, tais como, mas não se limitando a: preparação, ajuizamento e representação em pedido de natureza cautelar, na forma da Lei nº 11.101/05; participação em sessões de mediação com credores previamente selecionados; ajuizamento e representação em eventual pedido de recuperação judicial ou extrajudicial, incluindo a análise de todos os documentos necessários à preparação do pedido, a representação nos autos principais e nas habilitações e impugnações de crédito, minutas e negociação de Plano de Recuperação Judicial ou Extrajudicial, orientações relacionadas ao Direito Recuperacional nas negociações com os principais credores concursais e extraconcursais, orientação nas teses jurídicas para definição do Quadro-Geral de Credores, venda de ativos, reestruturação societária, negociação de Plano de Recuperação Judicial, renegociação com credores extraconcursais e outras medidas que vierem a ser necessárias.",
    {
      order: 10,
      legalReviewNote:
        "Texto quase idêntico confirmado em 2 contratos reais (grupos econômicos distintos) — alta confiança na redação-base.",
    },
  ),
  objectTemplate(
    "object.reestruturacao.negociacoes_estrategicas.scope",
    "Escopo",
    "paragraph",
    "Independentemente da alternativa adotada, a Contratada se compromete, ainda, a: interagir com os sócios e eventuais executivos das empresas [DA_CONTRATANTE] na definição das estratégias em preparação a eventual pedido de recuperação judicial ou extrajudicial; interagir com os representantes [DA_CONTRATANTE] e demais profissionais que lhe prestam serviços, estando à disposição para reuniões presenciais, virtuais ou conference calls; participar de reuniões com representantes de credores e investidores, sempre que necessário; preparar todas as minutas necessárias e representar [A_CONTRATANTE] nos autos dos respectivos processos de recuperação (incluindo medida cautelar), inclusive em despachos com magistrados e membros do Ministério Público, em interações com o Administrador Judicial e em assembleias-gerais de credores e sessões de julgamento; manter rotina de acompanhamento de todos os processos, recursos e incidentes, reportando [A_CONTRATANTE] sempre que solicitado, até o trânsito em julgado das decisões respectivas. Não fará parte do escopo de atuação da Contratada a atuação e representação [DA_CONTRATANTE] em outras demandas de qualquer natureza.",
    {
      order: 11,
      legalReviewNote: "Texto idêntico confirmado em 2 contratos reais — alta confiança.",
    },
  ),
  objectTemplate(
    "object.reestruturacao.negociacoes_estrategicas.exclusoes",
    "Atos Jurídicos Excluídos do Objeto",
    "paragraph",
    "Dentre as matérias não relacionadas aos Serviços, o presente Contrato também não abrange: consultoria em direito tributário, societário ou regulatório; elaboração de pareceres técnicos; e realização de sustentação oral nos Tribunais Regionais do Trabalho e Tribunal Superior do Trabalho — salvo, em qualquer caso, contratação expressa.",
    {
      order: 30,
      legalReviewNote:
        "Confirmado em 2 contratos reais. A menção a sustentação oral em TRT/TST é textualmente estranha a um contrato de Reestruturação (parece herança de template trabalhista), mas aparece de forma consistente nos 2 documentos assinados — mantida por fidelidade à prática real do escritório; REQUIRES LEGAL DECISION se deve ser removida por ser irrelevante à área.",
    },
  ),
  objectTemplate(
    "object.reestruturacao.negociacoes_estrategicas.sucumbencia",
    "Honorários de Sucumbência",
    "paragraph",
    "Eventuais honorários de sucumbência serão de titularidade da Contratada a partir do início da condução dos serviços jurídicos nos processos objeto do presente escopo contratual e pertencerão à Contratada, sem exclusão dos que ora são pactuados no presente Contrato, de conformidade com os arts. 23 da Lei nº 8.906/94 e 35, § 1º, do Código de Ética e Disciplina da Ordem dos Advogados do Brasil. Caso se aplique, serão preservados os direitos aos honorários sucumbenciais titularizados por patronos anteriores, na proporção de sua atuação, nos termos dos arts. 22 e seguintes do Estatuto de Ética da OAB.",
    {
      order: 40,
      legalReviewNote: "Confirmado literalmente em 2 contratos reais — presente em 100% da amostra desta área.",
    },
  ),
  objectTemplate(
    "object.reestruturacao.negociacoes_estrategicas.compensacao",
    "Compensação",
    "paragraph",
    "Fica autorizada a compensação de valores devidos [A_CONTRATANTE], que sejam levantados ou recebidos pela Contratada, nos termos dos arts. 664 do Código Civil e art. 35, § 2º do Código de Ética e Disciplina da Ordem dos Advogados do Brasil, caso configurada a inadimplência referente aos valores de honorários advocatícios pactuados no presente Contrato, bem como de despesas inerentes à prestação do serviço contratado.",
    {
      order: 41,
      legalReviewNote:
        "Presente nos 2 contratos reais, mas com redações diferentes entre si (uma ampla, outra restrita a créditos líquidos/certos/incontroversos com notificação prévia de 10 dias úteis) — mantida a versão ampla como default; variação negociada caso a caso via override no builder.",
    },
  ),
  objectTemplate(
    "object.reestruturacao.negociacoes_estrategicas.confidencialidade",
    "Confidencialidade e Informação Privilegiada",
    "paragraph",
    "Todas as informações de caráter privado fornecidas [PELA_CONTRATANTE] e/ou seus prepostos em razão dos serviços contratados serão mantidas em sigilo pela Contratada por prazo indeterminado. Todas as informações e comunicações entre as Partes serão protegidas e tratadas como informação e comunicação privilegiadas entre as Partes para todos os fins legais.",
    {
      order: 42,
      legalReviewNote:
        "Confirmado literalmente em 2 contratos reais — especialmente sensível nesta área pelo risco de vazamento de informação sobre situação de insolvência afetar crédito/reputação do cliente perante credores e mercado.",
    },
  ),
  objectTemplate(
    "object.reestruturacao.negociacoes_estrategicas.solidariedade",
    "Solidariedade",
    "paragraph",
    "Havendo mais de uma empresa contratante, estas são solidariamente responsáveis por todas as obrigações, principais e acessórias, inclusive as obrigações de pagamento de honorários mensais e de êxito, previstas no presente instrumento.",
    {
      order: 43,
      legalReviewNote:
        "Confirmado nos 2 contratos reais, ambos com múltiplas empresas contratantes (grupo econômico) — cláusula condicional por natureza (só relevante quando há mais de uma contratante), mantida como texto padrão pois não há prejuízo em declará-la mesmo com 1 contratante.",
    },
  ),

  // ── Societário e Contratos — diagnostico_estruturacao_e_protecao_patrimonial ──
  objectTemplate(
    "object.societario.diagnostico_estruturacao",
    "Objeto",
    "paragraph",
    "O Contrato tem por objeto a prestação de serviços advocatícios especializados, conforme as seguintes etapas ('Serviços'): Diagnóstico — análise técnica e jurídica dos Contratos Sociais e atos constitutivos atualmente arquivados, com o objetivo de identificar a natureza jurídica, estrutura de capital, forma de administração, responsabilidades e eventuais inconformidades legais, verificando-se também as disposições sobre entrada e saída de sócios, sucessão, distribuição de lucros, governança e poderes de gestão. Estruturação dos Cenários — com base no diagnóstico, avaliação da estrutura societária atual e elaboração de cenários jurídicos possíveis para a reorganização empresarial. Validação Tributária/Contábil — validação da análise tributária e contábil complementar, em colaboração com o contador [DA_CONTRATANTE], para mensurar os impactos financeiros e fiscais de cada cenário. Parecer Conclusivo — elaboração de parecer jurídico conclusivo, contendo o diagnóstico societário, a comparação entre as alternativas de estruturação e a recomendação técnica da forma societária mais adequada. Elaboração da Estrutura Jurídica — redação e adequação dos instrumentos jurídicos pertinentes à estrutura definida (contratos sociais, alterações contratuais, acordos de sócios ou de quotistas e, se necessário, contrato de sociedade em conta de participação). O resultado do Contrato será a entrega de um relatório diagnóstico societário completo, acompanhado do parecer jurídico comparativo e das minutas finais dos instrumentos societários devidamente adequadas e prontas para registro.",
    {
      order: 10,
      legalReviewNote:
        "Extraído literalmente de contrato real (diagnóstico + comparação de estruturas + parecer + redação de instrumentos). Mapeamento de subtipo confirmado com o time do CRM: `diagnostico_estruturacao_e_protecao_patrimonial` (alternativa considerada: `planejamento_sucessorio_e_societario` — o diagnóstico real menciona 'sucessão' como um dos pontos verificados, mas o contrato-fonte não trata de sucessão familiar/patrimonial de forma central). Nenhum dos dois nomes do catálogo descreve com total precisão as 5 etapas sequenciais do objeto real — reavaliar quando houver mais exemplares.",
    },
  ),
  objectTemplate(
    "object.societario.diagnostico_estruturacao.scope",
    "Escopo",
    "paragraph",
    "Os Serviços objeto deste Contrato restringem-se exclusivamente às atividades descritas no Objeto. Qualquer atividade adicional, modificação ou ampliação do escopo originalmente contratado — inclusive assessorias complementares, acompanhamento de execução, implementação ou suporte jurídico decorrente das etapas aqui previstas — dependerá de prévia concordância entre as Partes e será formalizada mediante aditivo contratual específico, no qual serão definidos o novo objeto, honorários correspondentes e prazos aplicáveis.",
    {
      order: 11,
      legalReviewNote: "Confirmado literalmente em contrato real — padrão de 'escopo fechado + aditivo para extras'.",
    },
  ),

  // ── Societário e Contratos — consultivo_revisao_e_elaboracao_de_contratos ──
  objectTemplate(
    "object.societario.consultivo_contratual",
    "Objeto",
    "paragraph",
    "Consultoria jurídica mensal com limitação de até [QTD_HORAS_SOCIETARIO] (por extenso) horas técnicas mensais, envolvendo a elaboração, revisão e negociação de contratos empresariais relacionados à atividade [DA_CONTRATANTE], tais como contratos de prestação de serviços, fornecimento e manutenção de equipamentos, acordos de confidencialidade (NDA), termos de parceria, representação, comodato, atas societárias, contrato social, acordo de sócios, entre outros. Compreende ainda a análise de riscos contratuais, com apresentação de sugestões de ajustes e medidas de mitigação, e a criação e revisão de modelos contratuais padronizados para uso interno. Horas excedentes ao limite mensal serão cobradas ao valor de [VALOR_EXCEDENTE_SOCIETARIO] por hora.",
    {
      requiredPlaceholders: ["QTD_HORAS_SOCIETARIO", "VALOR_EXCEDENTE_SOCIETARIO"],
      order: 10,
      legalReviewNote:
        "Extraído literalmente do padrão `contrato_honorarios_template_1.md` (subtipo 'Consultivo - Revisão e Elaboração de Contratos'). Diferente dos demais perfis Full Service, aqui a carga horária e o valor excedente são centrais à própria frase do objeto — por isso viraram placeholders obrigatórios diretos, não uma cláusula opcional apensada.",
    },
  ),
  objectTemplate(
    "object.societario.consultivo_contratual.limitation",
    "Limitações",
    "limitation",
    "Não está incluso na proposta atos societários complexos, assim considerados aqueles que envolvam fusão, incorporação, cisão, compra e venda de empresas, joint venture, entre outros. Nesses casos, será necessária contratação específica.",
    {
      order: 11,
      legalReviewNote: "Confirmado literalmente no padrão `contrato_honorarios_template_1.md`.",
    },
  ),
];

const byKey = new Map(CONTRACT_OBJECT_CATALOG.map((t) => [t.stableKey, t]));

export function getObjectTemplate(stableKey: string): ContractObjectTemplate | undefined {
  return byKey.get(stableKey);
}
