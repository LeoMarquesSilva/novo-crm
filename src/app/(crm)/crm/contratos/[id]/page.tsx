import { notFound } from "next/navigation";

import { ContractDetailShell } from "@/components/crm/contracts/contract-detail-shell";
import { canAccessContractCapability } from "@/lib/auth/crm-access-policy";
import { requireAuth } from "@/lib/auth/server";
import { maybeBackfillImportedDraftRateio } from "@/lib/contract-import/persist-draft";
import { getContractDetail } from "@/modules/contracts/infrastructure/contract-queries";

export const dynamic = "force-dynamic";

export default async function ContractDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, { profile }] = await Promise.all([params, requireAuth("/crm/contratos")]);
  try {
    await maybeBackfillImportedDraftRateio(id);
  } catch {
    /* a ficha continua abrindo; o fetch SIOE não engole o erro no process/review */
  }
  const contract = await getContractDetail(id);
  if (!contract) notFound();
  return <ContractDetailShell contract={contract} canConfigure={canAccessContractCapability({ role: profile.role, capability: "configure" })} />;
}
