import { storeGeneratedDocument } from "@/lib/crm/generated-document-storage";
import type { Json } from "@/lib/supabase/database.types";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function persistGeneratedDocumentVersion(input: {
  supabase: ReturnType<typeof createSupabaseAdminClient>;
  instanceId: string;
  versionNumber: number;
  dataSnapshot: Json;
  filePath: string;
  bytes: Uint8Array;
  contentType: string;
  generatedBy: string;
  instanceStatus?: "generated" | "sent";
}): Promise<{ versionId: string }> {
  await storeGeneratedDocument(
    input.supabase,
    input.filePath,
    input.bytes,
    input.contentType,
  );

  const { data: version, error: versionError } = await input.supabase
    .from("document_versions")
    .insert({
      instance_id: input.instanceId,
      version_number: input.versionNumber,
      data_snapshot: input.dataSnapshot,
      generated_file_path: input.filePath,
      generated_by: input.generatedBy,
    })
    .select("id")
    .single();
  if (versionError) throw versionError;

  const { error: instanceError } = await input.supabase
    .from("document_instances")
    .update({
      current_version: input.versionNumber,
      status: input.instanceStatus ?? "generated",
    })
    .eq("id", input.instanceId);
  if (instanceError) throw instanceError;

  return { versionId: version.id };
}
