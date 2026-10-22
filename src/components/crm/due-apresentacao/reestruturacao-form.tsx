"use client";

import { useMemo, useRef, useState } from "react";
import { FileText, Loader2, Plus, Sparkles, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateInputBr } from "@/components/ui/date-input-br";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ReestruturacaoForm as Form } from "@/lib/due-ppt/draft";
import { maskBrlCurrencyFromInput, parseBrlUserInput } from "@/lib/crm/proposta-valor-brl-extenso";
import { REEST_PDF_MAX_ARQUIVOS } from "@/lib/due-ppt/reestruturacao-ia";
import { aceitasPadrao, aplicarSugestoes, destacado, sugestoesIa } from "@/lib/due-ppt/reestruturacao-mescla";
import { lerPdfsReestruturacao } from "@/lib/due-ppt/reestruturacao-pdf-client";
import { cn } from "@/lib/utils";

/** Campo preenchido pela IA (também enquanto o formulário está travado na revisão). */
const DESTAQUE_IA =
  "border-info-border bg-info-bg disabled:border-info-border disabled:bg-info-bg disabled:text-foreground";

function formatarValor(v: number | null): string {
  if (v == null) return "";
  return maskBrlCurrencyFromInput(String(Math.round(v * 100)));
}

/**
 * Campo de valor em reais, no mesmo padrão dos valores da proposta e do contrato: digita-se só
 * números e o valor enche pelos centavos (`150000` → `R$ 1.500,00`). Grava número (ou vazio).
 */
function ValorInput({
  id,
  value,
  onChange,
  label,
  className,
}: {
  id: string;
  value: number | null;
  onChange: (v: number | null) => void;
  label: string;
  className?: string;
}) {
  return (
    <Input
      id={id}
      aria-label={label}
      inputMode="numeric"
      autoComplete="off"
      placeholder="R$ 0,00"
      value={formatarValor(value)}
      onChange={(e) => {
        const masked = maskBrlCurrencyFromInput(e.target.value);
        onChange(masked ? parseBrlUserInput(masked) : null);
      }}
      className={cn("tabular-nums", className)}
    />
  );
}

function Campo({
  id,
  label,
  value,
  onChange,
  multiline,
  placeholder,
  className,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      {multiline ? (
        <Textarea id={id} rows={2} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={cn("text-xs", className)} />
      ) : (
        <Input id={id} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={className} />
      )}
    </div>
  );
}

type Revisao = { ia: Form; aceitas: Set<string>; arquivos: string[]; avisos: string[] };
type Aplicado = { antes: Form; depois: Form; destacados: Set<string> };

