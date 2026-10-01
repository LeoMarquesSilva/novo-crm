import { describe, expect, it } from "vitest";

import { d4signSafariFixUrl } from "./embed";

const SAFARI = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const CHROME = "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

describe("d4signSafariFixUrl", () => {
  it("manda o Safari sem cookie para o safari_fix e volta para a página", () => {
    expect(
      d4signSafariFixUrl({ userAgent: SAFARI, cookie: "", href: "https://crm.example/crm/assinar-contratos?tab=x#a" }),
    ).toBe(
      "https://secure.d4sign.com.br/embed/safari_fix?param=tab%3Dx&r=https%3A%2F%2Fcrm.example%2Fcrm%2Fassinar-contratos",
    );
  });

  it("não redireciona Chrome nem Safari que já tem o cookie", () => {
    expect(d4signSafariFixUrl({ userAgent: CHROME, cookie: "", href: "https://crm.example/" })).toBeNull();
    expect(d4signSafariFixUrl({ userAgent: SAFARI, cookie: "a=1; fixed=fixed", href: "https://crm.example/" })).toBeNull();
  });
});
