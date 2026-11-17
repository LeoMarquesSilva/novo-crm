import { NextResponse } from "next/server";
import { requireAuthApi } from "@/lib/auth/server";
import { loadPipelineLeads } from "@/lib/crm/pipeline-leads";
import { internalErrorResponse } from "@/lib/http/api-errors";

export async function GET() {
  try {
    const auth = await requireAuthApi();
    if (!auth.ok) return auth.response;

    const data = await loadPipelineLeads();
    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    return internalErrorResponse("crm/leads", error, "Falha inesperada ao carregar leads.");
  }
}
