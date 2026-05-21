"use client";

import { Check, ChevronDown, Clock, ExternalLink, FileCheck, PenLine } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { KanbanD4SignSigner } from "@/lib/crm/d4sign-kanban-signers";
import {
  countSignedSigners,
  signerDisplayLabel,
  signerKanbanBadgeLabel,
  signerKanbanIsFirmSide,
} from "@/lib/crm/d4sign-kanban-signers";
import {
  resolveSignerAvatarUrl,
  signerInitials,
  type SignerAppUserLookup,
} from "@/lib/crm/signer-avatar-catalog";
import { formatDateTimeBr } from "@/lib/format-datetime";
import { cn } from "@/lib/utils";

type ContractSignersKanbanPanelProps = {
  signers: KanbanD4SignSigner[];
  sentAt?: string | null;
  finalizedAt?: string | null;
  linkContrato?: string | null;
  /** contrato_enviado | contrato_assinado */
  variant: "pending" | "completed";
  appUsersByEmail?: SignerAppUserLookup;
};

function SignerAvatar({
  signer,
  appUsersByEmail,
  size = "md",
  showStatus = true,
}: {
  signer: KanbanD4SignSigner;
  appUsersByEmail?: SignerAppUserLookup;
  size?: "sm" | "md";
  showStatus?: boolean;
}) {
  const avatarUrl = resolveSignerAvatarUrl(signer.email, appUsersByEmail);
  const initials = signerInitials(signer.name, signer.email);
  const isFirmSide = signerKanbanIsFirmSide(signer);
  const dim = size === "sm" ? "h-6 w-6" : "h-7 w-7";
  const badgeDim = size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5";
  const iconDim = size === "sm" ? "h-1.5 w-1.5" : "h-2 w-2";

  return (
    <div className="relative shrink-0">
      <Avatar
        className={cn(
          dim,
          "border-2 border-white shadow-sm ring-1 ring-primary-dark/[0.06]",
          !signer.signed && "opacity-70 saturate-[0.85]",
        )}
      >
        {avatarUrl ? <AvatarImage src={avatarUrl} alt="" className="object-cover" /> : null}
        <AvatarFallback
          className={cn(
            "font-bold",
            size === "sm" ? "text-[8px]" : "text-[9px]",
            signer.signed
              ? "bg-emerald-100 text-emerald-800"
              : isFirmSide
                ? "bg-teal-100 text-teal-800"
                : "bg-amber-100 text-amber-900",
          )}
        >
          {initials}
        </AvatarFallback>
      </Avatar>
      {showStatus ? (
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full border border-white",
            badgeDim,
            signer.signed ? "bg-emerald-500 text-white" : "bg-amber-400 text-white",
          )}
          aria-hidden
        >
          {signer.signed ? (
            <Check className={iconDim} strokeWidth={3} />
          ) : (
            <Clock className={iconDim} strokeWidth={2.5} />
          )}
        </span>
      ) : null}
    </div>
  );
}

function SignerRow({
  signer,
  appUsersByEmail,
}: {
  signer: KanbanD4SignSigner;
  appUsersByEmail?: SignerAppUserLookup;
}) {
  const label = signerDisplayLabel(signer);
  const badgeLabel = signerKanbanBadgeLabel(signer);
  const isFirmSide = signerKanbanIsFirmSide(signer);
  const signed = signer.signed;

  return (
    <li
      className={cn(
        "flex items-center gap-2 rounded-[10px] border px-2 py-1.5 transition-colors",
        signed
          ? "border-emerald-200/80 bg-emerald-50/55"
          : isFirmSide
            ? "border-teal-200/70 bg-teal-50/40"
            : "border-amber-200/70 bg-amber-50/40",
      )}
    >
      <SignerAvatar signer={signer} appUsersByEmail={appUsersByEmail} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <p className="truncate text-[11px] font-semibold leading-tight text-primary-dark">{label}</p>
          {badgeLabel ? (
            <span
              className={cn(
                "shrink-0 rounded px-1 py-px text-[7px] font-bold uppercase tracking-wide",
                isFirmSide ? "bg-teal-100 text-teal-800" : "bg-amber-100 text-amber-900",
              )}
            >
              {badgeLabel}
            </span>
          ) : null}
        </div>
        {signed && signer.signed_at ? (
          <p className="truncate text-[9px] font-medium text-emerald-800/90">
            Assinou {formatDateTimeBr(signer.signed_at)}
          </p>
        ) : (
          <p
            className={cn(
              "truncate text-[9px] font-medium",
              isFirmSide ? "text-teal-900/75" : "text-amber-900/75",
            )}
          >
            Aguardando assinatura
          </p>
        )}
      </div>
    </li>
  );
}

