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
    expect(isWhatsappTemplateKey("qualquer")).toBe(false);
  });
});
