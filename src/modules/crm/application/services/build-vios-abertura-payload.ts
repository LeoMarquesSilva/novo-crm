import { formatDateYmdBr } from "@/lib/format-datetime";
import { isValidCnpj, isValidCpf } from "@/lib/crm/rd-migration/documents";

/**
 * Pedido de abertura no VIOS que o CRM manda ao robô do SAMA (Edge Function `enfileirar-abertura`),
 * no lugar do item da lista "AGENDAMENTOS / REAGENDAMENTOS" do SharePoint. O robô localiza ou cadastra
 * o prospect, abre (ou reaproveita) a pasta de atendimento e agenda as tarefas.
 * Plano: `docs/superpowers/plans/2026-11-12-abertura-vios-via-rpa-sama.md`.
 */

/** Valores da pasta e da pessoa como estão no VIOS (pasta de referência 61356). */
export const VIOS_ABERTURA_PADRAO = {
  escritorio: "BISMARCHI PIRES SOCIEDADE DE ADVOGADOS",
  departamento: "Comercial",
  area: "Comercial",
  agrupador: "Due Diligence Prospect",
  categoria: "Prospecção",
  grupo: "Grupo prospect",
  /** Responsável da pasta 61356; troca por `VIOS_ABERTURA_RESPONSAVEL_PASTA`. */
  responsavelPasta: "Ligia Gilberti Lopes",
} as const;

/** Tipos de tarefa do catálogo do VIOS para pasta de Atendimento/Comercial (etapa e etiqueta). */
export const VIOS_TAREFAS = {
  enviar: {
    tarefa: "ENVIAR",
    tarefa_id: "708",
    tipo: "Enviar",
    etiqueta_id: "1",
    titulo: "ENVIAR DUE DILLIGENCE PROSPECT",
  },
  protocolo: {
    tarefa: "Protocolo",
    tarefa_id: "595",
    tipo: "Protocolo",
    etiqueta_id: "3",
    titulo: "PROTOCOLO DUE DILLIGENCE PROSPECT",
  },
  ciencia: {
    tarefa: "CIÊNCIA DA ABERTURA DE PASTA",
    tarefa_id: "496",
    tipo: "Providência",
    etiqueta_id: "204",
    titulo: "CIÊNCIA DA ABERTURA DE PASTA",
  },
} as const;

export type ViosAberturaModoEnvio = "simular" | "ativo";

export type ViosAberturaTarefa = {
  tarefa: string;
  tarefa_id: string;
  tipo: string;
  etiqueta_id: string;
  observacao: string;
  data: string;
  responsavel: string[];
};

/** Contrato §3.1 do plano (validado de novo pela Edge Function). */
export type ViosAberturaPedido = {
  chave_idempotencia: string;
  origem: "crm";
  modo: ViosAberturaModoEnvio;
  oportunidade_id: string;
  crm_url: string | null;
  cliente: {
    tipo_pessoa: "PF" | "PJ";
    cpf_cnpj: string;
    nome: string;
    categoria: string;
    grupo: string;
  };
  envolvidos: { nome: string; cpf_cnpj?: string; tipo_parte: "Cliente" }[];
  pasta: {
    escritorio: string;
    departamento: string;
    area: string;
    agrupador: string;
    responsavel: string;
    data_cadastro: string;
    descricao: string;
  };
  tarefas: ViosAberturaTarefa[];
};

export type ViosAberturaEmpresa = {
  tipo_documento?: string | null;
  razao_social: string;
  documento: string;
};

export type ViosAberturaEntrada = {
  oportunidadeId: string;
  crmUrl: string | null;
  modo: ViosAberturaModoEnvio;
  /** Dia do cadastro (`yyyy-mm-dd`, São Paulo): data da pasta, do ENVIAR e da ciência. */
  hojeYmd: string;
  responsavelPasta: string;
  intake: {
    empresas: ViosAberturaEmpresa[];
    areas_analise: string[];
    data_entrega_due: string | null;
    horario_entrega_due: string | null;
    local_reuniao: string | null;
    data_reuniao: string | null;
    horario_reuniao: string | null;
    tipo_lead: string | null;
    tipo_indicacao: string | null;
    nome_indicacao: string | null;
    plataforma?: string | null;
  };
  /** Um por área da DUE, na ordem do cadastro; `nomeVios` nulo = área sem responsável no CRM. */
  responsaveis: { area: string; nomeVios: string | null }[];
};

export type ViosAberturaMontagem =
  | { ok: true; pedido: ViosAberturaPedido; avisos: string[] }
  | { ok: false; motivo: string };

/** Uma abertura por oportunidade: reenviar o mesmo lead não duplica pessoa, pasta nem tarefas. */
export function chaveAberturaVios(oportunidadeId: string): string {
  return `crm:abertura_due:${oportunidadeId}`;
}