export function ContractSignersKanbanPanel({
  signers,
  sentAt,
  finalizedAt,
  linkContrato,
  variant,
  appUsersByEmail,
}: ContractSignersKanbanPanelProps) {
  const signedCount = countSignedSigners(signers);
  const total = signers.length;
  const progressPct = total > 0 ? Math.round((signedCount / total) * 100) : 0;
  const isCompleted = variant === "completed" || signedCount === total;
  const pendingCount = total - signedCount;

  const sorted = [...signers].sort((a, b) => {
    if (a.signed !== b.signed) return a.signed ? -1 : 1;
    const roleOrder = (r: KanbanD4SignSigner) =>
      signerKanbanIsFirmSide(r) ? 1 : r.role === "CONTRATANTE" ? 0 : 2;
    return roleOrder(a) - roleOrder(b) || signerDisplayLabel(a).localeCompare(signerDisplayLabel(b), "pt-BR");
  });

  return (
    <div
      className={cn(
        "mt-2 overflow-hidden rounded-xl border text-[10px] shadow-sm shadow-primary-dark/[0.03]",
        isCompleted
          ? "border-emerald-300/55 bg-gradient-to-b from-emerald-50/95 to-white/85"
          : "border-sky-300/50 bg-gradient-to-b from-sky-50/90 to-white/80",
      )}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="border-b border-primary-dark/[0.06] px-2.5 py-2">
        <div className="flex items-start gap-2">
          <span
            className={cn(
              "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border",
              isCompleted
                ? "border-emerald-200/80 bg-emerald-500/10 text-emerald-700"
                : "border-sky-200/80 bg-sky-500/10 text-sky-800",
            )}
            aria-hidden
          >
            {isCompleted ? <FileCheck className="h-3.5 w-3.5" /> : <PenLine className="h-3.5 w-3.5" />}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] font-bold tracking-tight text-primary-dark">
                  {isCompleted ? "Assinaturas concluídas" : "Aguardando assinaturas"}
                </p>
                {sentAt ? (
                  <p className="mt-0.5 text-[9px] font-medium text-primary-dark/55">
                    Enviado {formatDateTimeBr(sentAt)}
                  </p>
                ) : null}
                {isCompleted && finalizedAt ? (
                  <p className="mt-0.5 text-[9px] font-semibold text-emerald-800/85">
                    Finalizado {formatDateTimeBr(finalizedAt)}
                  </p>
                ) : null}
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold tabular-nums",
                  isCompleted ? "bg-emerald-500/15 text-emerald-900" : "bg-sky-500/15 text-sky-950",
                )}
              >
                {signedCount}/{total}
              </span>
            </div>

            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-primary-dark/[0.06]">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  isCompleted ? "bg-emerald-500" : "bg-sky-500",
                )}
                style={{ width: `${progressPct}%` }}
              />
            </div>

            {total > 0 ? (
              <div className="mt-2 flex items-center">
                <div className="flex items-center -space-x-2">
                  {sorted.map((s) => (
                    <SignerAvatar
                      key={s.email}
                      signer={s}
                      appUsersByEmail={appUsersByEmail}
                      size="sm"
                      showStatus={false}
                    />
                  ))}
                </div>
                {!isCompleted && pendingCount > 0 ? (
                  <p className="ml-2 truncate text-[9px] font-medium text-primary-dark/60">
                    {pendingCount === 1 ? "1 pendente" : `${pendingCount} pendentes`}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {sorted.length > 0 ? (
        <details
          className="contract-signers-kanban-details group/details"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 border-b border-primary-dark/[0.05] px-2.5 py-1.5 text-[10px] font-semibold text-primary-dark/70 outline-none transition-colors hover:bg-primary-dark/[0.03] [&::-webkit-details-marker]:hidden">
            <span>Ver signatários</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform group-open/details:rotate-180" />
          </summary>
          <ul className="space-y-1.5 px-2 py-2">
            {sorted.map((s) => (
              <SignerRow key={s.email} signer={s} appUsersByEmail={appUsersByEmail} />
            ))}
          </ul>
        </details>
      ) : null}

      {linkContrato?.trim() ? (
        <div className="border-t border-primary-dark/[0.06] px-2.5 py-1.5">
          <a
            href={linkContrato.trim()}
            target="_blank"
            rel="noreferrer"
            className="inline-flex max-w-full items-center gap-1.5 text-[10px] font-semibold text-accent-teal underline-offset-2 hover:underline"
            title={linkContrato.trim()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {isCompleted ? (
              <FileCheck className="h-3 w-3 shrink-0" aria-hidden />
            ) : (
              <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
            )}
            <span className="min-w-0 truncate">
              {isCompleted ? "Ver contrato assinado" : "Abrir contrato"}
            </span>
          </a>
        </div>
      ) : null}
    </div>
  );
}
