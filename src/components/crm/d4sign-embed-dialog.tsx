"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, X, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * EMBED D4Sign — assinatura inline via iframe.
 *
 * REQUISITO: a conta D4Sign precisa ter o EMBED ATIVADO.
 * Solicitação ao suporte: e-mail para `suporte@d4sign.com.br` pedindo
 * "Ativação do EMBED para a API token X".
 *
 * Fonte: https://docapi.d4sign.com.br/docs/instala%C3%A7%C3%A3o
 */

type EmbedSignDialogProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** UUID do documento na D4Sign */
  documentUuid: string;
  /** E-mail do signatário (deve ter sido cadastrado via createlist) */
  signerEmail: string;
  /** Nome para exibição (opcional, pré-preenche o campo no iframe) */
  signerDisplayName?: string;
  /** CPF do signatário (opcional) */
  signerDocumentation?: string;
  /** Data de nascimento DD/MM/YYYY (opcional) */
  signerBirthday?: string;
  /** key_signer (opcional, para signatários repetidos) */
  signerKeySigner?: string;
  /** Base URL do EMBED (default: produção) */
  embedHost?: string;
  /** Callback quando assinatura conclui com sucesso */
  onSigned?: () => void;
};

export function EmbedSignDialog({
  open,
  onOpenChange,
  documentUuid,
  signerEmail,
  signerDisplayName = "",
  signerDocumentation = "",
  signerBirthday = "",
  signerKeySigner = "",
  embedHost = "https://secure.d4sign.com.br/embed/viewblob",
  onSigned,
}: EmbedSignDialogProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "signed" | "wrong-data" | "error">(
    "loading",
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Listener para mensagens do iframe
  useEffect(() => {
    if (!open) return;
    setStatus("loading");
    setErrorMsg(null);

    function handleMessage(event: MessageEvent) {
      // D4Sign manda strings simples via postMessage
      const data = event.data;
      if (typeof data !== "string") return;

      if (data === "signed") {
        setStatus("signed");
        onSigned?.();
      } else if (data === "wrong-data") {
        setStatus("wrong-data");
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [open, onSigned]);

  // Monta a URL do iframe
  const iframeSrc = `${embedHost}/${encodeURIComponent(documentUuid)}?email=${encodeURIComponent(signerEmail)}&display_name=${encodeURIComponent(signerDisplayName)}&documentation=${encodeURIComponent(signerDocumentation)}&birthday=${encodeURIComponent(signerBirthday)}&disable_preview=0${signerKeySigner ? `&key_signer=${encodeURIComponent(signerKeySigner)}` : ""}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[1200px] w-[95vw] h-[90vh] p-0 gap-0 overflow-hidden">
        <DialogTitle className="sr-only">Assinar documento via D4Sign EMBED</DialogTitle>
        <DialogDescription className="sr-only">
          Assinatura digital inline do documento {documentUuid} pelo signatário {signerEmail}.
        </DialogDescription>

        {/* Header */}
        <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-5 py-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-teal-100">
            <CheckCircle2 className="size-5 text-accent-teal" aria-hidden />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-primary-dark">Assinar documento</h2>
            <p className="truncate text-[11px] text-muted-foreground">
              {signerEmail} · UUID: <span className="font-mono">{documentUuid.slice(0, 12)}…</span>
            </p>
          </div>
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

        {/* Body */}
        <div className="relative flex-1 overflow-hidden bg-slate-100">
          {/* Loading overlay */}
          {status === "loading" ? (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white/80 backdrop-blur-sm">
              <Loader2 className="size-8 animate-spin text-accent-teal" />
              <p className="text-sm font-semibold text-slate-700">
                Carregando ambiente D4Sign…
              </p>
            </div>
          ) : null}

          {/* Success overlay */}
          {status === "signed" ? (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-emerald-50/95 backdrop-blur-sm">
              <div className="flex size-16 items-center justify-center rounded-full bg-emerald-100">
                <CheckCircle2 className="size-9 text-emerald-600" />
              </div>
              <div className="text-center">
                <h3 className="text-xl font-extrabold text-emerald-900">
                  Documento assinado com sucesso!
                </h3>
                <p className="mt-1 text-sm text-emerald-700">
                  A D4Sign processará a assinatura. Você pode fechar esta janela.
                </p>
              </div>
              <Button
                type="button"
                onClick={() => onOpenChange(false)}
                className="mt-2 bg-emerald-600 hover:bg-emerald-700"
              >
                Fechar
              </Button>
            </div>
          ) : null}

          {/* Wrong data overlay */}
          {status === "wrong-data" ? (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-amber-50/95 backdrop-blur-sm">
              <div className="flex size-16 items-center justify-center rounded-full bg-amber-100">
                <AlertTriangle className="size-9 text-amber-600" />
              </div>
              <div className="max-w-md text-center">
                <h3 className="text-xl font-extrabold text-amber-900">
                  Dados precisam ser corrigidos
                </h3>
                <p className="mt-1 text-sm text-amber-700">
                  O signatário indicou que os dados precisam de correção. Por favor,
                  ajuste os dados (e-mail, CPF, nome) e reenvie o contrato.
                </p>
              </div>
              <Button
                type="button"
                onClick={() => onOpenChange(false)}
                className="mt-2 bg-amber-600 hover:bg-amber-700"
              >
                Fechar
              </Button>
            </div>
          ) : null}

          {/* Error overlay */}
          {status === "error" && errorMsg ? (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-rose-50/95 backdrop-blur-sm">
              <div className="flex size-16 items-center justify-center rounded-full bg-rose-100">
                <AlertTriangle className="size-9 text-rose-600" />
              </div>
              <div className="max-w-md text-center">
                <h3 className="text-xl font-extrabold text-rose-900">
                  Erro ao carregar EMBED
                </h3>
                <p className="mt-1 text-sm text-rose-700">{errorMsg}</p>
                <p className="mt-3 text-[12px] text-rose-600">
                  Se este erro persistir, verifique se o EMBED está ativado na conta D4Sign
                  (suporte@d4sign.com.br).
                </p>
              </div>
              <Button
                type="button"
                onClick={() => onOpenChange(false)}
                variant="outline"
              >
                Fechar
              </Button>
            </div>
          ) : null}

          {/* Iframe */}
          <iframe
            ref={iframeRef}
            src={iframeSrc}
            className={cn("h-full w-full border-0", status === "signed" && "opacity-30")}
            onLoad={() => {
              if (status === "loading") setStatus("ready");
            }}
            onError={() => {
              setStatus("error");
              setErrorMsg("Falha ao carregar o iframe D4Sign.");
            }}
            allow="camera; microphone; geolocation"
            title="Assinatura D4Sign"
          />
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-2 text-[11px] text-muted-foreground">
          <span>
            Assinatura processada pela{" "}
            <a
              href="https://d4sign.com.br"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-accent-teal hover:underline inline-flex items-center gap-1"
            >
              D4Sign
              <ExternalLink className="size-2.5" />
            </a>
            {" "}— validade jurídica MP 2.200-2/01
          </span>
          <span className="font-mono">
            Status: {status === "loading" ? "carregando" : status === "ready" ? "pronto" : status}
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
