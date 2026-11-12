import { NextRequest, NextResponse } from "next/server";
import type { ClienteCadastroRow } from "@/lib/crm/cliente-cadastro-cp-fields";
import { buildClienteLookupResult } from "@/lib/crm/lookup-cliente-by-document";
import { digitsOnly, isCnpj, isCpf } from "@/lib/crm/normalize-document";
import { requireAuthApi } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { listarClientesDaCarteiraAtiva } from "@/lib/crm/clientes-carteira-ativa";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthApi();
    if (!auth.ok) return auth.response;

    const documento = request.nextUrl.searchParams.get("documento")?.trim() ?? "";
    const digits = digitsOnly(documento);
    if (!isCpf(digits) && !isCnpj(digits)) {
      return NextResponse.json({
        ok: true,
        data: { found: false, matchedBy: null, cliente: null, contratos: [] },
      });
    }

    const supabase = createSupabaseAdminClient();
    // Cliente existente = carteira ativa do escritório (OrquestrAI); lead que nunca virou cliente não conta
    // e não dispara a pergunta "contrato novo ou aditivo" (12/11/2026).
    let clientes: Array<ClienteCadastroRow & { grupo_id: string | null }>;
    try {
      clientes = await listarClientesDaCarteiraAtiva(
        supabase,
        "id, razao_social, documento, logradouro, numero, complemento, bairro, cidade, uf, cep, email_principal, telefone_principal",
      );
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : "Falha ao consultar clientes." },
        { status: 500 },
      );
    }

    const lookup = buildClienteLookupResult({
      clientes,
      documento,
      contratosByClienteId: new Map(),
    });

    if (!lookup.cliente) {
      return NextResponse.json({
        ok: true,
        data: lookup,
      });
    }

    const { data: contratos, error: contratosError } = await supabase
      .from("contratos")
      .select("id, titulo, status, vigente_de, cliente_id")
      .eq("cliente_id", lookup.cliente.id)
      .order("created_at", { ascending: false });

    if (contratosError) {
      return NextResponse.json({ ok: false, error: contratosError.message }, { status: 500 });
    }

    const contratosByClienteId = new Map<
      string,
      Array<{ id: string; titulo: string; status: string; vigente_de: string | null }>
    >();
    for (const row of contratos ?? []) {
      const cid = row.cliente_id as string | null;
      if (!cid) continue;
      const list = contratosByClienteId.get(cid) ?? [];
      list.push({
        id: row.id,
        titulo: row.titulo,
        status: row.status,
        vigente_de: row.vigente_de,
      });
      contratosByClienteId.set(cid, list);
    }

    const data = buildClienteLookupResult({
      clientes,
      documento,
      contratosByClienteId,
    });

    return NextResponse.json({ ok: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
