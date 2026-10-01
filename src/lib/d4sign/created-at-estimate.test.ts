import { describe, expect, it } from "vitest";

import { createdAtFromName, createdAtFromUuidV7, estimateD4SignCreatedAt } from "./created-at-estimate";

const NOW = new Date("2026-10-01T12:00:00Z");

describe("estimateD4SignCreatedAt", () => {
  it("lê o instante de um UUIDv7 da D4Sign", () => {
    expect(createdAtFromUuidV7("01a0ef04-8caf-7391-b038-dd25014749cd", NOW)?.slice(0, 10)).toBe("2026-09-29");
  });

  it("ignora UUIDv4", () => {
    expect(createdAtFromUuidV7("bf424b1c-ec44-4410-8000-000000000000", NOW)).toBeNull();
  });

  it("usa a data do nome do arquivo", () => {
    expect(createdAtFromName("2026 02 19 CONTRATO DE HONORARIOS EDITAL pdf", NOW)).toBe("2026-02-19T15:00:00.000Z");
    expect(createdAtFromName("2026-05-18 CONTRATO", NOW)).toBe("2026-05-18T15:00:00.000Z");
  });

  it("recusa nome sem data, data inválida ou no futuro", () => {
    expect(createdAtFromName("NIGRO ALUMÍNIO LTDA v2 docx pdf", NOW)).toBeNull();
    expect(createdAtFromName("2026 02 31 CONTRATO", NOW)).toBeNull();
    expect(createdAtFromName("2027 01 10 CONTRATO", NOW)).toBeNull();
  });

  it("prefere o UUIDv7 ao nome", () => {
    expect(
      estimateD4SignCreatedAt("01a0ef04-8caf-7391-b038-dd25014749cd", "2026 01 01 X", NOW)?.slice(0, 10),
    ).toBe("2026-09-29");
    expect(estimateD4SignCreatedAt("bf424b1c-ec44-4410-8000-000000000000", "2026 01 01 X", NOW)).toBe(
      "2026-01-01T15:00:00.000Z",
    );
  });
});