const soDigitos = (valor: string) => valor.replace(/\D/g, "");

function tipoPessoa(empresa: ViosAberturaEmpresa): "PF" | "PJ" | null {
  const digitos = soDigitos(empresa.documento);
  if (digitos.length === 11 && isValidCpf(digitos)) return "PF";
  if (digitos.length === 14 && isValidCnpj(digitos)) return "PJ";
  return null;
}

function rotuloTipoLead(intake: ViosAberturaEntrada["intake"]): string {
  const tipo = intake.tipo_lead?.trim();
  if (!tipo) return "Não informado";
  if (tipo === "Indicacao") return "Indicação";
  const plataforma = intake.plataforma?.trim();
  return tipo === "Lead Digital" && plataforma ? `${tipo} (${plataforma})` : tipo;
}

const ouNaoInformado = (valor: string | null | undefined) => valor?.trim() || "Não informado";

/** O banco devolve `time` como "17:00:00"; a central escrevia "17:00". */
function hora(valor: string | null | undefined): string {
  const t = valor?.trim() ?? "";
  const m = /^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(t);
  return m ? `${m[1]!.padStart(2, "0")}:${m[2]}` : t;
}

/** Corpo das tarefas, no modelo das tarefas que a central agendava (pasta 61356). */
function corpoDaTarefa(entrada: ViosAberturaEntrada): string {
  const { intake } = entrada;
  const prazo = formatDateYmdBr(intake.data_entrega_due);
  const horarioDue = hora(intake.horario_entrega_due);
  const dataReuniao = formatDateYmdBr(intake.data_reuniao);
  const empresas = intake.empresas
    .map((e) => [e.razao_social.trim(), e.documento.trim()].filter(Boolean).join(" - "))
    .filter(Boolean);
  return [
    `Tipo de Lead: ${rotuloTipoLead(intake)}`,
    `Indicação: ${ouNaoInformado(intake.tipo_indicacao)}`,
    `Nome da Indicação: ${ouNaoInformado(intake.nome_indicacao)}`,
    "",
    "Detalhes da Due Diligence:",
    `- Prazo de Entrega: ${prazo}${horarioDue ? ` às ${horarioDue}` : ""}`,
    `- Áreas de Análise: ${intake.areas_analise.join(", ") || "Não especificado"}`,
    "",
    "Detalhes da Reunião:",
    `- Local: ${ouNaoInformado(intake.local_reuniao)}`,
    `- Data: ${dataReuniao || "A definir"}`,
    `- Horário: ${hora(intake.horario_reuniao) || "A definir"}`,
    "",
    "Empresas do grupo:",
    ...empresas.map((e) => `- ${e}`),
    ...(entrada.crmUrl ? ["", `Lead no CRM: ${entrada.crmUrl}`] : []),
  ].join("\n");
}

function tarefa(
  tipo: (typeof VIOS_TAREFAS)[keyof typeof VIOS_TAREFAS],
  data: string,
  responsavel: string[],
  corpo: string,
): ViosAberturaTarefa {
  return {
    tarefa: tipo.tarefa,
    tarefa_id: tipo.tarefa_id,
    tipo: tipo.tipo,
    etiqueta_id: tipo.etiqueta_id,
    observacao: `${tipo.titulo}\n\n${corpo}`,
    data,
    responsavel,
  };
}

/**
 * Monta o pedido a partir do cadastro do lead. Regras (D2 e D4 do plano):
 * - a 1ª empresa é o cliente da pasta; as demais entram como envolvidos (parte "Cliente");
 * - um ENVIAR por responsável de área, para o dia do cadastro;
 * - um Protocolo com todos os responsáveis, para a data de entrega da due;
 * - a "CIÊNCIA DA ABERTURA DE PASTA" para o responsável da pasta, no dia do cadastro.
 */
