# Motor canônico da proposta BP — implementação

**Objetivo:** preencher o Word oficial, preservar os elementos institucionais e derivar preview e download da mesma geração.

**Arquitetura:** dados do CRM/draft → payload canônico → template privado BP → bytes DOCX. Preview e exportação compartilham renderer e data de geração; exportação valida novamente o draft persistido. Contratos e D4Sign ficam fora deste trabalho.

## Diagnóstico e restrições

- Auditoria lida: `docs/AUDITORIA-PROPOSTAS-CONTRATOS-PREVIEW.md`.
- O checkout tem alterações anteriores: preservá-las, sem commits/publicação automática.
- DOCX e PDF oficiais têm seis páginas no Word instalado. A capa apresenta deslocamento vertical em relação ao PDF; não redesenhar.
- O Word contém 37 anchors e 24 caixas de texto no corpo, além de gráficos nos headers/footers, e 20 mídias. Biografias são imagens de página.
- O marcador de investimento está truncado (`[INVESTIMEN`). Há data de vigência fixa sobreposta à página do sócio. Corrigir só esses campos e preparar escopo variável.
- `docx-preview` será avaliado com o arquivo real antes da adoção. A biblioteca não calcula paginação dinâmica; se falhar nos objetos deste modelo, não apresentar uma renderização defeituosa como oficial. Documentar a necessidade de conversão DOCX → PDF.
- Nenhuma migration remota, envio externo, publicação ou alteração de contrato está autorizada por esta tarefa.

## Etapas

- [x] Ler contexto, auditoria e instruções anexas; mapear três motores existentes.
- [x] Abrir DOCX em Word somente leitura e exportar PDF local; comparar com referência.
- [x] Criar template privado com marcadores corretos e estilos Word para títulos e corpo; preservar mídias, relationships, header/footer e conteúdo fixo. Testar ZIP/XML, tags, mídias e múltiplas áreas.
- [x] Unificar campos, responsável e datas em `buildCanonicalProposalData`; manter catálogo, tributação, parcelas/extenso e vigência +7 dias em America/Sao_Paulo.
- [x] Geração server-side a partir de draft; renderer determinístico sem pós-processamento global destrutivo. Validar dados atuais antes do download.
- [x] Retirar JSX documental e preservar erros de save. Ensaio docx-preview reprovado com o template real; disponibilizar prévia por download Word. Prévia visual automática/debounce/cancelamento ficam pendentes do conversor, conforme a exceção técnica prevista no pedido.
- [x] Deprecar rota Word legada e PDF paralelo; somente expor PDF por conversão real, se compatível com infraestrutura existente.
- [x] Documentar arquitetura, campos, arquivos, decisão de preview/PDF e limitações em `docs/PROPOSTA-DOCUMENT-ENGINE.md`; atualizar `docs/system-context.md`.
- [x] Executar `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`. Gerar proposta Zincatec e casos de escopo extenso; abrir no Word e comparar todas as páginas.

## Critérios de validação

Sem placeholders residuais; Word abre sem recuperação; todas as mídias e partes gráficas são mantidas. Erro de persistência bloqueia exportação e não marca rascunho salvo. Resultado de preview antigo nunca substitui geração mais nova. Não reivindicar equivalência visual caso o visualizador falhe na composição específica deste documento.

## Resultado e limitação técnica

Template privado e motor Word implementados; fixtures padrão e extensa abertas no Microsoft Word (6 e 9 páginas), composição institucional preservada. Prévia em arquivo Word usa renderer canônico; PDF e visualização paginada no navegador estão indisponíveis até integração de conversor adequado. docx-preview perdeu caixas de texto da capa e posicionamento dos objetos no ensaio real. Não apresentar o aceite visual no navegador como concluído.

Relatório completo: `docs/PROPOSTA-DOCUMENT-ENGINE.md`. Os comandos obrigatórios foram executados; lint global apresenta problema preexistente em `app-shell.tsx:402`. Nenhuma publicação, migration remota ou alteração contratual foi realizada.
