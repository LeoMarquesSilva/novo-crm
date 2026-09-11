import type { ClausulaAdicional, ContratoDocumentPagePreview } from "@/lib/crm/contrato-docx-data";
import { CONTRACT_CLAUSE_CATALOG } from "./clause-catalog";
import { SECTION_ORDER } from "./clause-engine";
import { renderContractObjectPlainText } from "./object-engine";
import type { CanonicalContractData } from "./types";

/** Título das seções cujo conteúdo já está representado dentro de `objeto` (não repetir). */
const OBJETO_SECTION_TITLE = "OBJETO DO CONTRATO";
/** Vira cláusula de posição fixa 2 (Objeto=1, Objetos Excluídos=2, Honorários=3). */
const OBJETOS_EXCLUIDOS_SECTION_TITLE = "OBJETOS EXCLUÍDOS DO CONTRATO";
/** Conteúdo já coberto pela cláusula fixa 3 "Honorários Contratuais" (renderizada à parte). */
const PAGAMENTO_SECTION_TITLE = "PREÇO E FORMA DE PAGAMENTO";

/** "Exclusão — Auditoria Trabalhista" → "Auditoria Trabalhista": redundante quando o
 * item já está listado dentro da seção "OBJETOS EXCLUÍDOS DO CONTRATO" (o cabeçalho
 * da seção já deixa claro que é uma exclusão; repetir em cada sub-item polui). */
const REDUNDANT_TITLE_PREFIX_RE = /^exclus(ã|a)o\s*[—-]\s*/i;

function stripSubItemTitlePrefix(title: string): string {
  return title
    .replace(/^\d+\.\d+\.\s*/, "")
    .replace(REDUNDANT_TITLE_PREFIX_RE, "");
}

function normalizeTitleForCompare(title: string): string {
  return stripSubItemTitlePrefix(title.trim()).toLowerCase();
}

function sectionToClausula(section: {
  title: string;
  clauses: Array<{ title: string; content: string }>;
}): ClausulaAdicional {
  return {
    title: section.title,
    content: section.clauses.length === 1 ? section.clauses[0].content : "",
    items:
      section.clauses.length > 1
        ? section.clauses.map((c) => ({
            title: stripSubItemTitlePrefix(c.title),
            content: c.content,
          }))
        : undefined,
  };
}

export function previewFromCanonical(data: CanonicalContractData): ContratoDocumentPagePreview {
  const qualificacoes = data.contractingParties.map((party) => {
    const end = party.endereco;
    const addr = [end.logradouro, end.numero, end.bairro, end.cidade, end.uf, end.cep]
      .filter((p) => p.trim())
      .join(", ");
    return `${party.razaoSocial}, inscrita no ${party.documentoTipo} nº ${party.documento}${addr ? `, com sede em ${addr}` : ""}.`;
  });

  const objeto = data.contractObject
    ? renderContractObjectPlainText(data.contractObject)
    : data.clauses
        .filter((c) => c.role === "object" || c.role === "scope")
        .map((c) => c.content)
        .join("\n\n");

  return {
    qualificacoesPartes: qualificacoes.length > 0 ? qualificacoes : ["…"],
    objeto: objeto || "…",
    valores: data.payment.clauseText || "…",
    investimento: data.investment.totalExtenso,
    dataAssinatura: data.generation.localDateLabel,
    limiteProcessos: "",
    limiteHoras: "",
    exitoAreas: "",
    tipoPagamento: data.payment.method,
    prazoConfeccao: "",
    prazoRevisao: "",
    // As "áreas" (heading + detalhes) do sistema legado de toggles cc_incluir_*
    // não se aplicam aqui: todo o conteúdo real de cada escopo (objeto, escopo,
    // limites, exclusões) já está dentro de `objeto` acima, via
    // renderContractObjectPlainText — numerado em suas próprias linhas (1.1, 1.2…).
    // Preencher `areas` a partir de `data.scopes` sem `details` produzia uma
    // cláusula numerada extra por escopo (ex.: "3. TRABALHISTA — CONSULTIVO")
    // sem nenhum texto abaixo, tanto no preview quanto no .docx gerado de
    // verdade — vazia por design, nunca teve dado para preencher `details`.
    areas: [],
    // Posição fixa 2 (Objeto=1, Objetos Excluídos=2, Honorários=3), igual à
    // ordem do padrão `contrato_honorarios_template_1.md`. Sem isso, a ordem
    // dependia de qual seção o motor gerava primeiro, e Honorários acabava
    // sempre em 2 (antes de Objetos Excluídos), divergindo do `.md`.
    objetosExcluidos:
      data.sections.find((s) => s.title === OBJETOS_EXCLUIDOS_SECTION_TITLE)
        ? sectionToClausula(data.sections.find((s) => s.title === OBJETOS_EXCLUIDOS_SECTION_TITLE)!)
        : null,
    // Uma cláusula "adicional" por SEÇÃO (não por cláusula individual): o motor
    // já agrupa tudo certinho em `data.sections` (numberSections, clause-engine.ts)
    // — ex. "DISPOSIÇÕES GERAIS" reúne Irrevogabilidade, Foro, Tributos... igual
    // ao padrão `contrato_honorarios_template_1.md`. O número de topo (N.) é
    // atribuído por quem renderiza (ContratoBodyDocument / generate-contrato-docx),
    // não aqui — por isso `title` não leva número embutido (isso já causou bug de
    // numeração duplicada uma vez). "Objeto", "Objetos Excluídos" (posição fixa
    // acima) e "Preço e Forma de Pagamento" (conteúdo já coberto pela cláusula
    // fixa 3 "Honorários Contratuais", renderizada à parte com o método de
    // pagamento) saem desta lista genérica para não duplicar.
    clausulasAdicionais: data.sections
      .filter(
        (section) =>
          section.title !== OBJETO_SECTION_TITLE &&
          section.title !== OBJETOS_EXCLUIDOS_SECTION_TITLE &&
          section.title !== PAGAMENTO_SECTION_TITLE,
      )
      .map(sectionToClausula),
  };
}

