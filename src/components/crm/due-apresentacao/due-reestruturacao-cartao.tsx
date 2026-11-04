"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, Download, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { numeros } from "@/components/crm/due-apresentacao/due-area-card";
import { draftSoDaArea } from "@/components/crm/due-apresentacao/due-area-previa";
import { draftInicial, type Sugestao } from "@/components/crm/due-apresentacao/due-apresentacao-panel";
import { ReestruturacaoForm } from "@/components/crm/due-apresentacao/reestruturacao-form";
import { baixarArquivoLocal, gerarApresentacao } from "@/lib/due-ppt/client";
import { analisarArea } from "@/lib/due-ppt/compose";
import {
  draftSchema,
  emptyDraft,
  type DueApresentacaoDraft,
  type ReestruturacaoForm as DadosRj,
} from "@/lib/due-ppt/draft";
import { cn } from "@/lib/utils";

/**
 * Dados da recuperação judicial no cartão da Reestruturação (levantamento da DUE, 04/11/2026). A área
 * não usa planilha: o advogado preenche aqui (inclusive "Preencher a partir do PDF") e o CRM grava no
 * rascunho da apresentação (`due_apresentacoes.dados.reestruturacao`), que o MKT usa na Compilação.
 * Antes isso ficava só dentro da Apresentação automática, que agora é só para admin.
 */

const SALVAR_EM_MS = 1200;

export function DueReestruturacaoNoCartao({
  leadId,
  razaoSocial,
  cnpj,
  abertoInicial,
}: {
  leadId: string;
  razaoSocial: string;
  cnpj: string;
  abertoInicial: boolean;
}) {
  const [aberto, setAberto] = useState(abertoInicial);
  const [rascunho, setRascunho] = useState<DueApresentacaoDraft | null>(null);
  const [form, setForm] = useState<DadosRj | null>(null);
  const [semAcesso, setSemAcesso] = useState(false);
  const [estado, setEstado] = useState<"salvando" | "salvo" | "erro" | null>(null);
  const [baixando, setBaixando] = useState(false);
  const [erroDownload, setErroDownload] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendente = useRef<DadosRj | null>(null);
  const api = `/api/crm/leads/${encodeURIComponent(leadId)}/due-apresentacao`;

  /** Rascunho salvo, ou o inicial do painel quando ainda não existe; null sem acesso. */
  async function lerRascunho(): Promise<DueApresentacaoDraft | null> {
    const res = await fetch(api, { cache: "no-store" });
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; draft?: unknown; sugestao?: Sugestao };
    if (!res.ok || !body.ok) return null;
    const salvo = body.draft ? draftSchema.safeParse(body.draft) : null;
    if (salvo?.success) return salvo.data;
    return body.sugestao ? draftInicial(body.sugestao, []) : null;
  }

  async function salvar(v: DadosRj) {
    setEstado("salvando");
    try {
      // Relê para gravar só os dados da RJ por cima do que o MKT já tiver salvo.
      const atual = await lerRascunho();
      if (!atual) throw new Error("sem acesso");
      atual.reestruturacao = v;
      const ad = atual.areas.reestruturacao ?? { incluir: true, variante: "auto" as const, textos: {} };
      atual.areas.reestruturacao = { ...ad, incluir: true };
      const res = await fetch(api, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft: atual }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (!res.ok || !body.ok) throw new Error("falha");
      setRascunho(atual);
      setEstado("salvo");
    } catch {
      setEstado("erro");
    }
  }

  useEffect(() => {
    if (!aberto || form) return;
    let cancelado = false;
    void lerRascunho()
      .then((d) => {
        if (cancelado) return;
        if (!d) {
          setSemAcesso(true);
          return;
        }
        setRascunho(d);
        setForm(d.reestruturacao);
      })
      .catch(() => {
        if (!cancelado) setSemAcesso(true);
      });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, leadId]);

  // Salva o que ficou pendente ao sair da tela (troca de aba, navegação).
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (pendente.current) void salvar(pendente.current);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  function alterar(v: DadosRj) {
    setForm(v);
    pendente.current = v;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      pendente.current = null;
      void salvar(v);
    }, SALVAR_EM_MS);
  }

  const base = useMemo(() => {
    const d = rascunho ? draftSchema.parse(JSON.parse(JSON.stringify(rascunho))) : emptyDraft();
    if (!rascunho) d.capa = { razaoSocial, cnpj, empresas: [] };
    if (form) d.reestruturacao = form;
    return d;
  }, [rascunho, form, razaoSocial, cnpj]);
  const resumo = useMemo(
    () =>
      form
        ? analisarArea(
            { id: "reestruturacao", processos: [], extras: { pge: null, pgfn: null } },
            draftSoDaArea(base, "reestruturacao"),
            new Date(),
          )
        : null,
    [form, base],
  );
  const kpis = numeros(resumo);

  async function baixarSlides() {
    setBaixando(true);
    setErroDownload(null);
    try {
      const r = await gerarApresentacao({
        leadId,
        draft: draftSoDaArea(base, "reestruturacao"),
        areas: [],
        logo: null,
        anexar: false,
      });
      const nome = `PRÉVIA REESTRUTURAÇÃO - ${r.arquivo.name.replace(/^DUE DILIGENCE - /, "")}`;
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
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
      >
        <span className="flex min-w-0 items-center gap-2 text-xs font-bold text-[#102033]">
          <FileText className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
          Dados da recuperação judicial
          {kpis.length ? <span className="truncate font-semibold text-slate-500">· {kpis.join(" · ")}</span> : null}
        </span>
        <span className="flex shrink-0 items-center gap-2 text-[11px] font-semibold text-slate-500">
          {estado === "salvando" ? "Salvando…" : estado === "salvo" ? "Salvo" : estado === "erro" ? "Não salvou" : null}
          <ChevronDown className={cn("h-4 w-4 text-slate-400 transition-transform", aberto && "rotate-180")} aria-hidden />
        </span>
      </button>

      {aberto ? (
        <div className="space-y-3 border-t border-[#dfe5ee] px-3 pb-3 pt-3">
          {semAcesso ? (
            <p className="text-xs text-slate-600">Sem acesso aos dados da apresentação deste lead.</p>
          ) : !form ? (
            <p className="flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              Carregando…
            </p>
          ) : (
            <>
              <p className="text-xs text-slate-500">
                Esses dados montam os slides da Reestruturação. Salva sozinho enquanto você preenche.
              </p>
              <ReestruturacaoForm leadId={leadId} value={form} onChange={alterar} />
              {estado === "erro" ? (
                <p className="text-xs text-danger-text">
                  Não foi possível salvar. Confira a conexão e altere um campo para tentar de novo.
                </p>
              ) : null}
              {resumo?.avisos.length ? (
                <ul className="space-y-0.5 text-xs text-warning-text">
                  {resumo.avisos.map((a) => (
                    <li key={a} className="flex gap-1.5">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                      {a}
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" size="sm" disabled={baixando} onClick={() => void baixarSlides()}>
                  {baixando ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Download className="h-3.5 w-3.5" aria-hidden />
                  )}
                  {baixando ? "Montando os slides…" : "Baixar slides da Reestruturação (.pptx)"}
                </Button>
                <p className="text-[11px] text-slate-500">Mesmos slides da apresentação, com a capa e as páginas do escritório.</p>
              </div>
              {erroDownload ? <p className="text-xs text-danger-text">{erroDownload}</p> : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
