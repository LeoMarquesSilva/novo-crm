import { maskCpfCnpj } from "@/lib/crm/br-document-mask";
import { normalizeGroupKey } from "@/lib/crm/normalize-document";
import { sioeClient } from "@/lib/sioe/client";
import { PublicError } from "@/lib/http/api-errors";
import { onlyDigits, type ClientOnboardingPayload } from "@/modules/crm/domain/client-onboarding";

/**
 * Conferência de Operações Legais: o VIOS não tem API, mas as Pessoas dele chegam ao SIOE
 * (`pessoas`, com o grupo do cliente e o código `ci`). Operações Legais escolhe o grupo, vê as
 * pessoas dele e confere o cadastro do CRM contra o que foi lançado no VIOS.
 */

export type ViosPessoa = {
  id: string;
  /** Código do cliente no VIOS. */
  ci: string | null;
  nome: string;
  cpfCnpj: string | null;
  tipo: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  email: string | null;
  telefone: string | null;
  categoria: string | null;
};

export type ViosConferenciaItem = {
  campo: string;
  label: string;
  crm: string;
  vios: string;
  ok: boolean;
};

export type ViosConferencia = {
  /** Pessoa do grupo com o mesmo CPF/CNPJ do cliente (null: não lançada no VIOS ou em outro grupo). */
  pessoaId: string | null;
  ci: string | null;
  itens: ViosConferenciaItem[];
};

const PESSOA_COLUMNS =
  "id, ci, nome, cpf_cnpj, tipo, logradouro, nro, complemento, bairro, cidade, uf, cep, email, telefone, categoria, grupo_cliente";

function client() {
  const sioe = sioeClient();
  if (!sioe) {
    throw new PublicError("A leitura do VIOS (SIOE) não está configurada neste ambiente.", 503, "SIOE_NOT_CONFIGURED");
  }
  return sioe;
}

function toPessoa(row: Record<string, unknown>): ViosPessoa {
  const text = (key: string) => {
    const value = row[key];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  };
  return {
    id: String(row.id),
    ci: text("ci"),
    nome: text("nome") ?? "",
    cpfCnpj: text("cpf_cnpj"),
    tipo: text("tipo"),
    logradouro: text("logradouro"),
    numero: text("nro"),
    complemento: text("complemento"),
    bairro: text("bairro"),
    cidade: text("cidade"),
    uf: text("uf"),
    cep: text("cep"),
    email: text("email"),
    telefone: text("telefone"),
    categoria: text("categoria"),
  };
}

/** Grupos do VIOS pelo nome (sem acento e caixa), com quantas pessoas cada um tem. */
export async function searchViosGroups(query: string): Promise<Array<{ nome: string; pessoas: number }>> {
  const term = query.trim().replace(/[%,()]/g, " ").trim();
  if (term.length < 2) return [];
  const { data, error } = await client()
    .from("pessoas")
    .select("grupo_cliente")
    .ilike("grupo_cliente", `%${term}%`)
    .limit(1000);
  if (error) throw new Error(`Falha ao buscar grupos no SIOE: ${error.message}`);
  const counts = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ grupo_cliente: string | null }>) {
    const nome = row.grupo_cliente?.trim();
    if (nome) counts.set(nome, (counts.get(nome) ?? 0) + 1);
  }
  const key = normalizeGroupKey(term);
  return [...counts.entries()]
    .map(([nome, pessoas]) => ({ nome, pessoas }))
    .sort((a, b) => {
      const exact = Number(normalizeGroupKey(b.nome) === key) - Number(normalizeGroupKey(a.nome) === key);
      return exact || a.nome.localeCompare(b.nome, "pt-BR");
    })
    .slice(0, 15);
}

/** Pessoas (empresas e pessoas físicas) do grupo no VIOS. */
export async function loadViosGroupPeople(grupo: string): Promise<ViosPessoa[]> {
  const { data, error } = await client()
    .from("pessoas")
    .select(PESSOA_COLUMNS)
    .eq("grupo_cliente", grupo)
    .order("nome", { ascending: true })
    .limit(500);
  if (error) throw new Error(`Falha ao ler as pessoas do grupo no SIOE: ${error.message}`);
  return ((data ?? []) as Array<Record<string, unknown>>).map(toPessoa);
}