/**
 * Fonte única do merge "motor canônico + cláusulas extras escolhidas manualmente
 * no builder", usada por todo caminho que gera o Word de verdade (preview ao
 * vivo no builder, botão "Gerar DOCX", envio ao D4Sign) — para que os três nunca
 * divirjam entre si de novo. `userExtras` deve ser a lista bruta salva em
 * `clausulas_selecionadas`; cláusulas cujo texto já saiu do motor são
 * descartadas automaticamente (evita duplicar o que o motor já escreveu).
 */
/** "1.2. Consultivo Trabalhista" etc. — sobra de fragmento do Objeto salva como
 * "cláusula extra" antes de o motor de Objeto existir; nunca é uma cláusula
 * extra de verdade escolhida por alguém. */
const STALE_OBJECT_FRAGMENT_RE = /^\d+\.\d+\.\s/;

/** título (normalizado) → seção do documento onde esse título do catálogo pertence.
 * Aproximação: usa o catálogo estático de fallback, não a biblioteca do banco
 * (que um admin pode ter customizado) — suficiente para essa heurística de
 * "essa cláusula extra corresponde a que seção", não para resolver conteúdo. */
const CATALOG_TITLE_TO_SECTION = new Map<string, string>(
  CONTRACT_CLAUSE_CATALOG.map((c): [string, string] => {
    const spec = SECTION_ORDER.find((s) => (s.roles as readonly string[]).includes(c.role));
    return [c.title.trim().toLowerCase(), spec?.title ?? ""];
  }).filter(([, title]) => title),
);

/** "OBJETO DO CONTRATO" e "PREÇO E FORMA DE PAGAMENTO" não vêm de `data.sections`
 * (são montados por `contractObject.numberedLines` / `data.payment` — mecanismos
 * próprios), então não há como posicionar um item extra dentro deles aqui. */
const NON_MERGEABLE_SECTION_TITLES = new Set([OBJETO_SECTION_TITLE, PAGAMENTO_SECTION_TITLE]);

/** A que seção do documento uma cláusula "adicional" pertence — `null` se não bate
 * com nada (cláusula genuinamente bespoke, sem correspondência) ou se a seção não
 * é mesclável (ver `NON_MERGEABLE_SECTION_TITLES`).
 *
 * Duas formas de identificar: (1) título bate exatamente com um título conhecido
 * do catálogo — cobre o caso comum (escolhida na biblioteca) e permite detectar
 * duplicata desatualizada por título, não só por conteúdo; (2) título começa com
 * "Exclusão — " mesmo sem bater com o catálogo — cobre exclusão genuinamente nova,
 * digitada à mão, que não existe como template. */
function resolveExtraTargetSection(title: string): string | null {
  const catalogSection = CATALOG_TITLE_TO_SECTION.get(title.trim().toLowerCase());
  if (catalogSection) {
    return NON_MERGEABLE_SECTION_TITLES.has(catalogSection) ? null : catalogSection;
  }
  if (REDUNDANT_TITLE_PREFIX_RE.test(title.trim())) return OBJETOS_EXCLUIDOS_SECTION_TITLE;
  return null;
}

