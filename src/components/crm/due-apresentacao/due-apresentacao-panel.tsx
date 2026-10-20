"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  ImagePlus,
  Loader2,
  Presentation,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DUE_AREAS, DUE_AREA_IDS, type DueAreaId } from "@/lib/due-ppt/areas";
import {
  baixarArquivoLocal,
  baixarDocumentoDue,
  dadosPorArea,
  enviarLogo,
  enviarPlanilha,
  gerarApresentacao,
  lerPlanilha,
  listarDocumentosDue,
  removerDocumentoDue,
  type DueDocumentoLista,
  type PlanilhaLida,
} from "@/lib/due-ppt/client";
import { composeDeck } from "@/lib/due-ppt/compose";
import { areaDraft, draftSchema, emptyDraft, type AreaDraft, type DueApresentacaoDraft } from "@/lib/due-ppt/draft";
import { formatDateTimeBr } from "@/lib/format-datetime";
import { detectarArea, normalizarPlanilha } from "@/lib/due-ppt/processos";
import { readXlsx } from "@/lib/due-ppt/xlsx-reader";
import type { ImageAsset } from "@/lib/due-ppt/pptx/image";
import { cn } from "@/lib/utils";
import { DueAreaCard } from "./due-area-card";
import { ReestruturacaoForm } from "./reestruturacao-form";

type Sugestao = {
  razaoSocial: string;
  cnpj: string;
  empresas: Array<{ razaoSocial: string; cnpj: string }>;
  areas: DueAreaId[];
};

type Pendente = { key: string; file: File; bytes: ArrayBuffer; erro?: string };

const PLANILHA_AREAS = DUE_AREA_IDS.filter((a) => DUE_AREAS[a].usaPlanilha);

function draftInicial(s: Sugestao, docs: DueDocumentoLista[]): DueApresentacaoDraft {
  const d = emptyDraft();
  d.capa = { razaoSocial: s.razaoSocial, cnpj: s.cnpj, empresas: s.empresas };
  const comPlanilha = new Set(docs.filter((x) => x.document_kind === "planilha_area").map((x) => x.area_key));
  for (const id of DUE_AREA_IDS) {
    if (s.areas.includes(id) || comPlanilha.has(id)) d.areas[id] = { incluir: true, variante: "auto", textos: {} };
  }
  return d;
}

