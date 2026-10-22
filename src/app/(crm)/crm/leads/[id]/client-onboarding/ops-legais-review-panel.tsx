"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { CheckCircle2, Loader2, RotateCcw, Search } from "lucide-react";

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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { listMissingChecklistItems, type OpsChecklist } from "@/modules/crm/domain/client-onboarding";

type CarteiraMatch = {
  clientes: { id: string; razaoSocial: string; documento: string; grupoId: string | null; grupoNome: string | null; exact: boolean }[];
  grupos: { id: string; nome: string; exact: boolean }[];
};

/**
 * Conferência de Operações Legais em Cadastro de Novo Cliente: checklist (dados, VIOS,
 * sistemas legados), nome do grupo econômico (novo ou existente), cliente já cadastrado e
 * as ações Devolver ao responsável / Concluir cadastro.
 */
export function OpsLegaisReviewPanel({
  leadId,
  initialChecklist,
  canReturn,
  canConclude,
  onChanged,
}: {
  leadId: string;
  initialChecklist: OpsChecklist;
  canReturn: boolean;
  canConclude: boolean;
  onChanged: () => void;
}) {
  const base = `/api/crm/leads/${encodeURIComponent(leadId)}/onboarding`;
  const [checklist, setChecklist] = useState<OpsChecklist>(initialChecklist);
  const [saving, setSaving] = useState(false);
  const [match, setMatch] = useState<CarteiraMatch | null>(null);
  const [searching, setSearching] = useState(false);
  const [grupoId, setGrupoId] = useState<string | null>(null);
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnComment, setReturnComment] = useState("");
  const [concludeOpen, setConcludeOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const missing = listMissingChecklistItems(grupoId ? { ...checklist, grupoNome: checklist.grupoNome || "existente" } : checklist);
  const selectedGroup = match?.grupos.find((g) => g.id === grupoId) ?? null;
  const selectedClient = match?.clientes.find((c) => c.id === clienteId) ?? null;

  async function searchCarteira(groupName: string) {
    setSearching(true);
    try {
      const res = await fetch(`${base}/carteira-match?grupo=${encodeURIComponent(groupName)}`, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ({ ok?: boolean } & CarteiraMatch) | null;
      if (res.ok && json?.ok) {
        setMatch({ clientes: json.clientes, grupos: json.grupos });
        const exactClient = json.clientes.find((c) => c.exact);
        if (exactClient) {
          setClienteId(exactClient.id);
          if (exactClient.grupoId) setGrupoId(exactClient.grupoId);
        }
      }
    } finally {
      setSearching(false);
    }
  }

  // Busca inicial pelo CPF/CNPJ do cadastro e o nome do grupo já salvo.
  const searchOnOpen = useEffectEvent(() => {
    void searchCarteira(initialChecklist.grupoNome);
  });
  useEffect(() => {
    searchOnOpen();
  }, [leadId]);

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
        setError(json?.error ?? "Não foi possível salvar o checklist.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function submitReturn() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${base}/return`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: returnComment }),
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
        body: JSON.stringify({ checklist, grupoId, clienteId }),
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

  const toggle = (key: "dadosConferidos" | "viosCadastrado" | "sistemasLegadosAtualizados", label: string) => (
    <label className="flex items-center justify-between gap-3 rounded-(--radius-v2-md) border border-neutral-200 bg-white px-3 py-2.5">
      <span className="text-v2-body-sm text-foreground">{label}</span>
      <Switch
        aria-label={label}
        checked={checklist[key]}
        disabled={!canConclude || saving}
        onCheckedChange={(checked) => void saveChecklist({ ...checklist, [key]: Boolean(checked) })}
      />
    </label>
  );

  return (
    <section className="space-y-4 rounded-(--radius-v2-xl) border border-interactive-200 bg-interactive-50 p-4 sm:p-5">
      <div>
        <h3 className="text-v2-heading-md text-foreground">Operações Legais — conferência e cadastro</h3>
        <p className="mt-0.5 text-v2-caption text-muted-foreground">
          Confira os dados abaixo, cadastre o cliente no VIOS e nos sistemas legados e defina o grupo econômico. Ao
          concluir, o lead vai para Inclusão no Faturamento e o Financeiro é avisado.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {toggle("dadosConferidos", "Dados conferidos")}
        {toggle("viosCadastrado", "Cadastrado no VIOS")}
        {toggle("sistemasLegadosAtualizados", "Sistemas legados atualizados")}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ops-vios">Código do cliente no VIOS *</Label>
          <Input
            id="ops-vios"
            value={checklist.viosReferencia}
            disabled={!canConclude}
            onChange={(e) => setChecklist({ ...checklist, viosReferencia: e.target.value })}
            onBlur={() => void saveChecklist(checklist)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ops-grupo">Nome do grupo econômico *</Label>
          <div className="flex gap-2">
            <Input
              id="ops-grupo"
              value={checklist.grupoNome}
              disabled={!canConclude || Boolean(grupoId)}
              onChange={(e) => setChecklist({ ...checklist, grupoNome: e.target.value })}
              onBlur={() => void saveChecklist(checklist)}
              placeholder="Ex.: Grupo ACME"
            />
            <Button
              type="button"
              variant="outline"
              size="control"
              disabled={searching}
              onClick={() => void searchCarteira(checklist.grupoNome)}
              aria-label="Buscar grupos na carteira"
            >
              {searching ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Search className="size-4" aria-hidden />}
            </Button>
          </div>
        </div>
      </div>

      {match && (match.grupos.length > 0 || match.clientes.length > 0) ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <p className="text-v2-caption-medium text-muted-foreground">Grupos parecidos na carteira</p>
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => setGrupoId(null)}
                className={cn(
                  "w-full rounded-(--radius-v2-md) border px-3 py-2 text-left text-v2-body-sm",
                  grupoId === null ? "border-interactive-600 bg-white" : "border-neutral-200 bg-white/70",
                )}
              >
                Criar novo grupo: <strong>{checklist.grupoNome || "—"}</strong>
              </button>
              {match.grupos.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setGrupoId(g.id)}
                  className={cn(
                    "w-full rounded-(--radius-v2-md) border px-3 py-2 text-left text-v2-body-sm",
                    grupoId === g.id ? "border-interactive-600 bg-white" : "border-neutral-200 bg-white/70",
                  )}
                >
                  Usar grupo existente: <strong>{g.nome}</strong>
                  {g.exact ? <span className="ml-2 text-v2-caption text-success-text">mesmo nome</span> : null}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="text-v2-caption-medium text-muted-foreground">Cliente já cadastrado com este CPF/CNPJ</p>
            {match.clientes.length === 0 ? (
              <p className="text-v2-body-sm text-muted-foreground">Nenhum — o CRM cria o cliente ao concluir.</p>
            ) : (
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => setClienteId(null)}
                  className={cn(
                    "w-full rounded-(--radius-v2-md) border px-3 py-2 text-left text-v2-body-sm",
                    clienteId === null ? "border-interactive-600 bg-white" : "border-neutral-200 bg-white/70",
                  )}
                >
                  Achar pelo CPF/CNPJ ou criar
                </button>
                {match.clientes.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setClienteId(c.id);
                      if (c.grupoId) setGrupoId(c.grupoId);
                    }}
                    className={cn(
                      "w-full rounded-(--radius-v2-md) border px-3 py-2 text-left text-v2-body-sm",
                      clienteId === c.id ? "border-interactive-600 bg-white" : "border-neutral-200 bg-white/70",
                    )}
                  >
                    <strong>{c.razaoSocial}</strong> · {c.documento}
                    {c.grupoNome ? <span className="block text-v2-caption text-muted-foreground">Grupo: {c.grupoNome}</span> : null}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="ops-obs">Observações de Operações Legais</Label>
        <Textarea
          id="ops-obs"
          rows={2}
          value={checklist.observacoes}
          disabled={!canConclude}
          onChange={(e) => setChecklist({ ...checklist, observacoes: e.target.value })}
          onBlur={() => void saveChecklist(checklist)}
        />
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Não foi possível continuar</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-v2-caption text-muted-foreground">
          {missing.length > 0 ? `Falta: ${missing.join(", ")}.` : "Checklist completo."}
        </p>
        <div className="flex flex-wrap gap-2">
          {canReturn ? (
            <Button type="button" variant="outline" disabled={busy} onClick={() => setReturnOpen(true)}>
              <RotateCcw className="size-4" aria-hidden />
              Devolver ao responsável
            </Button>
          ) : null}
          {canConclude ? (
            <Button type="button" disabled={busy || missing.length > 0} onClick={() => setConcludeOpen(true)}>
              <CheckCircle2 className="size-4" aria-hidden />
              Concluir cadastro
            </Button>
          ) : null}
        </div>
      </div>

      <Dialog open={returnOpen} onOpenChange={(open) => !busy && setReturnOpen(open)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Devolver o cadastro ao responsável</DialogTitle>
            <DialogDescription>
              O lead volta para Aguardando Cadastro e o responsável recebe este comentário.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={4}
            value={returnComment}
            onChange={(e) => setReturnComment(e.target.value)}
            placeholder="O que precisa ser ajustado?"
            aria-label="Comentário da devolução"
          />
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => setReturnOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" disabled={busy || returnComment.trim().length < 5} onClick={() => void submitReturn()}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
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
              {selectedClient
                ? `O lead será vinculado ao cliente ${selectedClient.razaoSocial}`
                : "O CRM vai achar o cliente pelo CPF/CNPJ ou criá-lo"}
              {selectedGroup ? `, no grupo ${selectedGroup.nome}` : `, no grupo ${checklist.grupoNome}`}. O contato
              financeiro entra nos contatos do cliente e o lead vai para Inclusão no Faturamento.
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
