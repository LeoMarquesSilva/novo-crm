"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ChevronDown, Download, Loader2, Presentation, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createSupabaseClient } from "@/lib/supabase/client";
import { limparCacheModelo } from "@/lib/due-ppt/client";
import { conferirModelo, SLIDES_DO_MODELO } from "@/lib/due-ppt/modelo";
import { formatDateTimeMinutesBr } from "@/lib/format-datetime";
import { cn } from "@/lib/utils";

type Modelo = {
  id: string;
  nomeArquivo: string;
  byteSize: number | null;
  observacao: string | null;
  ativo: boolean;
  enviadoEm: string;
  enviadoPor: string | null;
};

function mb(n: number | null): string {
  return n == null ? "—" : `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Modelos da apresentação automática da DUE: o ativo, o histórico e (admin) a troca.
 * O modelo novo é conferido no navegador antes do envio (slides SLIDE_* do contrato).
 */
export function DueModelosCard({ isAdmin }: { isAdmin: boolean }) {
  const [modelos, setModelos] = useState<Modelo[] | null>(null);
  const [semTabela, setSemTabela] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aberto, setAberto] = useState(false);
  const [ok, setOk] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const res = await fetch("/api/crm/due/modelos", { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) throw new Error(body.error ?? "Não foi possível carregar os modelos.");
      setModelos(body.modelos as Modelo[]);
      setSemTabela(!!body.semTabela);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar os modelos.");
      setModelos([]);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function baixar(id: string) {
    setOcupado(id);
    try {
      const res = await fetch(`/api/crm/due/modelos?download=${encodeURIComponent(id)}&attachment=1`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.signedUrl) throw new Error(body.error ?? "Falha ao baixar.");
      window.open(body.signedUrl as string, "_blank", "noopener,noreferrer");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao baixar.");
    } finally {
      setOcupado(null);
    }
  }

  async function enviar(file: File) {
    setErro(null);
    setOk(null);
    setOcupado("upload");
    try {
      const conferencia = conferirModelo(await file.arrayBuffer());
      if (conferencia.faltando.length) {
        throw new Error(
          `O modelo não tem estes slides marcados: ${conferencia.faltando.join(", ")}. Parta do modelo atual e mantenha os nomes SLIDE_* (Painel de Seleção do PowerPoint).`,
        );
      }
      const prep = await fetch("/api/crm/due/modelos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create-upload-url", filename: file.name }),
      });
      const p = await prep.json().catch(() => ({}));
      if (!prep.ok || !p.ok) throw new Error(p.error ?? "Falha ao preparar o envio.");
      const { error } = await createSupabaseClient()
        .storage.from("due-documents")
        .uploadToSignedUrl(p.storagePath, p.token, file, { contentType: p.contentType });
      if (error) throw new Error(error.message);
      const conf = await fetch("/api/crm/due/modelos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm", storagePath: p.storagePath, originalFilename: file.name }),
      });
      const c = await conf.json().catch(() => ({}));
      if (!conf.ok || !c.ok) throw new Error(c.error ?? "Falha ao salvar o modelo.");
      limparCacheModelo();
      setOk(
        `Modelo ativo: ${file.name} (${conferencia.slides} slides, ${conferencia.marcadores} campos).${conferencia.faltandoOpcionais.length ? ` Sem os opcionais: ${conferencia.faltandoOpcionais.join(", ")}.` : ""}`,
      );
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao enviar o modelo.");
    } finally {
      setOcupado(null);
    }
  }

  async function ativar(id: string) {
    setOcupado(id);
    setErro(null);
    try {
      const res = await fetch("/api/crm/due/modelos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) throw new Error(body.error ?? "Falha ao ativar.");
      limparCacheModelo();
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao ativar.");
    } finally {
      setOcupado(null);
    }
  }

  const ativo = modelos?.find((m) => m.ativo) ?? null;
  const anteriores = (modelos ?? []).filter((m) => !m.ativo);

  return (
    <div className="rounded-(--radius-v2-xl) border border-neutral-200 bg-white p-4">
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-(--radius-v2-lg) border border-orange-200 bg-orange-50 text-orange-600">
          <Presentation className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-foreground">Modelo da apresentação</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {modelos == null ? (
              "Carregando…"
            ) : ativo ? (
              <>
                {ativo.nomeArquivo} · {mb(ativo.byteSize)}
                {ativo.enviadoPor ? ` · enviado por ${ativo.enviadoPor}` : ""}
                {ativo.observacao ? ` · ${ativo.observacao}` : ""}
              </>
            ) : (
              "Nenhum modelo ativo."
            )}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            A apresentação de cada due é montada neste modelo, na ficha do lead (aba Due diligence → Apresentação
            automática).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {ativo ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="gap-1.5"
              onClick={() => void baixar(ativo.id)}
              disabled={!!ocupado}
            >
              {ocupado === ativo.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Download className="h-3.5 w-3.5" aria-hidden />}
              Baixar modelo
            </Button>
          ) : null}
          {isAdmin ? (
            <label
              className={cn(
                "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-(--radius-v2-lg) border border-border px-3 text-xs font-semibold text-foreground hover:bg-muted",
                (!!ocupado || semTabela) && "pointer-events-none opacity-60",
              )}
            >
              {ocupado === "upload" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Upload className="h-3.5 w-3.5" aria-hidden />}
              Enviar novo modelo
              <input
                type="file"
                accept=".pptx"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void enviar(f);
                }}
              />
            </label>
          ) : null}
        </div>
      </div>

      {ok ? (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-success-text">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> {ok}
        </p>
      ) : null}
      {erro ? <p className="mt-3 text-xs text-destructive">{erro}</p> : null}
      {semTabela && isAdmin ? (
        <p className="mt-3 text-xs text-warning-text">
          Para trocar o modelo e guardar histórico, falta aplicar a migration 20261020120000 no banco.
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="mt-3 flex items-center gap-1 text-xs font-semibold text-interactive-700"
        aria-expanded={aberto}
      >
        Como o modelo funciona{anteriores.length ? ` · ${anteriores.length} modelo(s) anterior(es)` : ""}
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", aberto && "rotate-180")} aria-hidden />
      </button>
      {aberto ? (
        <div className="mt-3 grid gap-4 border-t border-border/70 pt-3 lg:grid-cols-2">
          <div className="space-y-2 text-xs text-muted-foreground">
            <p>
              Cada slide do modelo tem um elemento com nome <code>SLIDE_…</code> (Página Inicial → Organizar → Painel de
              Seleção). O CRM usa esses nomes para escolher os slides de cada área e apaga os que não entram.
            </p>
            <p>
              Os valores ficam em campos <code>{"{{NOME}}"}</code> dentro das caixas de texto. Dá para mudar fonte, cor e
              posição à vontade; só não apague o campo nem renomeie os elementos.
            </p>
            <ul className="grid gap-0.5 sm:grid-cols-2">
              {SLIDES_DO_MODELO.map((s) => (
                <li key={s.marcador}>
                  <code className="text-[10px]">{s.marcador}</code> — {s.descricao}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground">Modelos anteriores</p>
            {anteriores.length ? (
              <ul className="mt-1 space-y-1">
                {anteriores.map((m) => (
                  <li key={m.id} className="flex items-center gap-2 text-xs">
                    <span className="min-w-0 flex-1 truncate text-foreground">{m.nomeArquivo}</span>
                    <span className="shrink-0 text-muted-foreground">{formatDateTimeMinutesBr(m.enviadoEm)}</span>
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => void baixar(m.id)} disabled={!!ocupado}>
                      Baixar
                    </Button>
                    {isAdmin ? (
                      <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => void ativar(m.id)} disabled={!!ocupado}>
                        Voltar a usar
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">Nenhum.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
