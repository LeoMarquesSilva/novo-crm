import { describe, expect, it } from "vitest";

import {
  CONTRACT_CLOSING_STATUS_LABELS,
  CONTRACT_LIFECYCLE_LABELS,
  CONTRACT_SIGNATURE_LABELS,
  statusLabel,
} from "./contract-status-labels";

describe("statusLabel", () => {
  it("troca o código do enum pelo rótulo", () => {
    expect(statusLabel(CONTRACT_CLOSING_STATUS_LABELS, "em_revisao")).toBe("Em revisão");
    expect(statusLabel(CONTRACT_CLOSING_STATUS_LABELS, "lancado_vios")).toBe("Lançado no VIOS");
    expect(statusLabel(CONTRACT_LIFECYCLE_LABELS, "ativo")).toBe("Ativo");
    expect(statusLabel(CONTRACT_SIGNATURE_LABELS, "assinado")).toBe("Assinado");
  });

  it("código desconhecido sai sem sublinhado e vazio vira travessão", () => {
    expect(statusLabel(CONTRACT_CLOSING_STATUS_LABELS, "aguardando_cliente")).toBe("Aguardando cliente");
    expect(statusLabel(CONTRACT_CLOSING_STATUS_LABELS, null)).toBe("—");
  });
});
