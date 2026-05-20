import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const OAUTH_ROW_ID = "default";

export async function POST() {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("lead_email_microsoft_oauth").delete().eq("id", OAUTH_ROW_ID);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
