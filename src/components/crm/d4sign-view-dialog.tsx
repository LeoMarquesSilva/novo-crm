"use client";

import { useState } from "react";
import { AlertTriangle, ExternalLink, FileSignature, Loader2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Abre um documento D4Sign em modo leitura via proxy com cache.
 *
 * Fluxo:
 *   1ª abertura  → baixa da D4Sign (1 req quota) e salva no Supabase Storage
 *   Próximas     → serve do bucket (0 req D4Sign)
 */

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** UUID do documento na D4Sign */
  documentUuid: string;
  /** Nome exibido no header do dialog (opcional) */
  documentName?: string | null;
  /** Link externo de fallback (portal D4Sign) */
  portalUrl?: string;
};

export function D4SignViewDialog({
  open,
  onOpenChange,
  documentUuid,
  documentName,
  portalUrl,
}: Props) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  // Rota proxy com cache em Supabase Storage
  const src = `/api/crm/d4sign/documents/${encodeURIComponent(documentUuid)}/view`;

  function handleOpenChange(v: boolean) {
    if (v) setStatus("loading");
    onOpenChange(v);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent hideCloseButton className="max-w-[1100px] w-[95vw] h-[92vh] p-0 gap-0 overflow-hidden">
        <DialogTitle className="sr-only">Visualizar contrato D4Sign</DialogTitle>
        <DialogDescription className="sr-only">
          Pré-visualização do documento {documentUuid}.
        </DialogDescription>

        {/* Header */}
        <div className="flex shrink-0 items-center gap-3 border-b border-neutral-200 bg-white px-5 py-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-(--radius-v2-md) bg-interactive-50 border border-interactive-300">
            <FileSignature className="size-5 text-interactive-600" aria-hidden />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="truncate text-sm font-bold text-foreground">
              {documentName ? documentName.replace(/\.docx?$/i, "") : "Contrato"}
            </h2>
            <p className="font-mono text-[10px] text-muted-foreground">
              {documentUuid.slice(0, 18)}…
            </p>
          </div>
          <div className="flex items-center gap-2">
            {portalUrl ? (
              <a
                href={portalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-(--radius-v2-md) border border-neutral-200 bg-white px-3 text-[11px] font-semibold text-muted-foreground hover:bg-neutral-50 transition-colors"
              >
                <ExternalLink className="size-3.5" aria-hidden />
                Abrir no D4Sign
              </a>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 gap-1.5"
              onClick={() => onOpenChange(false)}
            >
              <X className="size-4" />
              Fechar
            </Button>
          </div>
        </div>

        {/* Body */}
        <div className="relative flex-1 overflow-hidden bg-neutral-100">
          {/* Loading */}
          {status === "loading" ? (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white/80 backdrop-blur-sm pointer-events-none">
              <Loader2 className="size-8 animate-spin text-interactive-600" />
              <p className="text-sm font-semibold text-foreground">Carregando documento…</p>
            </div>
          ) : null}

          {/* Erro */}
          {status === "error" ? (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-danger-bg/95 backdrop-blur-sm">
              <div className="flex size-14 items-center justify-center rounded-(--radius-v2-full) bg-danger-bg">
                <AlertTriangle className="size-7 text-danger-text" />
              </div>
              <div className="max-w-sm text-center">
                <h3 className="text-base font-extrabold text-danger-text">
                  Não foi possível carregar o documento
                </h3>
                <p className="mt-1 text-sm text-danger-text/90">
                  O arquivo pode estar sendo processado ou houve falha na comunicação com a D4Sign.
                </p>
              </div>
              <div className="flex gap-2">
                {portalUrl ? (
                  <a
                    href={portalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-9 items-center gap-1.5 rounded-(--radius-v2-md) border border-danger-border bg-white px-4 text-sm font-semibold text-danger-text hover:bg-danger-bg transition-colors"
                  >
                    <ExternalLink className="size-3.5" />
                    Abrir no portal D4Sign
                  </a>
                ) : null}
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Fechar
                </Button>
              </div>
            </div>
          ) : null}

          {/* PDF via proxy com cache */}
          <iframe
            key={documentUuid}
            src={src}
            className="h-full w-full border-0"
            title="Visualização do contrato"
            onLoad={() => setStatus("ready")}
            onError={() => setStatus("error")}
          />
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between border-t border-neutral-200 bg-neutral-50 px-5 py-2 text-[11px] text-muted-foreground">
          <span>
            Documento via{" "}
            <a
              href="https://d4sign.com.br"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-interactive-700 hover:underline inline-flex items-center gap-1"
            >
              D4Sign
              <ExternalLink className="size-2.5" />
            </a>
            {" "}— validade jurídica MP 2.200-2/01
          </span>
          <span className="font-mono">
            {status === "loading" ? "carregando…" : status === "ready" ? "pronto" : "erro"}
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
