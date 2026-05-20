import { NextRequest, NextResponse } from "next/server";

/** Resposta normalizada para o CRM (ViaCEP JSON). */
export type ViaCepNormalized = {
  cep: string;
  logradouro: string;
  complemento: string;
  bairro: string;
  localidade: string;
  uf: string;
};

function onlyDigits(s: string): string {
  return s.replace(/\D/g, "");
}

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("cep") ?? "";
  const cep = onlyDigits(raw);
  if (cep.length !== 8) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "O CEP deve ter exatamente 8 números. Verifique se não faltou nenhum dígito e tente de novo.",
      },
      { status: 422 },
    );
  }

  try {
    const url = `https://viacep.com.br/ws/${cep}/json/`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Não foi possível consultar o CEP neste momento. Tente novamente em instantes ou preencha o endereço manualmente.",
        },
        { status: 502 },
      );
    }
    const data = (await res.json()) as {
      erro?: boolean;
      cep?: string;
      logradouro?: string;
      complemento?: string;
      bairro?: string;
      localidade?: string;
      uf?: string;
    };
    if (data.erro === true) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "CEP não encontrado na base dos Correios. Confira os 8 dígitos (sem letras ou símbolos) ou use outro CEP.",
        },
        { status: 404 },
      );
    }

    const out: ViaCepNormalized = {
      cep: onlyDigits(data.cep ?? cep),
      logradouro: String(data.logradouro ?? "").trim(),
      complemento: String(data.complemento ?? "").trim(),
      bairro: String(data.bairro ?? "").trim(),
      localidade: String(data.localidade ?? "").trim(),
      uf: String(data.uf ?? "").trim().toUpperCase().slice(0, 2),
    };

    return NextResponse.json({ ok: true, data: out });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Erro ao consultar o CEP. Verifique a sua ligação à internet ou preencha o endereço manualmente.",
      },
      { status: 500 },
    );
  }
}