export function DueApresentacaoPanel({
  leadId,
  etapa,
  onGenerated,
}: {
  leadId: string;
  etapa: string;
  onGenerated?: () => void;
}) {
  const [draft, setDraft] = useState<DueApresentacaoDraft | null>(null);
  const [docs, setDocs] = useState<DueDocumentoLista[]>([]);
  const [lidas, setLidas] = useState<Map<string, PlanilhaLida>>(new Map());
  const [logo, setLogo] = useState<ImageAsset | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [avisoBanco, setAvisoBanco] = useState<string | null>(null);
  const [salvo, setSalvo] = useState<{ estado: "ok" | "salvando" | "erro"; em: string | null }>({ estado: "ok", em: null });
  const [gerado, setGerado] = useState<{ em: string | null }>({ em: null });
  const [pendentes, setPendentes] = useState<Pendente[]>([]);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [gerando, setGerando] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ nome: string; slides: number; avisos: string[]; anexado: boolean } | null>(null);
  const salvarTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const podeSalvar = useRef(true);
  const carregou = useRef(false);

  // ─── carga ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const [resDraft, lista] = await Promise.all([
          fetch(`/api/crm/leads/${encodeURIComponent(leadId)}/due-apresentacao`, { cache: "no-store" }).then(
            async (r) => {
              const b = await r.json().catch(() => ({}));
              if (!r.ok || !b.ok) throw new Error(b.error ?? "Não foi possível carregar a apresentação.");
              return b as {
                draft: DueApresentacaoDraft | null;
                sugestao: Sugestao;
                atualizadoEm: string | null;
                geradoEm: string | null;
                migrationPending: boolean;
                aviso: string | null;
              };
            },
          ),
          listarDocumentosDue(leadId),
        ]);
        if (!vivo) return;
        setDocs(lista);
        setDraft(resDraft.draft ? draftSchema.parse(resDraft.draft) : draftInicial(resDraft.sugestao, lista));
        setSalvo({ estado: "ok", em: resDraft.atualizadoEm });
        setGerado({ em: resDraft.geradoEm });
        if (resDraft.migrationPending) {
          podeSalvar.current = false;
          setAvisoBanco(resDraft.aviso);
        }
        setCarregando(false);
        carregou.current = true;

        const planilhas = lista.filter((d) => d.document_kind === "planilha_area");
        const lidasAgora = await Promise.all(planilhas.map((d) => lerPlanilha(leadId, d.id)));
        if (!vivo) return;
        setLidas(new Map(lidasAgora.map((l) => [l.documentId, l])));

        const logoDoc = lista.find((d) => d.document_kind === "logo_cliente");
        if (logoDoc) {
          const bytes = await baixarDocumentoDue(leadId, logoDoc.id);
          if (!vivo) return;
          aplicarLogo(new Uint8Array(bytes), logoDoc.content_type);
        }
      } catch (e) {
        if (vivo) {
          setErro(e instanceof Error ? e.message : "Erro ao carregar.");
          setCarregando(false);
        }
      }
    })();
    return () => {
      vivo = false;
    };
  }, [leadId]);

  function aplicarLogo(bytes: Uint8Array, contentType: string | null) {
    const ct = contentType === "image/png" ? "image/png" : "image/jpeg";
    setLogo({ bytes, contentType: ct });
    setLogoUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(new Blob([bytes as BlobPart], { type: ct }));
    });
  }

  // ─── rascunho (salva sozinho) ───────────────────────────────────────────────
  const salvar = useCallback(
    async (d: DueApresentacaoDraft) => {
      if (!podeSalvar.current) return;
      setSalvo((s) => ({ ...s, estado: "salvando" }));
      try {
        const res = await fetch(`/api/crm/leads/${encodeURIComponent(leadId)}/due-apresentacao`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ draft: d }),
        });
        const body = await res.json().catch(() => ({}));
        if (res.status === 409 && body.migrationPending) {
          podeSalvar.current = false;
          setAvisoBanco(body.error);
          setSalvo((s) => ({ ...s, estado: "erro" }));
          return;
        }
        if (!res.ok || !body.ok) throw new Error(body.error ?? "Falha ao salvar.");
        setSalvo({ estado: "ok", em: body.atualizadoEm });
      } catch {
        setSalvo((s) => ({ ...s, estado: "erro" }));
      }
    },
    [leadId],
  );

  const atualizar = useCallback(
    (fn: (d: DueApresentacaoDraft) => DueApresentacaoDraft) => {
      setDraft((cur) => {
        if (!cur) return cur;
        const next = fn(structuredClone(cur));
        if (carregou.current) {
          if (salvarTimer.current) clearTimeout(salvarTimer.current);
          salvarTimer.current = setTimeout(() => void salvar(next), 1200);
        }
        return next;
      });
    },
    [salvar],
  );

  useEffect(
    () => () => {
      if (salvarTimer.current) clearTimeout(salvarTimer.current);
    },
    [],
  );

  const setArea = useCallback(
    (id: DueAreaId, patch: Partial<AreaDraft>) =>
      atualizar((d) => {
        d.areas[id] = { ...areaDraft(d, id), ...patch };
        return d;
      }),
    [atualizar],
  );

  // ─── planilhas ──────────────────────────────────────────────────────────────
  async function anexar(file: File, area: DueAreaId, bytes?: ArrayBuffer) {
    setEnviando(file.name);
    setErro(null);
    try {
      const buf = bytes ?? (await file.arrayBuffer());
      const dados = normalizarPlanilha(readXlsx(buf));
      const doc = await enviarPlanilha(leadId, file, area);
      setDocs((cur) => [doc, ...cur]);
      setLidas((cur) => new Map(cur).set(doc.id, { documentId: doc.id, dados }));
      setArea(area, { incluir: true });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao anexar a planilha.");
    } finally {
      setEnviando(null);
    }
  }

  async function soltarArquivos(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      if (!/\.xlsx$/i.test(file.name)) {
        setErro(`${file.name}: envie a planilha em .xlsx.`);
        continue;
      }
      const bytes = await file.arrayBuffer();
      let area: DueAreaId | null = null;
      try {
        area = detectarArea(file.name, readXlsx(bytes));
      } catch (e) {
        setErro(`${file.name}: ${e instanceof Error ? e.message : "planilha ilegível."}`);
        continue;
      }
      if (area && DUE_AREAS[area].usaPlanilha) await anexar(file, area, bytes);
      else setPendentes((cur) => [...cur, { key: `${file.name}-${Date.now()}`, file, bytes }]);
    }
  }

  async function remover(doc: DueDocumentoLista) {
    if (!window.confirm(`Remover ${doc.original_filename}?`)) return;
    try {
      await removerDocumentoDue(leadId, doc.id);
      setDocs((cur) => cur.filter((d) => d.id !== doc.id));
      setLidas((cur) => {
        const m = new Map(cur);
        m.delete(doc.id);
        return m;
      });
      if (doc.document_kind === "logo_cliente") {
        setLogo(null);
        setLogoUrl(null);
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao remover.");
    }
  }

  async function trocarLogo(file: File) {
    setEnviando(file.name);
    setErro(null);
    try {
      const antigos = docs.filter((d) => d.document_kind === "logo_cliente");
      const doc = await enviarLogo(leadId, file);
      for (const a of antigos) await removerDocumentoDue(leadId, a.id).catch(() => undefined);
      setDocs((cur) => [doc, ...cur.filter((d) => d.document_kind !== "logo_cliente")]);
      aplicarLogo(new Uint8Array(await file.arrayBuffer()), doc.content_type);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao enviar o logo.");
    } finally {
      setEnviando(null);
    }
  }

  // ─── prévia (números e textos gerados) ─────────────────────────────────────
  const areasDados = useMemo(() => dadosPorArea(docs, lidas), [docs, lidas]);
  const previa = useMemo(() => {
    if (!draft) return null;
    try {
      return composeDeck({ draft, areas: areasDados, logo: null, hoje: new Date() });
    } catch {
      return null;
    }
  }, [draft, areasDados]);
  const lendo = docs.some((d) => d.document_kind === "planilha_area" && !lidas.has(d.id));

  async function gerar(anexar: boolean) {
    if (!draft) return;
    setErro(null);
    setResultado(null);
    if (salvarTimer.current) {
      clearTimeout(salvarTimer.current);
      void salvar(draft);
    }
    try {
      setGerando("Preparando…");
      const r = await gerarApresentacao({
        leadId,
        draft,
        areas: areasDados,
        logo,
        anexar,
        onEtapa: setGerando,
      });
      baixarArquivoLocal(r.arquivo);
      setResultado({ nome: r.arquivo.name, slides: r.slides, avisos: r.avisos, anexado: !!r.documento });
      if (r.documento) {
        setGerado({ em: new Date().toISOString() });
        onGenerated?.();
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao gerar a apresentação.");
    } finally {
      setGerando(null);
    }
  }

  // ─── render ─────────────────────────────────────────────────────────────────
  if (carregando) {
    return (
      <Card className="border-border bg-white p-5 sm:p-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Carregando a apresentação da DUE…
        </div>
      </Card>
    );
  }
  if (!draft) {
    return (
      <Card className="border-border bg-white p-5 sm:p-6">
        <p className="text-sm text-destructive">{erro ?? "Não foi possível carregar a apresentação."}</p>
      </Card>
    );
  }

  const logoDoc = docs.find((d) => d.document_kind === "logo_cliente");
  const incluidas = DUE_AREA_IDS.filter((id) => draft.areas[id]?.incluir);
  const podeAnexar = ["compilacao", "revisao"].includes(etapa);

  return (
    <section id="due-apresentacao" className="scroll-mt-6">
      <Card className="border-border bg-white p-5 sm:p-6">
        <CardHeader className="px-0 pt-0">
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-[#24615b]">
            <Sparkles className="h-4 w-4" aria-hidden />
            Due Diligence
          </div>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <CardTitle className="text-lg font-semibold tracking-tight text-foreground">
                Apresentação automática
              </CardTitle>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Anexe as planilhas que chegaram das áreas. O CRM calcula os números, escolhe o formato de cada área
                e monta o PPT no modelo do escritório. Revise os textos antes de gerar.
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {salvo.estado === "salvando"
                  ? "Salvando…"
                  : salvo.estado === "erro"
                    ? "Rascunho não salvo"
                    : salvo.em
                      ? `Rascunho salvo em ${formatDateTimeBr(salvo.em)}`
                      : "Rascunho novo"}
                {gerado.em ? ` · Última apresentação gerada em ${formatDateTimeBr(gerado.em)}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => void gerar(false)}
                disabled={!!gerando || lendo}
                className="gap-1.5"
              >
                <Download className="h-4 w-4" aria-hidden />
                Só baixar
              </Button>
              {podeAnexar ? (
                <Button type="button" onClick={() => void gerar(true)} disabled={!!gerando || lendo} className="gap-1.5">
                  {gerando ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Presentation className="h-4 w-4" aria-hidden />
                  )}
                  Gerar e anexar à compilação
                </Button>
              ) : null}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-5 px-0 pb-0">
          {avisoBanco ? (
            <p className="flex items-start gap-2 rounded-(--radius-v2-md) border border-warning-border bg-warning-bg px-3 py-2 text-xs text-warning-text">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {avisoBanco}
            </p>
          ) : null}
          {erro ? (
            <p className="rounded-(--radius-v2-md) border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {erro}
            </p>
          ) : null}
          {gerando ? (
            <p className="flex items-center gap-2 rounded-(--radius-v2-md) border border-info-border bg-info-bg px-3 py-2 text-xs text-info-text">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> {gerando}
            </p>
          ) : null}
          {resultado ? (
            <div className="rounded-(--radius-v2-md) border border-success-border bg-success-bg px-3 py-2 text-xs text-success-text">
              <p className="flex items-center gap-2 font-semibold">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                {resultado.nome} — {resultado.slides} slides
                {resultado.anexado ? " · anexado à compilação" : " · baixado"}
              </p>
              {resultado.avisos.length ? (
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-warning-text">
                  {resultado.avisos.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {/* Capa */}
          <div className="rounded-(--radius-v2-xl) border border-border p-4">
            <h3 className="text-sm font-semibold text-foreground">Capa</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_220px]">
              <div className="space-y-1.5">
                <Label htmlFor="due-razao">Razão social</Label>
                <Input
                  id="due-razao"
                  value={draft.capa.razaoSocial}
                  onChange={(e) =>
                    atualizar((d) => {
                      d.capa.razaoSocial = e.target.value;
                      return d;
                    })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="due-cnpj">CNPJ</Label>
                <Input
                  id="due-cnpj"
                  value={draft.capa.cnpj}
                  onChange={(e) =>
                    atualizar((d) => {
                      d.capa.cnpj = e.target.value;
                      return d;
                    })
                  }
                />
              </div>
            </div>
            <div className="mt-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">Demais empresas diligenciadas (até 3)</p>
              {draft.capa.empresas.map((e, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-[1fr_220px_auto]">
                  <Input
                    aria-label={`Razão social da empresa ${i + 2}`}
                    value={e.razaoSocial}
                    onChange={(ev) =>
                      atualizar((d) => {
                        d.capa.empresas[i]!.razaoSocial = ev.target.value;
                        return d;
                      })
                    }
                  />
                  <Input
                    aria-label={`CNPJ da empresa ${i + 2}`}
                    value={e.cnpj}
                    onChange={(ev) =>
                      atualizar((d) => {
                        d.capa.empresas[i]!.cnpj = ev.target.value;
                        return d;
                      })
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remover empresa"
                    onClick={() =>
                      atualizar((d) => {
                        d.capa.empresas.splice(i, 1);
                        return d;
                      })
                    }
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              ))}
              {draft.capa.empresas.length < 3 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    atualizar((d) => {
                      d.capa.empresas.push({ razaoSocial: "", cnpj: "" });
                      return d;
                    })
                  }
                >
                  + Adicionar empresa
                </Button>
              ) : null}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <div className="flex h-14 w-32 items-center justify-center overflow-hidden rounded-(--radius-v2-md) border border-dashed border-border bg-muted/30">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="Logo do cliente" className="max-h-full max-w-full object-contain" />
                ) : (
                  <span className="text-[11px] text-muted-foreground">Sem logo</span>
                )}
              </div>
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-(--radius-v2-lg) border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted">
                <ImagePlus className="h-3.5 w-3.5" aria-hidden />
                {logoDoc ? "Trocar logo do cliente" : "Logo do cliente (opcional)"}
                <input
                  type="file"
                  accept=".png,.jpg,.jpeg,image/png,image/jpeg"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void trocarLogo(f);
                  }}
                />
              </label>
              {logoDoc ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => void remover(logoDoc)}>
                  Remover logo
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">Sem logo, a capa sai só com a marca do escritório.</span>
              )}
            </div>
          </div>

          {/* Entrada geral de planilhas */}
          <label
            className={cn(
              "flex cursor-pointer flex-col items-center gap-1.5 rounded-(--radius-v2-xl) border border-dashed border-interactive-300 bg-interactive-50/50 px-4 py-5 text-center transition-colors hover:bg-interactive-50",
              enviando && "pointer-events-none opacity-70",
            )}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void soltarArquivos(e.dataTransfer.files);
            }}
          >
            {enviando ? (
              <Loader2 className="h-5 w-5 animate-spin text-interactive-700" aria-hidden />
            ) : (
              <Upload className="h-5 w-5 text-interactive-700" aria-hidden />
            )}
            <span className="text-sm font-semibold text-foreground">
              {enviando ? `Enviando ${enviando}…` : "Solte aqui as planilhas das áreas (.xlsx)"}
            </span>
            <span className="text-xs text-muted-foreground">
              O CRM reconhece a área pelo nome do arquivo e pelas colunas. Dá para enviar várias de uma vez.
            </span>
            <input
              type="file"
              accept=".xlsx"
              multiple
              className="sr-only"
              onChange={(e) => {
                const files = e.target.files ? Array.from(e.target.files) : [];
                e.target.value = "";
                if (files.length) void soltarArquivos(files);
              }}
            />
          </label>

          {pendentes.map((p) => (
            <div
              key={p.key}
              className="flex flex-wrap items-center gap-2 rounded-(--radius-v2-md) border border-warning-border bg-warning-bg px-3 py-2 text-xs"
            >
              <FileSpreadsheet className="h-4 w-4 text-warning-text" aria-hidden />
              <span className="font-semibold text-foreground">{p.file.name}</span>
              <span className="text-warning-text">— de qual área é esta planilha?</span>
              {PLANILHA_AREAS.map((a) => (
                <Button
                  key={a}
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-7 px-2 text-xs"
                  onClick={() => {
                    setPendentes((cur) => cur.filter((x) => x.key !== p.key));
                    void anexar(p.file, a, p.bytes);
                  }}
                >
                  {DUE_AREAS[a].titulo}
                </Button>
              ))}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => setPendentes((cur) => cur.filter((x) => x.key !== p.key))}
              >
                Descartar
              </Button>
            </div>
          ))}

          {/* Áreas */}
          <div className="space-y-3">
            {DUE_AREA_IDS.map((id) => (
              <DueAreaCard
                key={id}
                id={id}
                draft={areaDraft(draft, id)}
                incluida={!!draft.areas[id]?.incluir}
                docs={docs.filter((d) => d.document_kind === "planilha_area" && d.area_key === id)}
                lidas={lidas}
                resumo={previa?.resumos.find((r) => r.id === id) ?? null}
                onChange={(patch) => setArea(id, patch)}
                onUpload={(file) => void anexar(file, id)}
                onRemove={(doc) => void remover(doc)}
                enviando={!!enviando}
              >
                {id === "reestruturacao" ? (
                  <ReestruturacaoForm
                    leadId={leadId}
                    value={draft.reestruturacao}
                    onChange={(form) =>
                      atualizar((d) => {
                        d.reestruturacao = form;
                        return d;
                      })
                    }
                  />
                ) : null}
              </DueAreaCard>
            ))}
          </div>

          {previa?.avisos.length ? (
            <div className="rounded-(--radius-v2-md) border border-warning-border bg-warning-bg px-3 py-2 text-xs text-warning-text">
              <p className="flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> Antes de gerar
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {previa.avisos.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <p className="text-xs text-muted-foreground">
            {incluidas.length
              ? `Entram na apresentação: ${incluidas.map((id) => DUE_AREAS[id].titulo).join(", ")}.`
              : "Nenhuma área marcada: a apresentação sai só com as páginas institucionais."}
            {lendo ? " Lendo as planilhas…" : ""}
            {!podeAnexar ? " Para anexar o PPT à compilação, a negociação precisa estar em Compilação ou Revisão." : ""}
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