/**
 * Junta (ou descarta) cláusulas "adicionais" cujo título bate com um título do
 * catálogo dentro da seção certa do documento — em vez de virarem cláusula solta
 * com número próprio, repetindo o nome da seção no título (ex.: "12. EXCLUSÃO —
 * DIAGNÓSTICO NR-1" quando já existe "2. OBJETOS EXCLUÍDOS DO CONTRATO").
 *
 * Se a seção já tem um item com o MESMO título (comparado sem prefixo/caixa) —
 * ou, em seção de item único, se o próprio título da seção já cobre o tema —, o
 * extra é uma versão desatualizada de algo que o motor já gera corretamente
 * (o catálogo evoluiu; o texto salvo manualmente ficou para trás) e é descartado,
 * não duplicado. Caso real que motivou isso: uma cláusula extra salva como
 * "Atraso no pagamento" carregava uma nota interna de revisão jurídica
 * ("REQUIRES LEGAL DECISION...") que vazaria para o contrato de verdade se
 * fosse mesclada ao lado da versão atual e correta da mesma cláusula.
 */
function mergeOrDropExtrasIntoClausula(
  base: ClausulaAdicional | null,
  extras: ClausulaAdicional[],
  sectionTitle: string,
): ClausulaAdicional | null {
  if (extras.length === 0) return base;

  const existingTitles = base
    ? base.items && base.items.length > 0
      ? new Set(base.items.map((i) => normalizeTitleForCompare(i.title)))
      : new Set([normalizeTitleForCompare(base.title)])
    : new Set<string>();

  const genuinelyNew = extras.filter((c) => !existingTitles.has(normalizeTitleForCompare(c.title)));
  if (genuinelyNew.length === 0) return base;

  const extraItems = genuinelyNew.map((c) => ({
    title: stripSubItemTitlePrefix(c.title),
    content: c.content,
  }));
  if (!base) {
    return {
      title: sectionTitle,
      content: extraItems.length === 1 ? extraItems[0].content : "",
      items: extraItems.length > 1 ? extraItems : undefined,
    };
  }
  const baseItems = base.items ?? (base.content.trim() ? [{ title: "Geral", content: base.content }] : []);
  return { title: base.title, content: "", items: [...baseItems, ...extraItems] };
}

export function buildCanonicalContratoPage(params: {
  canonicalData: CanonicalContractData;
  userExtras?: ClausulaAdicional[];
}): ContratoDocumentPagePreview {
  const page = previewFromCanonical(params.canonicalData);
  const engineContents = new Set(params.canonicalData.clauses.map((c) => c.content.trim()));
  const extras = (params.userExtras ?? []).filter(
    (c) => !engineContents.has(c.content.trim()) && !STALE_OBJECT_FRAGMENT_RE.test(c.title.trim()),
  );

  const objetosExcluidosExtras: ClausulaAdicional[] = [];
  const extrasBySection = new Map<string, ClausulaAdicional[]>();
  const looseExtras: ClausulaAdicional[] = [];

  for (const extra of extras) {
    const target = resolveExtraTargetSection(extra.title);
    if (!target) {
      looseExtras.push(extra);
    } else if (target === OBJETOS_EXCLUIDOS_SECTION_TITLE) {
      objetosExcluidosExtras.push(extra);
    } else {
      const arr = extrasBySection.get(target) ?? [];
      arr.push(extra);
      extrasBySection.set(target, arr);
    }
  }

  const objetosExcluidos = mergeOrDropExtrasIntoClausula(
    page.objetosExcluidos,
    objetosExcluidosExtras,
    OBJETOS_EXCLUIDOS_SECTION_TITLE,
  );

  const clausulasAdicionais = page.clausulasAdicionais.map((c) => {
    const toMerge = extrasBySection.get(c.title);
    if (!toMerge) return c;
    extrasBySection.delete(c.title);
    return mergeOrDropExtrasIntoClausula(c, toMerge, c.title) ?? c;
  });
  // Seções que o motor não gerou pra este contrato, mas que têm extra correspondente
  // (ex.: nenhuma cláusula de "Vigência" foi gerada, só a extra manual) — cria do zero.
  for (const [title, items] of extrasBySection) {
    const merged = mergeOrDropExtrasIntoClausula(null, items, title);
    if (merged) clausulasAdicionais.push(merged);
  }

  return {
    ...page,
    objetosExcluidos,
    clausulasAdicionais: [...clausulasAdicionais, ...looseExtras],
  };
}
