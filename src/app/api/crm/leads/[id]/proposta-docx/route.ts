import { format } from "date-fns";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildPropostaDocxTemplateData } from "@/lib/crm/proposta-docx-data";
import { parseEmpresasIntakeFromRecord } from "@/lib/crm/parse-lead-intake-empresas";
import { loadProposalCatalog } from "@/lib/crm/proposal-catalog-db";
import { readModeloPropostaTemplateBuffer, renderPropostaDocx } from "@/lib/crm/render-proposta-docx";
import { valueJsonToDisplayString } from "@/lib/crm/pipeline-field-values";

function sanitizeFilenamePart(s: string): string {
  return s
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "lead";
}

async function loadPipelineFieldByCode(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  oportunidadeId: string,
): Promise<Record<string, string>> {
  const { data: fvRows, error: fvErr } = await supabase
    .from("field_values")
    .select("field_definition_id, value_json")
    .eq("entity_name", "oportunidade")
    .eq("entity_record_id", oportunidadeId);

  if (fvErr) throw fvErr;
  const rows = fvRows ?? [];
  if (rows.length === 0) return {};

  const defIds = [...new Set(rows.map((r) => r.field_definition_id))];
  const { data: defRows, error: defErr } = await supabase
    .from("field_definitions")
    .select("id, field_code")
    .in("id", defIds)
    .eq("entity_name", "oportunidade");

  if (defErr) throw defErr;
  const idToCode = new Map((defRows ?? []).map((d) => [d.id, d.field_code]));
  const out: Record<string, string> = {};
  for (const r of rows) {
    const code = idToCode.get(r.field_definition_id);
    if (code) {
      out[code] = valueJsonToDisplayString(r.value_json);
    }
  }
  return out;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabaseAuth = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
    }

    const admin = createSupabaseAdminClient();
    const { data: profile, error: profileError } = await admin
      .from("app_users")
      .select("role")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (profileError || !profile || (profile.role !== "admin" && profile.role !== "comercial")) {
      return NextResponse.json(
        { ok: false, error: "Apenas comercial ou admin pode gerar a proposta." },
        { status: 403 },
      );
    }

    const { id: rawId } = await params;
    const id = decodeURIComponent(rawId);
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      return NextResponse.json({ ok: false, error: "ID inválido." }, { status: 400 });
    }

    const { data: op, error: opErr } = await admin
      .from("oportunidades")
      .select("id, solicitante_nome, etapa")
      .eq("id", id)
      .maybeSingle();

    if (opErr) {
      return NextResponse.json({ ok: false, error: opErr.message }, { status: 500 });
    }
    if (!op) {
      return NextResponse.json({ ok: false, error: "Negociação não encontrada." }, { status: 404 });
    }

    const { data: intake, error: intakeErr } = await admin
      .from("lead_intakes")
      .select("*")
      .eq("oportunidade_id", id)
      .maybeSingle();

    if (intakeErr) {
      return NextResponse.json({ ok: false, error: intakeErr.message }, { status: 500 });
    }

    const empresasIntake =
      intake && typeof intake === "object"
        ? parseEmpresasIntakeFromRecord(intake as Record<string, unknown>)
        : [];

    const fieldByCode = await loadPipelineFieldByCode(admin, id);
    const cpPropostaEmpresasJson = fieldByCode["cp_proposta_empresas_json"];
    const cpEscopoDetalheJson = fieldByCode["cp_escopo_detalhe_json"] ?? "";
    const catalog = await loadProposalCatalog(admin);

    const generatedAt = new Date();
    const data = buildPropostaDocxTemplateData({
      empresasIntake,
      cpPropostaEmpresasJson,
      fieldByCode,
      cpEscopoDetalheJson,
      generatedAt,
      scopeCatalog: catalog.scope,
      investmentCatalog: catalog.investment,
    });

    const templateBuf = readModeloPropostaTemplateBuffer();
    const outBuf = renderPropostaDocx(templateBuf, data);

    const base = sanitizeFilenamePart(String(op.solicitante_nome ?? "proposta"));
    const filename = `Proposta-${base}-${format(generatedAt, "yyyy-MM-dd-HHmm")}.docx`;

    return new NextResponse(new Uint8Array(outBuf), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Falha ao gerar o documento.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
