import { PROPOSAL_SCOPE_OPTIONS } from "@/lib/crm/proposta-scope-options";

/** Mesmas labels que `cp_areas_objeto` / modal de proposta. */
export const PROPOSTA_AREA_OPTIONS = PROPOSAL_SCOPE_OPTIONS;

/** Chaves de área alinhadas a `cp_areas_objeto`. */
export type PropostaAreaKey = (typeof PROPOSTA_AREA_OPTIONS)[number];

export type SubtipoDef = {
  subtipoId: string;
  label: string;
  escopoTemplate: string;
  placeholderKeys?: string[];
};

export type TipoDef = {
  tipoId: string;
  label: string;
  subtipos: SubtipoDef[];
};

/** Área → tipos → subtipos com textos modelo ESCOPO / INVESTIMENTO. */
export type PropostaTiposCatalog = Partial<Record<PropostaAreaKey, TipoDef[]>>;

/** Bloco de investimento (honorários) por área; catálogo global em `proposta-investimento-catalog`. */
export type PropostaInvestimentoEntry = {
  tipoId: string;
  subtipoId: string;
  placeholders?: Record<string, string>;
};

/** Valor persistido em `cp_escopo_detalhe_json` (lista por área; legado: um único objeto por área). */
export type PropostaEscopoDetalheEntry = {
  /** Identificador estável no JSON (vários escopos na mesma área). */
  id: string;
  tipoId: string;
  subtipoId: string;
  placeholders?: Record<string, string>;
  investimento?: PropostaInvestimentoEntry;
};

/** Área de atuação → um ou mais blocos de escopo + investimento. */
export type PropostaEscopoDetalhe = Record<string, PropostaEscopoDetalheEntry[]>;

/** Preenchido no CRM; no Word usa-se `[RESUMO]` (rótulo «Síntese da demanda:» fica só no modelo). */
export const PROPOSTA_PLACEHOLDER_RESUMO_PROCESSO = "RESUMO_DO_PROCESSO";

const ESCOPO_UM_PROCESSO = `Visando a atender as necessidades atuais, nossa proposta abrangerá serviços advocatícios especializados em Direito Civil, buscando a defesa da [NOME EMPRESA] nos autos da [TIPO DA AÇÃO] sob o n.º [NUM. DO PROCESSO], movida por [PARTE_CONTRÁRIA], cujo valor da causa, segundo a parte autora, é [VALOR_CAUSA]`;

const ESCOPO_MAIS_PROCESSOS = `Prestação de serviços advocatícios em favor de [NOME EMPRESA], abrangendo [QTD DE PROCESSOS] processos judiciais, com escopo de representação processual, análise de riscos e acompanhamento estratégico conforme detalhamento a ser alinhado em ata.

(i) Fase inicial: protocolo e acompanhamento instrutório;
(ii) Fase recursal: quando aplicável;
(iii) Exclusões: honorários de sucumbência a terceiros, despesas não previstas expressamente.`;

export function extractPlaceholderKeysFromText(...texts: string[]): string[] {
  const set = new Set<string>();
  for (const t of texts) {
    const re = /\[([^\]]+)\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(t)) !== null) {
      set.add(m[1].trim());
    }
  }
  return [...set];
}

function st(
  subtipoId: string,
  label: string,
  escopoTemplate: string,
  /** Chaves extra (ex.: resumo só para o Word, fora do texto de escopo). */
  extraPlaceholderKeys: string[] = [],
): SubtipoDef {
  const fromText = extractPlaceholderKeysFromText(escopoTemplate);
  const merged = [...new Set([...fromText, ...extraPlaceholderKeys])];
  return {
    subtipoId,
    label,
    escopoTemplate,
    ...(merged.length ? { placeholderKeys: merged } : {}),
  };
}

/**
 * Catálogo autoritativo (v1). Quando existir `public/tipos-propostas.xlsx`, pode ser
 * regenerado com `pnpm run import:tipos-propostas` no pacote `crm`.
 */
export const PROPOSTA_TIPOS_CATALOG: PropostaTiposCatalog = {
  Cível: [
    {
      tipoId: "contencioso",
      label: "Contencioso",
      subtipos: [
        st("um_processo", "1 processo", ESCOPO_UM_PROCESSO, [PROPOSTA_PLACEHOLDER_RESUMO_PROCESSO]),
        st("mais_um_processo", "+1 processo", ESCOPO_MAIS_PROCESSOS),
        st("carteira_processos", "Carteira de processos", ""),
      ],
    },
    {
      tipoId: "familia",
      label: "Família",
      subtipos: [
        st("divorcio_guarda_alimentos", "Divórcio, guarda e alimentos", ""),
      ],
    },
    {
      tipoId: "ajuizamento_acoes",
      label: "Ajuizamento de ações",
      subtipos: [
        st("padrao", "Padrão", ""),
      ],
    },
    {
      tipoId: "consultivo",
      label: "Consultivo",
      subtipos: [st("padrao", "Padrão", "")],
    },
  ],
  "Recuperação de Créditos": [
    {
      tipoId: "recuperacao_credito",
      label: "Recuperação de crédito",
      subtipos: [
        st(
          "ajuizamento_recuperacao",
          "Ajuizamento de ações de recuperação de crédito",
          "Prestação de serviços advocatícios em favor de [NOME EMPRESA] para ajuizamento e condução de ações de recuperação de crédito, observada a documentação disponível e a estratégia acordada.",
        ),
      ],
    },
  ],
  Trabalhista: [],
  "Societário e Contratos": [],
  Tributário: [],
  "Reestruturação e Insolvência": [],
};

export function getSubtipoDef(
  area: string,
  tipoId: string,
  subtipoId: string,
): SubtipoDef | undefined {
  const tipos = PROPOSTA_TIPOS_CATALOG[area as PropostaAreaKey];
  if (!tipos) return undefined;
  const tipo = tipos.find((t) => t.tipoId === tipoId);
  return tipo?.subtipos.find((s) => s.subtipoId === subtipoId);
}
