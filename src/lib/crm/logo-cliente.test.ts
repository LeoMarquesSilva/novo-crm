import { describe, expect, it } from "vitest";
import {
  ICP_LOGO_BUCKET,
  iniciaisDoCliente,
  indexarLogosPorGrupo,
  logoDoGrupo,
  urlDaLogoIcp,
} from "./logo-cliente";

const BASE = "https://projeto.supabase.co";
const UPDATED = "2026-10-11T22:22:26.76+00:00";

describe("urlDaLogoIcp", () => {
  it("monta a URL pública do bucket do ICP com a data da gravação em ?v=", () => {
    expect(urlDaLogoIcp(BASE, { logo_path: "grupo-ab.jpg", updated_at: UPDATED })).toBe(
      `${BASE}/storage/v1/object/public/${ICP_LOGO_BUCKET}/grupo-ab.jpg?v=${Date.parse(UPDATED)}`,
    );
  });

  it("é a mesma regra do ICP (icp-data-loader): barra final da base removida", () => {
    expect(urlDaLogoIcp(`${BASE}/`, { logo_path: "grupo-ab.jpg", updated_at: UPDATED })).toBe(
      `${BASE}/storage/v1/object/public/icp-logos/grupo-ab.jpg?v=1791757346760`,
    );
  });

  it("sem caminho da logo ou sem URL do Supabase, não há logo", () => {
    expect(urlDaLogoIcp(BASE, { logo_path: null, updated_at: UPDATED })).toBeNull();
    expect(urlDaLogoIcp(BASE, { logo_path: "  ", updated_at: UPDATED })).toBeNull();
    expect(urlDaLogoIcp(undefined, { logo_path: "grupo-ab.jpg", updated_at: UPDATED })).toBeNull();
    expect(urlDaLogoIcp("", { logo_path: "grupo-ab.jpg", updated_at: UPDATED })).toBeNull();
  });

  it("data ilegível ou ausente: URL sem ?v= em vez de ?v=NaN", () => {
    expect(urlDaLogoIcp(BASE, { logo_path: "grupo-ab.jpg", updated_at: "ontem" })).toBe(
      `${BASE}/storage/v1/object/public/icp-logos/grupo-ab.jpg`,
    );
    expect(urlDaLogoIcp(BASE, { logo_path: "grupo-ab.jpg", updated_at: null })).toBe(
      `${BASE}/storage/v1/object/public/icp-logos/grupo-ab.jpg`,
    );
  });

  it("codifica cada parte do caminho sem trocar as barras", () => {
    expect(urlDaLogoIcp(BASE, { logo_path: "/pasta/logo nova.png", updated_at: null })).toBe(
      `${BASE}/storage/v1/object/public/icp-logos/pasta/logo%20nova.png`,
    );
  });
});

describe("indexarLogosPorGrupo e logoDoGrupo", () => {
  const logos = indexarLogosPorGrupo(BASE, [
    { grupo: "Grupo Metal Moisés", logo_path: "grupo-metal-moises.png", updated_at: null },
    { grupo: "Grupo AB", logo_path: "grupo-ab.jpg", updated_at: null },
    { grupo: "Grupo Sem Logo", logo_path: null, updated_at: null },
  ]);

  it("liga o perfil do ICP ao grupo do CRM pelo nome normalizado (acento e caixa não importam)", () => {
    expect(logoDoGrupo(logos, "GRUPO METAL MOISES")).toBe(
      `${BASE}/storage/v1/object/public/icp-logos/grupo-metal-moises.png`,
    );
    expect(logoDoGrupo(logos, "Grupo  AB")).toBe(`${BASE}/storage/v1/object/public/icp-logos/grupo-ab.jpg`);
  });

  it("grupo sem logo, desconhecido ou sem nome: null", () => {
    expect(logos.has("grupo sem logo")).toBe(false);
    expect(logoDoGrupo(logos, "Grupo Sem Logo")).toBeNull();
    expect(logoDoGrupo(logos, "Grupo Outro")).toBeNull();
    expect(logoDoGrupo(logos, null)).toBeNull();
    expect(logoDoGrupo(logos, "")).toBeNull();
  });
});

describe("iniciaisDoCliente", () => {
  it("ignora 'Grupo', conectivos e a forma societária", () => {
    expect(iniciaisDoCliente("Grupo Longitude")).toBe("L");
    expect(iniciaisDoCliente("ACME Indústria e Comércio Ltda")).toBe("AI");
    expect(iniciaisDoCliente("Banco do Brasil S.A.")).toBe("BB");
    expect(iniciaisDoCliente("XYZ S/A")).toBe("X");
    expect(iniciaisDoCliente("Grupo Isabela Franco do Amaral")).toBe("IF");
  });

  it("colchetes e outros sinais separam palavras", () => {
    expect(iniciaisDoCliente("[TESTE E2E 2] GRUPO VINICIUS E ANDRE")).toBe("TE");
    expect(iniciaisDoCliente("A&B Participações")).toBe("AB");
    expect(iniciaisDoCliente("Grupo D'Ávila")).toBe("D");
  });

  it("respeita o máximo de letras", () => {
    expect(iniciaisDoCliente("Grupo Isabela Franco do Amaral", 1)).toBe("I");
  });

  it("nome só com palavras ignoradas ou vazio não quebra", () => {
    expect(iniciaisDoCliente("Grupo")).toBe("G");
    expect(iniciaisDoCliente("")).toBe("?");
    expect(iniciaisDoCliente(null)).toBe("?");
  });
});
