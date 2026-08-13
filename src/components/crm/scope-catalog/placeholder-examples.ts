export const EXAMPLE_NOME_EMPRESA = "ACME Logística Ltda.";

/** Placeholders de exemplo para o preview ao vivo. Cobre os mais comuns. */
export const EXAMPLE_PLACEHOLDER_VALUES: Record<string, string> = {
  "NOME EMPRESA": EXAMPLE_NOME_EMPRESA,
  EMPRESA: EXAMPLE_NOME_EMPRESA,
  CNPJ: "12.345.678/0001-90",
  DOCUMENTO: "12.345.678/0001-90",
  CIDADE: "Campinas",
  UF: "SP",
  CEP: "13025-002",
  NUMERO: "nº 1.266",
  "TIPO DA AÇÃO": "AÇÃO DE COBRANÇA",
  PARTE_CONTRÁRIA: "DEVEDOR EXEMPLO LTDA",
  VALOR_CAUSA: "R$ 150.000,00",
  RESUMO_DO_PROCESSO:
    "Trata-se de demanda monitória decorrente de inadimplemento contratual referente à prestação de serviços logísticos durante 2024.",
  NUMERO_PROCESSO: "1000123-45.2024.8.26.0100",
  VALORMENSAL: "8500",
  VALORHORA: "450",
  VALORMENSALBASE: "5000",
  VALORMENSALVARIAVEL: "3500",
  VALORMENSALESCALONADO: "12000",
  VALORMENSALESTIMADO: "10000",
  VALORSPOT: "25000",
  VALORPARCELA: "2500",
  VALORMANUTENCAO: "1500",
  VALOREXITO: "20",
  QTD_PROCESSOS: "30",
  HORAS_MES: "12",
  "HORAS MES": "12",
};

export function exampleForPlaceholder(key: string): string {
  return EXAMPLE_PLACEHOLDER_VALUES[key] ?? `[exemplo: ${key.toLowerCase().replace(/_/g, " ")}]`;
}

export function buildExamplePlaceholders(keys: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of keys) out[k] = exampleForPlaceholder(k);
  return out;
}
