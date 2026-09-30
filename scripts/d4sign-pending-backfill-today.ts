/**
 * Espera a cota D4Sign liberar e importa as fases 3 e 2 até fechar o ciclo.
 * Uso: node --env-file=.env.local ./node_modules/tsx/dist/cli.mjs scripts/d4sign-pending-backfill-today.ts
 */
import { getD4SignQuotaStatus } from "../src/lib/d4sign/api-usage";
import { runPendingSignatureBackfill } from "../src/lib/d4sign/pending-backfill";

const MAX_WINDOWS = 4;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stamp(): string {
  return new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

async function waitForQuota(): Promise<void> {
  const started = Date.now();
  for (;;) {
    const quota = await getD4SignQuotaStatus();
    const resetMs = quota.resetAt ? new Date(quota.resetAt).getTime() - Date.now() : 0;
    console.log(
      `[${stamp()}] cota ${quota.used}/${quota.limit}, livres ${quota.remaining}` +
        (quota.resetAt ? `, próxima vaga ${new Date(quota.resetAt).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : ""),
    );
    if (quota.remaining >= 8) return;
    if (Date.now() - started > 70 * 60 * 1000 && quota.remaining >= 1) return;
    const pause = quota.remaining <= 0 && resetMs > 0 ? Math.min(resetMs + 2_000, 60_000) : 20_000;
    await sleep(Math.max(5_000, pause));
  }
}

async function main() {
  for (let window = 1; window <= MAX_WINDOWS; window++) {
    await waitForQuota();
    console.log(`[${stamp()}] janela ${window}: puxando contratos sem assinatura finalizada`);
    const result = await runPendingSignatureBackfill({ maxRequests: 10 });
    console.log(`[${stamp()}] resultado ${JSON.stringify(result)}`);
    if (result.finishedCycle) {
      console.log(`[${stamp()}] ciclo concluído`);
      return;
    }
    if (!result.ok && !result.rateLimited) {
      console.error(`[${stamp()}] falhou: ${result.error ?? "erro desconhecido"}`);
      process.exit(1);
    }
  }
  console.error(`[${stamp()}] falhou: ainda há páginas depois de ${MAX_WINDOWS} janelas`);
  process.exit(1);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[${stamp()}] falhou: ${message}`);
  process.exit(1);
});
