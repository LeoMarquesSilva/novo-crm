"""Prepare the supplied BP Word without round-tripping drawings through python-docx.

Run with the bundled Python. Only document.xml and styles.xml are modified.
All other ZIP entries, including media, relationships and header/footer parts, are copied.
"""
from pathlib import Path
from zipfile import ZipFile
import re
import sys
from lxml import etree

root = Path(__file__).resolve().parent.parent
source = Path(sys.argv[1]) if len(sys.argv) > 1 else root / "public/Propostas - BP.docx"
target = root / "templates/proposta/PROPOSTA-BP-V1.docx"
target.parent.mkdir(parents=True, exist_ok=True)

with ZipFile(source) as original:
    xml = original.read("word/document.xml").decode("utf-8")
    assert xml.count("[ESCOPO_AREAS]") == 1, "Expected one scope marker"
    assert xml.count("[INVESTIMEN</w:t>") == 1, "Investment marker changed; review source"
    assert xml.count("08/09/2026") == 1, "Fixed validity date changed; review source"
    xml = xml.replace("[ESCOPO_AREAS]", "[@ESCOPO_AREAS]")
    xml = xml.replace("[INVESTIMEN</w:t>", "[@INVESTIMENTO]</w:t>")
    xml = xml.replace("08/09/2026", "[DATA_VIGENCIA]")

    # This is editor pagination metadata, never a layout rule for growing scope.
    xml = re.sub(r"<w:lastRenderedPageBreak\s*/>", "", xml)
    styles = original.read("word/styles.xml").decode("utf-8")
    # Typography taken from the supplied PDF: Times New Roman, headings 14pt,
    # body 12pt, bold leading labels, justified paragraphs. No page-height math.
    definitions = '''
<w:style w:type="paragraph" w:customStyle="1" w:styleId="BPScopeBody"><w:name w:val="BP Scope Body"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext w:val="0"/><w:keepLines w:val="0"/><w:widowControl/><w:spacing w:before="0" w:after="160" w:line="278" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:b w:val="0"/><w:color w:val="000000"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:customStyle="1" w:styleId="BPScopeArea"><w:name w:val="BP Scope Area"/><w:basedOn w:val="BPScopeBody"/><w:next w:val="BPScopeBody"/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="0" w:after="160"/><w:jc w:val="left"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style>
<w:style w:type="character" w:customStyle="1" w:styleId="BPScopeItem"><w:name w:val="BP Scope Item"/><w:rPr><w:b/></w:rPr></w:style>
<w:style w:type="paragraph" w:customStyle="1" w:styleId="BPInvestmentTitle"><w:name w:val="BP Investment Title"/><w:basedOn w:val="BPScopeArea"/><w:next w:val="BPInvestmentBody"/></w:style>
<w:style w:type="paragraph" w:customStyle="1" w:styleId="BPInvestmentBody"><w:name w:val="BP Investment Body"/><w:basedOn w:val="BPScopeBody"/></w:style>
'''
    styles = styles.replace("</w:styles>", definitions + "</w:styles>")
    etree.fromstring(xml.encode())
    etree.fromstring(styles.encode())
    with ZipFile(target, "w") as output:
        for item in original.infolist():
            value = original.read(item.filename)
            if item.filename == "word/document.xml":
                value = xml.encode("utf-8")
            elif item.filename == "word/styles.xml":
                value = styles.encode("utf-8")
            output.writestr(item, value)
print(target)
