# Apresentação automática da Due Diligence

O CRM monta o PPT da due no modelo do escritório a partir das planilhas que as áreas mandam. Antes, a compilação era feita à mão no PowerPoint.

## Fluxo

1. **Levantamento.** Cada área anexa a planilha do relatório (`.xlsx`) na própria tarefa (botão **Anexar planilha**). O CRM pergunta se já marca o levantamento como entregue. Comercial/admin também podem anexar na ficha.
2. **Compilação.** Na ficha do lead (aba Due diligence → **Apresentação automática**):
   - a capa vem do cadastro (razão social, CNPJ, demais empresas) e aceita o logo do cliente (opcional); razão social que não cabe em 2 linhas (~22 caracteres por linha a 24pt) sai com fonte menor (até 70%), para não passar por cima do traço e do CNPJ; pessoa física (CPF, ou nome sem LTDA/S.A./holding…) sai com "NOME" e "CPF:" e sem o ícone de empresa; sem documento, a linha do CNPJ/CPF sai; até 4 empresas ou pessoas além da principal; o logo fica centrado no círculo; pessoa física sem logo mostra a silhueta de pessoa no círculo (`IMG_ICONE_PESSOA`); lead do RD sem cadastro de empresas: a sugestão separa os CPFs/CNPJs emendados no cadastro do cliente (`clientes.documento`), na ordem dos nomes (`separarDocumentos`);
   - planilhas soltas no quadro geral vão para a área certa sozinhas (nome do arquivo e colunas); se não der para saber, o CRM pergunta;
   - cada área mostra os números calculados, o formato no PPT e os textos gerados (editáveis; `**trecho**` sai em negrito);
   - Reestruturação não tem planilha: o formulário cobre a RJ, a composição do endividamento (edital + relatório do AJ, ou só a documentação inicial), o plano, as formas especiais, as medidas e os pedidos de falência. **Preencher a partir do PDF** lê o edital, o relatório do AJ, o plano ou o pedido de falência com IA e sugere os campos (ver abaixo);
   - **Gerar e anexar à compilação** monta o PPT no navegador, baixa o arquivo e o anexa como PPT de compilação (vale para seguir para Revisão). **Só baixar** não anexa.
3. O rascunho (escolhas, textos editados, formulário) salva sozinho em `due_apresentacoes`.

O PPT é montado no navegador (`src/lib/due-ppt/client.ts`): modelo e planilhas descem por URL assinada do Storage e o resultado sobe do mesmo jeito. Nada de arquivo grande passa por função da Vercel (limite de ~4,5 MB no corpo).

## Reestruturação: preencher a partir do PDF

No formulário da Reestruturação, **Preencher a partir do PDF** aceita até 5 PDFs (50 MB cada) da recuperação judicial: edital do art. 52, §1º, relatório / relação de credores do administrador judicial, plano de recuperação, decisões.

1. Cada PDF sobe direto para o Storage por URL assinada (`due-documents/<lead>/reestruturacao-pdf/`), sem passar pelo corpo da função.
2. A rota extrai o texto com unpdf (o mesmo de `scope-import`), identifica a peça (nome do arquivo e começo do texto) e monta um recorte de até 60 mil caracteres: documento curto vai inteiro; o longo vai com o começo (autos, juízo, recuperandas) e os trechos com mais termos do formulário (classes, totais, extraconcursal, deságio, carência, credores parceiros, meios de recuperação). PDF digitalizado (sem texto) fica de fora com aviso.
3. A IA (cliente OpenAI de `scope-import`, saída estruturada strict) devolve o formulário inteiro; o que não estiver nos trechos volta em branco. A resposta passa por `parseRespostaReestruturacao`: valores viram número, datas `yyyy-mm-dd` (data inválida fica vazia), textos são cortados no limite do schema, linhas vazias saem, extraconcursal posto como classe vai para os campos próprios, e o resultado é validado por `reestruturacaoSchema`.
4. Os PDFs saem do Storage depois da leitura (com ou sem sucesso); sobras de envios interrompidos com mais de 1 h saem na leitura seguinte do mesmo lead.
5. Na tela, a sugestão **não é gravada**: o formulário mostra a prévia travada, com os campos da IA em azul, e uma lista para marcar o que entra. Campo vazio é preenchido; campo já preenchido com outro valor aparece como substituição, desmarcada. Classes e linhas do plano casam pela classe (I a IV pelo número ou pelo nome: trabalhista, garantia real, quirografário, ME/EPP), formas especiais e medidas pelo título; linha em branco recebe a primeira sobra; o que não casa entra como linha nova, até o máximo da lista. Nome da classe e título de linha já casada nunca são trocados.
6. **Aplicar** grava no rascunho (salvamento automático). Enquanto o formulário não for mexido, os campos da IA seguem em azul e **Desfazer** volta ao que era antes. **Descartar** fecha a revisão sem mudar nada.

