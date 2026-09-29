"""Monta `assets/proposta-pdf/proposta-modelo.pdf` a partir dos PDFs de referência BP.

Uso: python3 scripts/prepare-proposta-pdf-assets.py <MODELO PDF DAS MINIATURAS E TIMBRADO.pdf> <MODELO SÓ CAPA.pdf>

Requer PyMuPDF (`pip install pymupdf`). Ordem das páginas de saída (ver PROPOSTA_MODELO_PAGE em
`src/lib/crm/proposta-pdf-builder.ts`): capa limpa, institucional, timbrado, CV Gustavo, CV Ricardo,
assinaturas, contracapa. As datas de vigência de exemplo do guia são removidas apenas da camada de
texto (sem retângulo de preenchimento); imagens e desenhos ficam intactos.
"""

import sys
from pathlib import Path

import fitz

OUT = Path(__file__).resolve().parent.parent / "assets" / "proposta-pdf" / "proposta-modelo.pdf"

# Índices no guia de 7 páginas.
GUIA_INSTITUCIONAL, GUIA_TIMBRADO, GUIA_CV_GUSTAVO, GUIA_CV_RICARDO, GUIA_ASSINATURAS, GUIA_CONTRACAPA = 1, 2, 3, 4, 5, 6

# Texto de exemplo com data fixa (06/10/2026) embutido no guia.
REDACTIONS = {
    GUIA_CV_GUSTAVO: [fitz.Rect(84, 70, 272, 86)],  # "Data de vigência proposta: …" escondido sob a imagem do CV
    GUIA_ASSINATURAS: [fitz.Rect(209, 209, 389, 226)],  # "Vigência da Proposta: …" dentro da caixa
}


def main(guia_path: str, capa_path: str) -> None:
    guia = fitz.open(guia_path)
    capa = fitz.open(capa_path)
    if guia.page_count != 7 or capa.page_count != 1:
        raise SystemExit("Esperado guia com 7 páginas e capa com 1 página.")

    for index, rects in REDACTIONS.items():
        page = guia[index]
        for rect in rects:
            page.add_redact_annot(rect, fill=False)
        page.apply_redactions(
            images=fitz.PDF_REDACT_IMAGE_NONE,
            graphics=fitz.PDF_REDACT_LINE_ART_NONE,
            text=fitz.PDF_REDACT_TEXT_REMOVE,
        )
        leftover = [w for w in page.get_text("words") if "vig" in w[4].lower() or "/2026" in w[4]]
        if leftover:
            raise SystemExit(f"Texto de vigência ainda presente na página {index + 1}: {leftover}")

    out = fitz.open()
    out.insert_pdf(capa, from_page=0, to_page=0)
    for index in (GUIA_INSTITUCIONAL, GUIA_TIMBRADO, GUIA_CV_GUSTAVO, GUIA_CV_RICARDO, GUIA_ASSINATURAS, GUIA_CONTRACAPA):
        out.insert_pdf(guia, from_page=index, to_page=index)
    out.set_metadata({})
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.save(OUT, garbage=4, deflate=True, clean=True)
    print(f"{OUT} ({OUT.stat().st_size} bytes, {out.page_count} páginas)")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2])
