"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, Trash2, X } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { CrmSelectContent, CrmSelectItem, CrmSelectValue } from "@/components/crm/crm-select";
import { Select, SelectTrigger } from "@/components/ui/select";

const DOC_TYPE_LABELS = { CPF: "CPF", CNPJ: "CNPJ" } as const;
import { maskDocument } from "@/lib/crm/br-document-mask";
import { cn } from "@/lib/utils";
import type { LeadIntakeEmpresaRow } from "./lead-intake-types";

type Props = {
  leadId: string;
  initial: LeadIntakeEmpresaRow;
  /** Só permite remover se existir mais do que uma empresa (regra do cadastro). */
  canDelete: boolean;
};

export function LeadIntakeEmpresaBlock({ leadId, initial, canDelete }: Props) {
  const router = useRouter();
  const fieldKey = `empresa_${initial.index}`;
  const [editing, setEditing] = useState(false);
  const [razao, setRazao] = useState(initial.razao_social);
  const [tipo, setTipo] = useState<"CPF" | "CNPJ">(initial.tipo_documento);
  const [doc, setDoc] = useState(initial.documento);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (editing) return;
    setRazao(initial.razao_social);
    setTipo(initial.tipo_documento);
    setDoc(initial.documento);
  }, [initial.razao_social, initial.tipo_documento, initial.documento, editing]);

  const startEdit = () => {
    setRazao(initial.razao_social);
    setTipo(initial.tipo_documento);
    setDoc(initial.documento);
    setEditing(true);
    setError(null);
  };

  const cancel = () => {
    setEditing(false);
    setRazao(initial.razao_social);
    setTipo(initial.tipo_documento);
    setDoc(initial.documento);
    setError(null);
  };

  async function save() {
    const rs = razao.trim();
    const d = doc.trim();
    if (!rs) {
      setError("Razão social é obrigatória.");
      return;
    }
    if (!d) {
      setError("Documento é obrigatório.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = JSON.stringify({
        razao_social: rs,
        tipo_documento: tipo,
        documento: d,
      });
      const res = await fetch(`/api/crm/leads/${encodeURIComponent(leadId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intakeField: { key: fieldKey, value: payload } }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Não foi possível salvar.");
      }
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  function onDocInput(raw: string) {
    setDoc(maskDocument(raw, tipo));
  }

  function onTipoChange(next: "CPF" | "CNPJ") {
    setTipo(next);
    setDoc((prev) => maskDocument(prev.replace(/\D/g, ""), next));
  }

  async function confirmDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/crm/leads/${encodeURIComponent(leadId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intakeField: { key: "empresa_delete", value: String(initial.index) },
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Não foi possível remover a empresa.");
      }
      setDeleteOpen(false);
      router.refresh();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Erro ao remover.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className={cn("rounded-lg border border-white/50 bg-white/60 p-3 sm:col-span-2")}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Empresa {initial.index}
        </p>
        {!editing ? (
          <div className="flex shrink-0 items-center gap-0.5">
            {canDelete ? (
              <AlertDialog
                open={deleteOpen}
                onOpenChange={(open) => {
                  setDeleteOpen(open);
                  if (!open) setDeleteError(null);
                }}
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  title="Remover empresa"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remover empresa {initial.index}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta empresa será eliminada do cadastro inicial. Tem de existir pelo menos uma empresa
                      no lead; não é possível remover a única linha.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  {deleteError ? (
                    <p className="text-sm text-destructive" role="alert">
                      {deleteError}
                    </p>
                  ) : null}
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={deleting}
                      onClick={() => void confirmDelete()}
                    >
                      {deleting ? "A remover…" : "Remover"}
                    </Button>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-muted-foreground hover:text-primary-dark"
              title="Editar"
              onClick={startEdit}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : null}
      </div>

      {!editing ? (
        <div className="mt-2 space-y-2 text-sm text-primary-dark">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Razão social / nome
            </p>
            <p className="mt-0.5 font-medium">{initial.razao_social || "—"}</p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              CPF / CNPJ
            </p>
            <p className="mt-0.5">
              <span className="font-medium text-primary-dark">{initial.tipo_documento}</span>{" "}
              {initial.documento || "—"}
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-2 space-y-3">
          <div className="space-y-1">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Razão social / nome
            </p>
            <Input
              value={razao}
              onChange={(e) => setRazao(e.target.value)}
              disabled={saving}
              className="bg-white/80"
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-[120px_1fr]">
            <div className="space-y-1">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Tipo
              </p>
              <Select
                value={tipo}
                onValueChange={(v) => onTipoChange(v === "CPF" ? "CPF" : "CNPJ")}
                disabled={saving}
              >
                <SelectTrigger className="bg-white/80">
                  <CrmSelectValue value={tipo} labels={DOC_TYPE_LABELS} />
                </SelectTrigger>
                <CrmSelectContent>
                  <CrmSelectItem value="CPF">CPF</CrmSelectItem>
                  <CrmSelectItem value="CNPJ">CNPJ</CrmSelectItem>
                </CrmSelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Número
              </p>
              <Input
                value={doc}
                onChange={(e) => onDocInput(e.target.value)}
                disabled={saving}
                inputMode="numeric"
                autoComplete="off"
                className="bg-white/80"
              />
            </div>
          </div>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="cta" disabled={saving} onClick={() => void save()}>
              <Check className="mr-1 h-3.5 w-3.5" />
              {saving ? "Salvando…" : "Salvar"}
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={saving} onClick={cancel}>
              <X className="mr-1 h-3.5 w-3.5" />
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
