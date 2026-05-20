/**
 * Pins D4Sign na página de assinaturas dedicada (última folha do PDF).
 * Coordenadas em pixels A4 portrait — padrão D4Sign: 794×1123.
 */

export const D4SIGN_A4_WIDTH = 794;
export const D4SIGN_A4_HEIGHT = 1123;

/** 0 = última página do PDF (resolvido no envio via GET /dimensions). */
export const SIGNATURE_PAGE_LAST = 0;

/** Folha de assinaturas no preview HTML (corpo = folha 1 visual). */
export const PREVIEW_SIGNATURE_PAGE = 2;

export type ContratoSignaturePin = {
  email: string;
  page: number;
  position_x: number;
  position_y: number;
  page_width: number;
  page_height: number;
  type?: 0 | 1 | 2;
};

/** Presets calibrados para a tabela CONTRATANTE | CONTRATADA na folha de assinaturas. */
const SIGNATURE_PIN_PRESETS: Array<
  Pick<ContratoSignaturePin, "email" | "position_x" | "position_y" | "type">
> = [
  { email: "__client__", position_x: 200, position_y: 520, type: 0 },
  { email: "gustavo@bpplaw.com.br", position_x: 580, position_y: 480, type: 0 },
  { email: "ricardo@bpplaw.com.br", position_x: 580, position_y: 620, type: 0 },
];

export function buildDefaultSignaturePins(
  page: number = SIGNATURE_PAGE_LAST,
): ContratoSignaturePin[] {
  return SIGNATURE_PIN_PRESETS.map((p) => ({
    ...p,
    page,
    page_width: D4SIGN_A4_WIDTH,
    page_height: D4SIGN_A4_HEIGHT,
  }));
}

/** Converte pins legados (page:1) ou sentinel (page:0) para a última página real. */
export function resolvePinsToLastPage(
  pins: ContratoSignaturePin[],
  totalPages: number,
): ContratoSignaturePin[] {
  const last = Math.max(totalPages, 1);
  return pins.map((p) => ({
    ...p,
    page: p.page === SIGNATURE_PAGE_LAST || p.page <= 0 || p.page === 1 ? last : p.page,
    page_width: D4SIGN_A4_WIDTH,
    page_height: D4SIGN_A4_HEIGHT,
  }));
}

export function normalizeLegacySignaturePins(
  pins: ContratoSignaturePin[],
): ContratoSignaturePin[] {
  return pins.map((p) => ({
    ...p,
    page:
      p.page === 1 || p.page === PREVIEW_SIGNATURE_PAGE ? SIGNATURE_PAGE_LAST : p.page,
    page_width: p.page_width || D4SIGN_A4_WIDTH,
    page_height: p.page_height || D4SIGN_A4_HEIGHT,
  }));
}

/** Pin pertence à folha de assinaturas (preview ou última página). */
export function isSignaturePagePin(pin: ContratoSignaturePin): boolean {
  return (
    pin.page === SIGNATURE_PAGE_LAST ||
    pin.page <= 0 ||
    pin.page === PREVIEW_SIGNATURE_PAGE ||
    pin.page === 1
  );
}
