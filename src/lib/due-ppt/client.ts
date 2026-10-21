/**
 * Apresentação automática da DUE no navegador: baixa modelo e planilhas por URL
 * assinada, monta o PPT localmente e anexa como PPT de compilação. O arquivo
 * nunca passa pelo corpo de uma função serverless (limite ~4,5 MB no Vercel).
 */
import { uploadDueFile, type DueDocument } from "@/lib/crm/upload-due-ppt";
import { DUE_AREA_IDS, type DueAreaId } from "./areas";
import { composeDeck, type AreaDados, type ComposeResult } from "./compose";
import type { DueApresentacaoDraft } from "./draft";
import type { ImageAsset } from "./pptx/image";
import { buildDeck } from "./pptx/build";
import { normalizarPlanilha, type PlanilhaNormalizada } from "./processos";
import { readXlsx } from "./xlsx-reader";

export type DueDocumentoLista = DueDocument & { area_key: string | null };

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & { ok?: boolean; error?: string };
  if (!res.ok || body.ok === false) throw new Error(body.error ?? `Falha (${res.status}).`);
  return body;
}

export async function listarDocumentosDue(leadId: string): Promise<DueDocumentoLista[]> {
  const res = await fetch(`/api/crm/leads/${encodeURIComponent(leadId)}/due-documents`, { cache: "no-store" });
  const body = await json<{ documents: DueDocumentoLista[] }>(res);
  return (body.documents ?? []).map((d) => ({ ...d, area_key: d.area_key ?? null }));
}

export async function baixarDocumentoDue(leadId: string, documentId: string): Promise<ArrayBuffer> {
  const res = await fetch(
    `/api/crm/leads/${encodeURIComponent(leadId)}/due-documents?documentId=${encodeURIComponent(documentId)}`,
    { cache: "no-store" },
  );
  const { signedUrl } = await json<{ signedUrl: string }>(res);
  const file = await fetch(signedUrl);
  if (!file.ok) throw new Error("Não foi possível baixar o arquivo.");
  return file.arrayBuffer();
}

export async function removerDocumentoDue(leadId: string, documentId: string): Promise<void> {
  const res = await fetch(
    `/api/crm/leads/${encodeURIComponent(leadId)}/due-documents?documentId=${encodeURIComponent(documentId)}`,
    { method: "DELETE" },
  );
  await json(res);
}

export async function enviarPlanilha(leadId: string, file: File, area: DueAreaId): Promise<DueDocumentoLista> {
  const doc = await uploadDueFile(leadId, file, "planilha_area", area);
  return { ...doc, area_key: doc.area_key ?? area };
}

export async function enviarLogo(leadId: string, file: File): Promise<DueDocumentoLista> {
  const doc = await uploadDueFile(leadId, file, "logo_cliente");
  return { ...doc, area_key: null };
}

/** Planilha lida: processos normalizados (ou o erro de leitura). */
export type PlanilhaLida = { documentId: string; dados?: PlanilhaNormalizada; erro?: string };

export async function lerPlanilha(leadId: string, documentId: string): Promise<PlanilhaLida> {
  try {
    const bytes = await baixarDocumentoDue(leadId, documentId);
    return { documentId, dados: normalizarPlanilha(readXlsx(bytes)) };
  } catch (e) {
    return { documentId, erro: e instanceof Error ? e.message : "Não foi possível ler a planilha." };
  }
}

/** Junta as planilhas de cada área em um conjunto só de processos. */
export function dadosPorArea(docs: DueDocumentoLista[], lidas: Map<string, PlanilhaLida>): AreaDados[] {
  const out: AreaDados[] = [];
  for (const id of DUE_AREA_IDS) {
    if (id === "reestruturacao") continue;
    const daArea = docs.filter((d) => d.document_kind === "planilha_area" && d.area_key === id);
    if (!daArea.length) continue;
    const area: AreaDados = { id, processos: [], extras: { pge: null, pgfn: null } };
    const vistos = new Set<string>();
    for (const d of daArea) {
      const n = lidas.get(d.id)?.dados;
      if (!n) continue;
      for (const p of n.processos) {
        const k = p.numero.replace(/\D/g, "");
        if (vistos.has(k)) continue;
        vistos.add(k);
        area.processos.push(p);
      }
      if (n.extras.pge != null) area.extras.pge = (area.extras.pge ?? 0) + n.extras.pge;
      if (n.extras.pgfn) {
        const acc = area.extras.pgfn ?? { tributario: 0, previdenciario: 0, multa: 0 };
        acc.tributario += n.extras.pgfn.tributario;
        acc.previdenciario += n.extras.pgfn.previdenciario;
        acc.multa += n.extras.pgfn.multa;
        area.extras.pgfn = acc;
      }
    }
    out.push(area);
  }
  return out;
}

let modeloCache: { at: number; bytes: ArrayBuffer } | null = null;

/** Modelo ativo (cache de 10 min na aba). */
export async function baixarModeloAtivo(): Promise<ArrayBuffer> {
  if (modeloCache && Date.now() - modeloCache.at < 10 * 60 * 1000) return modeloCache.bytes;
  const res = await fetch("/api/crm/due/modelos?download=ativo", { cache: "no-store" });
  const { signedUrl } = await json<{ signedUrl: string }>(res);
  const file = await fetch(signedUrl);
  if (!file.ok) throw new Error("Não foi possível baixar o modelo da apresentação.");
  const bytes = await file.arrayBuffer();
  modeloCache = { at: Date.now(), bytes };
  return bytes;
}

export function limparCacheModelo(): void {
  modeloCache = null;
}

function nomeArquivo(razao: string): string {
  const base = (razao || "CLIENTE")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 ._-]/g, "")
    .trim()
    .slice(0, 80);
  return `DUE DILIGENCE - ${base || "CLIENTE"}.pptx`;
}

export type GeracaoResultado = {
  arquivo: File;
  documento: DueDocument | null;
  avisos: string[];
  slides: number;
};

/**
 * Monta o PPT e, se `anexar`, envia como PPT de compilação e registra no rascunho.
 */
export async function gerarApresentacao(opts: {
  leadId: string;
  draft: DueApresentacaoDraft;
  areas: AreaDados[];
  logo: ImageAsset | null;
  anexar: boolean;
  onEtapa?: (texto: string) => void;
}): Promise<GeracaoResultado> {
  opts.onEtapa?.("Baixando o modelo…");
  const modelo = await baixarModeloAtivo();
  opts.onEtapa?.("Montando os slides…");
  // Deixa a UI pintar o texto da etapa antes do trabalho pesado.
  await new Promise((r) => setTimeout(r, 30));
  const composto: ComposeResult = composeDeck({ draft: opts.draft, areas: opts.areas, logo: opts.logo, hoje: new Date() });
  const result = buildDeck(new Uint8Array(modelo), composto.spec);
  const arquivo = new File([result.bytes as BlobPart], nomeArquivo(opts.draft.capa.razaoSocial), {
    type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  });
  let documento: DueDocument | null = null;
  if (opts.anexar) {
    opts.onEtapa?.("Anexando à compilação…");
    documento = await uploadDueFile(opts.leadId, arquivo, "ppt_compilacao");
    await fetch(`/api/crm/leads/${encodeURIComponent(opts.leadId)}/due-apresentacao`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ geradoDocumentoId: documento.id }),
    }).catch(() => undefined);
  }
  return { arquivo, documento, avisos: [...composto.avisos, ...result.warnings], slides: result.slideCount };
}

export function baixarArquivoLocal(file: File): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
