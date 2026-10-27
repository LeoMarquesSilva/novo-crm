// @vitest-environment jsdom
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { reestruturacaoSchema, type ReestruturacaoForm as Form } from "@/lib/due-ppt/draft";
import { ReestruturacaoForm } from "./reestruturacao-form";

const lerPdfs = vi.hoisted(() => vi.fn());
vi.mock("@/lib/due-ppt/reestruturacao-pdf-client", () => ({ lerPdfsReestruturacao: lerPdfs }));

function Tela({ inicial, onChange }: { inicial: Form; onChange: (f: Form) => void }) {
  const [valor, setValor] = useState(inicial);
  return (
    <ReestruturacaoForm
      leadId="lead-1"
      value={valor}
      onChange={(f) => {
        onChange(f);
        setValor(f);
      }}
    />
  );
}

function enviarPdf() {
  const file = new File(["%PDF-1.4"], "edital.pdf", { type: "application/pdf" });
  fireEvent.change(screen.getByLabelText("PDFs da recuperação judicial"), { target: { files: [file] } });
  return file;
}

describe("ReestruturacaoForm — preencher a partir do PDF", () => {
  it("mostra as sugestões sem gravar, aplica o que foi marcado e desfaz", async () => {
    lerPdfs.mockResolvedValue({
      sugestao: reestruturacaoSchema.parse({ autos: "1234567-89.2025.8.26.0114", juiz: "Dr. Beltrano", passivoTotal: 1000 }),
      avisos: [],
      documentos: [],
    });
    const onChange = vi.fn();
    render(<Tela inicial={reestruturacaoSchema.parse({ juiz: "Dra. Fulana" })} onChange={onChange} />);

    const file = enviarPdf();
    await screen.findByText(/Sugestões da IA — edital\.pdf/);
    expect(lerPdfs).toHaveBeenCalledWith("lead-1", [file], expect.any(Function));

    // Prévia travada, nada gravado ainda; o juiz já preenchido não é trocado sem marcar.
    expect(screen.getByLabelText("Autos nº")).toHaveValue("1234567-89.2025.8.26.0114");
    expect(screen.getByLabelText("Autos nº")).toBeDisabled();
    expect(screen.getByLabelText("Juiz")).toHaveValue("Dra. Fulana");
    expect(screen.getByRole("checkbox", { name: /Juiz/ })).not.toBeChecked();
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Aplicar 2 itens" }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ autos: "1234567-89.2025.8.26.0114", juiz: "Dra. Fulana", passivoTotal: 1000 }),
    );
    expect(screen.getByText(/Campos em azul vieram da IA/)).toBeInTheDocument();
    expect(screen.getByLabelText("Autos nº")).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: /Desfazer/ }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ autos: "", juiz: "Dra. Fulana", passivoTotal: null }));
    expect(screen.queryByText(/Campos em azul vieram da IA/)).not.toBeInTheDocument();
  });

  it("descartar não mexe no formulário", async () => {
    lerPdfs.mockResolvedValue({ sugestao: reestruturacaoSchema.parse({ autos: "999" }), avisos: [], documentos: [] });
    const onChange = vi.fn();
    render(<Tela inicial={reestruturacaoSchema.parse({})} onChange={onChange} />);
    enviarPdf();
    fireEvent.click(await screen.findByRole("button", { name: "Descartar" }));
    expect(screen.getByLabelText("Autos nº")).toHaveValue("");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("avisa quando os PDFs não trazem nada novo e mostra o erro da leitura", async () => {
    lerPdfs.mockResolvedValueOnce({
      sugestao: reestruturacaoSchema.parse({ autos: "123" }),
      avisos: ["plano.pdf: sem texto (PDF digitalizado?); ficou de fora."],
      documentos: [],
    });
    render(<Tela inicial={reestruturacaoSchema.parse({ autos: "123" })} onChange={vi.fn()} />);
    enviarPdf();
    expect(await screen.findByText(/não achou nos PDFs nada/)).toBeInTheDocument();
    expect(screen.getByText(/plano\.pdf: sem texto/)).toBeInTheDocument();

    lerPdfs.mockRejectedValueOnce(new Error("A IA não respondeu a tempo. Tente novamente."));
    enviarPdf();
    expect(await screen.findByRole("alert")).toHaveTextContent("A IA não respondeu a tempo");
  });
});

describe("ReestruturacaoForm — valores em reais", () => {
  it("enche pelos centavos como os outros campos de R$ e grava o número", () => {
    const onChange = vi.fn();
    render(<Tela inicial={reestruturacaoSchema.parse({ passivoTotal: 1000 })} onChange={onChange} />);
    const passivo = screen.getByLabelText("Passivo total");
    expect(passivo).toHaveValue("R$ 1.000,00");

    fireEvent.change(passivo, { target: { value: "150000" } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ passivoTotal: 1500 }));
    expect(passivo).toHaveValue("R$ 1.500,00");

    fireEvent.change(passivo, { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ passivoTotal: null }));
    expect(passivo).toHaveValue("");
  });
});
