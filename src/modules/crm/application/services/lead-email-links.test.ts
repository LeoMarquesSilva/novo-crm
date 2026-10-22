import { afterEach, describe, expect, it, vi } from "vitest";

import { buildDueEmail, buildSemDueEmail } from "./build-lead-notification-email";
import { SAMPLE_LEAD_EMAIL_PAYLOAD, SAMPLE_LEAD_EMAIL_PAYLOAD_SEM_DUE } from "./lead-email-template-vars";
import { buildLeadDetailUrl } from "./send-lead-notification-email";

const leadUrl = "https://crm.bp.com.br/crm/leads/11a02ae4-5c64-4b39-8963-f1236f42da86";

describe("botões do e-mail de novo lead", () => {
  it.each([
    ["com due", () => buildDueEmail({ ...SAMPLE_LEAD_EMAIL_PAYLOAD, lead_url: leadUrl } as never)],
    ["sem due", () => buildSemDueEmail({ ...SAMPLE_LEAD_EMAIL_PAYLOAD_SEM_DUE, lead_url: leadUrl } as never)],
  ])("%s: apontam para a ficha do lead no CRM, não para o RD Station", (_label, build) => {
    const { html } = build();
    expect(html).not.toContain("rdstation");
    expect(html).toContain(`href="${leadUrl}"`);
  });
});

describe("buildLeadDetailUrl", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("monta a URL absoluta da ficha", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://crm.bp.com.br/");
    expect(buildLeadDetailUrl("lead-1")).toBe("https://crm.bp.com.br/crm/leads/lead-1");
    expect(buildLeadDetailUrl(null)).toBe("https://crm.bp.com.br/crm/leads");
  });

  it("sem URL base configurada devolve null", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("VERCEL_URL", "");
    expect(buildLeadDetailUrl("lead-1")).toBeNull();
  });
});
