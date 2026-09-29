import { NextResponse } from "next/server";
import { requireAuthApi } from "@/lib/auth/server";
import { clienteCadastroToCpFields } from "@/lib/crm/cliente-cadastro-cp-fields";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuthApi();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const clienteId = decodeURIComponent(id);
    const supabase = createSupabaseAdminClient();

    const { data: cliente, error } = await supabase
      .from("clientes")
      .select(
        "id, razao_social, documento, logradouro, numero, complemento, bairro, cidade, uf, cep, email_principal, telefone_principal",
      )
      .eq("id", clienteId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    if (!cliente) {
      return NextResponse.json({ ok: false, error: "Cliente não encontrado." }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      data: {
        cliente,
        cpFields: clienteCadastroToCpFields(cliente),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
