/**
 * Modelos das mensagens de WhatsApp do CRM. O padrão fica aqui; o admin pode sobrescrever o texto e
 * ligar/desligar cada modelo em Integrações → WhatsApp (tabela `whatsapp_message_templates`).
 *
 * Placeholders `{{nome}}`. Linha cujos placeholders ficaram todos vazios some (ex.: "*Respondido por:* {{x}}"
 * sem nome), e linhas em branco seguidas viram uma só — o modelo não precisa prever cada ausência.
 */

export const WHATSAPP_TEMPLATE_KEYS = [
  "novo_lead_due",
  "due_levantamento_concluido",
  "due_revisao_inicio",
  "due_revisao_aprovada",
  "due_revisao_ajustes",
  "proposta_escopo_pedido",
] as const;

export type WhatsappTemplateKey = (typeof WHATSAPP_TEMPLATE_KEYS)[number];

export type WhatsappTemplatePlaceholder = {
  name: string;
  description: string;
  /** Valor usado na prévia da tela de administração. */
  example: string;
};

export type WhatsappTemplateDef = {
  key: WhatsappTemplateKey;
  label: string;
  /** Quando o CRM manda a mensagem. */
  when: string;
  /** Para onde vai. */
  destination: string;
  placeholders: WhatsappTemplatePlaceholder[];
  defaultBody: string;
  defaultEnabled: boolean;
};

const CLIENTE: WhatsappTemplatePlaceholder = {
  name: "cliente",
  description: "Nome do cliente (lead)",
  example: "LE BLOG CONFECÇÕES LTDA",
};
const LINK: WhatsappTemplatePlaceholder = {
  name: "link",
  description: "Link da ficha do lead no CRM (some quando o CRM não tem endereço público)",
  example: "https://crm.bismarchipires.com.br/crm/leads/…",
};
const CICLO: WhatsappTemplatePlaceholder = {
  name: "ciclo",
  description: "Ciclo da revisão (1, ou 2 em diante depois de ajustes)",
  example: "1",
};

const DESTINO_DUE = "Destino da DUE (Integrações → WhatsApp)";

