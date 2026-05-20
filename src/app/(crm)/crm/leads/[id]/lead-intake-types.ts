/** Tipos compartilhados entre a página do lead (SSR) e componentes cliente. */

export type LeadIntakeEmpresaRow = {
  /** 1-based (Empresa 1, …). */
  index: number;
  razao_social: string;
  tipo_documento: "CPF" | "CNPJ";
  documento: string;
};
