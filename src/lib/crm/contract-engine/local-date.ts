const TZ = "America/Sao_Paulo";

export function formatContractCityDate(generatedAt: Date, city = "Campinas"): string {
  const label = new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(generatedAt);
  return `${city}, ${label}.`;
}

export function toSaoPauloIso(generatedAt: Date): string {
  return generatedAt.toISOString();
}