export function ReestruturacaoForm({
  leadId,
  value,
  onChange,
}: {
  leadId: string;
  value: Form;
  onChange: (v: Form) => void;
}) {
  const set = <K extends keyof Form>(k: K, v: Form[K]) => onChange({ ...value, [k]: v });

  // ─── leitura dos PDFs pela IA ────────────────────────────────────────────────
  const inputPdf = useRef<HTMLInputElement>(null);
  const [lendo, setLendo] = useState<string | null>(null);
  const [erroIa, setErroIa] = useState<string | null>(null);
  const [avisoIa, setAvisoIa] = useState<string[]>([]);
  // Sugestões em revisão: o formulário mostra como fica, travado, até aplicar ou descartar.
  const [revisao, setRevisao] = useState<Revisao | null>(null);
  // Última aplicação: destaque e "Desfazer" valem enquanto o formulário não for mexido depois.
  const [aplicado, setAplicado] = useState<Aplicado | null>(null);

  const sugestoes = useMemo(() => (revisao ? sugestoesIa(value, revisao.ia) : []), [revisao, value]);
  const previa = useMemo(
    () => (revisao ? aplicarSugestoes(value, revisao.ia, revisao.aceitas) : null),
    [revisao, value],
  );
  const aindaAplicado = !!aplicado && JSON.stringify(aplicado.depois) === JSON.stringify(value);
  const f = previa?.form ?? value;
  const destacados = previa?.destacados ?? (aindaAplicado && aplicado ? aplicado.destacados : null);
  const hl = (caminho: string) => (destacado(destacados, caminho) ? DESTAQUE_IA : undefined);
  const aceitasValidas = sugestoes.filter((s) => revisao?.aceitas.has(s.chave)).length;

  async function lerPdfs(files: File[]) {
    setErroIa(null);
    setAvisoIa([]);
    setAplicado(null);
    setLendo("Preparando…");
    try {
      const r = await lerPdfsReestruturacao(leadId, files, setLendo);
      const novas = sugestoesIa(value, r.sugestao);
      if (!novas.length) {
        setAvisoIa([...r.avisos, "A IA não achou nos PDFs nada que já não esteja no formulário."]);
        return;
      }
      setAvisoIa(r.avisos);
      setRevisao({ ia: r.sugestao, aceitas: aceitasPadrao(novas), arquivos: files.map((x) => x.name), avisos: r.avisos });
    } catch (e) {
      setErroIa(e instanceof Error ? e.message : "Falha ao ler os PDFs.");
    } finally {
      setLendo(null);
      if (inputPdf.current) inputPdf.current.value = "";
    }
  }

  function alternar(chave: string) {
    setRevisao((r) => {
      if (!r) return r;
      const aceitas = new Set(r.aceitas);
      if (aceitas.has(chave)) aceitas.delete(chave);
      else aceitas.add(chave);
      return { ...r, aceitas };
    });
  }

  function aplicar() {
    if (!previa) return;
    setAplicado({ antes: value, depois: previa.form, destacados: previa.destacados });
    setRevisao(null);
    setAvisoIa([]);
    onChange(previa.form);
  }

  function desfazer() {
    if (!aplicado) return;
    onChange(aplicado.antes);
    setAplicado(null);
  }

  const mostrarExtra =
    f.classes.length > 0 || f.extraconcursalEdital != null || f.extraconcursalAj != null || !!f.endividamentoResumo;

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 rounded-(--radius-v2-md) border border-dashed border-border px-3 py-2">
          <Sparkles className="h-4 w-4 shrink-0 text-info-text" aria-hidden />
          <p className="min-w-0 flex-1 text-xs text-muted-foreground">
            Edital do art. 52, §1º, relatório do AJ ou plano em PDF (até {REEST_PDF_MAX_ARQUIVOS}): a IA preenche o que achar e
            você confere antes de entrar no formulário.
          </p>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="gap-1"
            disabled={!!lendo || !!revisao}
            onClick={() => inputPdf.current?.click()}
          >
            {lendo ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <FileText className="h-3.5 w-3.5" aria-hidden />}
            Preencher a partir do PDF
          </Button>
          <input
            ref={inputPdf}
            type="file"
            accept=".pdf,application/pdf"
            multiple
            className="hidden"
            aria-label="PDFs da recuperação judicial"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length) void lerPdfs(files);
            }}
          />
        </div>

        {lendo ? (
          <p role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> {lendo}
          </p>
        ) : null}
        {erroIa ? (
          <p role="alert" className="rounded-(--radius-v2-md) border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {erroIa}
          </p>
        ) : null}
        {!revisao && avisoIa.length ? (
          <ul className="list-disc space-y-0.5 rounded-(--radius-v2-md) border border-warning-border bg-warning-bg py-2 pr-3 pl-7 text-xs text-warning-text">
            {avisoIa.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        ) : null}

        {revisao ? (
          <div className="rounded-(--radius-v2-md) border border-info-border bg-info-bg px-3 py-2 text-xs text-info-text">
            <p className="flex items-center gap-1.5 font-semibold">
              <Sparkles className="h-3.5 w-3.5" aria-hidden /> Sugestões da IA — {revisao.arquivos.join(", ")}
            </p>
            <p className="mt-0.5">
              Marque o que entra. Os campos destacados abaixo mostram como fica; nada é salvo antes de aplicar. Confira os
              valores no documento.
            </p>
            {revisao.avisos.length ? (
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-warning-text">
                {revisao.avisos.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            ) : null}
            <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto pr-1">
              {sugestoes.map((s) => (
                <li key={s.chave}>
                  <label className="flex cursor-pointer items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-current"
                      checked={revisao.aceitas.has(s.chave)}
                      onChange={() => alternar(s.chave)}
                    />
                    <span className="min-w-0 break-words">
                      <span className="font-medium text-foreground">{s.rotulo}:</span> {s.valor}
                      {s.tipo === "substituir" ? <span className="text-muted-foreground"> (no formulário: {s.atual})</span> : null}
                      {s.tipo === "adicionar" ? <span className="text-muted-foreground"> (linha nova)</span> : null}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" size="sm" className="h-7 px-2 text-xs" disabled={!aceitasValidas} onClick={aplicar}>
                Aplicar {aceitasValidas} {aceitasValidas === 1 ? "item" : "itens"}
              </Button>
              <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setRevisao(null)}>
                Descartar
              </Button>
            </div>
          </div>
        ) : aindaAplicado ? (
          <div className="flex flex-wrap items-center gap-2 rounded-(--radius-v2-md) border border-info-border bg-info-bg px-3 py-2 text-xs text-info-text">
            <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">Campos em azul vieram da IA. Confira antes de gerar a apresentação.</span>
            <Button type="button" size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={desfazer}>
              <Undo2 className="h-3.5 w-3.5" aria-hidden /> Desfazer
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setAplicado(null)}>
              Ok
            </Button>
          </div>
        ) : null}
      </div>

      <fieldset disabled={!!revisao} className="min-w-0 space-y-5">
        <div>
          <p className="text-xs font-semibold text-muted-foreground">Recuperação judicial</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <Campo id="rj-autos" label="Autos nº" value={f.autos} onChange={(v) => set("autos", v)} className={hl("autos")} />
            <div className="space-y-1">
              <Label htmlFor="rj-passivo" className="text-xs">
                Passivo total (edital art. 52, §1º)
              </Label>
              <ValorInput
                id="rj-passivo"
                label="Passivo total"
                value={f.passivoTotal}
                onChange={(v) => set("passivoTotal", v)}
                className={hl("passivoTotal")}
              />
            </div>
            <div className="sm:col-span-2">
              <Campo
                id="rj-recuperandas"
                label="Recuperandas (separe com |)"
                value={f.recuperandas}
                onChange={(v) => set("recuperandas", v)}
                multiline
                className={hl("recuperandas")}
              />
            </div>
            <div className="sm:col-span-2">
              <Campo
                id="rj-competencia"
                label="Competência"
                value={f.competencia}
                onChange={(v) => set("competencia", v)}
                multiline
                className={hl("competencia")}
              />
            </div>
            <Campo id="rj-juiz" label="Juiz" value={f.juiz} onChange={(v) => set("juiz", v)} className={hl("juiz")} />
            <Campo id="rj-relator" label="Relator prevento" value={f.relator} onChange={(v) => set("relator", v)} className={hl("relator")} />
            <Campo
              id="rj-aj"
              label="Administrador judicial"
              value={f.administrador}
              onChange={(v) => set("administrador", v)}
              className={hl("administrador")}
            />
            <Campo id="rj-foro" label="Foro" value={f.foro} onChange={(v) => set("foro", v)} placeholder="Campinas – SP" className={hl("foro")} />
            <div className="space-y-1">
              <Label htmlFor="rj-ajuizamento" className="text-xs">
                Ajuizamento
              </Label>
              <DateInputBr
                id="rj-ajuizamento"
                value={f.ajuizamento}
                onChange={(ymd) => set("ajuizamento", ymd)}
                className={hl("ajuizamento")}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="rj-deferimento" className="text-xs">
                Deferimento do processamento
              </Label>
              <DateInputBr
                id="rj-deferimento"
                value={f.deferimento}
                onChange={(ymd) => set("deferimento", ymd)}
                className={hl("deferimento")}
              />
            </div>
            <div className="sm:col-span-2">
              <Campo
                id="rj-resumo"
                label="Resumo (faixa no rodapé do slide)"
                value={f.resumo}
                onChange={(v) => set("resumo", v)}
                multiline
                placeholder="Recuperação judicial ajuizada em … • Plano apresentado em … • Assembleia pendente"
                className={hl("resumo")}
              />
            </div>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-muted-foreground">Composição do endividamento</p>
          <div className="mt-2 space-y-2">
            {f.classes.map((c, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[1fr_170px_170px_auto]">
                <Input
                  aria-label="Classe"
                  value={c.classe}
                  placeholder="Classe I – Trabalhista"
                  className={hl(`classes.${i}.classe`)}
                  onChange={(e) => set("classes", value.classes.map((x, j) => (j === i ? { ...x, classe: e.target.value } : x)))}
                />
                <ValorInput
                  id={`rj-classe-${i}-edital`}
                  label="Edital"
                  value={c.edital}
                  className={hl(`classes.${i}.edital`)}
                  onChange={(v) => set("classes", value.classes.map((x, j) => (j === i ? { ...x, edital: v } : x)))}
                />
                <ValorInput
                  id={`rj-classe-${i}-aj`}
                  label="Relatório do AJ"
                  value={c.aj}
                  className={hl(`classes.${i}.aj`)}
                  onChange={(v) => set("classes", value.classes.map((x, j) => (j === i ? { ...x, aj: v } : x)))}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remover classe"
                  onClick={() => set("classes", value.classes.filter((_, j) => j !== i))}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            ))}
            {f.classes.length ? (
              <p className="text-[11px] text-muted-foreground">Colunas: classe · edital (art. 52, §1º) · relatório do AJ.</p>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1"
              onClick={() =>
                set(
                  "classes",
                  value.classes.length
                    ? [...value.classes, { classe: "", edital: null, aj: null }]
                    : [
                        { classe: "Classe I – Trabalhista", edital: null, aj: null },
                        { classe: "Classe II – Garantia real", edital: null, aj: null },
                        { classe: "Classe III – Quirografário", edital: null, aj: null },
                        { classe: "Classe IV – ME/EPP", edital: null, aj: null },
                      ],
                )
              }
            >
              <Plus className="h-3.5 w-3.5" aria-hidden /> {f.classes.length ? "Adicionar classe" : "Preencher classes I a IV"}
            </Button>
            {mostrarExtra ? (
              <div className="grid gap-2 sm:grid-cols-[1fr_170px_170px_auto]">
                <span className="self-center text-xs font-medium text-foreground">Extraconcursal</span>
                <ValorInput
                  id="rj-extra-edital"
                  label="Extraconcursal (edital)"
                  value={f.extraconcursalEdital}
                  onChange={(v) => set("extraconcursalEdital", v)}
                  className={hl("extraconcursalEdital")}
                />
                <ValorInput
                  id="rj-extra-aj"
                  label="Extraconcursal (AJ)"
                  value={f.extraconcursalAj}
                  onChange={(v) => set("extraconcursalAj", v)}
                  className={hl("extraconcursalAj")}
                />
                <span />
              </div>
            ) : null}
            {mostrarExtra ? (
              <Campo
                id="rj-endiv-resumo"
                label="Destaque do slide"
                value={f.endividamentoResumo}
                onChange={(v) => set("endividamentoResumo", v)}
                multiline
                className={hl("endividamentoResumo")}
              />
            ) : null}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-muted-foreground">Forma de pagamento dos credores (plano)</p>
          <div className="mt-2 space-y-2">
            {f.pagamento.map((p, i) => (
              <div key={i} className="grid gap-2 rounded-(--radius-v2-md) border border-border/70 p-2 sm:grid-cols-5">
                {(["classe", "desagio", "carencia", "forma", "atualizacao"] as const).map((k) => (
                  <Input
                    key={k}
                    aria-label={k}
                    placeholder={{ classe: "Classe", desagio: "Deságio", carencia: "Carência", forma: "Forma e prazo", atualizacao: "Atualização e juros" }[k]}
                    value={p[k]}
                    className={hl(`pagamento.${i}.${k}`)}
                    onChange={(e) => set("pagamento", value.pagamento.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))}
                  />
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="sm:col-span-5 sm:justify-self-end"
                  onClick={() => set("pagamento", value.pagamento.filter((_, j) => j !== i))}
                >
                  Remover linha
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1"
              onClick={() => set("pagamento", [...value.pagamento, { classe: "", desagio: "", carencia: "", forma: "", atualizacao: "" }])}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden /> Adicionar classe ao plano
            </Button>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-muted-foreground">Formas especiais de pagamento (até 2)</p>
          <div className="mt-2 space-y-2">
            {f.opcoes.map((o, i) => (
              <div key={i} className="grid gap-2 rounded-(--radius-v2-md) border border-border/70 p-2 sm:grid-cols-2">
                <Input aria-label="Rótulo" placeholder={`OPÇÃO ${i === 0 ? "A" : "B"}`} value={o.rotulo} className={hl(`opcoes.${i}.rotulo`)} onChange={(e) => set("opcoes", value.opcoes.map((x, j) => (j === i ? { ...x, rotulo: e.target.value } : x)))} />
                <Input aria-label="Título" placeholder="Credores colaboradores financeiros" value={o.titulo} className={hl(`opcoes.${i}.titulo`)} onChange={(e) => set("opcoes", value.opcoes.map((x, j) => (j === i ? { ...x, titulo: e.target.value } : x)))} />
                <Textarea aria-label="Contrapartida exigida" placeholder="Contrapartida exigida" rows={2} className={cn("text-xs sm:col-span-2", hl(`opcoes.${i}.contrapartida`))} value={o.contrapartida} onChange={(e) => set("opcoes", value.opcoes.map((x, j) => (j === i ? { ...x, contrapartida: e.target.value } : x)))} />
                <Input aria-label="Condições" placeholder="Deságio 15% • Carência 6 meses • 36 parcelas" value={o.condicoes} className={hl(`opcoes.${i}.condicoes`)} onChange={(e) => set("opcoes", value.opcoes.map((x, j) => (j === i ? { ...x, condicoes: e.target.value } : x)))} />
                <Input aria-label="Observação" placeholder="Observação" value={o.obs} className={hl(`opcoes.${i}.obs`)} onChange={(e) => set("opcoes", value.opcoes.map((x, j) => (j === i ? { ...x, obs: e.target.value } : x)))} />
                <Button type="button" variant="ghost" size="sm" className="sm:col-span-2 sm:justify-self-end" onClick={() => set("opcoes", value.opcoes.filter((_, j) => j !== i))}>
                  Remover opção
                </Button>
              </div>
            ))}
            {f.opcoes.length < 2 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1"
                onClick={() => set("opcoes", [...value.opcoes, { rotulo: `OPÇÃO ${value.opcoes.length === 0 ? "A" : "B"}`, titulo: "", contrapartida: "", condicoes: "", obs: "" }])}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden /> Adicionar forma especial
              </Button>
            ) : null}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-muted-foreground">Principais medidas do plano (até 3)</p>
          <div className="mt-2 space-y-2">
            {f.medidas.map((m, i) => (
              <div key={i} className="grid gap-2 rounded-(--radius-v2-md) border border-border/70 p-2 sm:grid-cols-3">
                <Input aria-label="Categoria" placeholder="CAPTAÇÃO" value={m.categoria} className={hl(`medidas.${i}.categoria`)} onChange={(e) => set("medidas", value.medidas.map((x, j) => (j === i ? { ...x, categoria: e.target.value } : x)))} />
                <Input aria-label="Título" placeholder="Financiamento DIP" value={m.titulo} className={hl(`medidas.${i}.titulo`)} onChange={(e) => set("medidas", value.medidas.map((x, j) => (j === i ? { ...x, titulo: e.target.value } : x)))} />
                <Input aria-label="Destaque" placeholder="Até R$ 150 milhões" value={m.destaque} className={hl(`medidas.${i}.destaque`)} onChange={(e) => set("medidas", value.medidas.map((x, j) => (j === i ? { ...x, destaque: e.target.value } : x)))} />
                <Textarea aria-label="O que prevê" placeholder="O que prevê" rows={2} className={cn("text-xs sm:col-span-3", hl(`medidas.${i}.preve`))} value={m.preve} onChange={(e) => set("medidas", value.medidas.map((x, j) => (j === i ? { ...x, preve: e.target.value } : x)))} />
                <Textarea aria-label="Objetivo" placeholder="Objetivo" rows={2} className={cn("text-xs sm:col-span-3", hl(`medidas.${i}.objetivo`))} value={m.objetivo} onChange={(e) => set("medidas", value.medidas.map((x, j) => (j === i ? { ...x, objetivo: e.target.value } : x)))} />
                <Button type="button" variant="ghost" size="sm" className="sm:col-span-3 sm:justify-self-end" onClick={() => set("medidas", value.medidas.filter((_, j) => j !== i))}>
                  Remover medida
                </Button>
              </div>
            ))}
            {f.medidas.length < 3 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1"
                onClick={() => set("medidas", [...value.medidas, { categoria: "", titulo: "", destaque: "", preve: "", objetivo: "" }])}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden /> Adicionar medida
              </Button>
            ) : null}
          </div>
        </div>
      </fieldset>
      <p className="text-[11px] text-muted-foreground">
        Só entram os slides com dado: sem classes, o slide de endividamento sai; sem plano, o de pagamento sai; e assim por
        diante.
      </p>
    </div>
  );
}
