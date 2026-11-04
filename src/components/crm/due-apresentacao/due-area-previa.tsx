"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, Download, Loader2, Pencil, Presentation, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { numeros } from "@/components/crm/due-apresentacao/due-area-card";
import { draftInicial, type Sugestao } from "@/components/crm/due-apresentacao/due-apresentacao-panel";
import { DUE_AREA_IDS, DUE_AREAS, type DueAreaId } from "@/lib/due-ppt/areas";
import {
  baixarArquivoLocal,
  dadosPorArea,
  gerarApresentacao,
  lerPlanilha,
  type DueDocumentoLista,
  type PlanilhaLida,
} from "@/lib/due-ppt/client";
import { analisarArea, type ResumoArea, type VarianteEfetiva } from "@/lib/due-ppt/compose";
import { draftSchema, emptyDraft, type DueApresentacaoDraft } from "@/lib/due-ppt/draft";
import { cn } from "@/lib/utils";

/**
 * Prévia da parte da área na apresentação da DUE (04/11/2026), no cartão da área do levantamento:
 * logo depois de anexar o relatório, o gestor vê como a área vai sair (números, formato, leitura
 * executiva e avisos da planilha), pode reescrever os textos e baixar só os slides dela. Usa o mesmo
 * cálculo e o mesmo rascunho da Apresentação automática (`analisarArea`, `due_apresentacoes`): o texto
 * editado aqui é o que entra nos slides e o que quem compila encontra no painel.
 */

export type PreviaDocumento = { id: string; originalFilename: string };

const FORMATO: Record<VarianteEfetiva, string> = {
  painel: "Painel com gráficos",
  detalhe: "Um slide por processo",
  lista: "Lista de processos",
};

/** `**trecho**` sai em negrito, como na apresentação. */
function TextoComNegrito({ texto }: { texto: string }) {
  const partes = texto.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {partes.map((parte, i) =>
        i % 2 === 1 ? (
          <strong key={i} className="font-semibold text-foreground">
            {parte}
          </strong>
        ) : (
          <Fragment key={i}>{parte}</Fragment>
        ),
      )}
    </>
  );
}

/** Rascunho com só esta área ligada (mantém capa, formato e textos já salvos). */
function draftSoDaArea(base: DueApresentacaoDraft, areaId: DueAreaId): DueApresentacaoDraft {
  const d = draftSchema.parse(JSON.parse(JSON.stringify(base)));
  for (const id of DUE_AREA_IDS) {
    const atual = d.areas[id] ?? { incluir: false, variante: "auto" as const, textos: {} };
    d.areas[id] = { ...atual, incluir: id === areaId };
  }
  return d;
}

function TextoEditavel({
  rotulo,
  texto,
  editado,
  podeEditar,
  salvando,
  onSalvar,
  onRestaurar,
}: {
  rotulo: string;
  texto: string;
  editado: boolean;
  podeEditar: boolean;
  salvando: boolean;
  onSalvar: (texto: string) => Promise<boolean>;
  onRestaurar: () => Promise<boolean>;
}) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(texto);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
          {rotulo}
          {editado ? <span className="ml-2 normal-case tracking-normal text-primary">· texto editado</span> : null}
        </p>
        {podeEditar && !editando ? (
          <span className="flex items-center gap-3">
            {editado ? (
              <button
                type="button"
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-foreground disabled:opacity-60"
                disabled={salvando}
                onClick={() => void onRestaurar()}
              >
                <RotateCcw className="h-3 w-3" aria-hidden />
                Voltar ao texto automático
              </button>
            ) : null}
            <button
              type="button"
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline disabled:opacity-60"
              disabled={salvando}
              onClick={() => {
                setValor(texto);
                setEditando(true);
              }}
            >
              <Pencil className="h-3 w-3" aria-hidden />
              Editar texto
            </button>
          </span>
        ) : null}
      </div>

      {editando ? (
        <div className="mt-1.5 space-y-2">
          <Textarea
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            rows={Math.min(8, Math.max(3, Math.ceil(valor.length / 100)))}
            className="bg-white text-xs leading-relaxed"
            aria-label={`Editar ${rotulo.toLowerCase()}`}
            autoFocus
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={salvando || !valor.trim()}
              onClick={() =>
                void onSalvar(valor).then((ok) => {
                  if (ok) setEditando(false);
                })
              }
            >
              {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
              Salvar texto
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={salvando} onClick={() => setEditando(false)}>
              Cancelar
            </Button>
            <span className="text-[11px] text-slate-500">
              Use <code>**trecho**</code> para negrito.
            </span>
          </div>
        </div>
      ) : (
        <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-slate-600">
          <TextoComNegrito texto={texto} />
        </p>
      )}
    </div>
  );
}

