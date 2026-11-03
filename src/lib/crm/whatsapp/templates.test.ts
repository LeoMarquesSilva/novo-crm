import { describe, expect, it } from "vitest";

import {
  WHATSAPP_TEMPLATE_DEFS,
  WHATSAPP_TEMPLATE_KEYS,
  exampleValuesFor,
  isWhatsappTemplateKey,
  renderWhatsappTemplate,
} from "./templates";

describe("renderWhatsappTemplate", () => {
  it("troca os placeholders, com ou sem espaço nas chaves", () => {
    expect(renderWhatsappTemplate("*Cliente:* {{cliente}} / {{ ciclo }}", { cliente: "ACME", ciclo: "2" })).toBe(
      "*Cliente:* ACME / 2",
    );
  });

  it("linha com placeholder vazio some e não sobram linhas em branco seguidas", () => {
    const body = "*Título*\n*Cliente:* {{cliente}}\n\n{{avisos}}\n\nfim\n{{link}}";
    expect(renderWhatsappTemplate(body, { cliente: "ACME", avisos: "", link: null })).toBe("*Título*\n*Cliente:* ACME\n\nfim");
  });

  it("linha com um placeholder preenchido e outro vazio fica", () => {
    expect(renderWhatsappTemplate("{{a}} e {{b}}", { a: "x" })).toBe("x e");
  });

  it("valor com várias linhas entra inteiro", () => {
    expect(renderWhatsappTemplate("*Áreas*\n{{areas}}", { areas: "• Cível: Ana\n• Trabalhista: Bia" })).toBe(
      "*Áreas*\n• Cível: Ana\n• Trabalhista: Bia",
    );
  });

  it("placeholder desconhecido conta como vazio", () => {
    expect(renderWhatsappTemplate("ok\n{{inexistente}}", {})).toBe("ok");
  });
});

describe("modelos padrão", () => {
  it("todo placeholder usado no texto padrão está documentado", () => {
    for (const key of WHATSAPP_TEMPLATE_KEYS) {
      const def = WHATSAPP_TEMPLATE_DEFS[key];
      const used = [...def.defaultBody.matchAll(/\{\{\s*([a-z0-9_]+)\s*\}\}/g)].map((m) => m[1]);
      const documented = new Set(def.placeholders.map((p) => p.name));
      for (const name of used) expect(documented.has(name!), `${key}: {{${name}}}`).toBe(true);
    }
  });

  it("prévia com os exemplos não deixa chaves sem trocar", () => {
    for (const key of WHATSAPP_TEMPLATE_KEYS) {
      const text = renderWhatsappTemplate(WHATSAPP_TEMPLATE_DEFS[key].defaultBody, exampleValuesFor(key));
      expect(text, key).not.toMatch(/\{\{|\}\}/);
      expect(text.startsWith("*"), key).toBe(true);
    }
  });

  it("reconhece só as chaves conhecidas", () => {
    expect(isWhatsappTemplateKey("due_revisao_inicio")).toBe(true);
    expect(isWhatsappTemplateKey("novo_lead")).toBe(true);
    expect(isWhatsappTemplateKey("novo_lead_due")).toBe(true);
    expect(isWhatsappTemplateKey("qualquer")).toBe(false);
  });

  it("toda chave tem definição com a mesma chave", () => {
    for (const key of WHATSAPP_TEMPLATE_KEYS) expect(WHATSAPP_TEMPLATE_DEFS[key].key).toBe(key);
  });
});

describe("novo lead sem e com DUE", () => {
  it("novo_lead: mesmo grupo, sem título de DUE, sem prazo da base e sem avisos de área", () => {
    const def = WHATSAPP_TEMPLATE_DEFS.novo_lead;
    expect(def.label).toBe("Novo lead");
    expect(def.destination).toBe(WHATSAPP_TEMPLATE_DEFS.novo_lead_due.destination);
    expect(def.defaultBody.split("\n")[0]).toBe("*Novo Lead*");
    expect(def.defaultBody).not.toContain("Due Diligence*");
    expect(def.defaultBody).not.toContain("Detalhes da Due Diligence");
    expect(def.defaultBody).not.toMatch(/\{\{\s*(prazo_due|avisos)\s*\}\}/);
    expect(def.placeholders.map((p) => p.name)).not.toContain("prazo_due");
  });

  it("novo_lead tem os campos do novo_lead_due, menos o bloco da DUE", () => {
    const names = (key: "novo_lead" | "novo_lead_due") =>
      WHATSAPP_TEMPLATE_DEFS[key].placeholders.map((p) => p.name);
    expect(names("novo_lead")).toEqual(names("novo_lead_due").filter((n) => n !== "prazo_due" && n !== "avisos"));
  });

  it("novo_lead_due continua com o título e o bloco da DUE", () => {
    const body = WHATSAPP_TEMPLATE_DEFS.novo_lead_due.defaultBody;
    expect(body.split("\n")[0]).toBe("*Novo Lead com Due Diligence*");
    expect(body).toContain("*Detalhes da Due Diligence:*\n- *Prazo de Entrega:* {{prazo_due}}\n- *Áreas de Análise:* {{areas}}");
  });
});
