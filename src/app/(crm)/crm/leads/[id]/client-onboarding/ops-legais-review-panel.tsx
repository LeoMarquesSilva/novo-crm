"use client";

import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import {
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  CircleAlert,
  ClipboardCheck,
  Copy,
  FileText,
  Hash,
  Loader2,
  MonitorCog,
  RefreshCw,
  RotateCcw,
  Search,
  Users,
  X,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { maskCpf, maskCpfCnpj, maskDocument } from "@/lib/crm/br-document-mask";
import { formatCepDisplay } from "@/lib/crm/proposta-empresas";
import { formatDateTimeMinutesBr } from "@/lib/format-datetime";
import { cn } from "@/lib/utils";
import {
  ONBOARDING_ADJUSTABLE_FIELDS,
  partyTipo,
  type ClientOnboardingPayload,
  type OnboardingAdjustableField,
  type OnboardingAdjustment,
  type OpsChecklist,
} from "@/modules/crm/domain/client-onboarding";

type ViosGrupo = { nome: string; pessoas: number };
type ViosPessoa = {
  id: string;
  ci: string | null;
  nome: string;
  cpfCnpj: string | null;
  cidade: string | null;
  uf: string | null;
};
type ViosConferencia = {
  pessoaId: string | null;
  ci: string | null;
  itens: { campo: string; label: string; crm: string; vios: string; ok: boolean }[];
};
type CarteiraMatch = {
  clientes: { id: string; razaoSocial: string; grupoId: string | null; grupoNome: string | null; exact: boolean }[];
  grupos: { id: string; nome: string; exact: boolean }[];
};

type StepId = 1 | 2 | 3;

const STEPS: { id: StepId; label: string }[] = [
  { id: 1, label: "Lançar no VIOS" },
  { id: 2, label: "Conferir o lançamento" },
  { id: 3, label: "Sistemas legados" },
];

/** Primeira palavra útil da razão social, para sugerir a busca do grupo. */
function suggestedGroupTerm(razaoSocial: string): string {
  const ignore = new Set(["grupo", "ltda", "s/a", "sa", "s.a.", "eireli", "me", "epp", "de", "da", "do", "e"]);
  return razaoSocial.split(/\s+/).find((w) => w.length > 2 && !ignore.has(w.toLowerCase())) ?? "";
}

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  async function copy(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied((current) => (current === key ? null : current)), 1500);
    } catch {
      // Sem permissão de área de transferência: o texto continua selecionável.
    }
  }
  return { copied, copy };
}

function CopyButton({ label, value, copied, onCopy }: { label: string; value: string; copied: boolean; onCopy: () => void }) {
  if (!value.trim()) return null;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={onCopy}
      aria-label={`Copiar ${label}`}
      title={copied ? "Copiado" : `Copiar ${label}`}
      className="shrink-0 text-muted-foreground hover:text-foreground"
    >
      {copied ? <Check className="text-success-text" aria-hidden /> : <Copy aria-hidden />}
    </Button>
  );
}

/** Célula da grade de dados (mesmo desenho da faixa de destaques da ficha do lead). */
function DataCell({
  label,
  value,
  copied,
  onCopy,
  className,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 items-start justify-between gap-2 bg-white px-4 py-3", className)}>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className={cn("mt-1 text-sm break-words select-all", value.trim() ? "font-medium text-foreground" : "text-muted-foreground")}>
          {value.trim() || "Não informado"}
        </p>
      </div>
      <CopyButton label={label} value={value} copied={copied} onCopy={onCopy} />
    </div>
  );
}

function Highlight({ icon: Icon, label, children }: { icon: ComponentType<{ className?: string }>; label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 bg-white px-4 py-3.5">
      <div className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-(--radius-v2-md) bg-interactive-50 text-interactive-700">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <div className="mt-1 min-w-0 text-sm text-foreground">{children}</div>
        </div>
      </div>
    </div>
  );
}

function BlockTitle({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      {action}
    </div>
  );
}

/**
 * Área de trabalho de Operações Legais, em três passos (o cadastro corre em paralelo ao lead):
 * 1) lançar no VIOS com os dados prontos para copiar; 2) conferir o lançamento (grupo, pessoa e
 * campo a campo — divergência é aviso para corrigir no VIOS); 3) sistemas legados. Dado errado no
 * cadastro volta ao responsável pela devolução, antes do lançamento.
 */
