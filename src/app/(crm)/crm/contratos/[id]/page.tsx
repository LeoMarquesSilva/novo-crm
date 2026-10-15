import { notFound } from "next/navigation";

import { ContractDetailShell } from "@/components/crm/contracts/contract-detail-shell";
import { canConfigureContract } from "@/lib/auth/crm-access-policy";
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
  const canConfigure = canConfigureContract({
    role: profile.role,
    contract: {
      opportunityId: contract.opportunityId,
      opportunityStage: contract.opportunityStage,
      versionNumber: contract.configuration ? 1 : null,
      versionStatus: contract.configuration ? "rascunho" : null,
    },
  });
  return <ContractDetailShell contract={contract} canConfigure={canConfigure} />;
}
