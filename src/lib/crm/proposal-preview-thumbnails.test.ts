// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  PROPOSAL_PREVIEW_OVERLAY_TEXT,
  PROPOSAL_PREVIEW_PAGE_HEIGHT_PX,
  PROPOSAL_PREVIEW_REFERENCE,
  PROPOSAL_PREVIEW_VIGENCIA_BOX_PCT,
  capaFieldsFromPreviewPage,
  capaOverlays,
  classifyProposalPreviewStaticPage,
  extractCapaFields,
  extractFechamentoVigencia,
  fechamentoOverlays,
  findProposalVigenciaDateInPages,
  findProposalVigenciaPageIndex,
  isAssinaturaSociosPage,
  isCapaDecorativeLine,
  normalizeCapaClienteLine,
  resolveProposalPreviewStaticThumbnail,
  resolveProposalPreviewTailLayout,
  resolveScopeLetterheadAsset,
} from "./proposal-preview-thumbnails";

function wordPage(html: string) {
  const page = document.createElement("section");
  page.innerHTML = `<article>${html}</article>`;
  return page;
}

describe("proposal-preview-thumbnails", () => {
  it("extrai campos mutáveis da capa", () => {
    const page = wordPage(`
      <p>PROPOSTA DE</p>
      <p>SERVIÇOS JURÍDICOS</p>
      <p>ACME Holding Ltda.</p>
      <p>Enviado por: Maria Silva</p>
      <p>Campinas/SP, 29/09/2026</p>
    `);
    expect(extractCapaFields(page)).toEqual({
      cliente: "ACME Holding Ltda.",
      dataLinha: "Campinas/SP, 29/09/2026",
      enviadoPor: "Maria Silva",
    });
    expect(capaOverlays(extractCapaFields(page)).some((o) => o.text.includes("ACME"))).toBe(true);
  });

  it("monta capa a partir do templateData canônico", () => {
    expect(
      capaFieldsFromPreviewPage({
        empresa: "ACME Holding Ltda.",
        responsavel: "Maria Silva",
        dataProposta: "29 de setembro de 2026",
      }),
    ).toEqual({
      cliente: "ACME Holding Ltda.",
      enviadoPor: "Maria Silva",
      dataLinha: "Campinas/SP, 29 de setembro de 2026",
    });
  });

  it("capa canônica gera só três overlays (cliente, enviado, data)", () => {
    const overlays = capaOverlays(
      capaFieldsFromPreviewPage({
        empresa: "Cliente X",
        responsavel: "Fulano",
        dataProposta: "1/1/2026",
      }),
    );
    expect(overlays).toHaveLength(3);
    expect(overlays.map((o) => o.text)).toEqual([
      "Cliente X",
      "Enviado por: Fulano",
      "Campinas/SP, 1/1/2026",
    ]);
    expect(overlays.some((o) => /3254-6446|www\./i.test(o.text))).toBe(false);
  });

  it("posiciona overlays da capa conforme guia PDF (percentuais)", () => {
    const overlays = capaOverlays({
      cliente: "X",
      dataLinha: "Campinas/SP, 1/1/2026",
      enviadoPor: "Y",
    });
    expect(overlays[0]).toMatchObject({ leftPct: 14.07, topPct: 48.02, fontSizePx: 36 });
    expect(overlays[1]).toMatchObject({ leftPct: 14.07, topPct: 76.01, fontSizePx: 12 });
    expect(overlays[2]).toMatchObject({ leftPct: 14.23, topPct: 79.15, fontSizePx: 12 });
  });

  it("prefere capa canônica no resolve da miniatura estática", () => {
    const page = wordPage(`<p>(19) 3254-6446 | www.bismarchipires.com.br</p>`);
    const resolved = resolveProposalPreviewStaticThumbnail("capa", page, {
      cliente: "Só Canônico",
      dataLinha: "Campinas/SP, hoje",
      enviadoPor: "Maria",
    });
    expect(resolved.overlays[0]?.text).toBe("Só Canônico");
    expect(resolved.overlays).toHaveLength(3);
  });

  it("ignora linha de contato ao extrair cliente do DOCX", () => {
    const page = wordPage(`
      <p>PROPOSTA DE</p>
      <p>SERVIÇOS JURÍDICOS</p>
      <p>(19) 3254-6446 | www.bismarchipires.com.br | contato@bismarchipires.com.br</p>
      <p>ENGEFAZ ENGENHARIA LTDA</p>
    `);
    expect(extractCapaFields(page).cliente).toBe("ENGEFAZ ENGENHARIA LTDA");
  });

  it("ignora linhas institucionais da capa ao extrair cliente", () => {
    const page = wordPage(`
      <p>ENGEFAZ ENGENHARIA LTDA PROPOSTA DE SERVIÇOS JURÍDICOS</p>
      <p>Engenharia Faz Ltda.</p>
    `);
    expect(extractCapaFields(page).cliente).toBe("Engenharia Faz Ltda.");
  });

  it("usa cores corretas nos overlays da capa", () => {
    const overlays = capaOverlays({
      cliente: "Cliente",
      dataLinha: "Campinas/SP",
      enviadoPor: "Maria",
    });
    const titulo = overlays.find((o) => o.text === "Cliente");
    expect(titulo?.color).toBe(PROPOSAL_PREVIEW_OVERLAY_TEXT.capaCliente);
    expect(overlays.filter((o) => o.text.startsWith("Enviado")).every(
      (o) => o.color === PROPOSAL_PREVIEW_OVERLAY_TEXT.capaMeta,
    )).toBe(true);
    expect(overlays.every((o) => o.mask !== true)).toBe(true);
  });

  it("ignora fileira de traços decorativos na capa", () => {
    expect(isCapaDecorativeLine("- - - - - -")).toBe(true);
    const page = wordPage(`
      <p>PROPOSTA DE</p>
      <p>- - - - - -</p>
      <p>SERVIÇOS JURÍDICOS</p>
      <p>ENGEFAZ ENGENHARIA LTDA</p>
    `);
    expect(extractCapaFields(page).cliente).toBe("ENGEFAZ ENGENHARIA LTDA");
    expect(capaOverlays(extractCapaFields(page)).some((o) => /-/.test(o.text))).toBe(false);
  });

  it("normaliza LT-DA colado ao título da proposta", () => {
    expect(normalizeCapaClienteLine("ENGEFAZ LT-DAPROPOSTA DE SERVIÇOS JURÍDICOS")).toBe(
      "ENGEFAZ LTDA",
    );
  });

  it("resolve timbrado de escopo por ordem", () => {
    expect(resolveScopeLetterheadAsset(0)).toBe(PROPOSAL_PREVIEW_REFERENCE.escopoA);
    expect(resolveScopeLetterheadAsset(1)).toBe(PROPOSAL_PREVIEW_REFERENCE.escopoB);
    expect(resolveScopeLetterheadAsset(2)).toBe(PROPOSAL_PREVIEW_REFERENCE.escopoC);
    expect(resolveScopeLetterheadAsset(4)).toBe(PROPOSAL_PREVIEW_REFERENCE.escopoC);
  });

  it("extrai vigência do fechamento e monta overlay na folha de assinaturas", () => {
    const page = wordPage(`
      <p>Gustavo Bismarchi Motta</p>
      <p>Ricardo Viscardi Pires</p>
      <p>Vigência da Proposta: 06/10/2026</p>
    `);
    expect(extractFechamentoVigencia(page)).toBe("06/10/2026");
    const overlays = fechamentoOverlays("06/10/2026");
    expect(overlays[0]?.text).toBe("Vigência da Proposta: 06/10/2026");
  });

  it("assinatura tem um único overlay de vigência, dentro da caixa, com a data canônica", () => {
    const assinatura = wordPage(`
      <p>Gustavo Bismarchi Motta</p>
      <p>Ricardo Viscardi Pires</p>
      <p>Vigência da Proposta: 01/01/2020</p>
    `);
    const { asset, overlays } = resolveProposalPreviewStaticThumbnail("assinatura", assinatura, {
      vigenciaOverride: "13/10/2026",
    });
    expect(asset).toBe(PROPOSAL_PREVIEW_REFERENCE.assinatura);
    const vigencias = overlays.filter((o) => /Vig[eê]ncia/i.test(o.text));
    expect(vigencias).toHaveLength(1);
    const [overlay] = vigencias;
    expect(overlay.text).toBe("Vigência da Proposta: 13/10/2026");

    const box = PROPOSAL_PREVIEW_VIGENCIA_BOX_PCT;
    const heightPct = (overlay.fontSizePx * (overlay.lineHeight ?? 1.2) * 100) / PROPOSAL_PREVIEW_PAGE_HEIGHT_PX;
    expect(overlay.leftPct).toBeGreaterThan(box.left);
    expect(overlay.leftPct + (overlay.maxWidthPct ?? 0)).toBeLessThanOrEqual(box.right + 0.01);
    expect(overlay.topPct).toBeGreaterThan(box.top);
    expect(overlay.topPct + heightPct).toBeLessThan(box.bottom);
    expect(overlay.fontSizePx).toBeLessThanOrEqual(16);
  });

  it("vigência usa o texto do DOCX só como fallback", () => {
    const assinatura = wordPage(`
      <p>Gustavo Bismarchi Motta</p>
      <p>Ricardo Viscardi Pires</p>
      <p>Vigência da Proposta: 01/01/2020</p>
    `);
    const { overlays } = resolveProposalPreviewStaticThumbnail("assinatura", assinatura, {});
    expect(overlays.map((o) => o.text)).toEqual(["Vigência da Proposta: 01/01/2020"]);
  });

  it("mapeia sequência final do modelo BP (CVs, assinatura, contracapa)", () => {
    const capa = wordPage(`
      <p>ACME Ltda.</p>
      <p>Enviado por: Maria</p>
      <p>Campinas/SP, 29/09/2026</p>
    `);
    const cvGustavo = wordPage(`
      <p>Data de vigência proposta: 06/30/2026</p>
      <p>Gustavo Bismarchi Motta Formação Graduado em Direito</p>
    `);
    const cvRicardo = wordPage("");
    const assinatura = wordPage(`
      <p>Gustavo Bismarchi Motta</p>
      <p>Ricardo Viscardi Pires</p>
      <p>Vigência da Proposta: 06/30/2026</p>
    `);
    const contracapa = wordPage(`<p>PROPOSTA DE SERVIÇOS JURÍDICOS</p>`);
    const pages = [capa, cvGustavo, cvRicardo, assinatura, contracapa];

    expect(resolveProposalPreviewTailLayout(pages)).toEqual({
      cvGustavo: 1,
      cvRicardo: 2,
      assinatura: 3,
      contracapa: 4,
    });
    expect(classifyProposalPreviewStaticPage(capa, 0, pages)).toBe("capa");
    expect(classifyProposalPreviewStaticPage(cvGustavo, 1, pages)).toBe("cvGustavo");
    expect(classifyProposalPreviewStaticPage(cvRicardo, 2, pages)).toBe("cvRicardo");
    expect(classifyProposalPreviewStaticPage(assinatura, 3, pages)).toBe("assinatura");
    expect(classifyProposalPreviewStaticPage(contracapa, 4, pages)).toBe("contracapa");
    expect(findProposalVigenciaPageIndex(pages)).toBe(3);
  });

  it("não trata linha de vigência no CV Gustavo como folha vigência separada", () => {
    const cvGustavo = wordPage(`<p>Data de vigência proposta: 06/30/2026</p>`);
    const cvRicardo = wordPage("");
    const assinatura = wordPage(`
      <p>Gustavo Bismarchi Motta</p>
      <p>Ricardo Viscardi Pires</p>
    `);
    const pages = [
      wordPage("<p>Capa</p>"),
      wordPage("<p>QUEM SOMOS</p>"),
      cvGustavo,
      cvRicardo,
      assinatura,
      wordPage(""),
    ];
    expect(classifyProposalPreviewStaticPage(cvGustavo, 2, pages)).toBe("cvGustavo");
    expect(classifyProposalPreviewStaticPage(cvGustavo, 2, pages)).not.toBe("vigencia");
  });

  it("CV Gustavo não recebe overlay; assinatura recebe data de qualquer folha", () => {
    const cvGustavo = wordPage(`<p>Data de vigência proposta: 06/30/2026</p>`);
    const assinatura = wordPage(`
      <p>Gustavo Bismarchi Motta</p>
      <p>Ricardo Viscardi Pires</p>
    `);
    const pages = [wordPage("<p>x</p>"), cvGustavo, wordPage(""), assinatura, wordPage("")];

    expect(
      resolveProposalPreviewStaticThumbnail("cvGustavo", cvGustavo, { pages }).overlays,
    ).toEqual([]);
    const assinResolved = resolveProposalPreviewStaticThumbnail("assinatura", assinatura, {
      pages,
    });
    expect(assinResolved.asset).toBe(PROPOSAL_PREVIEW_REFERENCE.assinatura);
    expect(assinResolved.overlays[0]?.text).toBe("Vigência da Proposta: 06/30/2026");
  });

  it("classifica folha vazia antes da assinatura como CV Ricardo", () => {
    const assinatura = wordPage(`
      <p>Gustavo Bismarchi Motta</p>
      <p>Ricardo Viscardi Pires</p>
    `);
    const blank = wordPage("");
    const gustavo = wordPage(`<p>Data de vigência proposta: 01/01/2026</p>`);
    const pages = [wordPage("capa"), gustavo, blank, assinatura, wordPage("fim")];
    expect(isAssinaturaSociosPage(getPlain(pages[3]))).toBe(true);
    expect(classifyProposalPreviewStaticPage(blank, 2, pages)).toBe("cvRicardo");
  });

  it("busca data de vigência em todas as folhas", () => {
    const pages = [
      wordPage("<p>capa</p>"),
      wordPage("<p>Data de vigência proposta: 06/30/2026</p>"),
      wordPage("<p>assinaturas</p>"),
    ];
    expect(findProposalVigenciaDateInPages(pages)).toBe("06/30/2026");
  });
});

function getPlain(page: HTMLElement) {
  return page.querySelector("article")?.textContent ?? "";
}