export function DueAreaPreviaRelatorio({
  leadId,
  areaId,
  documentos,
  razaoSocial,
  cnpj,
  abertaInicial,
}: {
  leadId: string;
  areaId: DueAreaId;
  documentos: PreviaDocumento[];
  razaoSocial: string;
  cnpj: string;
  abertaInicial: boolean;
}) {
  const [aberta, setAberta] = useState(abertaInicial);
  const [lidas, setLidas] = useState<Map<string, PlanilhaLida>>(new Map());
  // Rascunho da Apresentação automática (null = ainda não carregou ou sem acesso).
  const [rascunho, setRascunho] = useState<DueApresentacaoDraft | null>(null);
  const [podeEditar, setPodeEditar] = useState(false);
  const [salvandoTexto, setSalvandoTexto] = useState(false);
  const [erroTexto, setErroTexto] = useState<string | null>(null);
  const [baixando, setBaixando] = useState(false);
  const [erroDownload, setErroDownload] = useState<string | null>(null);
  const titulo = DUE_AREAS[areaId].titulo;
  const idsKey = documentos.map((d) => d.id).join(",");
  const apiRascunho = `/api/crm/leads/${encodeURIComponent(leadId)}/due-apresentacao`;

  const docsLista = useMemo(
    () =>
      documentos.map(
        (d) =>
          ({
            id: d.id,
            document_kind: "planilha_area",
            area_key: areaId,
            original_filename: d.originalFilename,
          }) as DueDocumentoLista,
      ),
    // A lista muda de identidade a cada render do cartão; os ids dizem se mudou de fato.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [idsKey, areaId],
  );

  /** Rascunho salvo, ou o inicial do painel quando ainda não existe (null se sem acesso). */
  async function lerRascunho(): Promise<{ draft: DueApresentacaoDraft | null; podeSalvar: boolean }> {
    const res = await fetch(apiRascunho, { cache: "no-store" });
    const body = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      draft?: unknown;
      sugestao?: Sugestao;
      migrationPending?: boolean;
    };
    if (!res.ok || !body.ok) return { draft: null, podeSalvar: false };
    const salvo = body.draft ? draftSchema.safeParse(body.draft) : null;
    const draft = salvo?.success
      ? salvo.data
      : body.sugestao
        ? draftInicial(body.sugestao, docsLista)
        : null;
    return { draft, podeSalvar: Boolean(draft) && !body.migrationPending };
  }

  // Lê no navegador só as planilhas ainda não lidas (mesma leitura da Apresentação automática).
  useEffect(() => {
    if (!aberta) return;
    let cancelado = false;
    for (const doc of documentos) {
      if (lidas.has(doc.id)) continue;
      void lerPlanilha(leadId, doc.id).then((lida) => {
        if (!cancelado) setLidas((cur) => new Map(cur).set(doc.id, lida));
      });
    }
    return () => {
      cancelado = true;
    };
    // `lidas` fora das dependências: a leitura de um arquivo não dispara a dos outros de novo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberta, leadId, idsKey]);

  // Textos já editados (aqui ou no painel), formato escolhido e capa vêm do rascunho.
  useEffect(() => {
    if (!aberta || rascunho) return;
    let cancelado = false;
    void lerRascunho()
      .then(({ draft, podeSalvar }) => {
        if (cancelado) return;
        setRascunho(draft);
        setPodeEditar(podeSalvar);
      })
      .catch(() => undefined);
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberta, leadId]);

  const base = useMemo(() => {
    if (rascunho) return rascunho;
    const d = emptyDraft();
    d.capa = { razaoSocial, cnpj, empresas: [] };
    return d;
  }, [rascunho, razaoSocial, cnpj]);

  const lendo = documentos.some((d) => !lidas.has(d.id));
  const dados = useMemo(
    () => (lendo ? null : (dadosPorArea(docsLista, lidas).find((a) => a.id === areaId) ?? null)),
    [lendo, docsLista, lidas, areaId],
  );
  const resumo: ResumoArea | null = useMemo(
    () => (dados ? analisarArea(dados, draftSoDaArea(base, areaId), new Date()) : null),
    [dados, base, areaId],
  );
  const textosEditados = base.areas[areaId]?.textos ?? {};
  const textoFinal = (chave: string) => textosEditados[chave] ?? resumo?.textos[chave]?.texto ?? "";

  async function gravarTexto(chave: string, valor: string | null): Promise<boolean> {
    setSalvandoTexto(true);
    setErroTexto(null);
    try {
      // Relê antes de gravar para não apagar o que foi salvo no painel da apresentação nesse meio-tempo.
      const { draft: atual } = await lerRascunho();
      if (!atual) throw new Error("Sem acesso ao rascunho da apresentação.");
      const ad = atual.areas[areaId] ?? { incluir: true, variante: "auto" as const, textos: {} };
      const textos = { ...ad.textos };
      const automatico = resumo?.textos[chave]?.texto ?? "";
      if (valor == null || valor.trim() === automatico.trim()) delete textos[chave];
      else textos[chave] = valor.trim();
      atual.areas[areaId] = { ...ad, textos };
      const res = await fetch(apiRascunho, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft: atual }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) throw new Error(body.error ?? "Não foi possível salvar o texto.");
      setRascunho(atual);
      return true;
    } catch (e) {
      setErroTexto(e instanceof Error ? e.message : "Não foi possível salvar o texto.");
      return false;
    } finally {
      setSalvandoTexto(false);
    }
  }

  const errosLeitura = documentos.flatMap((d) => {
    const erro = lidas.get(d.id)?.erro;
    return erro ? [`${d.originalFilename}: ${erro}`] : [];
  });
  const avisos = [
    ...documentos.flatMap((d) => (lidas.get(d.id)?.dados?.avisos ?? []).map((a) => `${d.originalFilename}: ${a}`)),
    ...(resumo?.avisos ?? []),
  ];
  const slidesPorProcesso = resumo ? Object.keys(resumo.textos).filter((k) => k.startsWith("resumo:")) : [];
  const temLeitura = Boolean(resumo?.textos.leitura);
  const kpis = numeros(resumo);
  const semDados = resumo != null && resumo.total === 0 && errosLeitura.length === 0;

  async function baixarSlides() {
    if (!dados) return;
    setBaixando(true);
    setErroDownload(null);
    try {
      const r = await gerarApresentacao({
        leadId,
        draft: draftSoDaArea(base, areaId),
        areas: [dados],
        logo: null,
        anexar: false,
      });
      const nome = `PRÉVIA ${titulo.toUpperCase()} - ${r.arquivo.name.replace(/^DUE DILIGENCE - /, "")}`;
      baixarArquivoLocal(new File([r.arquivo], nome, { type: r.arquivo.type }));
    } catch (e) {
      setErroDownload(e instanceof Error ? e.message : "Não foi possível montar os slides.");
    } finally {
      setBaixando(false);
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-[#dfe5ee] bg-[#f8fafc]">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
        aria-expanded={aberta}
        onClick={() => setAberta((v) => !v)}
      >
        <span className="flex min-w-0 items-center gap-2 text-xs font-bold text-[#102033]">
          <Presentation className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
          Prévia na apresentação
          {resumo && !semDados ? (
            <span className="truncate font-semibold text-slate-500">
              · {FORMATO[resumo.variante]}
              {resumo.variante === "detalhe" && slidesPorProcesso.length
                ? ` (${slidesPorProcesso.length} slide${slidesPorProcesso.length > 1 ? "s" : ""})`
                : ""}
            </span>
          ) : null}
        </span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-slate-400 transition-transform", aberta && "rotate-180")}
          aria-hidden
        />
      </button>

      {aberta ? (
        <div className="space-y-3 border-t border-[#dfe5ee] px-3 pb-3 pt-3">
          {lendo ? (
            <p className="flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              Lendo o relatório…
            </p>
          ) : null}

          {errosLeitura.length ? (
            <ul className="space-y-1 text-xs text-danger-text" role="alert">
              {errosLeitura.map((e) => (
                <li key={e} className="flex gap-1.5">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                  <span className="min-w-0 break-words">Não consegui ler {e}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {semDados ? (
            <p className="text-xs text-slate-600">
              Nenhum processo encontrado no relatório. Se a área não tem processos, use &quot;Sem processos ativos&quot;.
            </p>
          ) : null}

          {resumo && !semDados ? (
            <>
              {kpis.length ? (
                <div className="grid gap-2 sm:grid-cols-3">
                  {kpis.map((k) => (
                    <div key={k} className="rounded-lg border border-[#e4e9f0] bg-white px-2.5 py-2">
                      <p className="text-xs font-bold leading-snug text-[#102033]">{k}</p>
                    </div>
                  ))}
                </div>
              ) : null}

              {temLeitura ? (
                <TextoEditavel
                  key={`leitura:${textoFinal("leitura")}`}
                  rotulo="Leitura executiva"
                  texto={textoFinal("leitura")}
                  editado={textosEditados.leitura != null}
                  podeEditar={podeEditar}
                  salvando={salvandoTexto}
                  onSalvar={(v) => gravarTexto("leitura", v)}
                  onRestaurar={() => gravarTexto("leitura", null)}
                />
              ) : null}

              {resumo.variante === "detalhe" && slidesPorProcesso.length ? (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                    Slides por processo (maiores valores primeiro)
                  </p>
                  {slidesPorProcesso.slice(0, 3).map((k) => (
                    <div key={k} className="rounded-lg border border-[#e4e9f0] bg-white px-2.5 py-2">
                      <TextoEditavel
                        key={`${k}:${textoFinal(k)}`}
                        rotulo={resumo.textos[k]!.rotulo.replace(/^Resumo — /, "Processo ")}
                        texto={textoFinal(k)}
                        editado={textosEditados[k] != null}
                        podeEditar={podeEditar}
                        salvando={salvandoTexto}
                        onSalvar={(v) => gravarTexto(k, v)}
                        onRestaurar={() => gravarTexto(k, null)}
                      />
                    </div>
                  ))}
                  {slidesPorProcesso.length > 3 ? (
                    <p className="text-[11px] text-slate-500">
                      E mais {slidesPorProcesso.length - 3} no arquivo dos slides (os textos deles se editam na
                      Apresentação automática).
                    </p>
                  ) : null}
                </div>
              ) : null}

              {erroTexto ? <p className="text-xs text-danger-text">{erroTexto}</p> : null}
            </>
          ) : null}

          {avisos.length ? (
            <div className="rounded-lg border border-warning-border bg-warning-bg px-2.5 py-2">
              <p className="text-[11px] font-bold text-warning-text">Confira no relatório antes de entregar</p>
              <ul className="mt-1 space-y-0.5 text-xs text-warning-text">
                {avisos.map((a) => (
                  <li key={a} className="flex gap-1.5">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                    <span className="min-w-0 break-words">{a}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {resumo && !semDados ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" disabled={baixando} onClick={() => void baixarSlides()}>
                {baixando ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <Download className="h-3.5 w-3.5" aria-hidden />
                )}
                {baixando ? "Montando os slides…" : `Baixar slides de ${titulo} (.pptx)`}
              </Button>
              <p className="text-[11px] text-slate-500">
                Mesmos slides da apresentação, com a capa e as páginas do escritório e os textos como estão acima.
              </p>
            </div>
          ) : null}
          {erroDownload ? <p className="text-xs text-danger-text">{erroDownload}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