Modelo: `DUE_REESTRUTURACAO_OPENAI_MODEL`; sem ela, o de extração do `scope-import` (`SCOPE_IMPORT_OPENAI_MODEL_EXTRACTION`, padrão `gpt-4.1-mini`). Precisa de `OPENAI_API_KEY`.

## Formato de cada área

| Área | Formatos | Automático |
|---|---|---|
| Cível | painel, um slide por processo, tabela | até 5 processos ativos → um slide por processo; acima → painel |
| Trabalhista | painel com gráficos, um slide por processo, tabela | até 5 processos ativos → **tabela** (como a área monta); acima → painel |
| Recuperação de Crédito | painel com gráficos, um slide por processo, tabela | até 5 processos ativos → um slide por processo; acima → painel |
| Tributário | painel | sempre painel |
| Reestruturação | slides da RJ + um slide por pedido de falência | só entram os slides com dado |

A tabela (`SLIDE_LISTA`) mostra 10 processos por slide, até 4 slides (os de maior valor; o aviso diz quantos ficaram de fora), no estilo da tabela que a área trabalhista monta (Prisma, 05/11/2026): cabeçalho azul-marinho, corpo sem fundo, bordas finas, texto centralizado; com poucas linhas, as linhas crescem até ocupar o cartão e, até 5, a letra fica 15% maior. Colunas: número, parte A, parte B, coluna extra, valor e informação. No Trabalhista: reclamante, reclamadas, origem do valor, valor envolvido e últimos andamentos; nas outras áreas a coluna extra sai. Mais de duas partes viram "A, B e outros". Um slide por processo vai até 15 processos.

Área sem processo ativo (exceto Tributário com dívida ativa) fica fora da apresentação, com aviso.

## Regras de cálculo

Conferidas contra os PPTs entregues (Cível do Sul Fluminense e Trabalhista/Rec. Crédito da ALEA batem centavo a centavo). Arquivado = situação começando com "arquiv", "baixad", "extint" ou "encerr".

**Cível** (`analisarCivel`)
- Potencial passivo: soma do valor da causa dos processos não arquivados com **polo do cliente = PASSIVO**. Sem a coluna "Polo do cliente", vale a "Posição do cliente" (Requerido, Executado, Réu… = passivo; Requerente, Autor, Exequente… = ativo; planilha da Synvia, 11/2026). Sem nenhuma das duas, soma todos (com aviso).
- Ativos / suspensos: não arquivados, separados por "Suspenso".
- Média e maior valor: sobre todos os não arquivados.
- Região: não arquivados por tribunal, do maior para o menor, com a UF ("SP · TJSP"; a UF sai da sigla TJxx ou, para TRF e outros, da coluna UF ou do número CNJ). Até 4 tribunais, um por coluna; com 5 ou mais, os 3 maiores + "Outros". Tribunal vazio sai do número CNJ (TJ + UF, TRF + região); "TJ-SP" vira "TJSP".
- Fase processual e sócio no polo passivo: até 3 fases e 2 linhas de sócio (o excedente vira "Outras fases").
- Sócio no polo passivo: sem essa coluna na planilha (ex.: pessoa física), o quadro vira "Polo do cliente" (polo passivo / polo ativo, com processos e valor da causa).
- Casos com maior valor: top 5 do polo passivo (coluna = primeira parte do polo ativo; a lista inteira de credores estoura a tabela). Nome com mais de ~55 caracteres vira o trecho depois do último " - " ("… LTDA - SICOOB DIVICRED" → "SICOOB DIVICRED") ou é cortado numa palavra.
- Leitura executiva: concordância com a classe ("execução … movida", "embargos … movidos", "cumprimento … movido").

