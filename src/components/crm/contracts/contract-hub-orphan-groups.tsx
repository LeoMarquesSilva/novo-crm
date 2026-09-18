"use client";

import Link from "next/link";
import { useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { HubOrphanGroup } from "@/lib/crm/contract-hub-summary";
import { cn } from "@/lib/utils";

export function ContractHubOrphanGroupsTrigger({
  groups,
}: {
  groups: HubOrphanGroup[];
}) {
  const [open, setOpen] = useState(false);
  if (groups.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 text-left text-xs font-medium text-danger-text underline-offset-2 hover:underline"
      >
        Ver {groups.length === 1 ? "grupo" : "grupos"}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Grupos ativos sem contrato</DialogTitle>
            <DialogDescription>
              Cliente ativo no OrquestrAI sem nenhum contrato cadastrado no CRM — inclusive rascunho
              importado.
            </DialogDescription>
          </DialogHeader>
          <ul className="divide-y divide-border">
            {groups.map((group) => (
              <li key={group.orqestraiId} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate text-sm font-medium text-foreground">{group.name}</span>
                <Link
                  href="/crm/clientes"
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shrink-0")}
                >
                  Abrir clientes
                </Link>
              </li>
            ))}
          </ul>
          <div className="flex justify-end">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