export function buildViosAberturaPedido(entrada: ViosAberturaEntrada): ViosAberturaMontagem {
  const { intake } = entrada;
  const avisos: string[] = [];

  const entrega = formatDateYmdBr(intake.data_entrega_due);
  if (!entrega) return { ok: false, motivo: "Lead sem data de entrega da due." };
  const hoje = formatDateYmdBr(entrada.hojeYmd);
  if (!hoje) return { ok: false, motivo: "Data do cadastro inválida." };

  const [primeira, ...demais] = intake.empresas.filter((e) => e.razao_social?.trim());
  if (!primeira) return { ok: false, motivo: "Lead sem empresa no cadastro." };
  const tipo = tipoPessoa(primeira);
  if (!tipo) {
    return { ok: false, motivo: `CPF/CNPJ da 1ª empresa inválido (${primeira.razao_social.trim()}).` };
  }
  const docCliente = soDigitos(primeira.documento);

  const vistos = new Set([docCliente]);
  const envolvidos: ViosAberturaPedido["envolvidos"] = [];
  for (const empresa of demais) {
    const nome = empresa.razao_social.trim();
    const doc = soDigitos(empresa.documento);
    if (doc && vistos.has(doc)) continue;
    if (doc) vistos.add(doc);
    if (tipoPessoa(empresa)) {
      envolvidos.push({ nome, cpf_cnpj: doc, tipo_parte: "Cliente" });
    } else {
      envolvidos.push({ nome, tipo_parte: "Cliente" });
      avisos.push(`Envolvido sem CPF/CNPJ válido: ${nome}.`);
    }
  }

  const nomes: string[] = [];
  for (const r of entrada.responsaveis) {
    const nome = r.nomeVios?.trim();
    if (!nome) {
      avisos.push(`Área sem responsável no CRM: ${r.area}.`);
      continue;
    }
    if (!nomes.includes(nome)) nomes.push(nome);
  }

  const corpo = corpoDaTarefa(entrada);
  const tarefas: ViosAberturaTarefa[] = nomes.map((nome) => tarefa(VIOS_TAREFAS.enviar, hoje, [nome], corpo));
  if (nomes.length > 0) {
    tarefas.push(tarefa(VIOS_TAREFAS.protocolo, entrega, nomes, corpo));
  } else {
    avisos.push("Nenhum responsável de área: o pedido vai sem ENVIAR e sem Protocolo.");
  }
  const responsavelPasta = entrada.responsavelPasta.trim() || VIOS_ABERTURA_PADRAO.responsavelPasta;
  tarefas.push(
    tarefa(
      VIOS_TAREFAS.ciencia,
      hoje,
      [responsavelPasta],
      `Pasta aberta automaticamente pelo CRM.\n\n${corpo}`,
    ),
  );

  const razoes = intake.empresas.map((e) => e.razao_social.trim()).filter(Boolean).join(", ");
  return {
    ok: true,
    avisos,
    pedido: {
      chave_idempotencia: chaveAberturaVios(entrada.oportunidadeId),
      origem: "crm",
      modo: entrada.modo,
      oportunidade_id: entrada.oportunidadeId,
      crm_url: entrada.crmUrl,
      cliente: {
        tipo_pessoa: tipo,
        cpf_cnpj: docCliente,
        nome: primeira.razao_social.trim(),
        categoria: VIOS_ABERTURA_PADRAO.categoria,
        grupo: VIOS_ABERTURA_PADRAO.grupo,
      },
      envolvidos,
      pasta: {
        escritorio: VIOS_ABERTURA_PADRAO.escritorio,
        departamento: VIOS_ABERTURA_PADRAO.departamento,
        area: VIOS_ABERTURA_PADRAO.area,
        agrupador: VIOS_ABERTURA_PADRAO.agrupador,
        responsavel: responsavelPasta,
        data_cadastro: hoje,
        descricao: [`DUE DILIGENCE - ${razoes}`, entrada.crmUrl ? `Lead no CRM: ${entrada.crmUrl}` : null]
          .filter(Boolean)
          .join("\n"),
      },
      tarefas,
    },
  };
}

export type ColaboradorRh = { fullName: string; email: string | null; isActive: boolean };

const localPart = (email: string) => email.trim().toLowerCase().split("@")[0] ?? "";

/**
 * Nome do usuário no VIOS. O cadastro do CRM usa nome curto ("Renato Vallim"); o VIOS usa o nome
 * completo do RH ("Renato Rossetti Vallim de Castro"). Casa pelo e-mail de login com o espelho do RH
 * (`orqestrai_colaboradores`): e-mail igual e, se não houver, o mesmo local-part (bpplaw.com.br ×
 * bismarchipires.com.br). Sem par no RH, fica o nome do CRM e o robô avisa se não achar no VIOS.
 */
export function nomeNoVios(
  usuario: { fullName: string; email: string | null },
  rh: ColaboradorRh[],
): string {
  const email = usuario.email?.trim().toLowerCase();
  if (email) {
    const ativosPrimeiro = [...rh].sort((a, b) => Number(b.isActive) - Number(a.isActive));
    const exato = ativosPrimeiro.find((c) => c.email?.trim().toLowerCase() === email);
    if (exato) return exato.fullName.trim();
    const local = localPart(email);
    const porLocal = ativosPrimeiro.filter((c) => c.email && localPart(c.email) === local);
    const nomes = [...new Set(porLocal.map((c) => c.fullName.trim()))];
    if (nomes.length === 1) return nomes[0]!;
  }
  return usuario.fullName.trim();
}