**Trabalhista** (`analisarTrabalhista`) — regras tiradas dos slides que a área montou (ALEA, Antonini e Sedna, out/2026), conferidos contra as planilhas e confirmados com o advogado da área em 20/10/2026
- Potencial passivo: soma do **Valor envolvido** dos não arquivados, como a área preencheu (zero conta como zero: acordo quitado, execução extinta, execução reunida em processo piloto). O painel lista os não arquivados com valor zero e o último andamento. Sem a coluna, usa o valor da causa.
- Situação: **Ativos = ativos + suspensos** (regra da área) e Arquivados. O card da área no CRM mostra quantos dos ativos estão suspensos.
- Média do valor da causa: **todos os processos da planilha**, inclusive arquivados (igual nas três dues). Maior valor: maior valor envolvido dos não arquivados.
- Fases: as da planilha, na ordem Conhecimento → Recursal → Liquidação → Execução, com o valor envolvido de cada uma (nos slides da área o rótulo "Liquidação" ficava repetido no 2º/3º quadro).
- Processos por ano: toda a planilha, pela data de distribuição; anos sem processo entram com zero.
- Pedidos: coluna **Assuntos** (ou Pedidos), cada assunto da lista, todos os processos. Entram no gráfico os **10 de maior incidência** (a área usa 10 a 12; o gráfico do modelo foi desenhado para 9 e comporta 10). Catálogo em `PEDIDOS_TRABALHISTAS`: horas extras, verbas rescisórias, multa 477, dano moral (qualquer "moral"), vínculo de emprego, insalubridade (inclui "Outros Agentes Insalubres"), periculosidade, rescisão indireta, intervalo, acúmulo de função, desvio de função, acidente/doença ocupacional, adicional noturno, equiparação salarial, justa causa, estabilidade/reintegração, dano material. Assuntos fora do catálogo (FGTS, multa 467, férias e 13º proporcionais, honorários, reflexos, terceirização…) não entram.
- **Verbas rescisórias** = assunto "Verbas Rescisórias" **ou** multa 477 **ou** aviso prévio. É o saneamento que a área faz à mão: o reclamante muitas vezes cadastra só a multa 477 ou só o aviso prévio, e aí há pedido de verbas rescisórias.
- "Principais pedidos": os 3 primeiros do gráfico, sem a multa 477 (acessória das verbas rescisórias).
- Leitura executiva: fase predominante, principais pedidos e o processo de maior valor envolvido, com os pedidos dele.
- Saneamento: a área corrige a planilha do levantamento antes da due (situação desatualizada, processo em que o cliente foi excluído, assuntos incompletos). O CRM lê a planilha como foi enviada, então a planilha saneada é a que deve subir.
- Diferenças com os slides da área: nas três dues as barras "Multa 477" e "Verbas rescisórias" tinham o mesmo número, o maior dos dois assuntos (ALEA 54, Antonini 7, Sedna 44); pela regra acima a planilha dá ALEA 79/39, Antonini 11/6, Sedna 76/44. Anos da ALEA (41/82 no slide, 43/80 na planilha); valor da Execução da ALEA (43.291,01 no slide, 43.298,01 na planilha); rótulo "Liquidação" repetido no 3º quadro de fase.

**Tributário** (`analisarTributario`)
- Processos judiciais = execuções não arquivadas; passivo judicial = soma do valor.
- Órgão de origem pelo polo ativo: Estado do X, Municípios (UF pelo número CNJ), União (PGFN).
- Esfera administrativa: aba **PGE** (dívida ativa estadual) e aba **PGFN** (tributário / previdenciário / multa trabalhista) da mesma planilha. PGFN só com o valor de cada devedor (sem natureza): a tabela vira "Débitos por devedor" (`pgfnDevedores`), em vez de pôr tudo em "Tributário".
- Sem execução fiscal (só dívida ativa): textos e nota da conclusão dizem que o valor é a dívida ativa, sem "0 processos, todos em tramitação".
- Na conclusão: judicial + administrativo, com nota de rodapé.

