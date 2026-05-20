/**
 * Interpolação de modelos de e-mail de lead: chaves `{{nome_da_chave}}`
 * com valores já escapados para HTML (exceto fragmentos HTML pré-montados pelo servidor).
 */

const PLACEHOLDER = /\{\{([a-zA-Z0-9_]+)\}\}/g;

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function interpolateLeadEmailTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(PLACEHOLDER, (_, key: string) => vars[key] ?? "");
}
