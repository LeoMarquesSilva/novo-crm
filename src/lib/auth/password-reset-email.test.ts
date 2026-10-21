import { describe, expect, it } from "vitest";

import { RECOVERY_CONFIRM_PATH } from "./password-recovery";
import { buildPasswordResetEmailHtml, buildPasswordResetLink, firstNameFrom } from "./password-reset-email";

describe("e-mail de redefinição de senha", () => {
  it("monta o link para a página de confirmação, na URL pública do CRM", () => {
    const link = buildPasswordResetLink("https://crm.exemplo.com.br/", "abc123");
    expect(link).toBe(`https://crm.exemplo.com.br${RECOVERY_CONFIRM_PATH}?token_hash=abc123&type=recovery`);
  });

  it("usa o primeiro nome e escapa HTML", () => {
    expect(firstNameFrom("  Maria   Clara Souza ")).toBe("Maria");
    expect(firstNameFrom("")).toBeNull();
    expect(firstNameFrom(null)).toBeNull();

    const html = buildPasswordResetEmailHtml({
      firstName: "<b>Ana</b>",
      link: "https://crm.exemplo.com.br/auth/confirmar?token_hash=x&type=recovery",
      appBaseUrl: "https://crm.exemplo.com.br",
    });
    expect(html).toContain("Olá, &lt;b&gt;Ana&lt;/b&gt;");
    expect(html).not.toContain("<b>Ana</b>");
    expect(html).toContain('href="https://crm.exemplo.com.br/auth/confirmar?token_hash=x&amp;type=recovery"');
    expect(html).toContain('src="https://crm.exemplo.com.br/brand/logo-bismarchi-pires-claro.png"');
    expect(html).toContain("1 hora");
  });

  it("cumprimenta sem nome quando o cadastro não tem", () => {
    const html = buildPasswordResetEmailHtml({ firstName: null, link: "https://x.test/a", appBaseUrl: "https://x.test" });
    expect(html).toMatch(/>Olá<\/h1>/);
  });
});
