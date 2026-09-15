"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, XCircle } from "lucide-react";
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
import { cn } from "@/lib/utils";

type LeadClosingStatusButtonProps = {
  leadId: string;
  isLost: boolean;
  className?: string;
};

export function LeadClosingStatusButton({
  leadId,
  isLost,
  className,
}: LeadClosingStatusButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function updateClosingStatus() {
    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/crm/leads/${encodeURIComponent(leadId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          closingStatus: { value: isLost ? null : "perdido" },
        }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || payload.ok === false) {
        throw new Error(payload.error ?? "Não foi possível alterar o status do lead.");
      }

      setOpen(false);
      router.refresh();
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Não foi possível alterar o status do lead.",
      );
    } finally {
      setSaving(false);
    }
  }

  const Icon = isLost ? RotateCcw : XCircle;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && saving) return;
        if (!next) setError(null);
        setOpen(next);
      }}
    >
      <Button
        type="button"
        variant="outline"
        size="control"
        disabled={saving}
        onClick={() => setOpen(true)}
        className={cn(
          !isLost &&
            "border-danger-border text-danger-text hover:border-danger-border hover:bg-danger-bg",
          className,
        )}
      >
        <Icon className="size-4" aria-hidden />
        {isLost ? "Reabrir lead" : "Marcar perda"}
      </Button>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isLost ? "Reabrir este lead?" : "Marcar este lead como perdido?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isLost
              ? "A negociação voltará a aparecer entre os leads ativos do funil."
              : "A negociação sairá do funil ativo e passará a constar como perdida. O lead não será excluído."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
          <Button
            type="button"
            variant={isLost ? "primary" : "destructive"}
            disabled={saving}
            onClick={() => void updateClosingStatus()}
          >
            {saving
              ? "Salvando…"
              : isLost
                ? "Reabrir lead"
                : "Marcar como perdido"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
