import type { ClausulaAdicional, ContratoDocumentPagePreview } from "@/lib/crm/contrato-docx-data";
import { renderContractObjectPlainText } from "./object-engine";
import type { CanonicalContractData } from "./types";

/** Título das seções cujo conteúdo já está representado dentro de `objeto` (não repetir). */
const OBJETO_SECTION_TITLE = "OBJETO DO CONTRATO";
/** Vira cláusula de posição fixa 2 (Objeto=1, Objetos Excluídos=2, Honorários=3). */
const OBJETOS_EXCLUIDOS_SECTION_TITLE = "OBJETOS EXCLUÍDOS DO CONTRATO";
/** Conteúdo já coberto pela cláusula fixa 3 "Honorários Contratuais" (renderizada à parte). */
const PAGAMENTO_SECTION_TITLE = "PREÇO E FORMA DE PAGAMENTO";

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
            title: c.title.replace(/^\d+\.\d+\.\s*/, ""),
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
    qualificacao: qualificacoes.join(" ") || "…",
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

export function buildCanonicalContratoPage(params: {
  canonicalData: CanonicalContractData;
  userExtras?: ClausulaAdicional[];
}): ContratoDocumentPagePreview {
  const page = previewFromCanonical(params.canonicalData);
  const engineContents = new Set(params.canonicalData.clauses.map((c) => c.content.trim()));
  const extras = (params.userExtras ?? []).filter(
    (c) => !engineContents.has(c.content.trim()) && !STALE_OBJECT_FRAGMENT_RE.test(c.title.trim()),
  );
  return {
    ...page,
    clausulasAdicionais: [...page.clausulasAdicionais, ...extras],
  };
}