export const WHATSAPP_TEMPLATE_DEFS: Record<WhatsappTemplateKey, WhatsappTemplateDef> = {
  novo_lead_due: {
    key: "novo_lead_due",
    label: "Novo lead com Due Diligence",
    when: "Ao cadastrar um lead com due diligence.",
    destination: DESTINO_DUE,
    defaultEnabled: true,
    placeholders: [
      { name: "solicitante", description: "Captador do lead", example: "Leonardo Marques" },
      { name: "cadastrado_por", description: "Quem cadastrou", example: "leonardo.marques@bismarchipires.com.br" },
      { name: "email", description: "E-mail do captador", example: "leonardo.marques@bismarchipires.com.br" },
      { name: "empresas", description: "Razões sociais, separadas por vírgula", example: "LE BLOG CONFECÇÕES LTDA, PEC COMÉRCIO DO VESTUÁRIO LTDA" },
      { name: "documentos", description: "CNPJs/CPFs, separados por vírgula", example: "13.030.003/0001-10, 48.030.003/0001-02" },
      { name: "origem", description: "Bloco da origem do lead (tipo, indicação…)", example: "*Tipo de Lead:* Indicacao\n*Indicação:* Outros parceiros\n*Nome da Indicação:* CAIO CIRINO" },
      { name: "prazo_due", description: "Prazo de entrega da base", example: "26/10/2026 às 18:00" },
      { name: "areas", description: "Áreas de análise", example: "Cível, Trabalhista, Tributário" },
      { name: "reuniao_local", description: "Local da reunião", example: "A definir" },
      { name: "reuniao_data", description: "Data da reunião", example: "27/10/2026" },
      { name: "reuniao_horario", description: "Horário da reunião", example: "12:00" },
      { name: "due_diligence", description: "Sim/Não", example: "Sim" },
      { name: "avisos", description: "Alerta de área sem responsável (vazio quando está tudo certo)", example: "*Atenção:* nenhum usuário cadastrado na área Recuperação de Créditos. Defina no cadastro de usuários quem faz o levantamento." },
    ],
    defaultBody: [
      "*Novo Lead com Due Diligence*",
      "*Solicitante:* {{solicitante}}",
      "*Cadastrado por:* {{cadastrado_por}}",
      "*E-mail:* {{email}}",
      "",
      "*Empresa/Pessoa:* {{empresas}}",
      "*CNPJ/CPF:* {{documentos}}",
      "",
      "{{origem}}",
      "",
      "*Detalhes da Due Diligence:*",
      "- *Prazo de Entrega:* {{prazo_due}}",
      "- *Áreas de Análise:* {{areas}}",
      "",
      "*Detalhes da Reunião:*",
      "- *Local:* {{reuniao_local}}",
      "- *Data:* {{reuniao_data}}",
      "- *Horário:* {{reuniao_horario}}",
      "",
      "*Due Diligence:* {{due_diligence}}",
      "",
      "{{avisos}}",
      "",
      "_Esta mensagem foi gerada automaticamente pelo sistema de Gestão de Leads do Bismarchi | Pires._",
    ].join("\n"),
  },
  due_levantamento_concluido: {
    key: "due_levantamento_concluido",
    label: "Levantamento da DUE concluído",
    when: "Uma vez, quando a última área entrega o levantamento e o lead vai sozinho para Compilação.",
    destination: DESTINO_DUE,
    defaultEnabled: true,
    placeholders: [
      CLIENTE,
      {
        name: "areas",
        description: "Uma linha por área com o que foi entregue",
        example: "• Cível: planilha anexada\n• Trabalhista: planilha anexada\n• Reestruturação e Insolvência: pasta Due Diligence confirmada",
      },
      LINK,
    ],
    defaultBody: [
      "*Levantamento da DUE concluído*",
      "*Cliente:* {{cliente}}",
      "",
      "Todas as áreas entregaram. A DUE está pronta para a compilação.",
      "",
      "*Entregas*",
      "{{areas}}",
      "",
      "{{link}}",
    ].join("\n"),
  },
  due_revisao_inicio: {
    key: "due_revisao_inicio",
    label: "DUE em revisão",
    when: "Uma vez por ciclo, quando a compilação vai para Revisão (no ciclo 2 em diante, só as áreas que voltam a revisar).",
    destination: DESTINO_DUE,
    defaultEnabled: true,
    placeholders: [
      CLIENTE,
      CICLO,
      { name: "prazo", description: "Prazo da revisão", example: "27/10/2026 às 12:42" },
      {
        name: "areas",
        description: "Uma linha por área com o responsável pela revisão",
        example: "• Cível: Giancarlo Zotini\n• Trabalhista: Daniel Pressatto Fernandes\n• Recuperação de Créditos: sem responsável",
      },
      {
        name: "avisos",
        description: "Alerta de área sem responsável (vazio quando está tudo certo)",
        example: "*Atenção:* defina no cadastro de usuários quem revisa Recuperação de Créditos.",
      },
      LINK,
    ],
    defaultBody: [
      "*DUE em revisão*",
      "*Cliente:* {{cliente}}",
      "*Ciclo:* {{ciclo}}",
      "*Prazo:* {{prazo}}",
      "",
      "*Revisores*",
      "{{areas}}",
      "",
      "{{avisos}}",
      "",
      "Cada área aprova ou pede ajustes no CRM.",
      "{{link}}",
    ].join("\n"),
  },
  due_revisao_aprovada: {
    key: "due_revisao_aprovada",
    label: "DUE aprovada por todas as áreas",
    when: "Uma vez, quando a última área do ciclo aprova e todas as áreas estão aprovadas.",
    destination: DESTINO_DUE,
    defaultEnabled: true,
    placeholders: [
      CLIENTE,
      CICLO,
      {
        name: "areas",
        description: "Uma linha por área com quem aprovou",
        example: "• Cível: aprovada por Giancarlo Zotini\n• Trabalhista: aprovada por Daniel Pressatto Fernandes",
      },
      LINK,
    ],
    defaultBody: [
      "*DUE aprovada por todas as áreas*",
      "*Cliente:* {{cliente}}",
      "*Ciclo:* {{ciclo}}",
      "",
      "{{areas}}",
      "",
      "*Próximo passo:* avançar para Due Diligence Finalizada e confirmar a reunião.",
      "{{link}}",
    ].join("\n"),
  },
  due_revisao_ajustes: {
    key: "due_revisao_ajustes",
    label: "Ajustes pedidos na revisão",
    when: "Uma vez por ciclo, quando um pedido de ajuste devolve a DUE para Compilação (ou quando todas respondem e há ajuste).",
    destination: DESTINO_DUE,
    defaultEnabled: true,
    placeholders: [
      CLIENTE,
      CICLO,
      {
        name: "ajustes",
        description: "Uma linha por área que pediu ajuste, com a observação",
        example: "• Trabalhista: processo 1000581-21.2026.5.02.0029 entrou com valor zero.",
      },
      { name: "aprovadas", description: "Áreas que já aprovaram", example: "Cível, Tributário" },
      { name: "pendentes", description: "Áreas sem resposta, que voltam no próximo ciclo", example: "Recuperação de Créditos" },
      LINK,
    ],
    defaultBody: [
      "*Ajustes pedidos na revisão da DUE*",
      "*Cliente:* {{cliente}}",
      "*Ciclo:* {{ciclo}}",
      "",
      "*Ajustes*",
      "{{ajustes}}",
      "",
      "*Já aprovaram:* {{aprovadas}}",
      "*Sem resposta (voltam no próximo ciclo):* {{pendentes}}",
      "",
      "*Próximo passo:* corrigir a compilação, anexar o PPT novo e concluir os ajustes no CRM.",
      "{{link}}",
    ].join("\n"),
  },
  proposta_escopo_pedido: {
    key: "proposta_escopo_pedido",
    label: "Escopo da proposta solicitado",
    when: "Uma vez por pedido de escopo (todas as áreas pedidas juntas).",
    destination: "Grupo do escopo da proposta (EVOLUTION_GROUP_JID)",
    defaultEnabled: true,
    placeholders: [
      CLIENTE,
      { name: "prazo", description: "Prazo para preencher o escopo", example: "25/10/2026 às 12:55" },
      {
        name: "areas",
        description: "Uma linha por área com o gestor",
        example: "• Reestruturação e Insolvência: Lavinia Ferraz Crispim",
      },
      LINK,
    ],
    defaultBody: [
      "*Escopo da proposta solicitado*",
      "*Cliente:* {{cliente}}",
      "*Prazo:* {{prazo}}",
      "",
      "*Áreas*",
      "{{areas}}",
      "",
      "Preencha o escopo da sua área na Elaboração da Proposta.",
      "{{link}}",
    ].join("\n"),
  },
};

