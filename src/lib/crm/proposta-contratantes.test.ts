import { describe, expect, it } from "vitest";
import {
  alternarContratante,
  comContratantesEfetivos,
  comContratantesPadrao,
  contarOutrosContratantes,
  contratantesMarcados,
  isContratanteDoCadastro,
  parseContratantesIndexes,
  trocarPrincipal,
} from "./proposta-contratantes";

const VINICIUS = { index: 1, razao_social: "VINICIUS", documento: "111.444.777-35" };
const ANDRE = { index: 2, razao_social: "ANDRE", documento: "123.456.789-09" };
const EMPRESAS = [VINICIUS, ANDRE];

describe("contratantes do cadastro", () => {
  it("escolha antiga, sem lista: só a principal e quem foi redigitado entram", () => {
    const antiga = { primaryIndex: 1, extras: [] };
    expect(isContratanteDoCadastro(VINICIUS, antiga, EMPRESAS)).toBe(true);
    expect(isContratanteDoCadastro(ANDRE, antiga, EMPRESAS)).toBe(false);

    const redigitada = { primaryIndex: 1, extras: [{ razao_social: "Outro nome", documento: "12345678909" }] };
    expect(isContratanteDoCadastro(ANDRE, redigitada, EMPRESAS)).toBe(true);
  });

  it("na tela, sem lista, todas as outras aparecem marcadas e são gravadas assim", () => {
    const nova = { primaryIndex: 1, extras: [] };
    expect(contratantesMarcados(nova, EMPRESAS)).toEqual([2]);
    const gravada = comContratantesPadrao(nova, EMPRESAS);
    expect(gravada.contratantes).toEqual([2]);
    expect(isContratanteDoCadastro(ANDRE, gravada, EMPRESAS)).toBe(true);
  });

  it("desmarcar tira a pessoa do contrato; a principal continua", () => {
    const escolha = alternarContratante({ primaryIndex: 1, extras: [] }, EMPRESAS, 2, false);
    expect(escolha.contratantes).toEqual([]);
    expect(isContratanteDoCadastro(ANDRE, escolha, EMPRESAS)).toBe(false);
    expect(isContratanteDoCadastro(VINICIUS, escolha, EMPRESAS)).toBe(true);
  });

  it("trocar a principal mantém a anterior como contratante", () => {
    const escolha = trocarPrincipal({ primaryIndex: 1, extras: [], contratantes: [] }, EMPRESAS, 2);
    expect(escolha.primaryIndex).toBe(2);
    expect(escolha.contratantes).toEqual([1]);
    expect(isContratanteDoCadastro(VINICIUS, escolha, EMPRESAS)).toBe(true);
  });

  it("conta quem assina além da principal, sem contar duas vezes quem foi redigitado", () => {
    expect(contarOutrosContratantes({ primaryIndex: 1, extras: [], contratantes: [2] }, EMPRESAS)).toBe(1);
    expect(
      contarOutrosContratantes(
        {
          primaryIndex: 1,
          extras: [
            { razao_social: "ANDRE", documento: "12345678909" },
            { razao_social: "TERCEIRO", documento: "52998224725" },
          ],
        },
        EMPRESAS,
      ),
    ).toBe(2);
    expect(contarOutrosContratantes({ primaryIndex: 1, extras: [] }, EMPRESAS)).toBe(0);
  });

  it("no editor, escolha antiga mostra o que o contrato faz hoje", () => {
    expect(comContratantesEfetivos({ primaryIndex: 1, extras: [] }, EMPRESAS).contratantes).toEqual([]);
    expect(
      comContratantesEfetivos({ primaryIndex: 1, extras: [{ razao_social: "ANDRE", documento: "" }] }, EMPRESAS)
        .contratantes,
    ).toEqual([2]);
  });

  it("lê só índices inteiros positivos", () => {
    expect(parseContratantesIndexes([2, "3", 0, 2, 1.5, 1])).toEqual([1, 2]);
    expect(parseContratantesIndexes(undefined)).toBeUndefined();
  });
});
