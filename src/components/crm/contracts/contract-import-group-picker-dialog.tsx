"use client";

import { useMemo, useState } from "react";

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
import { normalizeGroupKey } from "@/lib/crm/normalize-document";
import { selectPrincipalClienteForGrupo } from "@/lib/contract-import/match-carteira";

export type ImportGrupoOption = { id: string; nome: string };
export type ImportClienteOption = {
  id: string;
  razaoSocial: string;
  documento: string;
  grupoId: string | null;
};

export function ContractImportGroupPickerDialog({
  open,
  filename,
  hint,
  grupos,
  clientes,
  busy,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  filename: string;
  hint?: string | null;
  grupos: ImportGrupoOption[];
  clientes: ImportClienteOption[];
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (grupoId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = normalizeGroupKey(query);
    if (!needle) return grupos;
    return grupos.filter((grupo) => normalizeGroupKey(grupo.nome).includes(needle));
  }, [grupos, query]);

  const selected = grupos.find((grupo) => grupo.id === selectedId) ?? null;
  const companies = selected
    ? clientes.filter((cliente) => cliente.grupoId === selected.id)
    : [];
  const principal = selected
    ? selectPrincipalClienteForGrupo(selected.id, clientes)
    : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setQuery("");
          setSelectedId(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[min(720px,90dvh)] overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Escolher grupo da carteira</DialogTitle>
          <DialogDescription>
            A extração não casou este PDF com um grupo. Selecione o grupo econômico para gravar o
            rascunho.
          </DialogDescription>
        </DialogHeader>
        <p className="truncate text-sm text-neutral-600" title={filename}>
          {filename}
        </p>
        {hint ? <p className="text-sm text-neutral-500">{hint}</p> : null}
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar grupo"
          autoFocus
        />
        <ul className="max-h-72 overflow-y-auto rounded-(--radius-v2-md) border border-neutral-200">
          {filtered.length === 0 ? (
            <li className="px-3 py-6 text-sm text-neutral-500">Nenhum grupo encontrado.</li>
          ) : (
            filtered.map((grupo) => (
              <li key={grupo.id} className="border-b border-neutral-100 last:border-b-0">
                <button
                  type="button"
                  className={`flex w-full items-center px-3 py-2.5 text-left text-sm ${
                    selectedId === grupo.id
                      ? "bg-interactive-50 text-interactive-800"
                      : "text-neutral-800 hover:bg-neutral-50"
                  }`}
                  onClick={() => setSelectedId(grupo.id)}
                >
                  {grupo.nome}
                </button>
              </li>
            ))
          )}
        </ul>
        {selected ? (
          <p className="text-sm text-neutral-600">
            {companies.length === 0
              ? "Este grupo não tem empresa cadastrada na carteira."
              : `Empresa: ${principal?.razaoSocial ?? companies[0]?.razaoSocial}${
                  companies.length > 1 ? ` (+${companies.length - 1})` : ""
                }`}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Agora não
          </Button>
          <Button
            type="button"
            disabled={!selectedId || companies.length === 0 || busy}
            onClick={() => {
              if (selectedId) onConfirm(selectedId);
            }}
          >
            Usar este grupo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
