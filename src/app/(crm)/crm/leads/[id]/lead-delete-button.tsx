"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
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

interface LeadDeleteButtonProps {
  leadId: string;
  /** Variante visual quando o botão fica sobre fundo escuro (ex.: header do lead). */
  variant?: "default" | "onDark";
}

export function LeadDeleteButton({ leadId, variant = "default" }: LeadDeleteButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmDelete() {
    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/crm/leads/${encodeURIComponent(leadId)}`, {
        method: "DELETE",
      });

      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || payload.ok === false) {
        throw new Error(payload.error ?? "Falha ao excluir lead.");
      }

      setOpen(false);
      router.push("/crm/leads");
      router.refresh();
    } catch (deleteError) {
      const message =
        deleteError instanceof Error ? deleteError.message : "Falha ao excluir lead.";
      setError(message);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className={cn(variant === "default" && "mt-4 space-y-2")}>
      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          if (!next && isDeleting) return;
          if (!next) setError(null);
          setOpen(next);
        }}
      >
        <Button
          type="button"
          variant={variant === "onDark" ? "outline" : "destructive"}
          size="sm"
          disabled={isDeleting}
          onClick={() => setOpen(true)}
          className={cn(
            variant === "onDark" &&
              "border-[#fecaca] bg-white text-[#b91c1c] shadow-sm hover:bg-[#fef2f2] hover:text-[#991b1b] focus-visible:border-[#fca5a5] focus-visible:ring-[#fecaca]/40",
          )}
        >
          <Trash2 className="mr-1.5 h-4 w-4" />
          {isDeleting ? "Excluindo..." : "Excluir lead"}
        </Button>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir este lead?</AlertDialogTitle>
            <AlertDialogDescription>
              A oportunidade será removida de forma permanente. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={isDeleting}
              onClick={() => void confirmDelete()}
            >
              {isDeleting ? "A excluir…" : "Excluir"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
