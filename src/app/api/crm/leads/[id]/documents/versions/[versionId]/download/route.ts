import { NextResponse } from "next/server";

import { requireAuthApi } from "@/lib/auth/server";
import {
  GENERATED_DOCUMENTS_BUCKET,
  generatedDocumentObjectExists,
} from "@/lib/crm/generated-document-storage";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) {
  try {
    const auth = await requireAuthApi();
    if (!auth.ok) return auth.response;
    if (!auth.profile) {
      return NextResponse.json({ ok: false, error: "Perfil CRM não encontrado." }, { status: 403 });
    }

    const { id: rawId, versionId: rawVersionId } = await params;
    const oportunidadeId = decodeURIComponent(rawId);
    const versionId = decodeURIComponent(rawVersionId);
    const supabase = createSupabaseAdminClient();

    const { data: version, error: versionError } = await supabase
      .from("document_versions")
      .select("id, instance_id, generated_file_path")
      .eq("id", versionId)
      .maybeSingle();
    if (versionError) throw versionError;
    if (!version) {
      return NextResponse.json({ ok: false, error: "Versão não encontrada." }, { status: 404 });
    }

    const { data: instance, error: instanceError } = await supabase
      .from("document_instances")
      .select("oportunidade_id")
      .eq("id", version.instance_id)
      .maybeSingle();
    if (instanceError) throw instanceError;
    if (!instance || instance.oportunidade_id !== oportunidadeId) {
      return NextResponse.json(
        { ok: false, error: "A versão não pertence a esta negociação." },
        { status: 404 },
      );
    }

    const filePath = version.generated_file_path?.trim();
    if (!filePath || !(await generatedDocumentObjectExists(supabase, filePath))) {
      return NextResponse.json(
        { ok: false, error: "O arquivo desta versão não está disponível no Storage." },
        { status: 404 },
      );
    }

    const filename = filePath.split("/").at(-1) || "documento";
    const { data: signed, error: signedError } = await supabase.storage
      .from(GENERATED_DOCUMENTS_BUCKET)
      .createSignedUrl(filePath, 120, { download: filename });
    if (signedError || !signed?.signedUrl) {
      throw signedError ?? new Error("Não foi possível gerar o link de download.");
    }

    return NextResponse.json({ ok: true, signedUrl: signed.signedUrl, filename });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao preparar o download do documento.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
