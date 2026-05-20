/**
 * GET /api/crm/d4sign/debug
 * Diagnóstico de configuração D4Sign — apenas admin.
 * Retorna o raw da listagem (com token mascarado) para verificar
 * exatamente quais campos a API está retornando.
 *
 * Útil para identificar:
 *  - se `nameDoc` está presente
 *  - rate-limit ativo
 *  - estrutura da resposta (array direto vs {documents:[...]})
 *  - primeiro item ser metadata ({totalOfPages})
 *
 * Remova ou restrinja antes de prod.
 */
import { type NextRequest, NextResponse } from "next/server";
import { requireAuthApi } from "@/lib/auth/server";
import { getD4SignEnv } from "@/lib/d4sign/env";

export async function GET(request: NextRequest) {
  const auth = await requireAuthApi();
  if (!auth.ok) return auth.response;
  if (!auth.profile || auth.profile.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Apenas admin." }, { status: 403 });
  }

  const env = getD4SignEnv();
  const tokenApi = env.tokenApi;
  const safeUuid = env.safeUuid;

  // ?uuid=<docUuid>  →  pula safes/folders/listing e só testa o /list de signatários
  const forceUuid = request.nextUrl.searchParams.get("uuid") ?? null;
  if (forceUuid) {
    const qs = new URLSearchParams({ tokenAPI: tokenApi, ...(env.cryptKey ? { cryptKey: env.cryptKey } : {}) });
    const signersUrl = `${env.apiBaseUrl.replace(/\/$/, "")}/documents/${encodeURIComponent(forceUuid)}/list?${qs.toString()}`;
    let status = 0;
    let rawBody: unknown = null;
    let err: string | null = null;
    try {
      const r = await fetch(signersUrl, { headers: { Accept: "application/json" } });
      status = r.status;
      rawBody = await r.json().catch(async () => ({ raw: await r.text().catch(() => "") }));
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
    }
    const raw = rawBody && typeof rawBody === "object" ? rawBody as Record<string, unknown> : {};
    const listArr = Array.isArray(raw.list) ? raw.list as unknown[]
                  : Array.isArray(rawBody)  ? rawBody as unknown[]
                  : [];
    return NextResponse.json({
      mode: "signers-only",
      documentUuid: forceUuid,
      httpStatus: status,
      error: err,
      topLevelKeys: Object.keys(raw),
      listLength: listArr.length,
      allSigners: listArr,   // raw completo — mostra todos os campos
      rawBody,               // resposta bruta caso a estrutura seja diferente
    });
  }

  const maskSecret = (s: string | undefined) => {
    if (!s) return "(vazio)";
    if (s.length <= 8) return `[${s.length} chars]`;
    return `${s.slice(0, 8)}… [${s.length} chars total]`;
  };

  // Build URLs (sem expor token na resposta)
  const qs = new URLSearchParams({ tokenAPI: tokenApi, pg: "1" });
  if (env.cryptKey) qs.set("cryptKey", env.cryptKey);
  const listingUrl = `${env.apiBaseUrl.replace(/\/$/, "")}/documents/${encodeURIComponent(safeUuid)}/safe?${qs.toString()}`;
  const safesUrl = `${env.apiBaseUrl.replace(/\/$/, "")}/safes?${qs.toString()}`;
  const foldersUrl = `${env.apiBaseUrl.replace(/\/$/, "")}/folders/${encodeURIComponent(safeUuid)}/find?${qs.toString()}`;

  const maskUrl = (url: string) =>
    url
      .replace(encodeURIComponent(tokenApi), "TOKEN_HIDDEN")
      .replace(encodeURIComponent(env.cryptKey ?? ""), "CRYPT_HIDDEN");

  // ── 1. Safes ───────────────────────────────────────────────
  let safesStatus = 0;
  let safesBody: unknown = null;
  let safesError: string | null = null;
  try {
    const r = await fetch(safesUrl, { headers: { Accept: "application/json" } });
    safesStatus = r.status;
    safesBody = await r.json().catch(async () => ({ raw: await r.text().catch(() => "") }));
  } catch (e) {
    safesError = e instanceof Error ? e.message : String(e);
  }

  // ── 2. Folders ──────────────────────────────────────────────
  let foldersStatus = 0;
  let foldersBody: unknown = null;
  let foldersError: string | null = null;
  try {
    const r = await fetch(foldersUrl, { headers: { Accept: "application/json" } });
    foldersStatus = r.status;
    foldersBody = await r.json().catch(async () => ({ raw: await r.text().catch(() => "") }));
  } catch (e) {
    foldersError = e instanceof Error ? e.message : String(e);
  }

  // ── 3. Listing ──────────────────────────────────────────────
  let listingStatus = 0;
  let listingBody: unknown = null;
  let listingError: string | null = null;
  try {
    const r = await fetch(listingUrl, { headers: { Accept: "application/json" } });
    listingStatus = r.status;
    listingBody = await r.json().catch(async () => ({ raw: await r.text().catch(() => "") }));
  } catch (e) {
    listingError = e instanceof Error ? e.message : String(e);
  }

  // Diagnóstico estruturado da listagem
  let listingDiagnostic: Record<string, unknown> = {};
  let firstPendingUuid: string | null = null;
  if (Array.isArray(listingBody)) {
    const arr = listingBody as Record<string, unknown>[];
    // Pular primeiro item se for metadado de paginação (sem uuidDoc)
    const docs = arr.filter((d) => typeof (d.uuidDoc ?? d.uuid_doc) === "string");
    // Encontra primeiro doc "Aguardando" para diagnóstico de signatários
    const pending = docs.find((d) => {
      const sid = d.statusId ?? d.status_id;
      return sid === "2" || sid === "3" || sid === 2 || sid === 3 ||
        (typeof d.statusName === "string" && /aguardando/i.test(d.statusName));
    });
    firstPendingUuid = (typeof pending?.uuidDoc === "string" ? pending.uuidDoc : null) ??
                       (typeof pending?.uuid_doc === "string" ? pending.uuid_doc : null);
    listingDiagnostic = {
      isArray: true,
      length: arr.length,
      docsCount: docs.length,
      firstItemKeys: arr[0] ? Object.keys(arr[0]) : null,
      firstItem: arr[0] ?? null,
      secondItemKeys: arr[1] ? Object.keys(arr[1]) : null,
      secondItem: arr[1] ?? null,
      hasNameDoc: docs.some((d) => typeof d.nameDoc === "string"),
      hasNameDocument: docs.some((d) => typeof d.name_document === "string"),
      hasUuidDoc: docs.some((d) => typeof d.uuidDoc === "string"),
      hasUuidUnderscore: docs.some((d) => typeof d.uuid_doc === "string"),
      firstPendingUuid,
    };
  } else if (typeof listingBody === "object" && listingBody !== null) {
    listingDiagnostic = {
      isArray: false,
      topLevelKeys: Object.keys(listingBody as Record<string, unknown>),
      bodyPreview: JSON.stringify(listingBody).slice(0, 800),
    };
  }

  // ── 4. Signers (/documents/{uuid}/list) — usa primeiro doc "Aguardando" ──
  let signersStatus = 0;
  let signersRaw: unknown = null;
  let signersError: string | null = null;
  let signersDiagnostic: Record<string, unknown> = {};

  if (firstPendingUuid) {
    const signersUrl = `${env.apiBaseUrl.replace(/\/$/, "")}/documents/${encodeURIComponent(firstPendingUuid)}/list${new URLSearchParams({ tokenAPI: tokenApi, ...(env.cryptKey ? { cryptKey: env.cryptKey } : {}) }).toString() ? `?${new URLSearchParams({ tokenAPI: tokenApi, ...(env.cryptKey ? { cryptKey: env.cryptKey } : {}) }).toString()}` : ""}`;
    try {
      const r = await fetch(signersUrl, { headers: { Accept: "application/json" } });
      signersStatus = r.status;
      signersRaw = await r.json().catch(async () => ({ raw: await r.text().catch(() => "") }));
    } catch (e) {
      signersError = e instanceof Error ? e.message : String(e);
    }

    // Diagnóstico: extrair chaves do primeiro signatário
    if (signersRaw && typeof signersRaw === "object") {
      const raw = signersRaw as Record<string, unknown>;
      const listArr = Array.isArray(raw.list) ? (raw.list as Record<string, unknown>[])
                    : Array.isArray(signersRaw)  ? (signersRaw as Record<string, unknown>[])
                    : [];
      const first = listArr[0] ?? null;
      signersDiagnostic = {
        documentUuid: firstPendingUuid,
        topLevelKeys: Object.keys(raw),
        listLength: listArr.length,
        firstSignerKeys: first ? Object.keys(first) : null,
        firstSigner: first,  // raw completo do primeiro signatário
        allSigners: listArr,  // todos os signatários raw
      };
    }
  } else {
    signersDiagnostic = { note: "Nenhum documento 'Aguardando' encontrado na listagem." };
  }

  return NextResponse.json({
    config: {
      tokenApi: maskSecret(tokenApi),
      cryptKey: maskSecret(env.cryptKey),
      safeUuid: safeUuid || "(vazio)",
      apiBaseUrl: env.apiBaseUrl,
    },
    safes: {
      url: maskUrl(safesUrl),
      httpStatus: safesStatus,
      error: safesError,
      bodyPreview:
        typeof safesBody === "string"
          ? String(safesBody).slice(0, 500)
          : safesBody,
    },
    folders: {
      url: maskUrl(foldersUrl),
      httpStatus: foldersStatus,
      error: foldersError,
      bodyPreview:
        typeof foldersBody === "string"
          ? String(foldersBody).slice(0, 500)
          : foldersBody,
    },
    listing: {
      url: maskUrl(listingUrl),
      httpStatus: listingStatus,
      error: listingError,
      diagnostic: listingDiagnostic,
    },
    signers: {
      httpStatus: signersStatus,
      error: signersError,
      diagnostic: signersDiagnostic,
    },
  });
}
