/**
 * POST /api/crm/d4sign/enrich-signers
 * Busca signatários via `GET /documents/{uuid}/list` (1 req/doc).
 *
 * Body opcional: `{ "uuid_doc": "..." }` — enriquece só 1 documento.
 * Sem body: até 9 docs pendentes sem signatários.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthApi } from "@/lib/auth/server";
import { getD4SignEnv } from "@/lib/d4sign/env";
import {
  getD4SignQuotaStatus,
  isD4SignQuotaExhausted,
} from "@/lib/d4sign/api-usage";
import {
  countDocumentsNeedingEnrich,
  enrichDocuments,
  pickDocumentsToEnrich,
} from "@/lib/d4sign/enrich-documents";
import {
  isRateLimitError,
  notifyQuotaExhausted,
} from "@/lib/d4sign/quota-orchestrator";

const BATCH_SIZE = 9;

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthApi();
    if (!auth.ok) return auth.response;
    if (
      !auth.profile ||
      !["admin", "comercial"].includes(String(auth.profile.role))
    ) {
      return NextResponse.json({ ok: false, error: "Apenas admin/comercial." }, { status: 403 });
    }

    const quotaBefore = await getD4SignQuotaStatus();
    if (isD4SignQuotaExhausted(quotaBefore)) {
      await notifyQuotaExhausted({ operation: "enriquecer signatários" });
      return NextResponse.json(
        {
          ok: false,
          error: `Quota D4Sign esgotada (${quotaBefore.used}/${quotaBefore.limit} req/h). Tente após ${quotaBefore.resetAt ? new Date(quotaBefore.resetAt).toLocaleTimeString("pt-BR") : "1 hora"}.`,
          quota: quotaBefore,
        },
        { status: 429 },
      );
    }

    const env = getD4SignEnv();
    if (!env.tokenApi) {
      return NextResponse.json({ ok: false, error: "D4SIGN_TOKEN não configurado." }, { status: 500 });
    }

    let singleUuid: string | null = null;
    try {
      const body = (await request.json()) as { uuid_doc?: string };
      singleUuid = body?.uuid_doc?.trim() || null;
    } catch {
      // body vazio — modo lote
    }

    const limit = singleUuid ? 1 : Math.min(BATCH_SIZE, quotaBefore.remaining);
    const sorted = await pickDocumentsToEnrich({ limit, uuidDoc: singleUuid });

    if (singleUuid && sorted.length === 0) {
      return NextResponse.json({ ok: false, error: "Documento não encontrado." }, { status: 404 });
    }

    if (sorted.length === 0) {
      const remaining = await countDocumentsNeedingEnrich();
      const quota = await getD4SignQuotaStatus();
      return NextResponse.json({
        ok: true,
        enriched: 0,
        remaining,
        message: "Todos os documentos já têm dados de signatários.",
        quota,
      });
    }

    const result = await enrichDocuments(env, sorted, { apiSource: "enrich" });

    return NextResponse.json({
      ok: true,
      enriched: result.enriched,
      remaining: result.remaining,
      items: result.items,
      quota: result.quota,
      ...(result.lastError ? { last_error: result.lastError } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isRateLimitError(message)) {
      await notifyQuotaExhausted({ operation: "enriquecer signatários" });
      const quota = await getD4SignQuotaStatus();
      return NextResponse.json(
        { ok: false, error: "Quota D4Sign esgotada.", quota },
        { status: 429 },
      );
    }
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
