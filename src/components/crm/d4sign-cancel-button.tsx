"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * Cancela o documento na D4Sign (irreversível). Só para admin e documento em
 * andamento — a rota `/api/crm/d4sign/documents/[uuid]/cancel` confere de novo.
 * O motivo vai para a D4Sign como comentário do cancelamento.
 */
export function D4SignCancelButton({
  documentUuid,
  documentName,
  className,
}: {
  documentUuid: string;
  documentName: string | null;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = reason.trim().length >= 5;

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/crm/d4sign/documents/${encodeURIComponent(documentUuid)}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(body?.error ?? "Não foi possível cancelar o contrato.");
        return;
      }
      setOpen(false);
      setReason("");
      router.refresh();
    } catch {
      setError("Falha de conexão ao cancelar o contrato.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={className}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        <Ban />
        Cancelar
      </Button>
      <AlertDialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar contrato na D4Sign?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{documentName ?? "Este documento"}</strong> será cancelado na D4Sign e ninguém mais
              poderá assinar. <strong>Não dá para desfazer</strong> — para seguir, será preciso enviar um novo
              documento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <label htmlFor={`cancel-reason-${documentUuid}`} className="text-xs font-semibold text-foreground">
              Motivo do cancelamento
            </label>
            <Textarea
              id={`cancel-reason-${documentUuid}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex.: valor de honorários errado, será enviada nova versão"
              maxLength={500}
              disabled={busy}
            />
            <p className="text-[11px] text-muted-foreground">
              Vai para a D4Sign como comentário do cancelamento.
            </p>
            {error ? <p className="text-xs font-medium text-danger-text">{error}</p> : null}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Voltar</AlertDialogCancel>
            <Button type="button" variant="destructive" disabled={!valid || busy} onClick={confirm}>
              {busy ? <Loader2 className="animate-spin" /> : <Ban />}
              Cancelar contrato
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
