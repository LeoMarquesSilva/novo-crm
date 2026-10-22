/**
 * Quem do cadastro do lead (`lead_intakes`) assina o contrato como contratante, além da
 * empresa principal. `contratantes` guarda os índices do cadastro (Empresa/Pessoa 1, 2, …);
 * no avanço para a proposta todos vêm marcados (decisão de 21/10/2026). Escolhas gravadas
 * antes não têm a lista e seguem a regra anterior: só entra quem foi redigitado em
 * "Razão social ou CNPJ adicional".
 */

export type EmpresaCadastroRef = {
  index: number;
  razao_social: string;
  documento: string;
};

export type EnderecoContratante = {
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
};

export type EscolhaEmpresasProposta = {
  primaryIndex: number;
  extras: Array<{ razao_social: string; documento: string }>;
  contratantes?: number[];
  /**
   * Endereço próprio de outra contratante do cadastro, pelo índice (Empresa/Pessoa 2 → "2").
   * Sem endereço próprio, a qualificação usa o endereço do cliente (o da principal).
   */
  enderecos?: Record<string, EnderecoContratante>;
};

export function parseContratantesIndexes(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return [...new Set(value.filter((v): v is number => Number.isInteger(v) && v > 0))].sort((a, b) => a - b);
}

const ENDERECO_KEYS: Array<keyof EnderecoContratante> = ["cep", "logradouro", "numero", "complemento", "bairro", "cidade", "uf"];

export function enderecoContratanteVazio(): EnderecoContratante {
  return { cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "" };
}

/** Endereço com rua e cidade: o mínimo para entrar na qualificação. */
export function enderecoContratantePreenchido(e: EnderecoContratante | undefined): e is EnderecoContratante {
  return Boolean(e && e.logradouro.trim() && e.cidade.trim());
}

export function parseEnderecosContratantes(value: unknown): Record<string, EnderecoContratante> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const out: Record<string, EnderecoContratante> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!/^\d+$/.test(key) || !raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const endereco = enderecoContratanteVazio();
    for (const k of ENDERECO_KEYS) endereco[k] = typeof r[k] === "string" ? (r[k] as string).trim() : "";
    if (enderecoContratantePreenchido(endereco)) out[key] = endereco;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Grava ou remove (endereço `null`) o endereço próprio de uma contratante do cadastro. */
export function definirEnderecoContratante<T extends EscolhaEmpresasProposta>(
  escolha: T,
  index: number,
  endereco: EnderecoContratante | null,
): T {
  const enderecos = { ...(escolha.enderecos ?? {}) };
  if (endereco && enderecoContratantePreenchido(endereco)) enderecos[String(index)] = endereco;
  else delete enderecos[String(index)];
  const resto: T = { ...escolha };
  delete resto.enderecos;
  return (Object.keys(enderecos).length > 0 ? { ...resto, enderecos } : resto) as T;
}

export function principalIndexDaEscolha(escolha: EscolhaEmpresasProposta, empresas: EmpresaCadastroRef[]): number {
  return escolha.primaryIndex > 0 ? escolha.primaryIndex : empresas[0]?.index ?? 0;
}

function digits(value: string): string {
  return value.replace(/\D/g, "");
}

function redigitadaComoAdicional(empresa: EmpresaCadastroRef, escolha: EscolhaEmpresasProposta): boolean {
  const doc = digits(empresa.documento);
  const nome = empresa.razao_social.trim().toLowerCase();
  return escolha.extras.some(
    (extra) =>
      (doc !== "" && digits(extra.documento) === doc) ||
      (nome !== "" && extra.razao_social.trim().toLowerCase() === nome),
  );
}

/** A empresa do cadastro entra no contrato como contratante? */
export function isContratanteDoCadastro(
  empresa: EmpresaCadastroRef,
  escolha: EscolhaEmpresasProposta,
  empresas: EmpresaCadastroRef[],
): boolean {
  if (empresa.index === principalIndexDaEscolha(escolha, empresas)) return true;
  if (redigitadaComoAdicional(empresa, escolha)) return true;
  return escolha.contratantes?.includes(empresa.index) ?? false;
}

/** Quantos assinam além da principal: do cadastro e redigitados de fora dele. */
export function contarOutrosContratantes(escolha: EscolhaEmpresasProposta, empresas: EmpresaCadastroRef[]): number {
  const principal = principalIndexDaEscolha(escolha, empresas);
  const docsCadastro = new Set(empresas.map((e) => digits(e.documento)).filter(Boolean));
  const doCadastro = empresas.filter(
    (e) => e.index !== principal && isContratanteDoCadastro(e, escolha, empresas),
  ).length;
  const deFora = escolha.extras.filter(
    (extra) => (extra.razao_social.trim() || extra.documento.trim()) && !docsCadastro.has(digits(extra.documento)),
  ).length;
  return doCadastro + deFora;
}

/** Na tela, sem lista gravada, todas as outras empresas do cadastro aparecem marcadas. */
export function contratantesMarcados(escolha: EscolhaEmpresasProposta, empresas: EmpresaCadastroRef[]): number[] {
  const principal = principalIndexDaEscolha(escolha, empresas);
  return escolha.contratantes ?? empresas.map((e) => e.index).filter((index) => index !== principal);
}

/** Escolha antiga, sem lista: monta a lista com quem o contrato já trata como contratante. */
export function comContratantesEfetivos<T extends EscolhaEmpresasProposta>(
  escolha: T,
  empresas: EmpresaCadastroRef[],
): T & { contratantes: number[] } {
  if (escolha.contratantes) return { ...escolha, contratantes: escolha.contratantes };
  const principal = principalIndexDaEscolha(escolha, empresas);
  const contratantes = empresas
    .filter((e) => e.index !== principal && isContratanteDoCadastro(e, escolha, empresas))
    .map((e) => e.index);
  return { ...escolha, contratantes };
}

/** Grava a lista explícita (todas marcadas) quando a escolha ainda não tem uma. */
export function comContratantesPadrao<T extends EscolhaEmpresasProposta>(
  escolha: T,
  empresas: EmpresaCadastroRef[],
): T & { contratantes: number[] } {
  if (escolha.contratantes) return { ...escolha, contratantes: escolha.contratantes };
  return { ...escolha, contratantes: contratantesMarcados(escolha, empresas) };
}

/** Marca ou desmarca uma empresa do cadastro como contratante. */
export function alternarContratante<T extends EscolhaEmpresasProposta>(
  escolha: T,
  empresas: EmpresaCadastroRef[],
  index: number,
  marcado: boolean,
): T & { contratantes: number[] } {
  const atual = new Set(contratantesMarcados(escolha, empresas));
  if (marcado) atual.add(index);
  else atual.delete(index);
  return { ...escolha, contratantes: [...atual].sort((a, b) => a - b) };
}

/** Troca a principal sem tirar a anterior do contrato. */
export function trocarPrincipal<T extends EscolhaEmpresasProposta>(
  escolha: T,
  empresas: EmpresaCadastroRef[],
  novoIndex: number,
): T & { contratantes: number[] } {
  const anterior = principalIndexDaEscolha(escolha, empresas);
  const marcados = new Set(contratantesMarcados(escolha, empresas));
  if (anterior > 0 && anterior !== novoIndex) marcados.add(anterior);
  marcados.delete(novoIndex);
  return { ...escolha, primaryIndex: novoIndex, contratantes: [...marcados].sort((a, b) => a - b) };
}