export function OpsLegaisReviewPanel({
  leadId,
  initialChecklist,
  cadastro,
  submittedAt,
  submittedByName,
  resubmitted,
  canReturn,
  canConclude,
  onChanged,
}: {
  leadId: string;
  initialChecklist: OpsChecklist;
  /** Cadastro enviado pelo responsável (o que Operações Legais lança no VIOS). */
  cadastro: ClientOnboardingPayload["cadastro"];
  submittedAt?: string | null;
  submittedByName?: string | null;
  /** Reenviado depois de uma devolução. */
  resubmitted?: boolean;
  canReturn: boolean;
  canConclude: boolean;
  onChanged: () => void;
}) {
  const base = `/api/crm/leads/${encodeURIComponent(leadId)}/onboarding`;
  const [checklist, setChecklist] = useState<OpsChecklist>(initialChecklist);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const { copied, copy } = useCopy();

  const [grupoQuery, setGrupoQuery] = useState(initialChecklist.grupoNome);
  const [grupos, setGrupos] = useState<ViosGrupo[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [pessoas, setPessoas] = useState<ViosPessoa[] | null>(null);
  const [conferencia, setConferencia] = useState<ViosConferencia | null>(null);
  const [loadingGrupo, setLoadingGrupo] = useState(false);
  const [carteira, setCarteira] = useState<CarteiraMatch | null>(null);
  const [showPessoas, setShowPessoas] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  const [returnOpen, setReturnOpen] = useState(false);
  const [returnComment, setReturnComment] = useState("");
  const [ajustes, setAjustes] = useState<OnboardingAdjustment[]>([]);
  const [concludeOpen, setConcludeOpen] = useState(false);

  const divergencias = conferencia?.itens.filter((i) => !i.ok) ?? [];
  const clienteExistente = carteira?.clientes.find((c) => c.exact) ?? null;
  // Grupo do CRM: o do cliente já cadastrado (evita conflito) ou o de mesmo nome.
  const grupoCrm = clienteExistente?.grupoId
    ? { id: clienteExistente.grupoId, nome: clienteExistente.grupoNome ?? checklist.grupoNome }
    : (carteira?.grupos.find((g) => g.exact) ?? null);

  const done: Record<StepId, boolean> = {
    1: checklist.viosCadastrado,
    2: Boolean(checklist.grupoNome) && checklist.dadosConferidos,
    3: checklist.sistemasLegadosAtualizados,
  };
  const allDone = done[1] && done[2] && done[3];
  const firstPending: StepId = !done[1] ? 1 : !done[2] ? 2 : 3;
  const [view, setView] = useState<StepId>(firstPending);
  const locked = !canConclude || saving || busy;

  async function saveChecklist(next: OpsChecklist) {
    setChecklist(next);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${base}/checklist`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checklist: next }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(json?.error ?? "Não foi possível salvar a conferência.");
      }
    } finally {
      setSaving(false);
    }
  }

  /** Marca o passo e segue para o próximo pendente. */
  async function completeStep(next: OpsChecklist, goTo: StepId) {
    await saveChecklist(next);
    setView(goTo);
  }

  async function searchGroups(query: string) {
    if (query.trim().length < 2) {
      setGrupos(null);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`${base}/vios?q=${encodeURIComponent(query)}`, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; grupos?: ViosGrupo[] } | null;
      if (!res.ok || !json?.ok) {
        setError(json?.error ?? "Não foi possível buscar os grupos do VIOS.");
        return;
      }
      setGrupos(json.grupos ?? []);
    } finally {
      setSearching(false);
    }
  }

  async function selectGroup(nome: string, current: OpsChecklist = checklist) {
    setGrupos(null);
    setGrupoQuery(nome);
    setLoadingGrupo(true);
    setError(null);
    try {
      const [viosRes, carteiraRes] = await Promise.all([
        fetch(`${base}/vios?grupo=${encodeURIComponent(nome)}`, { cache: "no-store" }),
        fetch(`${base}/carteira-match?grupo=${encodeURIComponent(nome)}`, { cache: "no-store" }),
      ]);
      const vios = (await viosRes.json().catch(() => null)) as
        | { ok?: boolean; error?: string; pessoas?: ViosPessoa[]; conferencia?: ViosConferencia }
        | null;
      const match = (await carteiraRes.json().catch(() => null)) as ({ ok?: boolean } & CarteiraMatch) | null;
      if (!viosRes.ok || !vios?.ok) {
        setError(vios?.error ?? "Não foi possível ler as pessoas do grupo no VIOS.");
        return;
      }
      setPessoas(vios.pessoas ?? []);
      setConferencia(vios.conferencia ?? null);
      if (carteiraRes.ok && match?.ok) setCarteira({ clientes: match.clientes, grupos: match.grupos });
      // O código do cliente no VIOS vem da pessoa de mesmo CPF/CNPJ.
      const ci = vios.conferencia?.ci ?? "";
      if (nome !== current.grupoNome || ci !== current.viosReferencia) {
        await saveChecklist({ ...current, grupoNome: nome, viosReferencia: ci, dadosConferidos: false });
      }
    } finally {
      setLoadingGrupo(false);
    }
  }

  // Abertura: retoma o grupo já escolhido; sem ele, vê se o cliente já tem grupo na carteira.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (initialChecklist.grupoNome) {
      void selectGroup(initialChecklist.grupoNome, initialChecklist);
      return;
    }
    void (async () => {
      const res = await fetch(`${base}/carteira-match?grupo=`, { cache: "no-store" });
      const match = (await res.json().catch(() => null)) as ({ ok?: boolean } & CarteiraMatch) | null;
      if (res.ok && match?.ok) setCarteira({ clientes: match.clientes, grupos: match.grupos });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só na abertura do painel
  }, []);

  // Busca de grupos enquanto digita (com pausa).
  useEffect(() => {
    if (grupoQuery === checklist.grupoNome) return;
    const timer = window.setTimeout(() => void searchGroups(grupoQuery), 350);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- busca só pelo texto digitado
  }, [grupoQuery]);

  async function syncVios() {
    setSyncing(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(`${base}/vios/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grupo: checklist.grupoNome || null }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !json?.ok) {
        setError(json?.error ?? "Não foi possível atualizar os grupos do CRM.");
        return;
      }
      setInfo("Atualização pedida. Em alguns instantes o que foi lançado no VIOS chega ao CRM; depois pesquise o grupo.");
    } finally {
      setSyncing(false);
    }
  }

  function openReturn() {
    // A devolução é sobre o que o responsável preencheu; divergência com o VIOS se corrige no VIOS.
    setAjustes([]);
    setReturnComment("");
    setReturnOpen(true);
  }

  /** O que o responsável preencheu no campo (a devolução mostra para lembrar o erro). */
  function filledValue(campo: OnboardingAdjustableField): string {
    const end = cadastro.endereco;
    switch (campo) {
      case "cadastro.razaoSocial":
        return cadastro.razaoSocial;
      case "cadastro.documento":
        return maskCpfCnpj(cadastro.documento);
      case "cadastro.email":
        return cadastro.email;
      case "cadastro.telefone":
        return cadastro.telefone;
      case "cadastro.endereco":
        return [
          [end.logradouro, end.numero].filter(Boolean).join(", "),
          end.complemento,
          end.bairro,
          [end.cidade, end.uf].filter(Boolean).join("/"),
          end.cep ? `CEP ${formatCepDisplay(end.cep)}` : "",
        ]
          .filter(Boolean)
          .join(" · ");
      case "cadastro.socios":
        return cadastro.socios
          .filter((s) => s.nome)
          .map((s) => [s.nome, s.posicao, s.cpf ? `CPF ${maskCpf(s.cpf)}` : ""].filter(Boolean).join(", "))
          .join("; ");
      case "cadastro.empresasConsulta":
        return cadastro.empresasConsulta
          .filter((p) => p.razaoSocial || p.documento)
          .map((p) => [p.razaoSocial, p.documento ? maskDocument(p.documento, partyTipo(p)) : ""].filter(Boolean).join(", "))
          .join("; ");
    }
  }

  function toggleAjuste(campo: OnboardingAdjustableField, checked: boolean) {
    setAjustes((prev) =>
      checked ? [...prev.filter((a) => a.campo !== campo), { campo, comentario: "" }] : prev.filter((a) => a.campo !== campo),
    );
  }

  async function submitReturn() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${base}/return`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: returnComment, ajustes }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !json?.ok) {
        setError(json?.error ?? "Não foi possível devolver o cadastro.");
        return;
      }
      setReturnOpen(false);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function submitConclude() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${base}/conclude`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checklist,
          grupoId: grupoCrm?.id ?? null,
          clienteId: clienteExistente?.id ?? null,
        }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !json?.ok) {
        setError(json?.error ?? "Não foi possível concluir o cadastro.");
        setConcludeOpen(false);
        return;
      }
      setConcludeOpen(false);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  const e = cadastro.endereco;
  const tipoCliente = partyTipo({ documento: cadastro.documento });
  const sugestao = clienteExistente?.grupoNome || suggestedGroupTerm(cadastro.razaoSocial);
  const pessoaEncontrada = pessoas?.find((p) => p.id === conferencia?.pessoaId) ?? null;
  const grupoInfo = checklist.grupoNome ? pessoas : null;
  const statusBadge = allDone
    ? { label: "Pronto para concluir", className: "border-success-border bg-success-bg text-success-text" }
    : !done[1]
      ? { label: "Aguardando lançamento no VIOS", className: "border-warning-border bg-warning-bg text-warning-text" }
      : !done[2]
        ? { label: "Conferência pendente", className: "border-info-border bg-info-bg text-info-text" }
        : { label: "Sistemas legados pendentes", className: "border-info-border bg-info-bg text-info-text" };
  const copyAll = [
    `${tipoCliente === "CPF" ? "Nome" : "Razão social"}: ${cadastro.razaoSocial}`,
    `${tipoCliente}: ${maskCpfCnpj(cadastro.documento)}`,
    `Endereço: ${[e.logradouro, e.numero, e.complemento, e.bairro, `${e.cidade}/${e.uf}`, `CEP ${formatCepDisplay(e.cep)}`]
      .filter((v) => v && v.trim() && v !== "/")
      .join(", ")}`,
    cadastro.email ? `E-mail: ${cadastro.email}` : "",
    cadastro.telefone ? `Telefone: ${cadastro.telefone}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <section className="overflow-hidden rounded-(--radius-v2-xl) border border-border bg-white">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-(--radius-v2-md) bg-interactive-50 text-interactive-700">
            <ClipboardCheck className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold tracking-tight text-foreground">Cadastro do cliente no VIOS</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {submittedAt
                ? `Enviado${submittedByName ? ` por ${submittedByName}` : ""} em ${formatDateTimeMinutesBr(submittedAt)}`
                : "Enviado pelo responsável do lead"}
              {resubmitted ? " · reenviado depois de ajuste" : ""} · o lead segue sem esperar este cadastro
            </p>
          </div>
        </div>
        <Badge variant="outline" className={statusBadge.className}>
          {statusBadge.label}
        </Badge>
      </header>

      <nav aria-label="Passos do cadastro" className="border-b border-border bg-surface-subtle px-5 py-3">
        <ol className="flex items-center gap-1 sm:gap-2">
          {STEPS.map((step, index) => {
            const active = view === step.id;
            const isLast = index === STEPS.length - 1;
            return (
              <li key={step.id} className={cn("flex items-center gap-1 sm:gap-2", !isLast && "flex-auto")}>
                <button
                  type="button"
                  aria-current={active ? "step" : undefined}
                  onClick={() => setView(step.id)}
                  className={cn(
                    "group flex shrink-0 items-center gap-2 rounded-(--radius-v2-md) py-1 pr-1.5 pl-1 text-left outline-none transition-colors duration-150 focus-visible:ring-3 focus-visible:ring-ring/20",
                    !active && "hover:bg-surface-hover",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums transition-colors duration-150",
                      active
                        ? "border-primary bg-primary text-white"
                        : done[step.id]
                          ? "border-interactive-300 bg-interactive-50 text-interactive-700"
                          : "border-border-strong bg-white text-muted-foreground",
                    )}
                  >
                    {done[step.id] && !active ? <Check className="size-3.5" strokeWidth={2.5} /> : step.id}
                  </span>
                  <span
                    className={cn(
                      "whitespace-nowrap text-[13px] leading-5",
                      active ? "font-semibold text-foreground" : "hidden font-medium text-muted-foreground group-hover:text-foreground sm:inline",
                    )}
                  >
                    {step.label}
                  </span>
                  <span className="sr-only">{active ? ", passo atual" : done[step.id] ? ", feito" : ", pendente"}</span>
                </button>
                {!isLast ? (
                  <span aria-hidden className={cn("h-px min-w-2 flex-1", done[step.id] ? "bg-interactive-300" : "bg-border")} />
                ) : null}
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="space-y-5 px-5 py-5">
        {view === 1 ? (
          <>
            <BlockTitle
              title="Dados do cliente"
              hint="Copie cada dado para o cadastro no VIOS."
              action={
                <Button type="button" variant="outline" size="sm" onClick={() => void copy("tudo", copyAll)}>
                  {copied === "tudo" ? <Check className="text-success-text" aria-hidden /> : <Copy aria-hidden />}
                  {copied === "tudo" ? "Copiado" : "Copiar tudo"}
                </Button>
              }
            />
            <div className="grid gap-px overflow-hidden rounded-(--radius-v2-lg) border border-neutral-200 bg-neutral-200 sm:grid-cols-2 lg:grid-cols-4">
              <DataCell
                className="sm:col-span-2"
                label={tipoCliente === "CPF" ? "Nome" : "Razão social"}
                value={cadastro.razaoSocial}
                copied={copied === "razao"}
                onCopy={() => void copy("razao", cadastro.razaoSocial)}
              />
              <DataCell
                label={tipoCliente}
                value={maskCpfCnpj(cadastro.documento)}
                copied={copied === "doc"}
                onCopy={() => void copy("doc", maskCpfCnpj(cadastro.documento))}
              />
              <DataCell
                label="Telefone"
                value={cadastro.telefone}
                copied={copied === "tel"}
                onCopy={() => void copy("tel", cadastro.telefone)}
              />
              <DataCell
                className="sm:col-span-2 lg:col-span-4"
                label="E-mail"
                value={cadastro.email}
                copied={copied === "email"}
                onCopy={() => void copy("email", cadastro.email)}
              />
            </div>

            <BlockTitle title="Endereço" />
            {/* Denso: o número sobe para o lado do CEP e a grade fecha sem células vazias. */}
            <div className="grid grid-flow-row-dense gap-px overflow-hidden rounded-(--radius-v2-lg) border border-neutral-200 bg-neutral-200 sm:grid-cols-2 lg:grid-cols-4">
              <DataCell label="CEP" value={formatCepDisplay(e.cep)} copied={copied === "cep"} onCopy={() => void copy("cep", formatCepDisplay(e.cep))} />
              <DataCell
                className="sm:col-span-2"
                label="Logradouro"
                value={e.logradouro}
                copied={copied === "log"}
                onCopy={() => void copy("log", e.logradouro)}
              />
              <DataCell label="Número" value={e.numero} copied={copied === "num"} onCopy={() => void copy("num", e.numero)} />
              <DataCell label="Complemento" value={e.complemento} copied={copied === "comp"} onCopy={() => void copy("comp", e.complemento)} />
              <DataCell label="Bairro" value={e.bairro} copied={copied === "bairro"} onCopy={() => void copy("bairro", e.bairro)} />
              <DataCell label="Cidade" value={e.cidade} copied={copied === "cidade"} onCopy={() => void copy("cidade", e.cidade)} />
              <DataCell label="UF" value={e.uf} copied={copied === "uf"} onCopy={() => void copy("uf", e.uf)} />
            </div>

            {cadastro.socios.length > 0 ? (
              <div className="space-y-2">
                <BlockTitle title="Sócios" />
                <div className="overflow-hidden rounded-(--radius-v2-lg) border border-neutral-200">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs text-muted-foreground">Nome</TableHead>
                        <TableHead className="text-xs text-muted-foreground">Posição</TableHead>
                        <TableHead className="text-xs text-muted-foreground">CPF</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cadastro.socios.map((s, i) => (
                        <TableRow key={i}>
                          <TableCell className="whitespace-normal">
                            <span className="flex items-center justify-between gap-2 font-medium">
                              {s.nome || "—"}
                              <CopyButton label="nome do sócio" value={s.nome} copied={copied === `socio-${i}-nome`} onCopy={() => void copy(`socio-${i}-nome`, s.nome)} />
                            </span>
                          </TableCell>
                          <TableCell>{s.posicao || "—"}</TableCell>
                          <TableCell>
                            <span className="flex items-center justify-between gap-2 tabular-nums">
                              {s.cpf ? maskCpf(s.cpf) : "—"}
                              <CopyButton label="CPF do sócio" value={maskCpf(s.cpf)} copied={copied === `socio-${i}-cpf`} onCopy={() => void copy(`socio-${i}-cpf`, maskCpf(s.cpf))} />
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : null}

            {cadastro.empresasConsulta.length > 0 ? (
              <div className="space-y-2">
                <BlockTitle title="Busca de novas demandas" hint="Empresas e pessoas do cliente que entram no monitoramento." />
                <div className="overflow-hidden rounded-(--radius-v2-lg) border border-neutral-200">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs text-muted-foreground">Nome ou razão social</TableHead>
                        <TableHead className="text-xs text-muted-foreground">CPF/CNPJ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cadastro.empresasConsulta.map((p, i) => {
                        const doc = p.documento ? maskDocument(p.documento, partyTipo(p)) : "";
                        return (
                          <TableRow key={i}>
                            <TableCell className="whitespace-normal font-medium">{p.razaoSocial || "—"}</TableCell>
                            <TableCell>
                              <span className="flex items-center justify-between gap-2 tabular-nums">
                                {doc || "—"}
                                <CopyButton label="documento" value={doc} copied={copied === `consulta-${i}`} onCopy={() => void copy(`consulta-${i}`, doc)} />
                              </span>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : null}

            {cadastro.informacoesAdicionais ? (
              <div className="rounded-(--radius-v2-lg) border border-border bg-surface-subtle">
                <button
                  type="button"
                  onClick={() => setShowNotes((v) => !v)}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
                  aria-expanded={showNotes}
                >
                  <FileText className="size-3.5" aria-hidden />
                  Anotações trazidas do RD
                  <span className="ml-auto">{showNotes ? "Esconder" : "Ver"}</span>
                </button>
                {showNotes ? (
                  <p className="border-t border-border px-4 py-3 text-sm whitespace-pre-wrap text-foreground">
                    {cadastro.informacoesAdicionais}
                  </p>
                ) : null}
              </div>
            ) : null}

            {canReturn && !done[1] ? (
              <Alert className="border-info-border bg-info-bg text-info-text">
                <CircleAlert className="size-4" aria-hidden />
                <AlertTitle>Algum dado errado ou faltando?</AlertTitle>
                <AlertDescription>
                  Devolva ao responsável antes de lançar no VIOS: ele corrige e reenvia.{" "}
                  <button type="button" className="font-medium underline underline-offset-2" onClick={openReturn}>
                    Devolver ao responsável
                  </button>
                </AlertDescription>
              </Alert>
            ) : null}
          </>
        ) : null}

        {view === 2 ? (
          !done[1] ? (
            <Alert className="border-warning-border bg-warning-bg text-warning-text">
              <CircleAlert className="size-4" aria-hidden />
              <AlertTitle>Lance o cliente no VIOS primeiro</AlertTitle>
              <AlertDescription>A conferência compara o que foi lançado no VIOS com o cadastro.</AlertDescription>
            </Alert>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="ops-grupo">Grupo econômico no VIOS</Label>
                <p className="text-xs text-muted-foreground">
                  Primeiro atualize os grupos do CRM para trazer o que você lançou no VIOS; depois pesquise o grupo.
                </p>
                {/* Atualizar vem antes da busca: traz para o CRM as Pessoas recém-lançadas no VIOS. */}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 shrink-0"
                    disabled={syncing || !canConclude}
                    onClick={() => void syncVios()}
                  >
                    {syncing ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
                    Atualizar grupos do CRM
                  </Button>
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input
                    id="ops-grupo"
                    className="pl-9"
                    value={grupoQuery}
                    disabled={locked}
                    placeholder="Pesquise o grupo em que o cliente foi lançado"
                    autoComplete="off"
                    onChange={(ev) => setGrupoQuery(ev.target.value)}
                  />
                  {searching ? (
                    <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden />
                  ) : null}
                  {grupos ? (
                    <div className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-(--radius-v2-md) border border-border bg-white shadow-(--shadow-v2-md)">
                      {grupos.length === 0 ? (
                        <p className="px-3 py-2.5 text-sm text-muted-foreground">
                          Nenhum grupo com esse nome no VIOS. Se acabou de lançar, atualize os grupos do CRM.
                        </p>
                      ) : (
                        <ul role="listbox" aria-label="Grupos do VIOS" className="max-h-64 overflow-y-auto py-1">
                          {grupos.map((g) => (
                            <li key={g.nome}>
                              <button
                                type="button"
                                role="option"
                                aria-selected={g.nome === checklist.grupoNome}
                                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-surface-hover"
                                onClick={() => void selectGroup(g.nome)}
                              >
                                <span className="font-medium text-foreground">{g.nome}</span>
                                <span className="text-xs text-muted-foreground">
                                  {g.pessoas} {g.pessoas === 1 ? "pessoa" : "pessoas"}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : null}
                </div>
                </div>
                {info ? <p className="text-xs text-info-text">{info}</p> : null}
                {!checklist.grupoNome && !grupoQuery && sugestao ? (
                  <p className="text-xs text-muted-foreground">
                    Sugestão:{" "}
                    <button type="button" className="font-medium text-interactive-700 hover:underline" onClick={() => setGrupoQuery(sugestao)}>
                      {clienteExistente?.grupoNome ? `${clienteExistente.grupoNome} (grupo do cliente na carteira do CRM)` : sugestao}
                    </button>
                  </p>
                ) : null}
              </div>

              {loadingGrupo ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Lendo o grupo no VIOS…
                </div>
              ) : grupoInfo ? (
                <>
                  <div className="grid gap-px overflow-hidden rounded-(--radius-v2-lg) border border-neutral-200 bg-neutral-200 sm:grid-cols-3">
                    <Highlight icon={Users} label="Grupo no VIOS">
                      <span className="font-semibold">{checklist.grupoNome}</span>
                      <span className="block text-xs text-muted-foreground">
                        {grupoInfo.length} {grupoInfo.length === 1 ? "pessoa" : "pessoas"}
                      </span>
                    </Highlight>
                    <Highlight icon={Building2} label="Cliente no VIOS">
                      {pessoaEncontrada ? (
                        <span className="font-semibold">{pessoaEncontrada.nome}</span>
                      ) : (
                        <span className="font-semibold text-warning-text">Não encontrado no grupo</span>
                      )}
                    </Highlight>
                    <Highlight icon={Hash} label="Código no VIOS">
                      <span className="font-semibold tabular-nums">{conferencia?.ci ?? "—"}</span>
                    </Highlight>
                  </div>

                  {!conferencia?.pessoaId ? (
                    <Alert className="border-warning-border bg-warning-bg text-warning-text">
                      <CircleAlert className="size-4" aria-hidden />
                      <AlertTitle>O cliente não está neste grupo no VIOS</AlertTitle>
                      <AlertDescription>
                        Nenhuma pessoa do grupo {checklist.grupoNome} tem o {tipoCliente} {maskCpfCnpj(cadastro.documento)}. Confira se o
                        lançamento foi feito nesse grupo; se acabou de lançar, atualize os grupos do CRM e confira de novo.
                      </AlertDescription>
                    </Alert>
                  ) : divergencias.length > 0 ? (
                    <Alert className="border-warning-border bg-warning-bg text-warning-text">
                      <CircleAlert className="size-4" aria-hidden />
                      <AlertTitle>
                        O VIOS está diferente do cadastro em {divergencias.length} {divergencias.length === 1 ? "dado" : "dados"}
                      </AlertTitle>
                      <AlertDescription>
                        Corrija o lançamento no VIOS ({divergencias.map((d) => d.label).join(", ")}) e confira de novo.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <Alert className="border-success-border bg-success-bg text-success-text">
                      <CheckCircle2 className="size-4" aria-hidden />
                      <AlertTitle>O lançamento no VIOS confere com o cadastro</AlertTitle>
                    </Alert>
                  )}

                  {conferencia?.pessoaId ? (
                    <div className="overflow-hidden rounded-(--radius-v2-lg) border border-neutral-200">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs text-muted-foreground">Dado</TableHead>
                            <TableHead className="text-xs text-muted-foreground">No cadastro</TableHead>
                            <TableHead className="text-xs text-muted-foreground">No VIOS</TableHead>
                            <TableHead className="w-10">
                              <span className="sr-only">Situação</span>
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {conferencia.itens.map((item) => (
                            <TableRow key={item.campo} className={item.ok ? undefined : "bg-warning-bg/60 hover:bg-warning-bg"}>
                              <TableCell className="text-muted-foreground">{item.label}</TableCell>
                              <TableCell className="whitespace-normal">{item.crm || "—"}</TableCell>
                              <TableCell className={cn("whitespace-normal", item.ok ? undefined : "font-medium text-warning-text")}>
                                {item.vios || "—"}
                              </TableCell>
                              <TableCell>
                                {item.ok ? (
                                  <Check className="size-4 text-success-text" aria-label="Confere" />
                                ) : (
                                  <X className="size-4 text-danger-text" aria-label="Diverge" />
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" variant="outline" size="sm" disabled={loadingGrupo} onClick={() => void selectGroup(checklist.grupoNome)}>
                      <RefreshCw aria-hidden />
                      Conferir de novo
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setShowPessoas((v) => !v)}>
                      <Users aria-hidden />
                      {showPessoas ? "Esconder pessoas do grupo" : `Ver pessoas do grupo (${grupoInfo.length})`}
                    </Button>
                  </div>

                  {showPessoas ? (
                    <div className="max-h-72 overflow-y-auto rounded-(--radius-v2-lg) border border-neutral-200">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs text-muted-foreground">Pessoa</TableHead>
                            <TableHead className="text-xs text-muted-foreground">CPF/CNPJ</TableHead>
                            <TableHead className="text-xs text-muted-foreground">Cidade</TableHead>
                            <TableHead className="text-xs text-muted-foreground">Código</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {grupoInfo.map((p) => (
                            <TableRow key={p.id} className={p.id === conferencia?.pessoaId ? "bg-success-bg hover:bg-success-bg" : undefined}>
                              <TableCell className="whitespace-normal font-medium">{p.nome}</TableCell>
                              <TableCell className="tabular-nums">{p.cpfCnpj ?? "—"}</TableCell>
                              <TableCell>{[p.cidade, p.uf].filter(Boolean).join("/") || "—"}</TableCell>
                              <TableCell className="tabular-nums">{p.ci ?? "—"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : null}

                  {clienteExistente?.grupoId && clienteExistente.grupoNome ? (
                    <p className="text-xs text-muted-foreground">
                      Na carteira do CRM o cliente já está no grupo {clienteExistente.grupoNome}; o cadastro será ligado a ele.
                    </p>
                  ) : null}
                </>
              ) : null}
            </>
          )
        ) : null}

        {view === 3 ? (
          <>
            <div className="flex items-start gap-3 rounded-(--radius-v2-lg) border border-border bg-surface-subtle px-4 py-3.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-(--radius-v2-md) bg-interactive-50 text-interactive-700">
                <MonitorCog className="size-4" aria-hidden />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">Lance o cliente nos sistemas legados do escritório</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Depois de atualizar, marque aqui. Com os três passos feitos, o cadastro pode ser concluído.
                </p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ops-obs">Observações de Operações Legais (opcional)</Label>
              <Textarea
                id="ops-obs"
                rows={3}
                value={checklist.observacoes}
                disabled={!canConclude}
                placeholder="Fica registrado no cadastro do cliente."
                onChange={(ev) => setChecklist({ ...checklist, observacoes: ev.target.value })}
                onBlur={() => void saveChecklist(checklist)}
              />
            </div>
          </>
        ) : null}

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Não foi possível continuar</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface-subtle px-5 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {canReturn ? (
            <Button type="button" variant="outline" disabled={busy} onClick={openReturn}>
              <RotateCcw aria-hidden />
              Devolver ao responsável
            </Button>
          ) : null}
          {done[view] && !allDone && canConclude ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={locked}
              onClick={() =>
                void saveChecklist(
                  view === 1
                    ? { ...checklist, viosCadastrado: false }
                    : view === 2
                      ? { ...checklist, dadosConferidos: false }
                      : { ...checklist, sistemasLegadosAtualizados: false },
                )
              }
            >
              Desfazer este passo
            </Button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {allDone ? (
            canConclude ? (
              <Button type="button" disabled={busy} onClick={() => setConcludeOpen(true)}>
                <CheckCircle2 aria-hidden />
                Concluir cadastro
              </Button>
            ) : null
          ) : view === 1 ? (
            done[1] ? (
              <Button type="button" variant="outline" onClick={() => setView(2)}>
                Ir para a conferência
                <ArrowRight aria-hidden />
              </Button>
            ) : (
              <Button type="button" disabled={locked} onClick={() => void completeStep({ ...checklist, viosCadastrado: true }, 2)}>
                Já lancei no VIOS
                <ArrowRight aria-hidden />
              </Button>
            )
          ) : view === 2 ? (
            done[2] ? (
              <Button type="button" variant="outline" onClick={() => setView(3)}>
                Ir para os sistemas legados
                <ArrowRight aria-hidden />
              </Button>
            ) : (
              <>
                {conferencia && (divergencias.length > 0 || !conferencia.pessoaId) ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={locked || !done[1]}
                    onClick={() => void completeStep({ ...checklist, dadosConferidos: true }, 3)}
                  >
                    Marcar como conferido mesmo assim
                  </Button>
                ) : null}
                <Button
                  type="button"
                  disabled={locked || !done[1] || !conferencia?.pessoaId || divergencias.length > 0}
                  onClick={() => void completeStep({ ...checklist, dadosConferidos: true }, 3)}
                >
                  Conferi, está correto
                  <ArrowRight aria-hidden />
                </Button>
              </>
            )
          ) : done[3] ? null : (
            <Button
              type="button"
              disabled={locked}
              onClick={() => void completeStep({ ...checklist, sistemasLegadosAtualizados: true }, firstPending === 3 ? 3 : firstPending)}
            >
              Atualizei os sistemas legados
              <Check aria-hidden />
            </Button>
          )}
        </div>
      </footer>

      <Dialog open={returnOpen} onOpenChange={(open) => !busy && setReturnOpen(open)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Devolver o cadastro ao responsável</DialogTitle>
            <DialogDescription>
              Marque o que está errado ou faltando no cadastro. O responsável abre a ficha direto nesses campos, corrige e reenvia; o
              lead continua na etapa em que está.
            </DialogDescription>
          </DialogHeader>
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-semibold text-foreground">O que ajustar</legend>
            {ONBOARDING_ADJUSTABLE_FIELDS.map((field) => {
              const ajuste = ajustes.find((a) => a.campo === field.campo);
              const id = `ajuste-${field.anchor}`;
              const preenchido = filledValue(field.campo);
              return (
                <div
                  key={field.campo}
                  className={cn(
                    "rounded-(--radius-v2-md) border px-3 py-2.5 transition-colors",
                    ajuste ? "border-interactive-300 bg-interactive-50" : "border-border bg-white",
                  )}
                >
                  <label htmlFor={id} className="flex cursor-pointer items-start gap-3">
                    <input
                      id={id}
                      type="checkbox"
                      className="mt-0.5 size-4 shrink-0 accent-interactive-600"
                      checked={Boolean(ajuste)}
                      onChange={(ev) => toggleAjuste(field.campo, ev.target.checked)}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-foreground">{field.label}</span>
                      <span className={cn("block text-xs break-words", preenchido ? "text-muted-foreground" : "text-warning-text")}>
                        {preenchido ? `Preenchido: ${preenchido}` : "Não preenchido"}
                      </span>
                    </span>
                  </label>
                  {ajuste ? (
                    <Input
                      className="mt-2"
                      value={ajuste.comentario}
                      placeholder="O que está errado ou o que falta (opcional)"
                      aria-label={`O que ajustar em ${field.label}`}
                      onChange={(ev) =>
                        setAjustes((prev) => prev.map((a) => (a.campo === field.campo ? { ...a, comentario: ev.target.value } : a)))
                      }
                    />
                  ) : null}
                </div>
              );
            })}
          </fieldset>
          <div className="space-y-1.5">
            <Label htmlFor="ops-return-comment">Comentário geral</Label>
            <Textarea
              id="ops-return-comment"
              rows={3}
              value={returnComment}
              onChange={(ev) => setReturnComment(ev.target.value)}
              placeholder={ajustes.length > 0 ? "Opcional" : "O que precisa ser ajustado?"}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => setReturnOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={busy || (ajustes.length === 0 && returnComment.trim().length < 5)}
              onClick={() => void submitReturn()}
            >
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : <RotateCcw aria-hidden />}
              Devolver
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={concludeOpen} onOpenChange={(open) => !busy && setConcludeOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Concluir o cadastro do cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              {clienteExistente
                ? `O lead será ligado ao cliente ${clienteExistente.razaoSocial}`
                : "O CRM vai achar o cliente pelo CPF/CNPJ ou criá-lo"}
              {`, no grupo ${grupoCrm?.nome ?? checklist.grupoNome}`}
              {checklist.viosReferencia ? ` (VIOS ${checklist.viosReferencia})` : ""}. O responsável do lead é avisado para seguir para a
              etapa seguinte.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Voltar</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={() => void submitConclude()}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Concluir cadastro
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
