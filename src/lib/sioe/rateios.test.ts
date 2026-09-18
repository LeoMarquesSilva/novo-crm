import { describe, expect, it } from "vitest";
import { documentsForSioeRateio } from "@/lib/sioe/rateios";

describe("documentsForSioeRateio", () => {
  it("exclui o CNPJ do escritório e deduplica a contratante", () => {
    expect(
      documentsForSioeRateio([
        "60.494.416/0033-12",
        "60494416003312",
        "26.080.152/0001-35",
        "26080152000135",
        "",
        null,
      ]),
    ).toEqual(["60494416003312"]);
  });

  it("mantém a matriz da Ingevity e ignora a sociedade de advogados", () => {
    expect(documentsForSioeRateio(["30381107000198", "26080152000135"])).toEqual(["30381107000198"]);
  });
});