/** Texto comparável: sem acento, caixa, pontuação e com as abreviações de endereço por extenso. */
function comparable(value: string | null | undefined): string {
  const words = normalizeGroupKey(value).split(" ").filter(Boolean);
  const expand: Record<string, string> = {
    av: "avenida",
    r: "rua",
    al: "alameda",
    rod: "rodovia",
    est: "estrada",
    pca: "praca",
    tv: "travessa",
    jd: "jardim",
    vl: "vila",
  };
  return words.map((w) => expand[w] ?? w).join(" ");
}

/** Telefone sem o 55 do país, para comparar "(19) 99220-0004" com "5519992200004". */
function phoneDigits(value: string | null | undefined): string {
  const digits = onlyDigits(value ?? "");
  return digits.length > 11 && digits.startsWith("55") ? digits.slice(2) : digits;
}

/**
 * Confere o cadastro do CRM com a pessoa de mesmo CPF/CNPJ no grupo do VIOS. Campo vazio no CRM
 * (opcional) não conta como divergência.
 */
export function compareCadastroWithVios(
  cadastro: ClientOnboardingPayload["cadastro"],
  pessoas: ViosPessoa[],
): ViosConferencia {
  const doc = onlyDigits(cadastro.documento);
  const pessoa = doc ? (pessoas.find((p) => onlyDigits(p.cpfCnpj ?? "") === doc) ?? null) : null;
  const e = cadastro.endereco;
  const item = (
    campo: string,
    label: string,
    crm: string,
    vios: string | null | undefined,
    same: (a: string, b: string) => boolean,
    optional = false,
  ): ViosConferenciaItem => {
    const viosText = vios?.trim() ?? "";
    const ok = pessoa ? (optional && !crm.trim() ? true : same(crm, viosText)) : false;
    return { campo, label, crm, vios: viosText, ok };
  };
  const text = (a: string, b: string) => comparable(a) === comparable(b);
  const digits = (a: string, b: string) => onlyDigits(a) === onlyDigits(b);

  const cepDigits = onlyDigits(e.cep);
  const cep = cepDigits.length === 8 ? `${cepDigits.slice(0, 5)}-${cepDigits.slice(5)}` : e.cep;
  return {
    pessoaId: pessoa?.id ?? null,
    ci: pessoa?.ci ?? null,
    itens: [
      item("cadastro.documento", "CPF/CNPJ", maskCpfCnpj(cadastro.documento), pessoa?.cpfCnpj, digits),
      item("cadastro.razaoSocial", "Razão social", cadastro.razaoSocial, pessoa?.nome, text),
      item("cadastro.endereco.cep", "CEP", cep, pessoa?.cep, digits),
      item("cadastro.endereco.logradouro", "Logradouro", e.logradouro, pessoa?.logradouro, text),
      item("cadastro.endereco.numero", "Número", e.numero, pessoa?.numero, text),
      item("cadastro.endereco.complemento", "Complemento", e.complemento, pessoa?.complemento, text, true),
      item("cadastro.endereco.bairro", "Bairro", e.bairro, pessoa?.bairro, text, true),
      item("cadastro.endereco.cidade", "Cidade", e.cidade, pessoa?.cidade, text),
      item("cadastro.endereco.uf", "UF", e.uf, pessoa?.uf, text),
      item("cadastro.email", "E-mail", cadastro.email, pessoa?.email, text, true),
      item("cadastro.telefone", "Telefone", cadastro.telefone, pessoa?.telefone, (a, b) => phoneDigits(a) === phoneDigits(b), true),
    ],
  };
}

/**
 * "Atualizar grupos do CRM": dispara o gatilho do n8n (fluxo VIOS AUTOMATIONS) que puxa as
 * Pessoas do VIOS para o SIOE. A URL vem de `VIOS_PESSOAS_SYNC_WEBHOOK_URL`.
 */
export async function triggerViosPessoasSync(input: { opportunityId: string; grupo: string | null }): Promise<void> {
  const url = process.env.VIOS_PESSOAS_SYNC_WEBHOOK_URL?.trim();
  if (!url) {
    throw new PublicError(
      "O gatilho que atualiza as Pessoas do VIOS ainda não foi configurado. Peça ao admin para ligar o fluxo do n8n.",
      503,
      "VIOS_SYNC_NOT_CONFIGURED",
    );
  }
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ origem: "crm", oportunidade_id: input.opportunityId, grupo: input.grupo }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new PublicError("O n8n não aceitou o pedido de atualização das Pessoas do VIOS. Tente de novo.", 502, "VIOS_SYNC_FAILED");
  }
}