export function isWhatsappTemplateKey(value: string): value is WhatsappTemplateKey {
  return (WHATSAPP_TEMPLATE_KEYS as readonly string[]).includes(value);
}

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export type WhatsappTemplateValues = Record<string, string | null | undefined>;

function valueOf(values: WhatsappTemplateValues, name: string): string {
  return String(values[name.toLowerCase()] ?? "").trim();
}

/** Troca os placeholders; linha cujos placeholders ficaram vazios some; no máximo uma linha em branco seguida. */
export function renderWhatsappTemplate(body: string, values: WhatsappTemplateValues): string {
  const out: string[] = [];
  for (const line of body.replace(/\r\n/g, "\n").split("\n")) {
    const names = [...line.matchAll(PLACEHOLDER)].map((match) => match[1]!);
    if (names.length > 0 && names.every((name) => !valueOf(values, name))) continue;
    out.push(line.replace(PLACEHOLDER, (_, name: string) => valueOf(values, name)).trimEnd());
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Valores de exemplo do modelo (prévia na tela de administração). */
export function exampleValuesFor(key: WhatsappTemplateKey): WhatsappTemplateValues {
  return Object.fromEntries(WHATSAPP_TEMPLATE_DEFS[key].placeholders.map((p) => [p.name, p.example]));
}
