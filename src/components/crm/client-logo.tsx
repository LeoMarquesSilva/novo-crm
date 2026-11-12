"use client";

import { useState } from "react";
import { iniciaisDoCliente } from "@/lib/crm/logo-cliente";
import { cn } from "@/lib/utils";

/**
 * Tamanhos do Design System V2: 16/20/24px no tamanho de ícone (listas, seletores, tabelas) com
 * `radius-sm`; 32/40px no tamanho de avatar (cabeçalhos e cartões) com `radius-md`.
 */
export type ClientLogoSize = 16 | 20 | 24 | 32 | 40;

const BOX: Record<ClientLogoSize, string> = {
  16: "size-4 rounded-(--radius-v2-sm) text-[8px]",
  20: "size-5 rounded-(--radius-v2-sm) text-[9px]",
  24: "size-6 rounded-(--radius-v2-sm) text-[10px]",
  32: "size-8 rounded-(--radius-v2-md) text-xs",
  40: "size-10 rounded-(--radius-v2-md) text-sm",
};

/**
 * Logo do cliente da carteira (a mesma do grupo econômico no ICP). Sem logo, ou se a imagem não
 * carregar, mostra as iniciais do nome. É decorativa: o nome do cliente fica sempre ao lado.
 */
export function ClientLogo({
  name,
  logoUrl,
  size = 20,
  className,
}: {
  name: string;
  logoUrl?: string | null;
  size?: ClientLogoSize;
  className?: string;
}) {
  // Guarda qual URL falhou (não um booleano): no seletor o mesmo componente recebe outra logo.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = Boolean(logoUrl) && failedUrl !== logoUrl;

  return (
    <span
      aria-hidden
      data-client-logo={showImage ? "image" : "initials"}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center overflow-hidden border border-border",
        showImage ? "bg-white" : "bg-neutral-50 font-semibold leading-none text-neutral-600",
        BOX[size],
        className,
      )}
    >
      {showImage ? (
        // Logos vêm de URLs públicas do storage do Supabase, sem otimização do next/image (como no ICP).
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl!}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          className="size-full object-contain"
          onError={() => setFailedUrl(logoUrl ?? null)}
        />
      ) : (
        iniciaisDoCliente(name, size === 16 ? 1 : 2)
      )}
    </span>
  );
}