**Recuperação de Crédito** (`analisarRecCred`) — só processos ativos
- Arquivados ficam fora de tudo: painel, slides por processo e lista (confirmado com a área em 20/10/2026). Suspensos entram, porque não estão arquivados.
- Valor por tipo de ação (top 5), faixas de valor (até 50 mil … acima de 1 milhão), valor por ano de ajuizamento, tempo de tramitação até hoje (até 1, 1–3, 3–5, +5 anos) e tempo médio, top 5 devedores.
- Vai para a conclusão como crédito (quadro "Recuperação de Créditos").

**Reestruturação** (formulário, sem planilha)
- Slide da RJ só com dados da recuperação (autos, recuperandas, competência, passivo ou classes). Juiz, relator, administrador e resumo vazios saem do slide (antes ficavam "—"); resumo com mais de 2 linhas sai com fonte 15% menor.
- Composição do endividamento: **edital + relatório do AJ** (colunas edital, AJ e variação) ou **só a documentação inicial** (art. 51, quando o processamento não foi deferido): os valores vão em `edital`, a tabela fica com 2 colunas ("DOCUMENTAÇÃO INICIAL"), o quadro lateral perde a variação e os rótulos "(AJ)".
- Pedidos de falência (até 6): cada um vira um slide de processo ("Pedido de Falência": requerente, empresa devedora — vazio usa a razão social da capa —, fundamento e crédito da inicial, valor da causa, situação, vara, tribunal pelo número CNJ, ajuizamento, juiz e status). Não entram na conclusão.
- Passivo total vai para a conclusão, com nota: "edital do art. 52, §1º" ou "documentação inicial da recuperação judicial (art. 51)"; créditos concursais podem coincidir com processos das demais áreas. Sem passivo informado, a área não entra na soma.

**Slides de processo (todas as áreas)**: mais de duas partes viram "A, B e outros"; parte com 2 linhas empurra os blocos de baixo (com 3, a fonte das partes cai 15%); vara que já cita a comarca não repete a comarca ("1ª Vara Cível da Comarca de Sumaré/SP"); classe, vara, comarca e assuntos sem acento ganham os acentos comuns (`acentuar`: execução, título, sentença, cível, são…); "movido/movida/movidos" concorda com a classe; blocos e informações vazios saem.

**Conclusão**: áreas de passivo em ordem de valor, barra proporcional e % do total. Com Recuperação de Crédito usa o slide com o quadro de crédito; com mais de 2 áreas de passivo nesse slide, as linhas ficam compactas (percentual ao lado do valor, com a marca da nota). As notas de rodapé (Reestruturação, Tributário) saem nos dois slides.

## Contrato do modelo

O modelo ativo fica em `due_modelos_apresentacao` + bucket `due-documents/modelos/`. Sem nenhum, a rota sobe `templates/due/MODELO-DUE-CRM.pptx`. Admin troca o modelo em **Due diligence → Modelo da apresentação**; o arquivo é conferido antes do envio.

