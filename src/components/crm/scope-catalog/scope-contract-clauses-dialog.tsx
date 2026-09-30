"use client";

import { AlertTriangle, BookText, Info } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  ClauseTemplatesAdminPanel,
  type ClausePanelFocusSubtype,
  type ClauseRow,
} from "@/components/crm/clause-templates-admin-panel";
import type { PropostaTiposCatalog } from "@/data/proposta-tipos-catalog";
import { dialogSelectOutsideHandlers } from "@/lib/ui/base-ui-select-dialog";

export type ScopeClausesTarget = ClausePanelFocusSubtype & {
  hasContractProfile: boolean;
  /** Outros subtipos com a mesma `subtype_key` — as cláusulas vinculadas valem para todos. */
  keySiblings: Array<{ id: string; label: string; typeLabel: string; areaKey: string }>;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: ScopeClausesTarget;
  clauses: ClauseRow[];
  catalog: PropostaTiposCatalog;
  onClausesChange: (clauses: ClauseRow[]) => void;
};

export function ScopeContractClausesDialog({
  open,
  onOpenChange,
  target,
  clauses,
  catalog,
  onClausesChange,
}: Props) {
  return (
    <Dialog modal={false} open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[90dvh] max-w-3xl flex-col gap-0 overflow-hidden p-0"
        {...dialogSelectOutsideHandlers()}
      >
        <header className="border-b border-neutral-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <BookText className="size-4 text-muted-foreground" aria-hidden />
            <DialogTitle className="text-base font-extrabold text-foreground">
              Cláusulas do contrato
            </DialogTitle>
          </div>
          <DialogDescription className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {target.label}
            <span className="ml-1.5 font-mono text-[10px] text-muted-foreground/80">
              {target.subtypeKey}
            </span>
          </DialogDescription>
        </header>

        <div className="crm-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {target.keySiblings.length > 0 ? (
            <div className="flex items-start gap-2 rounded-(--radius-v2-md) border border-warning-border bg-warning-bg px-3 py-2 text-xs leading-relaxed text-warning-text">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>
                A chave <code className="font-mono">{target.subtypeKey}</code> também é usada por{" "}
                {target.keySiblings
                  .map((s) => `${s.areaKey} › ${s.typeLabel} › ${s.label}`)
                  .join("; ")}
                . As cláusulas vinculadas aqui valem para todos esses subtipos.
              </span>
            </div>
          ) : null}

          <div className="flex items-start gap-2 rounded-(--radius-v2-md) border border-info-border bg-info-bg px-3 py-2 text-xs leading-relaxed text-info-text">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              {target.hasContractProfile
                ? "Este subtipo tem perfil de contrato no motor (código), que tem prioridade: as cláusulas vinculadas aqui ficam só organizadas na biblioteca e não alteram o contrato gerado."
                : "As cláusulas ativas vinculadas aqui entram no contrato gerado, na seção escolhida e na ordem definida. Sem nenhuma cláusula ativa, o contrato continua bloqueado por escopo sem cláusulas."}
            </span>
          </div>

          <ClauseTemplatesAdminPanel
            initialClauses={clauses}
            catalog={catalog}
            focusSubtype={target}
            onClausesChange={onClausesChange}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
