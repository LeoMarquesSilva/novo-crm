/**
 * GET /api/crm/d4sign/vault
 * Lista documentos do cofre D4Sign com cache em memória (55 min).
 * Usa apenas o listing endpoint — sem chamadas individuais por documento.
 */
import { NextResponse } from "next/server";
import { requireAuthApi } from "@/lib/auth/server";
import { getD4SignEnv } from "@/lib/d4sign/env";
import { D4SignConnector } from "@/modules/crm/infrastructure/integrations/d4sign-client";

const STATUSID_TO_STATUS: Record<number, string> = {
  1: "processing",
  2: "sent",
  3: "3",
  4: "1",
  5: "4",
};

export type VaultDoc = {
  uuid_doc: string;
  name_document: string | null;
  d4sign_status: string | null;
  status_name: string | null;
  created_at: string | null;
  finalized_at: string | null;
  safe_name: string | null;
};

// ── Cache em memória (55 min) ──────────────────────────────────────────────
const CACHE_TTL_MS = 55 * 60 * 1000;
let _cache: { data: VaultDoc[]; safe_name: string | null; ts: number } | null = null;

function getCached() {
  if (_cache && Date.now() - _cache.ts < CACHE_TTL_MS) return _cache;
  return null;
}

/** Extrai nome do documento tentando todas as variações de campo conhecidas */
function extractName(raw: Record<string, unknown>): string | null {
  const candidates = [
    raw.name_document,
    raw.nameDocument,
    raw.name,
    raw.nome,
    raw.filename,
    raw.file_name,
    raw.title,
    raw.documento,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return null;
}

export async function GET(request: Request) {
  try {
    const auth = await requireAuthApi();
    if (!auth.ok) return auth.response;

    // Aceita ?force=1 para ignorar cache (admin somente)
    const force = new URL(request.url).searchParams.get("force") === "1"
      && auth.profile?.role === "admin";

    if (!force) {
      const cached = getCached();
      if (cached) {
        return NextResponse.json({
          ok: true,
          data: cached.data,
          total: cached.data.length,
          safe_name: cached.safe_name,
          cached: true,
          cached_at: new Date(cached.ts).toISOString(),
        });
      }
    }

    const env = getD4SignEnv();
    if (!env.tokenApi) {
      return NextResponse.json({ ok: false, error: "D4SIGN_TOKEN não configurado." }, { status: 500 });
    }
    if (!env.safeUuid) {
      return NextResponse.json({ ok: false, error: "D4SIGN_SAFE_UUID não configurado." }, { status: 500 });
    }

    const connector = D4SignConnector.fromEnv(env);

    // Usa 2 das 10 requisições: safes + listing (página 1)
    const [safes, firstPage] = await Promise.all([
      connector.getSafes().catch(() => []),
      connector.listDocumentsBySafe(env.safeUuid, { pg: 1 }),
    ]);

    const safeName =
      safes.find((s) => s.uuid_safe === env.safeUuid)?.name_safe ??
      safes.find((s) => (s.uuid_safe ?? "").includes(env.safeUuid))?.name_safe ??
      null;

    // Páginas adicionais só se necessário (cada pg custa 1 requisição)
    const allRaw = [...firstPage];
    if (firstPage.length >= 50) {
      for (let pg = 2; pg <= 4; pg++) {
        const page = await connector.listDocumentsBySafe(env.safeUuid, { pg });
        if (!page || page.length === 0) break;
        allRaw.push(...page);
      }
    }

    // Log do primeiro documento bruto para diagnóstico (aparece nos logs do servidor)
    if (allRaw.length > 0) {
      console.log("[D4Sign vault] campos do 1º doc:", JSON.stringify(allRaw[0], null, 2));
    }

    // Deduplicar por UUID
    const seen = new Set<string>();
    const data: VaultDoc[] = [];

    for (const doc of allRaw) {
      const uuid = String(doc.uuid_doc ?? "").trim();
      if (!uuid || seen.has(uuid)) continue;
      seen.add(uuid);

      const rawId =
        typeof doc.statusId === "number"
          ? doc.statusId
          : parseInt(String(doc.statusId ?? ""), 10);

      const d4signStatus = isNaN(rawId) ? null : (STATUSID_TO_STATUS[rawId] ?? String(rawId));

      // Tenta extrair nome de todos os campos possíveis
      const rawDoc = doc as unknown as Record<string, unknown>;
      const nameDoc = extractName(rawDoc);

      data.push({
        uuid_doc:      uuid,
        name_document: nameDoc,
        d4sign_status: d4signStatus,
        status_name:   (doc.statusName ?? null) as string | null,
        created_at:    (doc.created_at ?? null) as string | null,
        finalized_at:  (doc.finalized_at ?? null) as string | null,
        safe_name:     safeName,
      });
    }

    // Salva no cache
    _cache = { data, safe_name: safeName, ts: Date.now() };

    return NextResponse.json({
      ok: true,
      data,
      total: data.length,
      safe_name: safeName,
      cached: false,
      cached_at: new Date(_cache.ts).toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao listar cofre D4Sign.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
