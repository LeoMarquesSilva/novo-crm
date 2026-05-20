"use client";

import { useState, useTransition, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  ExternalLink,
  Eye,
  FileSignature,
  Filter,
  Folder,
  FolderOpen,
  Link2,
  Loader2,
  Mail,
  PenLine,
  RefreshCw,
  Users,
  Vault,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EmbedSignDialog } from "@/components/crm/d4sign-embed-dialog";
import { D4SignViewDialog } from "@/components/crm/d4sign-view-dialog";
import { D4SignHealthPanel } from "@/components/crm/d4sign-health-panel";
import { D4SignLinkLeadDialog, D4SignOriginBadge } from "@/components/crm/d4sign-link-lead-dialog";
import { useD4SignDocumentsRealtime } from "@/lib/crm/use-d4sign-realtime";
import type { D4SignQuotaStatus } from "@/lib/d4sign/api-usage";
import { D4SIGN_HOURLY_LIMIT } from "@/lib/d4sign/api-usage";

// ─── Tipos ────────────────────────────────────────────────────────────────────

type SignerInfo = {
  email?: string | null;
  role?: string | null;
  signed?: boolean | number | string | null;
  signed_at?: string | null;
  /** Nome gravado pelo CRM (ao enviar) ou pelo D4Sign após assinatura (`user_name`). */
  name?: string | null;
  user_name?: string | null;
  user_document?: string | null;
  key_signer?: string | null;
  act?: string | null;
  /** Status de entrega do e-mail: "Delivery" | "Bounce" | "Pending" … */
  email_sent_status?: string | null;
  /** sign_info da D4Sign (IP, geo) — gravado no enrich */
  sign_info?: { ip?: string; geolocation?: string; date_signed?: string } | null;
};

type SentByInfo = { full_name: string; avatar_url: string | null } | null;

type LinkedRow = {
  uuid_doc: string;
  name_document: string | null;
  d4sign_status: string | null;
  status_name: string | null;
  link_contrato: string | null;
  created_at_d4sign: string | null;
  finalized_at: string | null;
  safe_name: string | null;
  folder_uuid: string | null;
  folder_name: string | null;
  folder_path: string | null;
  details_fetched_at: string | null;
  last_synced_at: string | null;
  signers: unknown;
  oportunidade_id: string | null;
  sent_by_app_user_id: string | null;
  sent_by: SentByInfo;
  oportunidades: {
    id: string;
    solicitante_nome: string;
    etapa: string;
    d4sign_updated_at: string | null;
    created_at: string;
  } | null;
};

type UnlinkedRow = {
  uuid_doc: string;
  name_document: string | null;
  d4sign_status: string | null;
  status_name: string | null;
  created_at_d4sign: string | null;
  finalized_at: string | null;
  safe_name: string | null;
  folder_uuid: string | null;
  folder_name: string | null;
  folder_path: string | null;
  folder_area: string | null;
  details_fetched_at: string | null;
  last_synced_at: string | null;
  signers: unknown;
  sent_by_app_user_id: string | null;
  sent_by: SentByInfo;
};

// ─── Agrupamento de pastas ────────────────────────────────────────────────────
// Modo 1 nível: pasta-cliente direto (quando folder_area não disponível)
// Modo 2 níveis: área → pasta-cliente (quando folder_area preenchido via walk recursivo)

type ClientGroup = { key: string; name: string; docs: UnlinkedRow[] };
type AreaGroup   = { key: string; name: string; clients: ClientGroup[]; directDocs: UnlinkedRow[] };

function groupByArea(docs: UnlinkedRow[]): AreaGroup[] {
  const map = new Map<string, AreaGroup>();
  for (const doc of docs) {
    const areaKey  = doc.folder_area ?? "__no_area__";
    const areaName = doc.folder_area ?? "Sem área";
    const clientKey  = doc.folder_uuid ?? "__no_client__";
    const clientName = doc.folder_name ?? "Sem pasta";
    if (!map.has(areaKey))
      map.set(areaKey, { key: areaKey, name: areaName, clients: [], directDocs: [] });
    const area = map.get(areaKey)!;
    if (doc.folder_uuid) {
      let c = area.clients.find((x) => x.key === clientKey);
      if (!c) { c = { key: clientKey, name: clientName, docs: [] }; area.clients.push(c); }
      c.docs.push(doc);
    } else {
      area.directDocs.push(doc);
    }
  }
  return [...map.values()]
    .sort((a, b) => {
      if (a.key === "__no_area__") return 1;
      if (b.key === "__no_area__") return -1;
      return a.name.localeCompare(b.name, "pt-BR");
    })
    .map((g) => ({ ...g, clients: g.clients.sort((a, b) => a.name.localeCompare(b.name, "pt-BR")) }));
}

type FolderGroup = { key: string; name: string; docs: UnlinkedRow[] };

function groupByFolder(docs: UnlinkedRow[]): FolderGroup[] {
  const map = new Map<string, FolderGroup>();
  for (const doc of docs) {
    const key  = doc.folder_uuid ?? "__root__";
    const name = doc.folder_name ?? (key === "__root__" ? "Sem pasta" : key.slice(0, 8));
    if (!map.has(key)) map.set(key, { key, name, docs: [] });
    map.get(key)!.docs.push(doc);
  }
  return [...map.values()].sort((a, b) => {
    if (a.key === "__root__") return 1;
    if (b.key === "__root__") return -1;
    return a.name.localeCompare(b.name, "pt-BR");
  });
}

// ─── Status map ───────────────────────────────────────────────────────────────

type StatusInfo = {
  label: string;
  icon: React.ElementType;
  pill: string;
  group: "pending" | "signed" | "cancelled" | "other";
};

const STATUS_MAP: Record<string, StatusInfo> = {
  sent:       { label: "Enviado",      icon: Clock,        pill: "bg-blue-50 border-blue-200 text-blue-700",          group: "pending"   },
  processing: { label: "Processando",  icon: Loader2,      pill: "bg-slate-50 border-slate-200 text-slate-600",       group: "other"     },
  "2":        { label: "Visualizado",  icon: Eye,          pill: "bg-indigo-50 border-indigo-200 text-indigo-700",    group: "pending"   },
  "3":        { label: "Assinando…",   icon: Clock,        pill: "bg-amber-50 border-amber-200 text-amber-700",       group: "pending"   },
  "1":        { label: "Assinado ✓",   icon: CheckCircle2, pill: "bg-emerald-50 border-emerald-200 text-emerald-700", group: "signed"    },
  "4":        { label: "Cancelado",    icon: XCircle,      pill: "bg-rose-50 border-rose-200 text-rose-700",          group: "cancelled" },
};

const ETAPA_LABEL: Record<string, string> = {
  confeccao_contrato: "Elaboração",
  contrato_elaborado: "Elaborado",
  contrato_enviado:   "Enviado",
  contrato_assinado:  "Assinado",
};

