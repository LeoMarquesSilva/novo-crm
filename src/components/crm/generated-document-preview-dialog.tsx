"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Download, ExternalLink, FileText, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { isPdfBytes } from "@/lib/d4sign/pdf-bytes";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  versionId: string;
  versionNumber: number;
  /** Nome do arquivo no Storage, usado no "Baixar". */
  filename: string;
};

/**
 * Mostra o PDF de uma versão gerada (proposta/contrato) dentro do CRM.
 *
 * Pede a URL assinada em modo `inline`, baixa os bytes e monta o iframe com blob URL
 * só depois de confirmar `%PDF`. "Abrir em nova aba" usa o mesmo blob, onde os links
 * do PDF (LinkedIn, Instagram, e-mail) abrem normalmente.
 */
export function GeneratedDocumentPreviewDialog({
  open,
  onOpenChange,
  leadId,
  versionId,
  versionNumber,
  filename,
}: Props) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [viewKey, setViewKey] = useState(`${open}:${versionId}`);
  const nextViewKey = `${open}:${versionId}`;
  if (viewKey !== nextViewKey) {
    setViewKey(nextViewKey);
    setStatus("loading");
    setErrorDetail(null);
    setBlobUrl(null);
  }

  useEffect(() => {
    if (!open) return;

    const controller = new AbortController();
    let cancelled = false;
    let createdUrl: string | null = null;

    void (async () => {
      try {
        const response = await fetch(
          `/api/crm/leads/${encodeURIComponent(leadId)}/documents/versions/${encodeURIComponent(versionId)}/download?inline=1`,
          { cache: "no-store", signal: controller.signal },
        );
        const payload = (await response.json().catch(() => null)) as {
          ok?: boolean;
          signedUrl?: string;
          error?: string;
        } | null;
        if (cancelled) return;
        if (!response.ok || !payload?.ok || !payload.signedUrl) {
          setErrorDetail(payload?.error ?? null);
          setStatus("error");
          return;
        }

        const file = await fetch(payload.signedUrl, { cache: "no-store", signal: controller.signal });
        const bytes = file.ok ? await file.arrayBuffer() : null;
        if (cancelled) return;
        if (!bytes || !isPdfBytes(bytes)) {
          setStatus("error");
          return;
        }

        createdUrl = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
        setBlobUrl(createdUrl);
        setStatus("ready");
      } catch (error) {
        if (cancelled || (error instanceof DOMException && error.name === "AbortError")) return;
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [open, leadId, versionId]);

  const linkClass =
    "inline-flex h-8 items-center gap-1.5 rounded-(--radius-v2-md) border border-neutral-200 bg-white px-3 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-neutral-50";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideCloseButton
        className="grid-rows-[auto_minmax(0,1fr)] max-w-[1100px] w-[95vw] h-[92vh] p-0 gap-0 overflow-hidden"
      >
        <DialogTitle className="sr-only">Visualizar versão v{versionNumber}</DialogTitle>
        <DialogDescription className="sr-only">Pré-visualização do arquivo {filename}.</DialogDescription>

        <div className="flex shrink-0 items-center gap-3 border-b border-neutral-200 bg-white px-5 py-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-(--radius-v2-md) border border-interactive-300 bg-interactive-50">
            <FileText className="size-5 text-interactive-600" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-bold text-foreground">v{versionNumber}</h2>
            <p className="truncate text-[10px] text-muted-foreground">{filename}</p>
          </div>
          <div className="flex items-center gap-2">
            {blobUrl ? (
              <>
                <a href={blobUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
                  <ExternalLink className="size-3.5" aria-hidden />
                  Abrir em nova aba
                </a>
                <a href={blobUrl} download={filename} className={linkClass}>
                  <Download className="size-3.5" aria-hidden />
                  Baixar
                </a>
              </>
            ) : null}
            <Button type="button" size="sm" variant="ghost" className="h-8 gap-1.5" onClick={() => onOpenChange(false)}>
              <X className="size-4" />
              Fechar
            </Button>
          </div>
        </div>

        <div className="relative min-h-0 overflow-hidden bg-neutral-100">
          {status === "loading" ? (
            <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white/80 backdrop-blur-sm">
              <Loader2 className="size-8 animate-spin text-interactive-600" />
              <p className="text-sm font-semibold text-foreground">Carregando documento…</p>
            </div>
          ) : null}

          {status === "error" ? (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-danger-bg/95 backdrop-blur-sm">
              <div className="flex size-14 items-center justify-center rounded-(--radius-v2-full) bg-danger-bg">
                <AlertTriangle className="size-7 text-danger-text" />
              </div>
              <div className="max-w-sm text-center">
                <h3 className="text-base font-extrabold text-danger-text">Não foi possível carregar o documento</h3>
                <p className="mt-1 text-sm text-danger-text/90">
                  {errorDetail ?? "Tente de novo em instantes ou use o botão Baixar da lista."}
                </p>
              </div>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Fechar
              </Button>
            </div>
          ) : null}

          {blobUrl && status !== "error" ? (
            <iframe key={blobUrl} src={blobUrl} className="h-full w-full border-0" title={`Visualização da versão v${versionNumber}`} />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
