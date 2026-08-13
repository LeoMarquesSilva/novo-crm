import { type NextRequest, NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/server";
import { getD4SignEnv } from "@/lib/d4sign/env";
import { fetchWithTimeout } from "@/lib/http/fetch-with-timeout";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ResponseShape = {
  httpStatus: number;
  topLevelKeys: string[];
  arrayLength: number | null;
  firstItemKeys: string[] | null;
  error: string | null;
};

async function inspectJsonShape(url: string): Promise<ResponseShape> {
  try {
    const response = await fetchWithTimeout(
      url,
      { headers: { Accept: "application/json" }, cache: "no-store" },
      15_000,
    );
    const body = (await response.json().catch(() => null)) as unknown;
    if (Array.isArray(body)) {
      const first =
        body[0] && typeof body[0] === "object"
          ? (body[0] as Record<string, unknown>)
          : null;
      return {
        httpStatus: response.status,
        topLevelKeys: [],
        arrayLength: body.length,
        firstItemKeys: first ? Object.keys(first) : null,
        error: null,
      };
    }
    const record =
      body && typeof body === "object"
        ? (body as Record<string, unknown>)
        : null;
    const nestedList = record && Array.isArray(record.list) ? record.list : null;
    const firstNested =
      nestedList?.[0] && typeof nestedList[0] === "object"
        ? (nestedList[0] as Record<string, unknown>)
        : null;
    return {
      httpStatus: response.status,
      topLevelKeys: record ? Object.keys(record) : [],
      arrayLength: nestedList?.length ?? null,
      firstItemKeys: firstNested ? Object.keys(firstNested) : null,
      error: null,
    };
  } catch (error) {
    return {
      httpStatus: 0,
      topLevelKeys: [],
      arrayLength: null,
      firstItemKeys: null,
      error: error instanceof Error ? error.name : "RequestError",
    };
  }
}

/**
 * Diagnóstico estrutural sem payload, tokens, nomes ou dados de signatários.
 * A rota não existe em produção.
 */
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse(null, { status: 404 });
  }

  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const env = getD4SignEnv();
  if (!env.tokenApi || !env.safeUuid) {
    return NextResponse.json(
      { ok: false, error: "D4Sign não configurado." },
      { status: 503 },
    );
  }

  const forcedUuid = request.nextUrl.searchParams.get("uuid")?.trim() ?? null;
  if (forcedUuid && !UUID_RE.test(forcedUuid)) {
    return NextResponse.json({ ok: false, error: "UUID inválido." }, { status: 400 });
  }

  const apiBase = env.apiBaseUrl.replace(/\/$/, "");
  const query = new URLSearchParams({
    tokenAPI: env.tokenApi,
    ...(env.cryptKey ? { cryptKey: env.cryptKey } : {}),
  });

  if (forcedUuid) {
    return NextResponse.json({
      ok: true,
      mode: "signers-only",
      signers: await inspectJsonShape(
        `${apiBase}/documents/${encodeURIComponent(forcedUuid)}/list?${query}`,
      ),
    });
  }

  query.set("pg", "1");
  const [safes, folders, listing] = await Promise.all([
    inspectJsonShape(`${apiBase}/safes?${query}`),
    inspectJsonShape(
      `${apiBase}/folders/${encodeURIComponent(env.safeUuid)}/find?${query}`,
    ),
    inspectJsonShape(
      `${apiBase}/documents/${encodeURIComponent(env.safeUuid)}/safe?${query}`,
    ),
  ]);

  return NextResponse.json({
    ok: true,
    config: {
      tokenConfigured: Boolean(env.tokenApi),
      cryptKeyConfigured: Boolean(env.cryptKey),
      safeUuidConfigured: Boolean(env.safeUuid),
      apiOrigin: new URL(env.apiBaseUrl).origin,
    },
    safes,
    folders,
    listing,
  });
}
