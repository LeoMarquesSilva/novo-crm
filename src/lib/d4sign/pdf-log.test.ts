import { describe, expect, it } from "vitest";

import { parseD4SignPdfLog } from "./pdf-log";

// Trecho real (Armor, 2026-05-18), com quebras de linha como sai da extração.
const LOG = `Eventos do documento
18 May 2026, 17:49:49
Documento cf35e8ﬀ-5633-4d47-90ef-c7051a925d9e criado por CAIO AUGUSTO DE ALCANTARA CESAR SILVA
(1eaf9e83-8a63-468a-b5f0-90aade8fb565). Email:caio.silva@bismarchipires.com.br. - DATE_ATOM:
2026-05-18T17:49:49-03:00
18 May 2026, 17:54:24
CAIO AUGUSTO DE ALCANTARA CESAR SILVA (1eaf9e83-8a63-468a-b5f0-90aade8fb565). Email:
caio.silva@bismarchipires.com.br. REMOVEU o signatário x@y.com - DATE_ATOM:
2026-05-18T17:54:24-03:00
18 May 2026, 17:57:27
Assinaturas iniciadas por CAIO AUGUSTO DE ALCANTARA CESAR SILVA (1eaf9e83-8a63-468a-
b5f0-90aade8fb565). Email: caio.silva@bismarchipires.com.br. - DATE_ATOM: 2026-05-18T17:57:27-03:00`;

describe("parseD4SignPdfLog", () => {
  it("lê quem criou e quem enviou para assinatura", () => {
    expect(parseD4SignPdfLog(LOG)).toEqual({
      createdBy: {
        name: "Caio Augusto de Alcantara Cesar Silva",
        email: "caio.silva@bismarchipires.com.br",
        at: "2026-05-18T20:49:49.000Z",
      },
      sentBy: {
        name: "Caio Augusto de Alcantara Cesar Silva",
        email: "caio.silva@bismarchipires.com.br",
        at: "2026-05-18T20:57:27.000Z",
      },
    });
  });

  it("devolve null sem log de eventos", () => {
    expect(parseD4SignPdfLog("CONTRATO DE HONORÁRIOS ... cláusula 1")).toEqual({ createdBy: null, sentBy: null });
  });
});