function getStatus(status: string | null): StatusInfo {
  if (!status) return { label: "Sem status", icon: AlertCircle, pill: "bg-slate-50 border-slate-200 text-slate-500", group: "other" };
  return STATUS_MAP[status] ?? { label: status, icon: AlertCircle, pill: "bg-slate-50 border-slate-200 text-slate-500", group: "other" };
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return "nunca";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 2) return "agora";
  if (mins < 60) return `há ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  return `há ${days} dia${days !== 1 ? "s" : ""}`;
}

type SignedSummary = {
  kind: "finalized" | "partial" | "pending";
  label: string;
  date: string | null;
};

/** Resumo de quando o documento foi (ou está sendo) assinado. */
function getSignedSummary(
  status: string | null,
  finalizedAt: string | null,
  signersRaw: unknown,
): SignedSummary | null {
  const signers = parseSigners(signersRaw);
  const signedOnes = signers.filter((s) => !signerIsPending(s));

  if (status === "1") {
    const date =
      finalizedAt ??
      signedOnes
        .map((s) => s.signed_at)
        .filter(Boolean)
        .sort((a, b) => new Date(b!).getTime() - new Date(a!).getTime())[0] ??
      null;
    return { kind: "finalized", label: "Finalizado em", date: date ?? null };
  }

  if (signedOnes.length > 0) {
    const latest = signedOnes
      .map((s) => s.signed_at)
      .filter(Boolean)
      .sort((a, b) => new Date(b!).getTime() - new Date(a!).getTime())[0] ?? null;
    return {
      kind: "partial",
      label: `${signedOnes.length}/${signers.length} assinaram · última em`,
      date: latest,
    };
  }

  if (signers.length > 0 && ["2", "3", "sent", "processing"].includes(String(status ?? ""))) {
    return { kind: "pending", label: "Aguardando assinaturas", date: null };
  }

  return null;
}

function SignedSummaryBadge({
  status,
  finalizedAt,
  signers,
}: {
  status: string | null;
  finalizedAt: string | null;
  signers: unknown;
}) {
  const summary = getSignedSummary(status, finalizedAt, signers);
  if (!summary) return null;

  const Icon =
    summary.kind === "finalized" ? CheckCircle2
    : Clock;

  return (
    <p className={cn(
      "flex items-center gap-1 text-[10px] font-semibold leading-tight",
      summary.kind === "finalized" ? "text-emerald-600"
      : summary.kind === "partial" ? "text-amber-600"
      : "text-slate-400",
    )}>
      <Icon className="size-3 shrink-0" aria-hidden />
      {summary.label}
      {summary.date ? `: ${fmtDate(summary.date)}` : null}
    </p>
  );
}

function QuotaBanner({
  quota,
}: {
  quota: D4SignQuotaStatus;
}) {
  const pct = Math.min(100, Math.round((quota.used / quota.limit) * 100));
  const exhausted = quota.remaining <= 0;
  const low = quota.remaining <= 2 && !exhausted;

  return (
    <div className={cn(
      "flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border px-4 py-2.5 text-sm",
      exhausted ? "border-rose-200 bg-rose-50"
      : low ? "border-amber-200 bg-amber-50/80"
      : "border-slate-200 bg-slate-50/80",
    )}>
      <div className="flex min-w-[140px] flex-1 flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className={cn(
            "text-[11px] font-bold uppercase tracking-wide",
            exhausted ? "text-rose-700" : low ? "text-amber-800" : "text-slate-600",
          )}>
            API D4Sign
          </span>
          <span className={cn(
            "font-mono text-[11px] font-bold",
            exhausted ? "text-rose-700" : "text-slate-700",
          )}>
            {quota.used}/{quota.limit} req/h
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/80">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              exhausted ? "bg-rose-500" : low ? "bg-amber-500" : "bg-accent-teal",
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <div className="text-[11px] text-muted-foreground">
        {exhausted && quota.resetAt ? (
          <span className="font-semibold text-rose-700">
            Limite atingido · libera {fmtDate(quota.resetAt)}
          </span>
        ) : (
          <>
            <span className="font-semibold text-slate-600">{quota.remaining}</span>
            {" "}restante{quota.remaining !== 1 ? "s" : ""} nesta hora
            {quota.lastSyncedAt ? (
              <> · sync {fmtRelative(quota.lastSyncedAt)}</>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Signer helpers ───────────────────────────────────────────────────────────

function parseSigners(raw: unknown): SignerInfo[] {
  if (!raw || !Array.isArray(raw)) return [];
  return raw as SignerInfo[];
}

function signerIsPending(s: SignerInfo): boolean {
  const { signed } = s;
  if (signed === null || signed === undefined) return true;
  if (typeof signed === "boolean") return !signed;
  return String(signed) === "0" || String(signed) === "false";
}

type AppUserInfo = { avatarUrl: string | null; fullName: string };

/** Gera iniciais a partir de nome ou e-mail */
function signerInitials(name: string | null | undefined, email: string | null | undefined): string {
  const src = name?.trim() || email?.split("@")[0] || "?";
  const parts = src.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0]! + parts[parts.length - 1][0]!).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

/** Linha de status de e-mail (entregue / bounce / enviado). */
function EmailSentBadge({ status }: { status: string | null | undefined }) {
  if (!status) return null;
  const lower = status.toLowerCase();
  if (lower === "delivery") {
    return (
      <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-slate-400">
        <Mail className="size-2.5" aria-hidden />
        Email entregue
      </span>
    );
  }
  if (lower.includes("bounce") || lower.includes("fail")) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-rose-500">
        <AlertTriangle className="size-2.5" aria-hidden />
        Bounce
      </span>
    );
  }
  return (
    <span className="text-[9px] text-slate-400">{status}</span>
  );
}

/** Exibe quem enviou + quando, em formato compacto. */
function SentByBadge({
  sentBy,
  sentAt,
}: {
  sentBy: SentByInfo;
  sentAt: string | null | undefined;
}) {
  if (!sentAt && !sentBy) return null;
  return (
    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
      {sentBy?.avatar_url ? (
        <img src={sentBy.avatar_url} alt={sentBy.full_name} className="size-4 rounded-full object-cover shrink-0" />
      ) : sentBy ? (
        <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[8px] font-black text-slate-600">
          {sentBy.full_name.charAt(0).toUpperCase()}
        </span>
      ) : null}
      <span>
        {sentBy ? <span className="font-semibold text-slate-600">{sentBy.full_name.split(" ")[0]}</span> : null}
        {sentBy && sentAt ? " · " : null}
        {sentAt ? fmtDate(sentAt) : null}
      </span>
    </div>
  );
}

/** Renderiza lista estruturada de signatários com avatar, nome/email e status. */
function SignersDisplay({
  signers,
  firmEmails,
  appUsersByEmail = {},
}: {
  signers: SignerInfo[];
  firmEmails: Set<string>;
  appUsersByEmail?: Record<string, AppUserInfo>;
}) {
  if (signers.length === 0) return null;

  const signedCount = signers.filter((s) => !signerIsPending(s)).length;
  const total       = signers.length;
  const allSigned   = signedCount === total;

  return (
    <div className="space-y-1.5">
      {/* Linha de resumo */}
      <div className="flex items-center justify-between gap-2">
        <p className={cn(
          "text-[10px] font-bold",
          allSigned ? "text-emerald-600" : signedCount > 0 ? "text-amber-600" : "text-slate-400",
        )}>
          {allSigned
            ? "✓ Todos assinaram"
            : signedCount === 0
              ? `Aguardando ${total} assinatura${total !== 1 ? "s" : ""}`
              : `${signedCount} / ${total} assinaram`}
        </p>
        {/* Bolinhas de progresso */}
        <div className="flex gap-0.5">
          {signers.map((s, i) => (
            <span
              key={i}
              className={cn(
                "block size-1.5 rounded-full",
                !signerIsPending(s) ? "bg-emerald-500" : "bg-slate-300",
              )}
            />
          ))}
        </div>
      </div>

      {/* Lista de signatários */}
      <ul className="space-y-1">
        {signers.map((s, i) => {
          const pending   = signerIsPending(s);
          const isFirm    = s.email ? firmEmails.has(s.email) : false;
          const displayName = s.name?.trim() || s.user_name?.trim() || null;
          const initials  = signerInitials(displayName, s.email);
          const appUser   = s.email ? appUsersByEmail[s.email.toLowerCase()] : undefined;

          return (
            <li
              key={i}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-2.5 py-1.5",
                !pending
                  ? "border-emerald-200 bg-emerald-50/40"
                  : isFirm
                    ? "border-teal-200 bg-teal-50/30"
                    : "border-slate-200 bg-white",
              )}
            >
              {/* Avatar */}
              {appUser?.avatarUrl ? (
                <img
                  src={appUser.avatarUrl}
                  alt={displayName ?? s.email ?? ""}
                  className="size-6 shrink-0 rounded-full object-cover"
                />
              ) : (
                <span className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-[9px] font-black",
                  !pending ? "bg-emerald-100 text-emerald-700"
                  : isFirm  ? "bg-teal-100 text-teal-700"
                  : "bg-slate-100 text-slate-600",
                )}>
                  {initials}
                </span>
              )}

              {/* Info principal */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 flex-wrap">
                  <p className="truncate text-[11px] font-semibold text-primary-dark leading-tight">
                    {displayName ?? s.email ?? `Signatário ${i + 1}`}
                  </p>
                  {s.role === "CONTRATADA" && (
                    <span className="shrink-0 rounded-sm bg-teal-100 px-1 py-px text-[8px] font-bold uppercase tracking-wide text-teal-700">
                      adv
                    </span>
                  )}
                  {s.role === "CONTRATANTE" && (
                    <span className="shrink-0 rounded-sm bg-amber-100 px-1 py-px text-[8px] font-bold uppercase tracking-wide text-amber-700">
                      cliente
                    </span>
                  )}
                </div>
                {/* E-mail (quando o displayName já existe) */}
                {displayName && s.email ? (
                  <p className="truncate text-[9px] text-muted-foreground leading-tight">{s.email}</p>
                ) : null}
                {s.user_document ? (
                  <p className="truncate text-[9px] text-slate-400 leading-tight">
                    CPF: {s.user_document.replace(/(\d{3})\d{5}(\d{2})/, "$1*****$2")}
                  </p>
                ) : null}
                {!signerIsPending(s) && s.sign_info?.geolocation ? (
                  <p className="truncate text-[9px] text-slate-400 leading-tight">{s.sign_info.geolocation}</p>
                ) : null}
              </div>

              {/* Status à direita */}
              <div className="shrink-0 text-right space-y-px">
                {!pending ? (
                  <>
                    <p className="flex items-center justify-end gap-0.5 text-[10px] font-bold text-emerald-600 leading-tight">
                      <CheckCircle2 className="size-3" aria-hidden />
                      Assinou
                    </p>
                    {s.signed_at ? (
                      <p className="text-[9px] text-emerald-600/70 leading-tight">
                        {fmtDate(s.signed_at)}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <>
                    <p className="flex items-center justify-end gap-0.5 text-[10px] font-semibold text-slate-400 leading-tight">
                      <Clock className="size-3" aria-hidden />
                      Pendente
                    </p>
                    <EmailSentBadge status={s.email_sent_status} />
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

type FirmSigner = { email: string; firstName: string; aliases?: string[] };

type Props = {
  initialLinked:       LinkedRow[];
  initialUnlinked:     UnlinkedRow[];
  initialMissingNames: number;
  initialQuota:        D4SignQuotaStatus;
  firmSigners:         FirmSigner[];
  d4signPortalBase:    string;
  /** email.toLowerCase() → avatar + nome do usuário interno */
  appUsersByEmail?:    Record<string, AppUserInfo>;
};

export function D4SignDashboard({
  initialLinked,
  initialUnlinked,
  initialMissingNames,
  initialQuota,
  firmSigners,
  d4signPortalBase,
  appUsersByEmail = {},
}: Props) {
  const router = useRouter();

  const linked   = initialLinked;
  const unlinked = initialUnlinked;
  const [missingNames, setMissingNames] = useState<number>(initialMissingNames);
  const [quota, setQuota] = useState<D4SignQuotaStatus>(initialQuota);
  const [enrichingUuid, setEnrichingUuid] = useState<string | null>(null);

  const quotaExhausted = quota.remaining <= 0;

  async function refreshQuota() {
    try {
      const res = await fetch("/api/crm/d4sign/quota");
      const json = (await res.json()) as D4SignQuotaStatus & { ok?: boolean };
      if (res.ok && json.ok !== false) {
        setQuota({
          used: json.used,
          limit: json.limit ?? D4SIGN_HOURLY_LIMIT,
          remaining: json.remaining,
          resetAt: json.resetAt,
          lastSyncedAt: json.lastSyncedAt,
        });
      }
    } catch {
      // silencioso
    }
  }

  const [syncing, startVaultSync] = useTransition();
  const [enriching, startEnrich] = useTransition();
  const [syncMsg, setSyncMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [sortBy, setSortBy] = useState<"updated" | "signed" | "created" | "name">("updated");
  const [noSignersOnly, setNoSignersOnly] = useState(false);
  const [linkState, setLinkState] = useState<
    | { open: true; uuid: string; name: string | null; leadId: string | null }
    | { open: false }
  >({ open: false });

  // EMBED dialog (assinar inline via iframe D4Sign)
  const [embedState, setEmbedState] = useState<
    | { open: true; documentUuid: string; signerEmail: string; signerName: string | null; signerKey: string | null }
    | { open: false }
  >({ open: false });

  function openEmbed(documentUuid: string, signer: SignerInfo) {
    if (!signer.email) return;
    setEmbedState({
      open: true,
      documentUuid,
      signerEmail: signer.email,
      signerName: signer.name ?? null,
      signerKey: signer.key_signer ?? null,
    });
  }

  // VIEW dialog (visualização do PDF via proxy)
  const [viewState, setViewState] = useState<
    | { open: true; documentUuid: string; documentName: string | null }
    | { open: false }
  >({ open: false });

  function openView(documentUuid: string, documentName?: string | null) {
    setViewState({ open: true, documentUuid, documentName: documentName ?? null });
  }

  // Filtros
  const [filter,       setFilter]       = useState<"all" | "pending" | "signed" | "cancelled">("all");
  const [signerFilter, setSignerFilter] = useState<"all" | string>("all"); // "all" | email | "client"
  const [showVault, setShowVault] = useState(true);
  // Pastas abertas no cofre — área (L1) e cliente (L2)
  const [openAreas,   setOpenAreas]   = useState<Set<string>>(() => new Set());
  const [openClients, setOpenClients] = useState<Set<string>>(() => new Set());

  // Todos os e-mails da firma (canônicos + aliases de domínio antigo)
  const firmEmails = useMemo(() => {
    const set = new Set<string>();
    for (const f of firmSigners) {
      set.add(f.email);
      for (const a of f.aliases ?? []) set.add(a);
    }
    return set;
  }, [firmSigners]);

  // alias → email canônico (para normalizar signers de contratos históricos)
  const aliasToMain = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of firmSigners) {
      map.set(f.email, f.email);
      for (const a of f.aliases ?? []) map.set(a, f.email);
    }
    return map;
  }, [firmSigners]);

  // Realtime: atualiza automaticamente quando webhook D4Sign marca alguém como assinado
  useD4SignDocumentsRealtime(() => router.refresh());

  function toggleArea(key: string) {
    setOpenAreas((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }
  function toggleClient(key: string) {
    setOpenClients((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  // ── Portal URL (fallback para abrir no D4Sign logado) ──
  function portalUrl(uuid: string): string {
    return `${d4signPortalBase}/desk/viewdoc/${uuid}`;
  }

  // ── Signer filter logic ──
  function matchesSigner(signers: SignerInfo[]): boolean {
    if (signerFilter === "all") return true;
    if (signers.length === 0) return false;
    if (signerFilter === "client") {
      return signers.some((s) => s.email && !firmEmails.has(s.email) && signerIsPending(s));
    }
    // Normaliza alias → email canônico para comparar com o filtro
    return signers.some((s) => {
      const canonical = s.email ? (aliasToMain.get(s.email) ?? s.email) : null;
      return canonical === signerFilter && signerIsPending(s);
    });
  }

  // Conta docs pendentes por signatário (para os chips)
  const allDocs = useMemo(() => {
    const arr: { signers: SignerInfo[]; status: string | null }[] = [];
    for (const r of linked)  arr.push({ signers: parseSigners(r.signers), status: r.d4sign_status });
    if (showVault)
      for (const r of unlinked) arr.push({ signers: parseSigners(r.signers), status: r.d4sign_status });
    return arr;
  }, [linked, unlinked, showVault]);

  const signerCounts = useMemo(() => {
    const counts: Record<string, number> = { client: 0 };
    for (const f of firmSigners) counts[f.email] = 0;
    for (const { signers } of allDocs) {
      if (!signers.length) continue;
      for (const s of signers) {
        if (!s.email || !signerIsPending(s)) continue;
        if (firmEmails.has(s.email)) {
          // Normaliza alias → canônico para acumular no chip correto
          const canonical = aliasToMain.get(s.email) ?? s.email;
          counts[canonical] = (counts[canonical] ?? 0) + 1;
        } else {
          counts.client += 1;
        }
      }
    }
    return counts;
  }, [allDocs, firmSigners, firmEmails, aliasToMain]);

  // Docs sem dados de signatários — SEPARADOS por relevância
  // Pendentes (status 2, 3, sent, processing) = relevantes
  // Finalizados (1, 4, 6, 7) = baixa prioridade (já tem desfecho)
  const PENDING_STATUSES = useMemo(() => new Set(["2", "3", "sent", "processing"]), []);
  const { noSignersPending, noSignersTotal } = useMemo(() => {
    const all = [...linked, ...unlinked];
    const empty = all.filter((r) => parseSigners(r.signers).length === 0);
    return {
      noSignersPending: empty.filter((r) => PENDING_STATUSES.has(r.d4sign_status ?? "")).length,
      noSignersTotal:   empty.length,
    };
  }, [linked, unlinked, PENDING_STATUSES]);
  const noSignersCount = noSignersPending; // alias legível

  // ── Ações ──
  function handleVaultSync() {
    if (quotaExhausted) {
      setSyncMsg({ ok: false, text: "Quota D4Sign esgotada nesta hora. Aguarde o reset." });
      return;
    }
    setSyncMsg(null);
    startVaultSync(async () => {
      try {
        const res = await fetch("/api/crm/d4sign/vault-sync", { method: "POST" });
        const json = (await res.json()) as {
          ok?: boolean;
          imported?: number;
          linked?: number;
          unlinked?: number;
          statusChanges?: number;
          safe_name?: string;
          folders_walked_this_run?: number;
          folders_remaining?: number;
          docs_with_folder?: number;
          docs_with_name?: number;
          missing_names?: number;
          enrich?: { enriched?: number; remainingWithoutSigners?: number };
          error?: string;
          quota?: D4SignQuotaStatus;
        };
        if (!res.ok || !json.ok) {
          setSyncMsg({ ok: false, text: json.error ?? "Falha ao atualizar cofre." });
          if (json.quota) setQuota(json.quota);
          return;
        }
        const parts = [
          `${json.imported ?? 0} doc(s) sincronizados`,
          json.statusChanges ? `${json.statusChanges} status alterado(s)` : null,
          json.enrich?.enriched ? `${json.enrich.enriched} enrich signatários` : null,
          json.folders_remaining ? `${json.folders_remaining} pastas restantes` : null,
        ].filter(Boolean);
        setSyncMsg({ ok: true, text: parts.join(" · ") });
        if (typeof json.missing_names === "number") setMissingNames(json.missing_names);
        if (json.quota) setQuota(json.quota);
        else await refreshQuota();
        setShowVault(true);
        router.refresh();
      } catch {
        setSyncMsg({ ok: false, text: "Erro de rede ao atualizar cofre." });
      }
    });
  }

  function handleEnrichSingle(uuidDoc: string) {
    if (quotaExhausted) {
      setSyncMsg({ ok: false, text: "Quota D4Sign esgotada nesta hora. Aguarde o reset." });
      return;
    }
    setSyncMsg(null);
    setEnrichingUuid(uuidDoc);
    startEnrich(async () => {
      try {
        const res = await fetch("/api/crm/d4sign/enrich-signers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uuid_doc: uuidDoc }),
        });
        const json = (await res.json()) as {
          ok?: boolean; enriched?: number; remaining?: number; message?: string; error?: string;
          quota?: D4SignQuotaStatus;
        };
        if (!res.ok || !json.ok) {
          setSyncMsg({ ok: false, text: json.error ?? "Falha ao buscar signatários." });
          return;
        }
        if (json.quota) setQuota(json.quota);
        else await refreshQuota();
        setSyncMsg({
          ok: true,
          text: json.enriched
            ? `Signatários atualizados (${json.enriched} doc).`
            : (json.message ?? "Nenhuma atualização."),
        });
        router.refresh();
      } catch {
        setSyncMsg({ ok: false, text: "Erro de rede." });
      } finally {
        setEnrichingUuid(null);
      }
    });
  }

  function handleEnrich() {
    if (quotaExhausted) {
      setSyncMsg({ ok: false, text: "Quota D4Sign esgotada nesta hora. Aguarde o reset." });
      return;
    }
    setSyncMsg(null);
    startEnrich(async () => {
      try {
        const res  = await fetch("/api/crm/d4sign/enrich-signers", { method: "POST" });
        const json = (await res.json()) as {
          ok?: boolean; enriched?: number; remaining?: number; message?: string; error?: string;
          quota?: D4SignQuotaStatus;
        };
        if (!res.ok || !json.ok) { setSyncMsg({ ok: false, text: json.error ?? "Falha ao enriquecer." }); return; }
        if (json.quota) setQuota(json.quota);
        else await refreshQuota();
        const msg = json.enriched === 0
          ? (json.message ?? "Nenhum documento para enriquecer.")
          : `${json.enriched} signatário(s) buscado(s). ${json.remaining ?? 0} ainda sem dados.`;
        setSyncMsg({ ok: true, text: msg });
        router.refresh();
      } catch { setSyncMsg({ ok: false, text: "Erro de rede ao enriquecer." }); }
    });
  }

  function sortDocs<T extends {
    name_document: string | null;
    created_at_d4sign: string | null;
    finalized_at: string | null;
    last_synced_at: string | null;
  }>(rows: T[]): T[] {
    const copy = [...rows];
    copy.sort((a, b) => {
      if (sortBy === "name") {
        return (a.name_document ?? "").localeCompare(b.name_document ?? "", "pt-BR");
      }
      if (sortBy === "signed") {
        const da = a.finalized_at ? new Date(a.finalized_at).getTime() : 0;
        const db = b.finalized_at ? new Date(b.finalized_at).getTime() : 0;
        return db - da;
      }
      if (sortBy === "created") {
        const da = a.created_at_d4sign ? new Date(a.created_at_d4sign).getTime() : 0;
        const db = b.created_at_d4sign ? new Date(b.created_at_d4sign).getTime() : 0;
        return db - da;
      }
      const da = a.last_synced_at ? new Date(a.last_synced_at).getTime() : 0;
      const db = b.last_synced_at ? new Date(b.last_synced_at).getTime() : 0;
      return db - da;
    });
    return copy;
  }

  function passesNoSignersFilter(signersRaw: unknown): boolean {
    if (!noSignersOnly) return true;
    return parseSigners(signersRaw).length === 0;
  }

  // ── Filtros ──
  const filteredLinked = useMemo(
    () =>
      sortDocs(
        linked.filter((r) => {
          if (filter !== "all" && getStatus(r.d4sign_status).group !== filter) return false;
          if (!passesNoSignersFilter(r.signers)) return false;
          return matchesSigner(parseSigners(r.signers));
        }),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [linked, filter, signerFilter, firmEmails, sortBy, noSignersOnly],
  );

  const filteredUnlinked = useMemo(
    () =>
      showVault
        ? sortDocs(
            unlinked.filter((d) => {
              if (filter !== "all" && getStatus(d.d4sign_status).group !== filter) return false;
              if (!passesNoSignersFilter(d.signers)) return false;
              return matchesSigner(parseSigners(d.signers));
            }),
          )
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [unlinked, showVault, filter, signerFilter, firmEmails, sortBy, noSignersOnly],
  );


  const counts = useMemo(() => ({
    all:       linked.length + (showVault ? unlinked.length : 0),
    pending:   linked.filter((r) => getStatus(r.d4sign_status).group === "pending").length   + (showVault ? unlinked.filter((d) => getStatus(d.d4sign_status).group === "pending").length   : 0),
    signed:    linked.filter((r) => getStatus(r.d4sign_status).group === "signed").length    + (showVault ? unlinked.filter((d) => getStatus(d.d4sign_status).group === "signed").length    : 0),
    cancelled: linked.filter((r) => getStatus(r.d4sign_status).group === "cancelled").length + (showVault ? unlinked.filter((d) => getStatus(d.d4sign_status).group === "cancelled").length : 0),
  }), [linked, unlinked, showVault]);

  const isWorking = syncing || enriching;

  // ── Helper: renderiza uma linha de documento do cofre ──
  function renderVaultDoc(doc: UnlinkedRow) {
    const status     = getStatus(doc.d4sign_status);
    const StatusIcon = status.icon;
    const signers    = parseSigners(doc.signers);
    const needsEnrich = signers.length === 0;
    return (
      <div key={doc.uuid_doc}
        className="grid grid-cols-1 gap-3 px-5 py-3.5 transition-colors hover:bg-slate-50/60 sm:grid-cols-[2fr_1.4fr_1fr_auto] sm:items-start sm:gap-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-700">
            {doc.name_document
              ? doc.name_document.replace(/\.docx?$/i, "")
              : <span className="italic text-amber-600">Sem nome</span>}
          </p>
          <p className="font-mono text-[10px] text-slate-400" title={doc.uuid_doc}>
            {doc.uuid_doc.slice(0, 18)}…
          </p>
          <div className="mt-1">
            <D4SignOriginBadge
              sentByAppUserId={doc.sent_by_app_user_id}
              detailsFetchedAt={doc.details_fetched_at}
              lastSyncedAt={doc.last_synced_at}
              d4signStatus={doc.d4sign_status}
            />
          </div>
          <div className="mt-1.5 flex items-center gap-2 flex-wrap">
            <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold", status.pill)}>
              <StatusIcon className="size-2.5 shrink-0" />
              {doc.status_name ?? status.label}
            </span>
          </div>
          <div className="mt-1 space-y-0.5">
            <SignedSummaryBadge
              status={doc.d4sign_status}
              finalizedAt={doc.finalized_at}
              signers={doc.signers}
            />
            {!doc.finalized_at && !parseSigners(doc.signers).some((s) => s.signed_at) ? (
              <p className="text-[10px] text-muted-foreground">
                Criado {fmtDate(doc.created_at_d4sign)}
              </p>
            ) : null}
            {doc.last_synced_at ? (
              <p className="text-[9px] text-slate-400">Sync {fmtRelative(doc.last_synced_at)}</p>
            ) : null}
          </div>
          {doc.sent_by || doc.created_at_d4sign ? (
            <div className="mt-1">
              <SentByBadge sentBy={doc.sent_by} sentAt={doc.created_at_d4sign} />
            </div>
          ) : null}
        </div>
        {/* Signatários */}
        <div className="pt-0.5">
          {needsEnrich ? (
            <div className="space-y-1.5">
              <p className="text-[10px] text-violet-600 font-semibold">Sem dados de signatários</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 gap-1 border-violet-200 text-[10px] text-violet-700"
                disabled={isWorking || quotaExhausted || enrichingUuid === doc.uuid_doc}
                onClick={() => handleEnrichSingle(doc.uuid_doc)}
              >
                {enrichingUuid === doc.uuid_doc ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Users className="size-3" />
                )}
                Buscar (1 req)
              </Button>
            </div>
          ) : (
            <SignersDisplay signers={signers} firmEmails={firmEmails} appUsersByEmail={appUsersByEmail} />
          )}
        </div>
        <div className="flex flex-col gap-1.5 pt-0.5">
          <button
            type="button"
            onClick={() => openView(doc.uuid_doc, doc.name_document)}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-teal-200 bg-teal-50 px-2.5 text-[11px] font-semibold text-teal-700 transition-colors hover:bg-teal-100"
            title="Visualizar PDF"
          >
            <Eye className="size-3" />Ver PDF
          </button>
          <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-600">
            Cofre histórico
          </span>
          <button
            type="button"
            onClick={() => setLinkState({ open: true, uuid: doc.uuid_doc, name: doc.name_document, leadId: null })}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
            title="Vincular a um lead do CRM (quando existir)"
          >
            <Link2 className="size-3" /> Vincular lead
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <QuotaBanner quota={quota} />
      <D4SignHealthPanel />

      {/* Banner pré-lançamento */}
      {unlinked.length > 0 && linked.length === 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
          <p className="font-bold">Cofre histórico D4Sign</p>
          <p className="mt-1 text-[12.5px] leading-relaxed opacity-90">
            Estes contratos vieram do cofre da D4Sign — ainda não estão vinculados a leads do CRM (pré-lançamento).
            Use <strong>Atualizar cofre</strong> para sincronizar status e pastas; <strong>Buscar signatários</strong> traz quem assinou e quando (1 req/doc).
          </p>
        </div>
      ) : null}

      {/* Banner: documentos sem nome */}
      {missingNames > 0 ? (
        <div className="flex items-start gap-3 rounded-xl border border-teal-200 bg-teal-50/70 px-4 py-3 text-sm">
          <Download className="mt-0.5 size-4 shrink-0 text-teal-700" aria-hidden />
          <div className="flex-1">
            <p className="font-bold text-teal-900">{missingNames} documento(s) sem nome</p>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-teal-900/85">
              Clique em <strong>Atualizar cofre</strong> — sincroniza status, nomes e pastas de todos os documentos.
            </p>
          </div>
        </div>
      ) : null}

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Filtro status */}
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { key: "all",       label: "Todos",      count: counts.all       },
              { key: "pending",   label: "Pendentes",  count: counts.pending   },
              { key: "signed",    label: "Assinados",  count: counts.signed    },
              { key: "cancelled", label: "Cancelados", count: counts.cancelled },
            ] as const
          ).map(({ key, label, count }) => (
            <button key={key} type="button" onClick={() => setFilter(key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                filter === key ? "border-accent-teal bg-accent-teal/10 text-accent-teal" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
              )}>
              {label}
              <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-bold", filter === key ? "bg-accent-teal/20" : "bg-slate-100")}>{count}</span>
            </button>
          ))}
        </div>

        {/* Ações */}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm"
            className={cn("h-9 gap-1.5", showVault && "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100")}
            onClick={() => setShowVault((v) => !v)}>
            <Vault className="size-3.5" aria-hidden />
            {showVault ? "Ocultar cofre" : `Ver cofre (${unlinked.length})`}
          </Button>

          <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5"
            disabled={isWorking || quotaExhausted} onClick={handleVaultSync}
            title={quotaExhausted ? "Quota esgotada" : "Sync + pastas + enrich automático (até 2 docs). ~3-9 req."}>
            {syncing ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <RefreshCw className="size-3.5" aria-hidden />}
            {syncing ? "Atualizando…" : "Atualizar cofre"}
          </Button>

          {noSignersCount > 0 ? (
            <Button type="button" variant="outline" size="sm"
              className="h-9 gap-1.5 border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100"
              disabled={isWorking || quotaExhausted} onClick={handleEnrich}
              title={quotaExhausted ? "Quota esgotada" : `Busca signatários de até ${Math.min(9, quota.remaining)} documentos.`}>
              {enriching ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Users className="size-3.5" aria-hidden />}
              {enriching ? "Buscando…" : `Buscar signatários (${noSignersCount})`}
            </Button>
          ) : null}
        </div>
      </div>

      {/* Ordenação + filtro sem signatários */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
          <Filter className="size-3" /> Ordenar
        </span>
        {(
          [
            { key: "updated", label: "Sync recente" },
            { key: "signed", label: "Assinatura" },
            { key: "created", label: "Criação" },
            { key: "name", label: "Nome" },
          ] as const
        ).map(({ key, label }) => (
          <button key={key} type="button" onClick={() => setSortBy(key)}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-colors",
              sortBy === key ? "border-slate-700 bg-slate-700 text-white" : "border-slate-200 bg-white text-slate-600",
            )}>
            {label}
          </button>
        ))}
        <button type="button" onClick={() => setNoSignersOnly((v) => !v)}
          className={cn(
            "ml-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-colors",
            noSignersOnly ? "border-violet-600 bg-violet-600 text-white" : "border-slate-200 bg-white text-slate-600",
          )}>
          Sem signatários
          {noSignersTotal > 0 ? (
            <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-bold", noSignersOnly ? "bg-white/25" : "bg-slate-100")}>
              {noSignersTotal}
            </span>
          ) : null}
        </button>
      </div>

      {/* ── Filtros de signatário ── */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
          <Users className="size-3" aria-hidden />
          Signatário pendente
        </span>
        <button type="button" onClick={() => setSignerFilter("all")}
          className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-colors",
            signerFilter === "all" ? "border-slate-700 bg-slate-700 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300")}>
          Todos
        </button>
        {firmSigners.map((f) => (
          <button key={f.email} type="button" onClick={() => setSignerFilter(signerFilter === f.email ? "all" : f.email)}
            className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-colors",
              signerFilter === f.email ? "border-teal-600 bg-teal-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300")}>
            {f.firstName}
            {signerCounts[f.email] > 0 ? (
              <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-bold", signerFilter === f.email ? "bg-white/25" : "bg-slate-100 text-slate-500")}>
                {signerCounts[f.email]}
              </span>
            ) : null}
          </button>
        ))}
        <button type="button" onClick={() => setSignerFilter(signerFilter === "client" ? "all" : "client")}
          className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-colors",
            signerFilter === "client" ? "border-amber-600 bg-amber-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300")}>
          Cliente
          {signerCounts.client > 0 ? (
            <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-bold", signerFilter === "client" ? "bg-white/25" : "bg-slate-100 text-slate-500")}>
              {signerCounts.client}
            </span>
          ) : null}
        </button>
        {noSignersCount > 0 ? (
          <span className="text-[10px] text-slate-400">· {noSignersCount} sem dados de signatários</span>
        ) : null}
      </div>

      {/* Msg feedback */}
      {syncMsg ? (
        <div className={cn("flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold",
          syncMsg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700")}>
          {syncMsg.ok ? <CheckCircle2 className="size-4 shrink-0" /> : <AlertCircle className="size-4 shrink-0" />}
          {syncMsg.text}
        </div>
      ) : null}

      {/* ── Documentos vinculados ao CRM ── */}
      {filteredLinked.length === 0 && !showVault ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-white py-16 text-center">
          <FileSignature className="mb-3 size-10 text-slate-300" />
          <p className="text-sm font-semibold text-slate-500">
            {filter === "all" && signerFilter === "all"
              ? "Nenhum contrato ainda. Clique em \"Atualizar cofre\" para sincronizar."
              : "Nenhum contrato com este filtro."}
          </p>
        </div>
      ) : filteredLinked.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-crm-border-warm-strong bg-white shadow-sm">
          <div className="hidden grid-cols-[2fr_1.5fr_1fr_1fr_auto] gap-4 border-b border-slate-100 bg-slate-50/60 px-5 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 sm:grid">
            <span>Lead / Documento</span><span>Signatários</span><span>Status D4Sign</span><span>Etapa / Data</span><span>Ações</span>
          </div>
          <div className="divide-y divide-slate-100">
            {filteredLinked.map((row) => {
              const opp        = row.oportunidades;
              const status     = getStatus(row.d4sign_status);
              const StatusIcon = status.icon;
              const signers    = parseSigners(row.signers);
              const leadId     = opp?.id ?? row.oportunidade_id ?? "";
              return (
                <div key={row.uuid_doc} className="grid grid-cols-1 gap-3 px-5 py-4 transition-colors hover:bg-slate-50/60 sm:grid-cols-[2fr_1.5fr_1fr_1fr_auto] sm:items-start sm:gap-4">
                  {/* Col 1 — Lead + Documento */}
                  <div className="min-w-0">
                    {opp ? (
                      <Link href={`/crm/leads/${encodeURIComponent(opp.id)}`}
                        className="group inline-flex items-center gap-1.5 text-sm font-semibold text-primary-dark hover:text-accent-teal">
                        {opp.solicitante_nome}
                        <ExternalLink className="size-3 opacity-0 transition-opacity group-hover:opacity-60" />
                      </Link>
                    ) : <span className="text-sm font-semibold text-slate-600">—</span>}
                    {row.name_document ? (
                      <p className="mt-0.5 truncate text-[10px] text-slate-500">{row.name_document.replace(/\.docx?$/i, "")}</p>
                    ) : (
                      <p className="mt-0.5 font-mono text-[10px] text-slate-400" title={row.uuid_doc}>{row.uuid_doc.slice(0, 18)}…</p>
                    )}
                    {row.folder_name ? (
                      <p className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-slate-500">
                        <Folder className="size-2.5 opacity-60" />{row.folder_name}
                      </p>
                    ) : null}
                  </div>
                  {/* Col 2 — Signatários */}
                  <div className="pt-0.5">
                    {signers.length === 0 ? (
                      <div className="space-y-1.5">
                        <p className="text-[10px] text-violet-600 font-semibold">Sem signatários</p>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1 border-violet-200 text-[10px] text-violet-700"
                          disabled={isWorking || quotaExhausted || enrichingUuid === row.uuid_doc}
                          onClick={() => handleEnrichSingle(row.uuid_doc)}
                        >
                          {enrichingUuid === row.uuid_doc ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <Users className="size-3" />
                          )}
                          Buscar (1 req)
                        </Button>
                      </div>
                    ) : (
                      <SignersDisplay signers={signers} firmEmails={firmEmails} appUsersByEmail={appUsersByEmail} />
                    )}
                  </div>
                  {/* Col 3 — Status D4Sign */}
                  <div className="space-y-1 pt-0.5">
                    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold", status.pill)}>
                      <StatusIcon className="size-3 shrink-0" />
                      {row.status_name ?? status.label}
                    </span>
                    <SignedSummaryBadge
                      status={row.d4sign_status}
                      finalizedAt={row.finalized_at}
                      signers={row.signers}
                    />
                  </div>
                  {/* Col 4 — Etapa + Data + Enviado por */}
                  <div className="space-y-1 pt-0.5">
                    {opp ? (
                      <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                        {ETAPA_LABEL[opp.etapa] ?? opp.etapa.replace(/_/g, " ")}
                      </span>
                    ) : null}
                    <p className="text-[10px] text-muted-foreground">
                      Enviado {fmtDate(row.created_at_d4sign ?? opp?.d4sign_updated_at)}
                    </p>
                    {row.last_synced_at ? (
                      <p className="text-[9px] text-slate-400">Sync {fmtRelative(row.last_synced_at)}</p>
                    ) : null}
                    {row.sent_by || row.created_at_d4sign ? (
                      <SentByBadge sentBy={row.sent_by} sentAt={row.created_at_d4sign} />
                    ) : null}
                  </div>
                  {/* Col 5 — Ações */}
                  <div className="flex flex-col gap-1.5 pt-0.5">
                    {/* Botão EMBED: aparece se há signer da firma pendente */}
                    {(() => {
                      const firmPending = signers.find(
                        (s) => s.email && firmEmails.has(s.email) && signerIsPending(s),
                      );
                      const docPending = ["sent", "2", "3", "processing"].includes(
                        String(row.d4sign_status ?? ""),
                      );
                      if (firmPending && docPending) {
                        return (
                          <Button
                            type="button"
                            size="sm"
                            className="h-8 gap-1 bg-accent-teal px-2.5 text-[11px] font-bold text-white hover:bg-teal-600"
                            onClick={() => openEmbed(row.uuid_doc, firmPending)}
                            title={`Assinar inline como ${firmPending.name ?? firmPending.email}`}
                          >
                            <PenLine className="size-3" />
                            Assinar agora
                          </Button>
                        );
                      }
                      return null;
                    })()}
                    <button
                      type="button"
                      onClick={() => openView(row.uuid_doc, row.name_document)}
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-teal-200 bg-teal-50 px-2.5 text-[11px] font-semibold text-teal-700 transition-colors hover:bg-teal-100"
                      title="Visualizar PDF"
                    >
                      <Eye className="size-3" />Ver PDF
                    </button>
                    {row.link_contrato ? (
                      <a href={row.link_contrato} target="_blank" rel="noopener noreferrer"
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-teal-200 bg-teal-50 px-2.5 text-[11px] font-semibold text-teal-700 transition-colors hover:bg-teal-100">
                        <ExternalLink className="size-3" />Link e-mail
                      </a>
                    ) : null}
                    {leadId ? (
                      <Link href={`/crm/leads/${encodeURIComponent(leadId)}`}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-50">
                        Ver lead
                      </Link>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* ── Cofre — docs não vinculados — 2 níveis (área → cliente) ── */}
      {showVault ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Vault className="size-4 text-amber-500" />
            <h3 className="text-sm font-bold text-slate-700">
              Cofre D4Sign
              {(linked[0]?.safe_name ?? unlinked[0]?.safe_name)
                ? ` — ${linked[0]?.safe_name ?? unlinked[0]?.safe_name}`
                : ""} — sem vínculo com lead
            </h3>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
              {unlinked.length}
            </span>
          </div>

          {/* Banner: pendentes sem dados (relevantes) */}
          {noSignersPending > 0 ? (
            <div className="flex items-start gap-3 rounded-xl border border-violet-200 bg-violet-50/70 px-4 py-3 text-sm">
              <Users className="mt-0.5 size-4 shrink-0 text-violet-600" aria-hidden />
              <div className="flex-1 space-y-1">
                <p className="text-[13px] font-bold text-violet-900">
                  {noSignersPending} contrato{noSignersPending !== 1 ? "s pendentes" : " pendente"} sem dados de signatários
                </p>
                <p className="text-[11.5px] leading-relaxed text-violet-900/85">
                  São contratos com status <em>Aguardando</em> ou <em>Em Assinatura</em> — vale a pena buscar quem falta assinar.
                  Cada clique busca <strong>até 9 docs</strong>; ≈ {Math.ceil(noSignersPending / 9)} clique{Math.ceil(noSignersPending / 9) !== 1 ? "s" : ""} no rate limit padrão D4Sign (10/h).
                  {noSignersTotal - noSignersPending > 0 ? (
                    <> Os outros <strong>{noSignersTotal - noSignersPending}</strong> finalizados/lixeira têm baixa prioridade.</>
                  ) : null}
                </p>
              </div>
              <Button type="button" size="sm"
                className="h-8 shrink-0 gap-1.5 bg-violet-600 text-white hover:bg-violet-700"
                disabled={isWorking || quotaExhausted} onClick={handleEnrich}>
                {enriching ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Users className="size-3.5" aria-hidden />}
                {enriching ? "Buscando…" : `Buscar 9 agora`}
              </Button>
            </div>
          ) : noSignersTotal > 0 ? (
            <p className="text-[10.5px] text-slate-400">
              {noSignersTotal} contratos finalizados/lixeira sem dados de signatários — baixa prioridade (já estão concluídos).
            </p>
          ) : null}

          {filteredUnlinked.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-amber-200 bg-amber-50/30 py-10 text-center">
              <Vault className="mb-2 size-8 text-amber-300" />
              <p className="text-sm font-semibold text-amber-600">
                {unlinked.length === 0
                  ? "Nenhum documento no cofre. Clique em \"Atualizar cofre\" para buscar."
                  : "Nenhum não vinculado com este filtro."}
              </p>
            </div>
          ) : (() => {
            // Modo adaptativo: 2 níveis se há dados de área, 1 nível caso contrário
            const hasAreaData = filteredUnlinked.some((d) => d.folder_area);
            if (hasAreaData) {
              // ── 2 níveis: Área → Cliente → Docs ──
              return (
                <div className="space-y-2">
                  {groupByArea(filteredUnlinked).map((area) => {
                    const areaOpen   = openAreas.has(area.key);
                    const totalDocs  = area.clients.reduce((n, c) => n + c.docs.length, 0) + area.directDocs.length;
                    const AreaIcon   = areaOpen ? FolderOpen : Folder;
                    const isNoArea   = area.key === "__no_area__";
                    return (
                      <div key={area.key} className="overflow-hidden rounded-xl border border-amber-200 bg-white shadow-sm">
                        {/* Cabeçalho Área (L1) */}
                        <button type="button" onClick={() => toggleArea(area.key)}
                          className="flex w-full items-center gap-3 bg-amber-50/60 px-4 py-3 text-left transition-colors hover:bg-amber-50">
                          {areaOpen ? <ChevronDown className="size-4 shrink-0 text-amber-500" /> : <ChevronRight className="size-4 shrink-0 text-amber-400" />}
                          <AreaIcon className={cn("size-4 shrink-0", isNoArea ? "text-slate-400" : "text-amber-500")} />
                          <span className={cn("flex-1 text-sm font-bold", isNoArea ? "italic text-slate-500" : "text-slate-700")}>{area.name}</span>
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">{totalDocs}</span>
                        </button>
                        {areaOpen ? (
                          <div>
                            {/* Pastas-cliente (L2) */}
                            {area.clients.map((client) => {
                              const clientOpen = openClients.has(client.key);
                              const ClientIcon = clientOpen ? FolderOpen : Folder;
                              return (
                                <div key={client.key} className="border-t border-slate-100">
                                  <button type="button" onClick={() => toggleClient(client.key)}
                                    className="flex w-full items-center gap-3 bg-slate-50/40 py-2.5 pl-8 pr-4 text-left transition-colors hover:bg-slate-50">
                                    {clientOpen ? <ChevronDown className="size-3.5 shrink-0 text-slate-400" /> : <ChevronRight className="size-3.5 shrink-0 text-slate-300" />}
                                    <ClientIcon className="size-3.5 shrink-0 text-slate-400" />
                                    <span className="flex-1 text-[13px] font-semibold text-slate-600">{client.name}</span>
                                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{client.docs.length}</span>
                                  </button>
                                  {clientOpen ? (
                                    <div className="divide-y divide-slate-100">
                                      {client.docs.map((doc) => renderVaultDoc(doc))}
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                            {/* Docs diretos na área (sem cliente) */}
                            {area.directDocs.length > 0 ? (
                              <div className={cn("divide-y divide-slate-100", area.clients.length > 0 && "border-t border-slate-200")}>
                                {area.directDocs.map((doc) => renderVaultDoc(doc))}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              );
            }
            // ── 1 nível: Pasta-cliente → Docs ──
            return (
              <div className="space-y-2">
                {groupByFolder(filteredUnlinked).map(({ key, name, docs }) => {
                  const isOpen     = openAreas.has(key);
                  const FolderIcon = isOpen ? FolderOpen : Folder;
                  const isRoot     = key === "__root__";
                  return (
                    <div key={key} className="overflow-hidden rounded-xl border border-amber-200 bg-white shadow-sm">
                      <button type="button" onClick={() => toggleArea(key)}
                        className="flex w-full items-center gap-3 bg-amber-50/60 px-4 py-3 text-left transition-colors hover:bg-amber-50">
                        {isOpen ? <ChevronDown className="size-4 shrink-0 text-amber-500" /> : <ChevronRight className="size-4 shrink-0 text-amber-400" />}
                        <FolderIcon className={cn("size-4 shrink-0", isRoot ? "text-slate-400" : "text-amber-500")} />
                        <span className={cn("flex-1 text-sm font-bold", isRoot ? "italic text-slate-500" : "text-slate-700")}>{name}</span>
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">{docs.length}</span>
                      </button>
                      {isOpen ? (
                        <div className="divide-y divide-slate-100">
                          {docs.map((doc) => renderVaultDoc(doc))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      ) : null}

      {/* Legenda */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Legenda D4Sign</p>
        {Object.entries(STATUS_MAP)
          .filter(([key]) => key !== "processing")
          .map(([key, info]) => {
            const Icon = info.icon;
            return (
              <span key={key} className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                <span className={cn("inline-flex size-4 items-center justify-center rounded-full border", info.pill)}>
                  <Icon className="size-2.5" />
                </span>
                {info.label}
              </span>
            );
          })}
      </div>

      {linkState.open ? (
        <D4SignLinkLeadDialog
          open={linkState.open}
          onOpenChange={(v) => { if (!v) setLinkState({ open: false }); }}
          documentUuid={linkState.uuid}
          documentName={linkState.name}
          currentLeadId={linkState.leadId}
          onLinked={() => router.refresh()}
        />
      ) : null}

      {/* EMBED Dialog — assinar inline */}
      {embedState.open ? (
        <EmbedSignDialog
          open={embedState.open}
          onOpenChange={(v) => {
            if (!v) {
              setEmbedState({ open: false });
              router.refresh(); // recarrega para refletir nova assinatura
            }
          }}
          documentUuid={embedState.documentUuid}
          signerEmail={embedState.signerEmail}
          signerDisplayName={embedState.signerName ?? undefined}
          signerKeySigner={embedState.signerKey ?? undefined}
          onSigned={() => {
            // Sincroniza após pequeno delay (D4Sign precisa de tempo)
            setTimeout(() => {
              fetch("/api/crm/d4sign/vault-sync", { method: "POST" }).catch(() => undefined);
            }, 1500);
          }}
        />
      ) : null}

      {/* VIEW Dialog — visualização do PDF via proxy */}
      {viewState.open ? (
        <D4SignViewDialog
          open={viewState.open}
          onOpenChange={(v) => { if (!v) setViewState({ open: false }); }}
          documentUuid={viewState.documentUuid}
          documentName={viewState.documentName}
          portalUrl={portalUrl(viewState.documentUuid)}
        />
      ) : null}
    </div>
  );
}
