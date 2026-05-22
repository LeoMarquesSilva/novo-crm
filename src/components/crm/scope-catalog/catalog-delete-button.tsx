"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { ProposalCatalogAdminData } from "@/lib/crm/proposal-catalog-db";

export type CatalogDeleteKind =
  | "scope_type"
  | "scope_subtype"
  | "investment_type"
  | "investment_subtype";

type Props = {
  kind: CatalogDeleteKind;
  id: string;
  itemLabel: string;
  /** Subtipos que serão removidos junto ao excluir um tipo. */
  childSubtypeCount?: number;
  onDeleted: (catalog: ProposalCatalogAdminData) => void;
  disabled?: boolean;
};

function kindLabel(kind: CatalogDeleteKind): string {
  switch (kind) {
    case "scope_type":
      return "tipo de escopo";
    case "scope_subtype":
      return "subtipo de escopo";
    case "investment_type":
      return "tipo de investimento";
    case "investment_subtype":
      return "subtipo de investimento";
  }
}

export function CatalogDeleteButton({
  kind,
  id,
  itemLabel,
  childSubtypeCount = 0,
  onDeleted,
  disabled,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isType = kind === "scope_type" || kind === "investment_type";
  const hasChildren = isType && childSubtypeCount > 0;

  async function confirmDelete() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/proposal-catalog", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        data?: ProposalCatalogAdminData;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.data) {
        throw new Error(json.error ?? "Falha ao excluir.");
      }
      onDeleted(json.data);
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao excluir.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || deleting}
          className="h-9 gap-1.5 border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
        >
          <Trash2 className="size-3.5" aria-hidden />
          Excluir
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir {kindLabel(kind)}?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                O item <strong className="text-primary-dark">{itemLabel}</strong> será removido do
                catálogo. Esta ação não pode ser desfeita.
              </p>
              {hasChildren ? (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">
                  Também serão excluídos{" "}
                  <strong>
                    {childSubtypeCount} subtipo{childSubtypeCount === 1 ? "" : "s"}
                  </strong>{" "}
                  vinculado{childSubtypeCount === 1 ? "" : "s"} a este tipo.
                </p>
              ) : null}
              {error ? <p className="text-rose-700">{error}</p> : null}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={deleting}
            className="bg-rose-600 hover:bg-rose-700"
            onClick={(e) => {
              e.preventDefault();
              void confirmDelete();
            }}
          >
            {deleting ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              "Excluir definitivamente"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
