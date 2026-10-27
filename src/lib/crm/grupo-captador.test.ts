import { describe, expect, it } from "vitest";

import { createSupabaseFake } from "@/test/supabase-fake";
import { loadCaptadoresByGrupo } from "./grupo-captador";

describe("loadCaptadoresByGrupo", () => {
  it("escolhe o lead mais recente dos clientes de cada grupo", async () => {
    const fake = createSupabaseFake({
      tables: {
        clientes: {
          awaited: {
            data: [
              { id: "cli-1", grupo_id: "grupo-a" },
              { id: "cli-2", grupo_id: "grupo-a" },
              { id: "cli-3", grupo_id: "grupo-b" },
            ],
            error: null,
          },
        },
        lead_intakes: {
          awaited: { data: [{ oportunidade_id: "opp-2", solicitante_nome: " Ana Captadora " }], error: null },
        },
        oportunidades: {
          awaited: {
            data: [
              { id: "opp-1", cliente_id: "cli-1", solicitante_email: "velho@bp.com.br", updated_at: "2026-01-01T00:00:00Z" },
              { id: "opp-2", cliente_id: "cli-2", solicitante_email: " ana@bp.com.br ", updated_at: "2026-05-01T00:00:00Z" },
              { id: "opp-9", cliente_id: "cli-sem-grupo", solicitante_email: "x@bp.com.br", updated_at: "2026-09-01T00:00:00Z" },
            ],
            error: null,
          },
        },
      },
    });

    const result = await loadCaptadoresByGrupo(fake.client as never);

    expect(result.get("grupo-a")).toEqual({ oportunidadeId: "opp-2", nome: "Ana Captadora", email: "ana@bp.com.br" });
    expect(result.has("grupo-b")).toBe(false);
    expect(result.size).toBe(1);
    // Os leads saem numa consulta só, sem lotes de `cliente_id`.
    expect(fake.calls.filter((call) => call.table === "oportunidades" && call.method === "in")).toHaveLength(0);
  });

  it("lê além das 1000 linhas que o PostgREST devolve por consulta", async () => {
    let page = 0;
    const fake = createSupabaseFake({
      tables: {
        clientes: {
          awaited: () => {
            page += 1;
            const size = page === 1 ? 1000 : 1;
            return {
              data: Array.from({ length: size }, (_, index) => ({ id: `cli-${page}-${index}`, grupo_id: "grupo-a" })),
              error: null,
            };
          },
        },
        oportunidades: {
          awaited: {
            data: [{ id: "opp-1", cliente_id: "cli-2-0", solicitante_email: null, updated_at: "2026-01-01T00:00:00Z" }],
            error: null,
          },
        },
        lead_intakes: { awaited: { data: [], error: null } },
      },
    });

    const result = await loadCaptadoresByGrupo(fake.client as never);

    expect(page).toBe(2);
    expect(fake.calls).toContainEqual({ table: "clientes", method: "range", args: [1000, 1999] });
    expect(result.get("grupo-a")?.oportunidadeId).toBe("opp-1");
  });
});
