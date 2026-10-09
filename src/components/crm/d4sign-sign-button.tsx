"use client";

import { useState, type ReactNode } from "react";
import { EmbedSignDialog } from "@/components/crm/d4sign-embed-dialog";
import { isD4SignEmbedEnabled } from "@/lib/d4sign/embed";
import { d4signDocumentSignPath } from "@/lib/d4sign/portal-url";

/**
 * "Assinar" de um documento D4Sign.
 *
 * Abre o EMBED no CRM. Com `NEXT_PUBLIC_D4SIGN_EMBED_ENABLED=0`, abre o link
 * de assinatura da D4Sign em outra aba, pela rota que só gera o link para o
 * próprio sócio.
 */
export function D4SignSignButton({
  documentUuid,
  signerEmail,
  signerName,
  keySigner,
  className,
  title,
  children,
  onClosed,
  onOpen,
}: {
  documentUuid: string;
  signerEmail: string;
  signerName?: string | null;
  keySigner?: string | null;
  className?: string;
  title?: string;
  children: ReactNode;
  /** Ao fechar o EMBED (para recarregar a lista). */
  onClosed?: () => void;
  /** Quando a janela de assinatura da D4Sign abre. */
  onOpen?: () => void;
}) {
  const [open, setOpen] = useState(false);

  if (!isD4SignEmbedEnabled()) {
    return (
      <a
        href={d4signDocumentSignPath(documentUuid)}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        title={title}
        onClick={() => onOpen?.()}
      >
        {children}
      </a>
    );
  }

  return (
    <>
      <button
        type="button"
        className={className}
        title={title}
        onClick={() => {
          onOpen?.();
          setOpen(true);
        }}
      >
        {children}
      </button>
      <EmbedSignDialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) onClosed?.();
        }}
        documentUuid={documentUuid}
        signerEmail={signerEmail}
        signerDisplayName={signerName ?? undefined}
        signerKeySigner={keySigner ?? undefined}
      />
    </>
  );
}