- **Slides**: cada slide tem um elemento com nome `SLIDE_*` (Painel de Seleção do PowerPoint). Lista em `src/lib/due-ppt/modelo.ts`. Repetir um slide (um por processo, páginas da lista) clona o slide; slides com gráfico não são clonados.
- **Valores**: campos `{{NOME}}` no texto. Dá para mudar fonte, cor e posição; o valor herda o formato do campo. Linha de tabela com `{{row.*}}` é o molde das linhas.
- **Elementos que o gerador move ou apaga** (manter os nomes):
  - capa: `TXT_EMPRESA_n`, `ICO_EMPRESA_n`, `IMG_LOGO_CLIENTE`, `CIRCULO_CLIENTE`, `CIRCULO_ESCRITORIO`, `IMG_LOGO_ESCRITORIO`;
  - áreas envolvidas: grupos `AREA_REESTRUTURACAO`, `AREA_REC_CRED`, `AREA_CIVEL`, `AREA_TRABALHISTA`, `AREA_TRIBUTARIO` (com 5 áreas o layout do modelo fica como está; com menos, os cards são centralizados numa linha);
  - fases e sócios: `CIVEL_FASE_n_*`, `CIVEL_SOCIO_n_*`, `TRAB_FASE_n_*` + `*_LINHA`;
  - região do Cível: colunas `CIVEL_TRIBUNAL_n_NOME` / `CIVEL_TRIBUNAL_n_QTD` (n = 1 a 4) e divisórias `CIVEL_TRIBUNAL_DIV_n`. O gerador deixa só as colunas usadas e divide entre elas a faixa que as 4 ocupam no modelo; com 4 colunas o nome sai 10% menor. Modelo sem essas colunas (anterior a 20/10/2026) segue com `{{CIVEL_REGIAO_1}}` / `{{CIVEL_REGIAO_2}}`: o maior tribunal + "Outros";
  - crédito: `RC_TIPO_QTD_n` (alinhados às barras do gráfico), gráficos `CHART_RC_TIPO|FAIXA|ANO|TEMPO`, `CHART_TRAB_ANO|PEDIDOS`;
  - tabelas: `TBL_*`; a tabela da lista (`TBL_LISTA`) tem 6 colunas, e a de cabeçalho `{{LISTA_L_EXTRA}}` sai nas áreas que não a usam (modelo antigo, de 5 colunas, segue funcionando);
  - endividamento da RJ: rótulos `{{RJ_L_EDITAL|AJ|VARIACAO}}` no cabeçalho e `{{RJ_L_CONCURSAL|EXTRA|TOTAL}}` no quadro lateral; `RJ_VARIACAO_ROTULO|CHIP|TEXTO` (saem com a documentação inicial) e `RJ_EXTRA_*`, `RJ_TOTAL_*` (sobem no lugar);
  - slide de processo: `Reclamante Value`, `Reclamadas Value`, `Pedidos *`, `Alegacoes *`, `Contrato *`, `Cargo *`, `Remun *`, `Resumo *`; slide da RJ: `Juiz *`, `Relator *`, `Admin *`, `Summary *`;
  - conclusão: `CONC_<REEST|TRIB|TRAB|CIVEL>_<NOME|VALOR|TRILHO|BARRA|PCT|ICONE>`, `CONC_SEPARADOR`, `CONC_NOTAS`.
- Gráficos: o cache do slide e a planilha embutida ("Editar dados") são atualizados juntos; rótulos fixos por ponto viram o valor novo.
- Partes que ficam sem uso (slides, gráficos, imagens) saem do arquivo.

`scripts/due-ppt/prepare-due-template.py` gerou o modelo do CRM a partir do "MODELO DUE - NOVO CRM.pptx" (troca os valores de exemplo por campos, dá os nomes acima, cria o slide de lista e tira notas internas e comentários). `scripts/due-ppt/gerar-apresentacao.ts` gera um PPT pela linha de comando com o mesmo código do CRM.

## Arquivos

- `src/lib/due-ppt/` — leitura de `.xlsx` (`xlsx-reader.ts`), normalização (`processos.ts`), cálculos (`analise.ts`), regras do deck (`compose.ts`), motor PPTX (`pptx/*`), navegador (`client.ts`), contrato do modelo (`modelo.ts`). Leitura dos PDFs da RJ: recorte, schema, prompts e parse (`reestruturacao-ia.ts`), mescla com o formulário (`reestruturacao-mescla.ts`), upload e chamada no navegador (`reestruturacao-pdf-client.ts`).
- `src/components/crm/due-apresentacao/` — painel da ficha.
- `src/app/(crm)/crm/documentos/due-modelos-card.tsx` — modelo na página Due diligence.
- APIs: `GET|POST|DELETE /api/crm/leads/[id]/due-documents` (kinds `ppt_compilacao`, `planilha_area` + `areaKey`, `logo_cliente`), `GET|PUT|PATCH /api/crm/leads/[id]/due-apresentacao`, `POST /api/crm/leads/[id]/due-apresentacao/reestruturacao-pdf` (`create-upload-url` / `extrair`), `GET|POST|PATCH /api/crm/due/modelos`.
- Migration `20261020120000_due_apresentacao_automatica.sql`.
