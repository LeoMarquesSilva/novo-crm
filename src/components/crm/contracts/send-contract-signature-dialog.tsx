"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Send, TriangleAlert, X } from "lucide-react";

import { CrmSelectContent, CrmSelectItem } from "@/components/crm/crm-select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Select, SelectTrigger } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { dialogSelectOutsideHandlers } from "@/lib/ui/base-ui-select-dialog";
import { cn } from "@/lib/utils";

type FirmSignerOption = {
  key: string;
  name: string;
  oab: string;
  defaultEmail: string;
  emailOptions: string[];
};

type ClientSuggestion = { name: string; email: string; foreign: "0" | "1"; source: string };

type SendReadiness = {
  stage: string;
  reviewApproved: boolean;
  pending: string[];
  canSend: boolean;
  blockReason: string | null;
  isResend: boolean;
};

type CurrentDocument = {
  uuid: string;
  pending: boolean;
  finalized: boolean;
  signed: number;
  total: number;
} | null;

type ClientRow = { id: string; name: string; email: string; foreign: "0" | "1" };
type FirmRow = { key: string; include: boolean; email: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function rowId(): string {
  return `c-${Math.random().toString(36).slice(2, 9)}`;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/**
 * Envio do contrato para assinatura (D4Sign): sócios já preenchidos (com escolha do
 * e-mail), signatários do cliente sugeridos a partir do lead. Ao enviar, o lead vai para
 * Contrato Enviado; quando todos assinam, segue sozinho para Contrato Assinado.
 */
export function SendContractSignatureDialog({
  open,
  onOpenChange,
  leadId,
  leadName,
  onSent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  leadName?: string | null;
  onSent: (result: { documentUuid: string; linkContrato: string | null }) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<SendReadiness | null>(null);
  const [currentDocument, setCurrentDocument] = useState<CurrentDocument>(null);
  const [firmOptions, setFirmOptions] = useState<FirmSignerOption[]>([]);
  const [firmRows, setFirmRows] = useState<FirmRow[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [message, setMessage] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setLoadError(null);
    setSendError(null);
    setConfirmCancel(false);
    void (async () => {
      try {
        const res = await fetch(`/api/crm/leads/${encodeURIComponent(leadId)}/contrato/send-d4sign`, {
          cache: "no-store",
        });
        const json = (await res.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
          readiness?: SendReadiness;
          currentDocument?: CurrentDocument;
          firmSigners?: FirmSignerOption[];
          clientSuggestions?: ClientSuggestion[];
        } | null;
        if (!active) return;
        if (!res.ok || !json?.ok || !json.readiness) {
          setLoadError(json?.error ?? "Não foi possível preparar o envio.");
          return;
        }
        setReadiness(json.readiness);
        setCurrentDocument(json.currentDocument ?? null);
        const options = json.firmSigners ?? [];
        setFirmOptions(options);
        setFirmRows(options.map((o) => ({ key: o.key, include: true, email: o.defaultEmail })));
        const suggestions = json.clientSuggestions ?? [];
        setClients(
          suggestions.length > 0
            ? suggestions.map((s) => ({ id: rowId(), name: s.name, email: s.email, foreign: s.foreign }))
            : [{ id: rowId(), name: "", email: "", foreign: "0" }],
        );
      } catch {
        if (active) setLoadError("Não foi possível preparar o envio.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [open, leadId]);

  const needsCancelConfirmation = Boolean(currentDocument?.pending);

  function updateClient(id: string, patch: Partial<ClientRow>) {
    setClients((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function validate(): string | null {
    const filled = clients.filter((r) => r.email.trim());
    if (filled.length === 0) return "Informe pelo menos um e-mail de quem assina pelo cliente.";
    const invalid = filled.find((r) => !EMAIL_RE.test(r.email.trim()));
    if (invalid) return `E-mail inválido: ${invalid.email}`;
    const emails = filled.map((r) => r.email.trim().toLowerCase());
    if (new Set(emails).size !== emails.length) return "Há e-mails repetidos entre os signatários do cliente.";
    if (needsCancelConfirmation && !confirmCancel) return "Confirme o cancelamento do envio atual para reenviar.";
    return null;
  }

  async function handleSend() {
    const problem = validate();
    if (problem) {
      setSendError(problem);
      return;
    }
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch(`/api/crm/leads/${encodeURIComponent(leadId)}/contrato/send-d4sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signers: clients
            .filter((r) => r.email.trim())
            .map((r) => ({
              email: r.email.trim(),
              foreign: r.foreign,
              role: "CONTRATANTE",
              ...(r.name.trim() ? { name: r.name.trim() } : {}),
            })),
          firmSigners: firmRows.filter((r) => r.include).map((r) => ({ email: r.email })),
          expectedStage: readiness?.stage,
          ...(needsCancelConfirmation ? { resend: { confirmCancelPrevious: true } } : {}),
          message: message.trim() || undefined,
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        documentUuid?: string;
        linkContrato?: string | null;
      } | null;
      if (!res.ok || !json?.ok) {
        setSendError(json?.error ?? `Erro ${res.status} ao enviar.`);
        return;
      }
      onSent({ documentUuid: json.documentUuid ?? "", linkContrato: json.linkContrato ?? null });
      onOpenChange(false);
    } catch {
      setSendError("Erro de conexão ao enviar. Tente novamente.");
    } finally {
      setSending(false);
    }
  }

  const blocked = readiness ? !readiness.canSend : true;

  return (
    <Dialog open={open} onOpenChange={(next) => !sending && onOpenChange(next)} modal={false}>
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"
        {...dialogSelectOutsideHandlers()}
      >
        <DialogHeader>
          <DialogTitle>{readiness?.isResend ? "Reenviar contrato para assinatura" : "Enviar contrato para assinatura"}</DialogTitle>
          <DialogDescription>
            {leadName ? `${leadName} · ` : ""}O lead vai para Contrato Enviado. Quando todos assinarem, segue sozinho
            para Contrato Assinado e o pós-venda começa.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 py-6 text-v2-body-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Preparando o envio…
          </div>
        ) : loadError ? (
          <Alert variant="destructive">
            <AlertTitle>Não foi possível abrir o envio</AlertTitle>
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-5">
            {readiness?.blockReason ? (
              <Alert variant="destructive">
                <TriangleAlert className="size-4" aria-hidden />
                <AlertTitle>Envio bloqueado</AlertTitle>
                <AlertDescription>{readiness.blockReason}</AlertDescription>
              </Alert>
            ) : null}

            <section className="space-y-2.5">
              <div>
                <p className="text-v2-body-sm-medium text-foreground">Contratada · sócios</p>
                <p className="text-v2-caption text-muted-foreground">
                  Já preenchidos. Escolha o e-mail de cada sócio ou desmarque quem não assina.
                </p>
              </div>
              <ul className="space-y-2">
                {firmOptions.map((option) => {
                  const row = firmRows.find((r) => r.key === option.key);
                  if (!row) return null;
                  return (
                    <li
                      key={option.key}
                      className="flex flex-wrap items-center gap-3 rounded-(--radius-v2-md) border border-neutral-200 bg-white px-3 py-2.5"
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-(--radius-v2-full) bg-interactive-50 text-v2-caption-medium text-interactive-700">
                        {initials(option.name)}
                      </span>
                      <div className="min-w-[160px] flex-1">
                        <p className="truncate text-v2-body-sm-medium text-foreground">{option.name}</p>
                        {option.oab ? <p className="text-v2-caption text-muted-foreground">{option.oab}</p> : null}
                      </div>
                      <Select
                        value={row.email}
                        onValueChange={(value) =>
                          setFirmRows((prev) =>
                            prev.map((r) => (r.key === option.key && value ? { ...r, email: String(value) } : r)),
                          )
                        }
                        disabled={!row.include || sending}
                      >
                        <SelectTrigger size="sm" className="w-full sm:w-[260px]">
                          <span className="truncate">{row.email}</span>
                        </SelectTrigger>
                        <CrmSelectContent inModal>
                          {option.emailOptions.map((email) => (
                            <CrmSelectItem key={email} value={email}>
                              {email}
                            </CrmSelectItem>
                          ))}
                        </CrmSelectContent>
                      </Select>
                      <label className="flex items-center gap-2 text-v2-caption text-muted-foreground">
                        <Switch
                          checked={row.include}
                          disabled={sending}
                          onCheckedChange={(checked) =>
                            setFirmRows((prev) =>
                              prev.map((r) => (r.key === option.key ? { ...r, include: Boolean(checked) } : r)),
                            )
                          }
                          aria-label={`Incluir ${option.name}`}
                        />
                        Incluir
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="space-y-2.5">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-v2-body-sm-medium text-foreground">Contratante · cliente</p>
                  <p className="text-v2-caption text-muted-foreground">
                    E-mails de quem assina pelo cliente. Sugeridos a partir do lead; confira antes de enviar.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={sending}
                  onClick={() => setClients((prev) => [...prev, { id: rowId(), name: "", email: "", foreign: "0" }])}
                >
                  <Plus className="size-3.5" aria-hidden />
                  Adicionar
                </Button>
              </div>
              <div className="space-y-2">
                {clients.map((row, index) => (
                  <div
                    key={row.id}
                    className="grid gap-2 rounded-(--radius-v2-md) border border-neutral-200 bg-white p-3 sm:grid-cols-[1fr_1.2fr_120px_auto] sm:items-center"
                  >
                    <Input
                      value={row.name}
                      onChange={(e) => updateClient(row.id, { name: e.target.value })}
                      placeholder={`Nome do signatário ${index + 1}`}
                      disabled={sending}
                      aria-label={`Nome do signatário ${index + 1}`}
                    />
                    <Input
                      type="email"
                      value={row.email}
                      onChange={(e) => updateClient(row.id, { email: e.target.value })}
                      placeholder="email@cliente.com.br"
                      disabled={sending}
                      aria-label={`E-mail do signatário ${index + 1}`}
                    />
                    <Select
                      value={row.foreign}
                      onValueChange={(value) => {
                        if (value === "0" || value === "1") updateClient(row.id, { foreign: value });
                      }}
                      disabled={sending}
                    >
                      <SelectTrigger size="sm">
                        <span>{row.foreign === "0" ? "CPF BR" : "Sem CPF"}</span>
                      </SelectTrigger>
                      <CrmSelectContent inModal>
                        <CrmSelectItem value="0">CPF brasileiro</CrmSelectItem>
                        <CrmSelectItem value="1">Sem CPF / estrangeiro</CrmSelectItem>
                      </CrmSelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={sending || clients.length <= 1}
                      onClick={() => setClients((prev) => prev.filter((r) => r.id !== row.id))}
                      aria-label={`Remover signatário ${index + 1}`}
                    >
                      <X className="size-4" aria-hidden />
                    </Button>
                  </div>
                ))}
              </div>
              {clients.filter((r) => r.email.trim()).length > 1 ? (
                <p className="text-v2-caption text-muted-foreground">
                  Com mais de um signatário do cliente, a posição de assinatura marcada no contrato vale só para o
                  primeiro; os demais assinam onde a D4Sign indicar.
                </p>
              ) : null}
            </section>

            <div className="space-y-1.5">
              <Label htmlFor="send-contract-message">Mensagem no e-mail da D4Sign (opcional)</Label>
              <Input
                id="send-contract-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={500}
                disabled={sending}
              />
            </div>

            {needsCancelConfirmation && currentDocument ? (
              <Alert className="border-warning-border bg-warning-bg text-warning-text">
                <TriangleAlert className="size-4" aria-hidden />
                <AlertTitle>Já existe um envio em andamento</AlertTitle>
                <AlertDescription>
                  <p>
                    {currentDocument.signed} de {currentDocument.total} já assinaram. Reenviar cancela o documento atual
                    na D4Sign e as assinaturas feitas nele são perdidas.
                  </p>
                  <label className="mt-2 flex items-center gap-2 font-medium">
                    <Switch checked={confirmCancel} onCheckedChange={(c) => setConfirmCancel(Boolean(c))} />
                    Cancelar o envio atual e reenviar
                  </label>
                </AlertDescription>
              </Alert>
            ) : null}

            {sendError ? (
              <p className="text-v2-body-sm text-danger-text" role="alert">
                {sendError}
              </p>
            ) : null}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" disabled={sending} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={loading || Boolean(loadError) || blocked || sending}
            onClick={() => void handleSend()}
            className={cn("gap-2")}
          >
            {sending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
            {sending ? "Gerando e enviando…" : readiness?.isResend ? "Reenviar para assinatura" : "Enviar para assinatura"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
