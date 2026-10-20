"use client";

import { useState, type ReactNode } from "react";
import { AlertTriangle, ChevronDown, FileSpreadsheet, Loader2, RotateCcw, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type {
  AnaliseCivel,
  AnaliseRecCred,
  AnaliseTrabalhista,
  AnaliseTributario,
} from "@/lib/due-ppt/analise";
import { DUE_AREAS, LIMITE_DETALHE, type DueAreaId } from "@/lib/due-ppt/areas";
import type { DueDocumentoLista, PlanilhaLida } from "@/lib/due-ppt/client";
import type { ResumoArea } from "@/lib/due-ppt/compose";
import type { AreaDraft, VarianteEscolha } from "@/lib/due-ppt/draft";
import { brl, brlCompacto } from "@/lib/due-ppt/format";
import { formatDateTimeBr } from "@/lib/format-datetime";
import { cn } from "@/lib/utils";

const VARIANTE_ROTULO: Record<Exclude<VarianteEscolha, "auto">, string> = {
  painel: "Painel com gráficos",
  detalhe: "Um slide por processo",
  lista: "Lista de processos",
};

function numeros(resumo: ResumoArea | null): string[] {
  if (!resumo) return [];
  const a = resumo.analise;
  switch (resumo.id) {
    case "civel": {
      const c = a as AnaliseCivel;
      return [`${c.ativos} ativos`, `${c.suspensos} suspensos`, `Potencial passivo ${brl(c.passivo)}`];
    }
    case "trabalhista": {
      const t = a as AnaliseTrabalhista;
      return [`${t.ativos} ativos`, `${t.arquivados} arquivados`, `Potencial passivo ${brl(t.passivo)}`];
    }
    case "tributario": {
      const t = a as AnaliseTributario;
      return [
        `${t.processos} execuções fiscais`,
        `Judicial ${brlCompacto(t.passivoJudicial)}`,
        `Administrativo ${brlCompacto(t.administrativo)}`,
      ];
    }
    case "rec_cred": {
      const r = a as AnaliseRecCred;
      return [`${r.ativos} ativos`, `${r.arquivados} arquivados`, `Crédito ${brl(r.valorCausa)}`];
    }
    case "reestruturacao":
      return resumo.passivo ? [`Passivo total ${brl(resumo.passivo)}`] : [];
  }
}

export function DueAreaCard({
  id,
  draft,
  incluida,
  docs,
  lidas,
  resumo,
  onChange,
  onUpload,
  onRemove,
  enviando,
  children,
}: {
  id: DueAreaId;
  draft: AreaDraft;
  incluida: boolean;
  docs: DueDocumentoLista[];
  lidas: Map<string, PlanilhaLida>;
  resumo: ResumoArea | null;
  onChange: (patch: Partial<AreaDraft>) => void;
  onUpload: (file: File) => void;
  onRemove: (doc: DueDocumentoLista) => void;
  enviando: boolean;
  children?: ReactNode;
}) {
  const def = DUE_AREAS[id];
  const [aberto, setAberto] = useState(false);
  const textos = resumo ? Object.entries(resumo.textos) : [];
  const avisosPlanilha = docs.flatMap((d) => {
    const l = lidas.get(d.id);
    if (!l) return [];
    if (l.erro) return [`${d.original_filename}: ${l.erro}`];
    return (l.dados?.avisos ?? []).map((a) => `${d.original_filename}: ${a}`);
  });
  const lendo = docs.some((d) => !lidas.has(d.id));
  const autoLabel =
    def.variantes.length === 1
      ? "Automático"
      : resumo
        ? `Automático (${resumo.considerados > 0 && resumo.considerados <= LIMITE_DETALHE ? "um slide por processo" : "painel com gráficos"})`
        : "Automático";

  return (
    <div
      className={cn(
        "rounded-(--radius-v2-xl) border p-4 transition-colors",
        incluida ? "border-border bg-white" : "border-dashed border-border bg-muted/20",
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <Switch
          checked={incluida}
          onCheckedChange={(v) => onChange({ incluir: v })}
          aria-label={`Incluir ${def.titulo} na apresentação`}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{def.titulo}</p>
          {incluida ? (
            <p className="text-xs text-muted-foreground">
              {lendo
                ? "Lendo planilhas…"
                : numeros(resumo).join(" · ") ||
                  (def.usaPlanilha ? "Sem planilha anexada" : "Preencha os dados da recuperação judicial")}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Fora da apresentação</p>
          )}
        </div>
        {incluida && (def.usaPlanilha || children) ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1"
            onClick={() => setAberto((v) => !v)}
            aria-expanded={aberto}
          >
            {aberto ? "Fechar" : "Detalhes"}
            <ChevronDown className={cn("h-4 w-4 transition-transform", aberto && "rotate-180")} aria-hidden />
          </Button>
        ) : null}
      </div>

      {incluida && aberto ? (
        <div className="mt-4 space-y-4 border-t border-border/70 pt-4">
          {def.usaPlanilha ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">Planilhas</p>
              {docs.length ? (
                <ul className="space-y-1">
                  {docs.map((d) => {
                    const l = lidas.get(d.id);
                    return (
                      <li key={d.id} className="flex items-center gap-2 text-xs">
                        <FileSpreadsheet className="h-4 w-4 shrink-0 text-success-text" aria-hidden />
                        <span className="min-w-0 flex-1 truncate font-medium text-foreground">{d.original_filename}</span>
                        <span className="shrink-0 text-muted-foreground">
                          {!l ? (
                            <Loader2 className="inline h-3 w-3 animate-spin" aria-hidden />
                          ) : l.erro ? (
                            "erro"
                          ) : (
                            `${l.dados?.processos.length ?? 0} processos`
                          )}{" "}
                          · {formatDateTimeBr(d.uploaded_at)}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remover ${d.original_filename}`}
                          onClick={() => onRemove(d)}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">Nenhuma planilha desta área ainda.</p>
              )}
              <label
                className={cn(
                  "inline-flex cursor-pointer items-center gap-1.5 rounded-(--radius-v2-lg) border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted",
                  enviando && "pointer-events-none opacity-60",
                )}
              >
                <Upload className="h-3.5 w-3.5" aria-hidden />
                Anexar planilha de {def.titulo}
                <input
                  type="file"
                  accept=".xlsx"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) onUpload(f);
                  }}
                />
              </label>
              {avisosPlanilha.length ? (
                <ul className="space-y-0.5 text-xs text-warning-text">
                  {avisosPlanilha.map((a) => (
                    <li key={a} className="flex gap-1.5">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden /> {a}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {def.variantes.length > 1 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">Formato na apresentação</p>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={`Formato de ${def.titulo}`}>
                {(["auto", ...def.variantes] as VarianteEscolha[]).map((v) => (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={draft.variante === v}
                    onClick={() => onChange({ variante: v })}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                      draft.variante === v
                        ? "border-brand-navy bg-brand-navy text-white"
                        : "border-border bg-white text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {v === "auto" ? autoLabel : VARIANTE_ROTULO[v]}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Até {LIMITE_DETALHE} processos ativos, o automático faz um slide por processo; acima disso, o painel com
                gráficos.
              </p>
            </div>
          ) : null}

          {resumo?.avisos.length ? (
            <ul className="space-y-0.5 text-xs text-warning-text">
              {resumo.avisos.map((a) => (
                <li key={a} className="flex gap-1.5">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden /> {a}
                </li>
              ))}
            </ul>
          ) : null}

          {textos.length ? (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground">
                Textos da apresentação (gerados pelos números — pode editar; <code>**trecho**</code> sai em negrito)
              </p>
              {textos.map(([chave, t]) => {
                const editado = draft.textos[chave];
                return (
                  <div key={chave} className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <label htmlFor={`due-${id}-${chave}`} className="text-xs font-medium text-foreground">
                        {t.rotulo}
                      </label>
                      {editado != null ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-interactive-700 hover:underline"
                          onClick={() => {
                            const next = { ...draft.textos };
                            delete next[chave];
                            onChange({ textos: next });
                          }}
                        >
                          <RotateCcw className="h-3 w-3" aria-hidden /> Voltar ao texto automático
                        </button>
                      ) : null}
                    </div>
                    <Textarea
                      id={`due-${id}-${chave}`}
                      rows={Math.min(6, Math.max(2, Math.ceil((editado ?? t.texto).length / 110)))}
                      value={editado ?? t.texto}
                      onChange={(e) => onChange({ textos: { ...draft.textos, [chave]: e.target.value } })}
                      className="text-xs"
                    />
                  </div>
                );
              })}
            </div>
          ) : null}

          {children}
        </div>
      ) : null}
    </div>
  );
}
