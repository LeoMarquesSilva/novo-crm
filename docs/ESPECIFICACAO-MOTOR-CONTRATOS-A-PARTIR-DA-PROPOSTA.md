# CRM Jurídico — Especificação completa do motor de contratos a partir da proposta

**Projeto:** CRM Jurídico — Bismarchi | Pires  
**Escopo desta tarefa:** etapa de **confecção do contrato**, imediatamente posterior à proposta comercial  
**Objetivo:** transformar o contrato em um documento estruturado, dinâmico e juridicamente consistente com a proposta aprovada, reutilizando os dados e os escopos da etapa anterior.

---

# 0. INSTRUÇÃO PRINCIPAL PARA O CURSOR

Antes de alterar qualquer código:

1. Leia integralmente esta especificação.
2. Leia a auditoria técnica já existente do módulo documental.
3. Inspecione o código atual da proposta e do contrato.
4. Inspecione os três modelos Word fornecidos:
   - `MODELO DE CONTRATO TRABALHISTA - AUDITORIA.docx`
   - `MODELO DE CONTRATO TRABALHISTA - CANAL DE DENÚNCIAS.docx`
   - `MODELO DE CONTRATO TRABALHISTA - DIAGNÓSTICO.docx`
5. Inspecione como a proposta persiste:
   - cliente(s);
   - áreas;
   - tipos/subtipos de escopo;
   - textos do escopo;
   - investimento;
   - forma de pagamento;
   - demais campos comerciais.
6. Só depois proponha e implemente a arquitetura.

Não trate os três documentos Word como três contratos independentes a serem hardcodados.

Eles são **fontes para descobrir a estrutura jurídica comum, as cláusulas variáveis e as regras ligadas a cada tipo de serviço**.

A arquitetura desejada é:

```text
PROPOSTA APROVADA
        │
        ├── Cliente(s)
        ├── Escopos contratados
        ├── Área / tipo / subtipo
        ├── Investimento
        └── Condições comerciais
        │
        ▼
CANONICAL CONTRACT DATA
        │
        ├── Preâmbulo
        ├── Objeto
        ├── Escopo
        ├── Limites / exclusões
        ├── Preço e pagamento
        ├── Vigência
        ├── Cláusulas aplicáveis
        └── Signatários
        │
        ▼
MOTOR DE REGRAS CONTRATUAIS
        │
        ├── cláusulas fixas
        ├── cláusulas por escopo
        ├── cláusulas condicionais
        └── cláusulas adicionais aprovadas
        │
        ▼
TEMPLATE WORD CANÔNICO
        │
        ▼
VERSÃO DO CONTRATO
        │
        ├── Preview
        ├── Word
        ├── Revisão jurídica
        └── D4Sign
```

A proposta e o contrato devem deixar de ser dois mundos desconectados.

---

# 1. OBJETIVO DE PRODUTO

Quando uma oportunidade chegar à etapa **Confecção do Contrato**, o sistema já deve saber grande parte das informações necessárias porque elas foram definidas na proposta.

O usuário NÃO deve preencher novamente:

- razão social;
- CNPJ;
- endereço;
- áreas contratadas;
- serviços contratados;
- escopos aprovados;
- investimento;
- estrutura de pagamento já definida na proposta.

A etapa de contrato deve:

1. herdar os dados comerciais;
2. traduzir os escopos aprovados em linguagem contratual;
3. adicionar as cláusulas jurídicas necessárias;
4. permitir revisão/ajuste pelo Societário e Contratos;
5. gerar um único documento canônico.

---

# 2. PRINCÍPIO MAIS IMPORTANTE: PROPOSTA E CONTRATO DEVEM SER SEMANTICAMENTE LIGADOS

Não copiar simplesmente o texto visível da proposta para dentro do contrato.

A proposta possui linguagem **comercial/descritiva**.

O contrato possui linguagem **jurídica/obrigacional**.

Portanto, a ligação correta deve ser por **identificador de escopo**, e não somente por texto.

Exemplo:

```text
proposal_scope_subtype
id: trabalhista_auditoria
label: Auditoria Trabalhista
```

Na proposta:

```text
Auditoria Trabalhista:
Mapeamento de riscos...
```

No contrato, o MESMO `scope_subtype_id` deve resolver:

```text
Objeto
Escopo contratual
Limites
Exclusões
Vigência específica
Obrigações específicas
```

Arquitetura conceitual:

```text
ESCOPO DA PROPOSTA
        │
        │ scope_subtype_id
        ▼
MAPEAMENTO CONTRATUAL
        │
        ├── object_clause
        ├── scope_clause
        ├── limitation_clause
        ├── exclusion_clause
        ├── term_rule
        └── obligation_rules
```

---

# 3. ANÁLISE DOS TRÊS MODELOS FORNECIDOS

## 3.1. Modelo — Auditoria Trabalhista

O modelo demonstra:

### Objeto específico

Auditoria Trabalhista para:

- identificar riscos;
- mapear e mensurar riscos;
- recomendar mitigação;
- análise documental;
- entrevistas;
- visita técnica;
- pareceres;
- relatório executivo.

### Exclusões específicas

Além das exclusões jurídicas gerais, existe bloco trabalhista excluindo, por exemplo:

- reclamações trabalhistas;
- consultivo diário;
- programa de compliance;
- diagnóstico psicossocial / NR-1;
- procedimentos MPT/MTE;
- sustentação oral.

### Investimento

Preço fechado parcelado.

### Vigência

Vinculada à conclusão do projeto:

```text
até a entrega do Relatório Conclusivo
```

com duração estimada de quatro meses.

### Início

Assinatura do contrato.

### Particularidade importante

Existem **duas empresas contratantes**.

Portanto o motor precisa suportar:

```text
1 contratante
N contratantes
```

e não apenas uma empresa.

---

# 4. Modelo — Canal de Denúncias

Este contrato possui estrutura contratual diferente no objeto.

## Objeto

Disponibilização e operacionalização da plataforma de canal de denúncias.

## Escopo próprio

O contrato detalha:

- recebimento;
- triagem;
- classificação;
- organização;
- encaminhamento;
- registro;
- controle.

## Limites próprios

O contrato delimita explicitamente que a CONTRATADA não é responsável por:

- investigação;
- medida disciplinar;
- apuração formal;
- decisão;
- implementação de plano de ação.

## Natureza

Possui uma cláusula específica declarando natureza:

> administrativa e organizacional.

Essa cláusula NÃO deve existir automaticamente em outros serviços.

## Exclusões

Além das exclusões gerais, possui exclusões trabalhistas próprias.

## Vigência

12 meses.

## Início

Primeiro pagamento.

## Pagamento

Possui cláusulas específicas de boleto.

## Atenção: documento contém marcas de revisão

O arquivo possui alterações controladas / trechos inseridos e excluídos.

Portanto:

**NÃO usar este arquivo diretamente como master template sem primeiro consolidar/aceitar a redação juridicamente aprovada.**

Há ainda indícios de conteúdo reaproveitado de outros documentos.

O Cursor deve tratar esse arquivo como **fonte de variações**, não como fonte absoluta da redação definitiva.

---

# 5. Modelo — Diagnóstico de Riscos Psicossociais / NR-1

## Objeto

Identificação e mapeamento de riscos psicossociais.

## Escopo

Inclui:

1. aplicação de questionário HSE-IT;
2. análise/validação;
3. relatório conclusivo para GRO/PGR.

## Limitação

A implementação posterior das medidas e consultoria diária ficam fora do escopo.

## Investimento

Preço fechado com:

- entrada;
- parcelas subsequentes.

## Vigência

Até entrega do laudo conclusivo.

Prazo máximo de 30 dias.

## Início

Primeiro pagamento.

---

# 6. CONCLUSÃO DOS MODELOS: O CONTRATO NÃO DEVE SER UM TEMPLATE MONOLÍTICO

Os documentos demonstram que existe uma estrutura comum, porém alguns blocos mudam conforme o serviço.

Portanto, NÃO implementar:

```text
if auditoria => contrato_auditoria.docx
if canal => contrato_canal.docx
if diagnostico => contrato_diagnostico.docx
```

Isso criaria dezenas de modelos ao longo do tempo.

Implementar:

```text
MASTER CONTRACT TEMPLATE
+
CLAUSE ENGINE
+
SCOPE CONTRACT RULES
```

---

# 7. ESTRUTURA CONTRATUAL RECOMENDADA

Estrutura-base:

```text
PREÂMBULO

1. OBJETO DO CONTRATO
   [DINÂMICO POR ESCOPO]

2. OBJETOS EXCLUÍDOS DO CONTRATO
   [BASE + VARIAÇÕES POR ESCOPO]

3. PREÇO E FORMA DE PAGAMENTO
   [DINÂMICO A PARTIR DA PROPOSTA]

4. INADIMPLEMENTO
   [PADRÃO]

5. VIGÊNCIA
   [REGRA POR ESCOPO / COMERCIAL]

6. EXTINÇÃO DO CONTRATO
   [PADRÃO]

7. OBRIGAÇÕES DA CONTRATADA
   [BASE + COMPLEMENTOS POR ESCOPO]

8. OBRIGAÇÕES DA CONTRATANTE
   [BASE + COMPLEMENTOS POR ESCOPO]

9. DESPESAS
   [PADRÃO OU CONDICIONAL]

10. COMPLIANCE E LEI ANTICORRUPÇÃO
    [PADRÃO]

11. DISPOSIÇÕES GERAIS
    [PADRÃO]

LOCAL E DATA

PÁGINA DE ASSINATURAS
```

A numeração precisa ser calculada automaticamente caso uma seção seja removida/adicionada.

---

# 8. MATRIZ: FIXO X DINÂMICO X CONDICIONAL

| Bloco | Classificação | Fonte |
|---|---|---|
| Branding, header e footer | FIXO | Master Word |
| Título do instrumento | CONDICIONAL | Tipo de serviço/instrumento |
| Qualificação da CONTRATADA BP | FIXO VERSIONADO | Configuração institucional |
| Qualificação CONTRATANTE(S) | DINÂMICO | Proposta / cliente |
| Definição Partes | DINÂMICO | Número de contratantes |
| Objeto | DINÂMICO | Escopos aprovados |
| Detalhamento de escopo | DINÂMICO | Mapeamento do escopo |
| Limites do serviço | DINÂMICO/CONDICIONAL | Mapeamento do escopo |
| Objetos excluídos gerais | FIXO VERSIONADO | Catálogo jurídico |
| Exclusões da área | DINÂMICO | Área / subtipo |
| Alteração de escopo / aditivo | FIXO | Catálogo jurídico |
| Honorários | DINÂMICO | Investimento da proposta |
| Vencimento | DINÂMICO | Comercial / contrato |
| Forma de pagamento | DINÂMICO | Investimento |
| Conta bancária | CONDICIONAL | Meio de pagamento |
| Boleto | CONDICIONAL | Meio de pagamento |
| Inadimplemento | FIXO VERSIONADO | Catálogo jurídico |
| Vigência | DINÂMICO | Escopo + regra comercial |
| Início dos serviços | DINÂMICO/CONDICIONAL | Escopo/regra |
| Extinção | FIXO VERSIONADO | Catálogo jurídico |
| Obrigações CONTRATADA | BASE + VARIAÇÕES | Catálogo + escopo |
| Obrigações CONTRATANTE | BASE + VARIAÇÕES | Catálogo + escopo |
| Despesas | FIXO/CONDICIONAL | Configuração |
| Compliance | FIXO VERSIONADO | Catálogo |
| Disposições gerais | FIXO VERSIONADO | Catálogo |
| Local/data | DINÂMICO | Geração |
| Assinaturas BP | FIXO CONFIGURÁVEL | Cadastro de signatários |
| Assinaturas cliente | DINÂMICO | Contratantes |

---

# 9. DADOS QUE DEVEM VIR AUTOMATICAMENTE DA PROPOSTA

Na entrada da etapa `confeccao_contrato`, construir um snapshot dos dados aprovados da proposta.

Não depender apenas de campos digitados novamente no contrato.

## 9.1 Cliente

Herdar:

- razão social;
- nome fantasia quando aplicável;
- CPF/CNPJ;
- logradouro;
- número;
- complemento;
- bairro;
- cidade;
- UF;
- CEP.

Se existirem várias empresas na proposta, permitir definir:

```text
empresa participante
empresa contratante
empresa apenas relacionada
```

Não assumir que todas são automaticamente contratantes sem uma regra explícita.

---

# 10. MÚLTIPLAS CONTRATANTES

O modelo de Auditoria demonstra duas empresas no mesmo contrato.

Implementar estrutura:

```ts
contractingParties: ContractingParty[]
```

Exemplo:

```json
[
  {
    "razaoSocial": "Empresa A",
    "documento": "...",
    "endereco": {...}
  },
  {
    "razaoSocial": "Empresa B",
    "documento": "...",
    "endereco": {...}
  }
]
```

O renderer deve gerar uma qualificação para cada empresa.

Também deve resolver gramática:

```text
CONTRATANTE
CONTRATANTES

a CONTRATANTE
as CONTRATANTES

pela CONTRATANTE
pelas CONTRATANTES
```

Não espalhar `if length > 1` pelo código.

Criar helper central de linguagem das partes.

---

# 11. ESCOPOS: HERDAR A ESTRUTURA, NÃO SÓ O TEXTO

O sistema da proposta já possui:

```text
Área
  → Tipo
     → Subtipo
        → textos
        → placeholders
```

O contrato deve herdar os IDs selecionados.

Exemplo:

```json
{
  "areaId": "...",
  "typeId": "...",
  "subtypeId": "...",
  "label": "Auditoria Trabalhista"
}
```

Nunca tomar decisão jurídica por comparação de label:

```ts
if (label === "Auditoria Trabalhista")
```

Preferir IDs/códigos estáveis.

---

# 12. NOVO CONCEITO: CONTRACT SCOPE PROFILE

Cada subtipo comercial que puder gerar contrato deve possuir um perfil contratual.

Conceitualmente:

```ts
type ContractScopeProfile = {
  scopeSubtypeId: string

  instrumentType?: string

  objectClauses: ClauseReference[]
  scopeClauses?: ClauseReference[]
  limitationClauses?: ClauseReference[]
  exclusionClauses?: ClauseReference[]

  contractedPartyObligations?: ClauseReference[]
  contractingPartyObligations?: ClauseReference[]

  defaultTermRule?: ContractTermRule
  defaultStartRule?: ContractStartRule

  defaultExpensePolicy?: string

  active: boolean
}
```

NÃO é obrigatório usar esses nomes.

A arquitetura é obrigatória.

---

# 13. EXEMPLOS DE PERFIS A PARTIR DOS DOCUMENTOS

## 13.1 `trabalhista_auditoria`

Resolver:

```text
Objeto:
Auditoria Trabalhista

Escopo:
análise documental
entrevistas
visita técnica
pareceres / relatório

Exclusões:
consultivo diário
contencioso
NR-1 psicossocial
MPT/MTE
etc.

Vigência:
até relatório conclusivo
estimativa 4 meses

Início:
assinatura
```

---

# 14. `trabalhista_canal_denuncias`

Resolver:

```text
Objeto:
plataforma de canal de denúncias

Escopo:
recebimento
triagem
classificação
encaminhamento
controle

Limites:
não investiga
não pune
não decide
não implementa plano de ação

Natureza:
administrativa/organizacional

Vigência:
12 meses

Início:
primeiro pagamento
```

---

# 15. `trabalhista_diagnostico_psicossocial_nr1`

Resolver:

```text
Objeto:
diagnóstico de riscos psicossociais NR-1

Escopo:
HSE-IT
análise
validação
relatório GRO/PGR

Limites:
implementação de plano não incluída
consultoria diária não incluída

Vigência:
até laudo conclusivo
máx. 30 dias

Início:
primeiro pagamento
```

---

# 16. IMPORTANTE: NÃO GERAR EXCLUSÕES CONTRADITÓRIAS

Este é um requisito crítico.

Se a proposta contratou:

```text
Auditoria Trabalhista
+
Diagnóstico Psicossocial NR-1
```

o contrato NÃO pode dizer no objeto que ambos estão contratados e depois, em “Objetos Excluídos”, dizer que Diagnóstico Psicossocial está excluído.

O engine deve conhecer o conjunto COMPLETO de escopos contratados.

Regra conceitual:

```ts
allSelectedScopes = Set(scopeSubtypeIds)

exclusionClauseCandidates
  .filter(clause => !clause.conflictsWith.some(id => allSelectedScopes.has(id)))
```

Cada exclusão precisa ter metadados de conflito.

Exemplo:

```json
{
  "clause": "diagnostico_psicossocial_excluido",
  "conflictsWith": ["trabalhista_diagnostico_psicossocial_nr1"]
}
```

---

# 17. MÚLTIPLOS ESCOPOS NO MESMO CONTRATO

Um contrato pode ter:

```text
Trabalhista — Consultivo
Trabalhista — Contencioso
Societário — Acordo de Sócios
```

Portanto, o motor não pode assumir uma única cláusula 1.1.

Criar agregação determinística.

Exemplo conceitual:

```text
1. OBJETO DO CONTRATO

1.1. Objeto Geral.
...

1.2. Escopo Trabalhista — Consultivo.
...

1.3. Escopo Trabalhista — Contencioso.
...

1.4. Escopo Societário — Acordo de Sócios.
...
```

OU outra estrutura que a equipe jurídica aprove.

O importante:

- nenhum escopo da proposta pode desaparecer;
- nenhum escopo não contratado pode entrar;
- ordem previsível;
- sem duplicação.

---

# 18. ALINHAMENTO PROPOSTA → CONTRATO

Criar validação automática:

```text
Escopos aprovados na proposta
=
Escopos representados no contrato
```

Antes de permitir “Enviar para revisão”, o sistema deve verificar:

```text
✓ Todos os subtipos aprovados possuem perfil contratual
✓ Todos aparecem no objeto/escopo
✓ Nenhuma cláusula de exclusão contradiz escopo contratado
✓ Nenhuma área ficou sem representação
```

Caso falte mapeamento:

```text
O escopo "X" ainda não possui cláusulas contratuais configuradas.
Solicite configuração ao administrador/Societário.
```

NÃO gerar contrato silenciosamente incompleto.

---

# 19. INVESTIMENTO: FONTE DA VERDADE É A PROPOSTA

Não usar valores copiados dos modelos Word.

Os valores observados nos exemplos são apenas casos reais/anteriores.

O contrato deve receber os dados estruturados do investimento aprovado.

Idealmente não usar apenas:

```text
cp_investimento_resumo = "R$..."
```

Se os dados estruturados existirem no JSON da proposta, usar:

```text
tipo
subtipo
valor
parcelas
entrada
vencimento
tributação
manutenção
êxito
condições
```

Gerar cláusula 3 automaticamente.

---

# 20. ENGINE DE PREÇO E FORMA DE PAGAMENTO

Exemplos de regras.

## Mensal fixo

```text
Honorários mensais de R$ X...
```

## Preço fechado

```text
Valor total de R$ X...
```

## Preço fechado parcelado

```text
Valor total de R$ X, pago em N parcelas...
```

## Entrada + parcelas

```text
Entrada de R$ X e N parcelas de R$ Y...
```

## Êxito

Gerar cláusula própria.

## Fixo + êxito

Gerar ambos os componentes.

## Manutenção

Gerar componente de manutenção, quando aplicável.

Não codificar dezenas de frases em componentes React.

Criar um domínio de cobrança contratual reutilizável.

---

# 21. VALOR POR EXTENSO

Todo valor relevante deve possuir:

```text
valor numérico
valor por extenso
```

Usar helper único.

Exemplo:

```text
R$ 4.000,00 (quatro mil reais)
```

Nunca confiar no texto vindo do Word antigo.

Validar:

```text
soma das parcelas + entrada = valor total
```

quando o modelo comercial exigir igualdade.

---

# 22. PRIMEIRO VENCIMENTO

Os modelos possuem datas específicas.

Essas datas NÃO são fixas.

Se a proposta não possuir primeiro vencimento, a etapa de contrato deve solicitar explicitamente.

Campo:

```text
Primeiro vencimento
```

Não inventar data.

---

# 23. FORMA DE PAGAMENTO: BOLETO X CONTA BANCÁRIA

Os modelos demonstram variações.

Não manter os dois blocos indiscriminadamente.

Criar regra:

```text
payment_method = boleto
→ cláusulas boleto

payment_method = transferencia
→ conta bancária

payment_method = pix
→ dados PIX

payment_method = combinado
→ blocos correspondentes
```

Dados bancários BP devem vir de configuração institucional, não ficar repetidos em cada template.

---

# 24. VIGÊNCIA NÃO É FIXA

Os três documentos comprovam pelo menos três regras:

```text
AUDITORIA
até relatório + estimativa 4 meses

CANAL DE DENÚNCIAS
12 meses

DIAGNÓSTICO
até laudo + máximo 30 dias
```

Portanto:

```ts
ContractTermRule
```

deve suportar conceitualmente:

```text
fixed_months
fixed_days
until_deliverable
until_deliverable_with_estimate
indefinite
manual
```

---

# 25. INÍCIO DO SERVIÇO

Também varia:

```text
na assinatura
no primeiro pagamento
em data definida
```

Criar `startRule`.

Não hardcodar.

---

# 26. CLÁUSULAS FIXAS DEVEM SER VERSIONADAS

Os modelos compartilham grande parte das cláusulas:

- inadimplemento;
- extinção;
- obrigações;
- despesas;
- compliance;
- disposições gerais;
- foro;
- assinaturas.

Porém, “fixa” NÃO significa “hardcoded para sempre”.

Significa:

> cláusula jurídica institucional versionada e reutilizável.

Usar/estender o catálogo já existente `contract_clause_templates`.

Cada cláusula deve ter, quando aplicável:

```text
id
stable_key
title
content
category
version
status
sort_order
is_required
effective_from
effective_to
approved_by
approved_at
```

Preservar compatibilidade com o schema atual quando possível.

---

# 27. NÃO ALTERAR REDAÇÃO JURÍDICA AUTOMATICAMENTE

O sistema pode:

- selecionar cláusula;
- combinar cláusulas;
- preencher placeholders;
- ajustar singular/plural controlado.

O sistema NÃO deve:

- reescrever cláusulas com IA em runtime;
- “melhorar” redação;
- resumir;
- adaptar livremente texto jurídico.

Todo conteúdo contratual deve vir de:

```text
cláusula aprovada
+
placeholders controlados
```

---

# 28. TRATAMENTO DOS MODELOS COM ERROS / REVISÕES

Os documentos fornecidos possuem inconsistências que demonstram por que o sistema precisa de catálogo.

Exemplos observados:

- valores comerciais reaproveitados entre documentos;
- marcas de revisão no Canal de Denúncias;
- textos riscados/inseridos;
- numeração em revisão;
- contratos com estruturas de pagamento diferentes;
- singular/plural inconsistente;
- página de assinatura que pode não corresponder exatamente ao preâmbulo;
- trechos possivelmente copiados de outro modelo;
- duplicidade de cláusula de legislação aplicável em algumas versões;
- pequenos erros materiais/typos.

NÃO corrigir juridicamente esses textos por conta própria.

Transformar essas ocorrências em itens para **revisão humana da equipe Societário e Contratos** antes de cadastrar a versão oficial no catálogo.

---

# 29. MASTER WORD DO CONTRATO

A recomendação é possuir UM template estrutural principal.

Exemplo:

```text
templates/contrato/CONTRATO-BP-MASTER-V1.docx
```

O Word deve conter:

- cabeçalho;
- logo;
- linhas;
- rodapé;
- margens;
- estilos;
- paginação;
- identidade visual.

E placeholders estruturais:

```text
[TITULO_CONTRATO]

[QUALIFICACAO_CONTRATANTES]

[QUALIFICACAO_CONTRATADA]

[DEFINICAO_PARTES]

[CLAUSULAS_CONTRATO]

[LOCAL_DATA]

[ASSINATURAS]
```

OU estrutura equivalente suportada pelo renderer.

Evitar inserir dezenas de cláusulas diretamente no Word master.

O master deve mandar no **visual**.

O engine manda no **conteúdo**.

---

# 30. BASE ESTRUTURAL RECOMENDADA

Entre os três arquivos, o modelo de Auditoria é o melhor candidato inicial para referência estrutural porque está visualmente consolidado e não apresenta o mesmo volume de alterações controladas visíveis do Canal de Denúncias.

Isso NÃO significa que o texto da Auditoria deve virar cláusula padrão.

Usar apenas:

- header;
- footer;
- estilos;
- margens;
- padrão de títulos;
- padrão de numeração;
- página de assinaturas.

A redação jurídica deve vir do catálogo.

---

# 31. CANONICAL CONTRACT DATA

Criar uma camada única.

Conceitualmente:

```ts
type CanonicalContractData = {
  opportunityId: string

  contractingParties: ContractingParty[]
  contractedFirm: FirmParty

  proposalSnapshotId: string

  scopes: ContractScope[]
  investment: ContractInvestment

  payment: ContractPayment
  term: ContractTerm
  startRule: ContractStartRule

  clauses: ResolvedContractClause[]

  signers: ContractSigner[]

  generation: {
    city: string
    generatedAt: string
  }
}
```

O preview, Word, revisão e envio devem consumir essa mesma estrutura.

---

# 32. SNAPSHOT DA PROPOSTA AO ENTRAR NO CONTRATO

Não depender indefinidamente de dados mutáveis da proposta.

Ao iniciar o contrato, criar snapshot:

```text
proposal_contract_snapshot
```

ou estrutura equivalente dentro de `document_instances.data_json` / `document_versions`, se fizer mais sentido no schema atual.

Guardar:

```text
cliente(s)
escopos
IDs de catálogo
investimento
condições
timestamp
versão/origem
```

Motivo:

A proposta pode ser editada depois.

O contrato precisa saber de qual estado comercial nasceu.

---

# 33. SINCRONIZAÇÃO COM ALTERAÇÕES DA PROPOSTA

Se a proposta for alterada depois que o contrato começou:

NÃO atualizar silenciosamente o contrato.

Exibir:

```text
A proposta foi alterada após a criação deste contrato.

[Comparar alterações]
[Atualizar contrato a partir da proposta]
[Manter versão atual]
```

Atualização deve:

- gerar novo draft;
- invalidar revisão anterior;
- recalcular cláusulas;
- registrar evento.

---

# 34. MAPEAMENTO NO BANCO

Investigar reutilização das tabelas atuais antes de criar novas.

Provavelmente envolverá:

```text
proposal_scope_subtypes
contract_clause_templates
document_templates
document_instances
document_versions
contract_review_tasks
field_values
```

Criar novas tabelas apenas onde a relação não puder ser representada de forma clara.

Sugestão conceitual:

## `contract_scope_profiles`

```text
id
proposal_scope_subtype_id
instrument_type
default_term_rule_json
default_start_rule_json
is_active
created_at
updated_at
```

## `contract_scope_profile_clauses`

```text
id
profile_id
contract_clause_template_id
role
sort_order
is_required
conditions_json
```

`role`:

```text
object
scope
limitation
exclusion
contracted_obligation
contracting_obligation
special
```

---

# 35. METADADOS DE CONFLITO

Para evitar exclusões contraditórias:

```text
contract_clause_scope_conflicts
```

ou campo JSON equivalente.

Conceito:

```json
{
  "excludeWhenScopesPresent": [
    "scope_subtype_uuid"
  ]
}
```

Também pode existir:

```text
requiresScopes
requiresAreas
excludesScopes
```

---

# 36. BUILDER DE CONTRATO

O builder não deve começar vazio.

Ao abrir:

```text
Contrato de [Cliente]

Herdado da proposta
✓ 2 contratantes
✓ 3 escopos
✓ investimento
✓ dados cadastrais

Cláusulas resolvidas
✓ 18 padrão
✓ 4 específicas de Trabalhista
✓ 2 específicas de Auditoria

Pendências
• primeiro vencimento
• confirmar vigência
```

---

# 37. UX: SEPARAR DADO COMERCIAL DE DECISÃO JURÍDICA

Organizar formulário em blocos:

## 1. Partes

Dados herdados.

## 2. Escopos contratados

Read-only por padrão, derivados da proposta.

## 3. Condições comerciais

Herdadas da proposta.

## 4. Condições contratuais

- início;
- vigência;
- vencimento;
- forma de pagamento;
- cláusulas condicionais.

## 5. Cláusulas

Lista de cláusulas resolvidas.

Mostrar origem:

```text
[PADRÃO BP]
[TRABALHISTA]
[AUDITORIA]
[MANUAL]
```

## 6. Preview

Documento canônico.

---

# 38. CLÁUSULAS MANUAIS

Permitir cláusula adicional apenas para usuário autorizado.

Ao adicionar:

```text
Título
Conteúdo
Posição
Motivo
```

Registrar:

```text
added_by
added_at
```

Ao alterar texto de cláusula padrão:

não sobrescrever a versão da biblioteca.

Criar override do documento.

---

# 39. MOSTRAR DIFERENÇAS PARA SOCIETÁRIO

Na revisão jurídica, mostrar:

```text
Escopo comercial aprovado:
Auditoria Trabalhista

Cláusula contratual gerada:
1.1 ...

Origem:
Perfil contratual: Auditoria Trabalhista v3
```

Isso facilita validar se proposta e contrato estão alinhados.

---

# 40. GATE DE REVISÃO

Corrigir a fragilidade apontada na auditoria atual.

A aprovação deve estar ligada a uma versão do documento.

Não apenas:

```text
review.status = concluido
```

Mas conceitualmente:

```text
review.document_version_id
review.approved_at
review.approved_by
review.document_hash
```

Se o contrato mudar:

```text
nova versão
→ revisão anterior NÃO aprova a nova versão
```

---

# 41. VERSIONAMENTO DO CONTRATO

Estados sugeridos:

```text
draft
ready_for_review
in_review
changes_requested
approved
sent_for_signature
signed
superseded
```

Não é obrigatório criar enum se o projeto tiver arquitetura melhor.

O requisito é o comportamento.

---

# 42. FREEZE DO DOCUMENTO APROVADO

Quando aprovado:

1. gerar DOCX;
2. armazenar o arquivo;
3. calcular SHA-256;
4. guardar `document_version_id`;
5. guardar hash;
6. não regenerar esse arquivo para D4Sign.

Fluxo:

```text
V7
↓
Revisão
↓
Aprovado
↓
DOCX V7 congelado
↓
SHA256
↓
D4Sign recebe exatamente V7
```

---

# 43. PREVIEW DO CONTRATO

Seguir o mesmo princípio definido para a proposta:

> o Word é o documento canônico.

Não manter:

```text
Preview React A
Word B
D4Sign C
```

Desejado:

```text
CanonicalContractData
↓
DOCX
├── Preview
├── Download
├── Review
└── D4Sign
```

Se o preview rápido em HTML for mantido temporariamente, rotular explicitamente como:

```text
Prévia de conteúdo
```

e disponibilizar:

```text
Visualização final
```

derivada do documento real.

---

# 44. D4SIGN

O arquivo enviado deve ser a versão aprovada.

NÃO:

```text
clicou enviar
→ lê banco
→ regenera contrato
→ envia
```

SIM:

```text
approved_document_version
→ lê bytes congelados
→ verifica hash
→ envia bytes
```

---

# 45. PÁGINA DE ASSINATURAS

Gerar dinamicamente.

Sempre incluir signatários BP configurados.

Hoje:

```text
Gustavo Bismarchi Motta
Ricardo Viscardi Pires
```

Mas não hardcodar dentro do renderer.

Usar catálogo/configuração já existente de signatários da firma.

Depois:

```text
for contractingParty in contractingParties:
   assinatura da empresa
```

Se houver representantes pessoas físicas, modelar separadamente.

Não assumir que razão social assina sem representante quando o fluxo D4Sign exigir pessoa/e-mail.

---

# 46. QUALIFICAÇÃO DA CONTRATADA BP

Hoje os documentos repetem os dados institucionais.

Criar configuração institucional versionada:

```text
razão social
CNPJ
endereço
CEP
representantes
OAB
```

O template não deve ter CNPJ da BP espalhado em múltiplos arquivos.

---

# 47. LOCAL E DATA

Centralizar geração.

Exemplo:

```text
Campinas, 2 de setembro de 2026.
```

Timezone:

```text
America/Sao_Paulo
```

Não gerar datas diferentes no preview e Word.

---

# 48. NUMERAÇÃO

A numeração do contrato deve ser automática.

Não salvar números como parte do conteúdo da cláusula:

```text
"11.10. Tributos..."
```

Salvar:

```text
title = Tributos
content = ...
```

O renderer determina:

```text
11.10.
```

Motivo:

blocos condicionais mudam a numeração.

---

# 49. NÃO CARREGAR TRACK CHANGES PARA O TEMPLATE FINAL

Antes de transformar qualquer modelo fornecido em master:

- aceitar/rejeitar revisões;
- remover marcas de revisão;
- remover comentários;
- remover texto excluído;
- verificar campos quebrados;
- verificar hyperlinks acidentais;
- verificar estilos duplicados.

O contrato final não pode carregar metadados de revisão interna.

---

# 50. AUDITORIA DE CONSISTÊNCIA DOS MODELOS

Antes de importar as cláusulas, gerar relatório para revisão humana.

Tabela:

| Cláusula | Auditoria | Canal | Diagnóstico | Igual? | Ação |
|---|---|---|---|---|---|

Especialmente:

- Inadimplemento
- Extinção
- Obrigações
- Despesas
- Compliance
- Disposições Gerais
- Tributos
- Foro
- Assinaturas

Se houver divergência de redação:

NÃO escolher silenciosamente.

Marcar:

```text
REVISÃO JURÍDICA NECESSÁRIA
```

---

# 51. CLÁUSULAS QUE NÃO DEVEM SER CONSIDERADAS FIXAS SEM REVISÃO

Apesar de repetidas nos modelos, exigir validação jurídica para consolidar:

- utilização de marca;
- responsabilidade;
- multa de 20%;
- despesas/km;
- aviso prévio;
- irretratabilidade;
- cláusula de tributos;
- texto de título executivo;
- exclusões gerais.

Esta especificação não declara qual redação jurídica é correta.

Ela define como o sistema deve modelar a redação aprovada.

---

# 52. ERROS DOS MODELOS NÃO DEVEM VIRAR REGRA

Exemplos de coisas que NÃO devem ser copiadas para o engine:

```text
R$ R$ 4.000,00
Ccontrato
realizadosr
duplicação de Legislação Aplicável
numeração riscada
assinante que não aparece no preâmbulo
```

Esses exemplos servem para criar testes de qualidade.

---

# 53. VALIDADORES ANTES DE GERAR

Bloquear geração final se:

```text
[ ] nenhuma contratante
[ ] CNPJ obrigatório ausente
[ ] endereço incompleto sem justificativa
[ ] escopo sem perfil contratual
[ ] escopo contratado contradito por exclusão
[ ] investimento inconsistente
[ ] valor por extenso ausente
[ ] forma de pagamento sem dados
[ ] vigência obrigatória indefinida
[ ] cláusula obrigatória ausente
[ ] signatário ausente
[ ] placeholder não resolvido
```

---

# 54. VALIDADORES DE COERÊNCIA PROPOSTA X CONTRATO

Criar função específica.

Conceito:

```ts
validateProposalContractAlignment({
  proposal,
  contract
})
```

Retorno:

```ts
{
  ok: boolean
  blockers: []
  warnings: []
}
```

Blockers:

- escopo da proposta ausente;
- valor diferente sem override aprovado;
- empresa diferente;
- cláusula de exclusão contraditória.

Warnings:

- vigência manual diferente do default;
- vencimento definido somente no contrato;
- cláusula adicional manual.

---

# 55. OVERRIDE COM JUSTIFICATIVA

Algumas vezes o contrato legitimamente será diferente da proposta.

Permitir override, mas registrar:

```text
campo
valor proposta
valor contrato
justificativa
alterado_por
alterado_em
```

Exemplo:

```text
Investimento proposta: R$ 20.000
Contrato: R$ 18.000

Motivo:
Condição renegociada após aprovação.
```

Idealmente exigir permissão/revisão.

---

# 56. HISTÓRICO

Registrar eventos:

```text
contract_created_from_proposal
contract_scope_profile_resolved
contract_clause_added
contract_clause_removed
contract_clause_overridden
contract_commercial_data_overridden
contract_sent_for_review
contract_changes_requested
contract_approved
contract_sent_d4sign
contract_signed
```

---

# 57. APIs

Revisar rotas atuais e preferir uma API canônica.

Possíveis responsabilidades:

```text
GET /leads/:id/contract
POST /leads/:id/contract/initialize-from-proposal
PATCH /leads/:id/contract/draft
POST /leads/:id/contract/validate
POST /leads/:id/contract/render
POST /leads/:id/contract/submit-review
POST /leads/:id/contract/approve
POST /leads/:id/contract/send-d4sign
```

Não é obrigatório usar esses caminhos.

Evitar várias rotas fazendo a mesma geração com regras diferentes.

---

# 58. SAVE ATÔMICO

O builder atual não deve salvar dezenas de campos independentemente sem verificar resposta.

Criar persistência consolidada do draft:

```json
{
  "parties": [],
  "commercial": {},
  "term": {},
  "scopes": [],
  "clauses": [],
  "signers": []
}
```

Com concorrência otimista:

```text
expected_updated_at
```

ou version counter.

---

# 59. CONCORRÊNCIA

Se dois usuários editarem:

```text
Usuário A abre V12
Usuário B abre V12
B salva V13
A tenta salvar V12
```

Retornar:

```text
409 CONTRACT_DRAFT_CHANGED
```

Não sobrescrever silenciosamente.

---

# 60. CATÁLOGO ADMINISTRATIVO

Criar/ajustar UI admin para:

## Escopos → Contrato

Selecionar subtipo:

```text
Auditoria Trabalhista
```

Configurar:

```text
Objeto
Escopo
Limites
Exclusões
Vigência default
Início default
Obrigações
```

---

# 61. ADMIN — CLÁUSULAS

A UI de cláusulas deve permitir:

- categoria;
- stable key;
- conteúdo;
- versão;
- status;
- obrigatória;
- ordem;
- placeholders suportados;
- escopos associados;
- conflitos;
- vigência da cláusula;
- histórico.

---

# 62. PLACEHOLDERS CONTRATUAIS

Padronizar.

Exemplos:

```text
[CONTRATANTE_RAZAO]
[CONTRATANTE_DOCUMENTO]
[CONTRATANTE_ENDERECO]

[VALOR_TOTAL]
[VALOR_TOTAL_EXTENSO]
[VALOR_PARCELA]
[VALOR_PARCELA_EXTENSO]
[NUMERO_PARCELAS]

[PRIMEIRO_VENCIMENTO]

[PRAZO_MESES]
[PRAZO_DIAS]

[LOCAL]
[DATA]
```

Para múltiplas empresas, preferir estruturas/loops em vez de placeholders numerados.

---

# 63. PLACEHOLDERS DE CLÁUSULA

Cada clause template deve declarar os placeholders utilizados.

Antes de renderizar:

```text
validateClausePlaceholders()
```

Nenhum:

```text
[VALOR]
[NOME EMPRESA]
[XXXX]
xx/xx/xxxx
```

pode aparecer no arquivo final.

---

# 64. MASTER TEMPLATE: ESTILOS

Preservar visual institucional:

- logo BP;
- linhas horizontais;
- cabeçalho;
- rodapé;
- endereço;
- página X de Y;
- Times New Roman / estilo efetivamente aprovado;
- margens;
- justificação;
- hierarquia dos títulos.

Não recriar isso em Tailwind como fonte oficial.

---

# 65. PAGE BREAKS

Deixar Word cuidar da paginação.

Apenas controlar:

```text
página de assinaturas
```

com quebra estruturada antes dela.

Não calcular página com pixels.

---

# 66. TESTES UNITÁRIOS — PERFIS DE ESCOPO

Criar pelo menos:

### Auditoria

- resolve objeto;
- resolve exclusões;
- resolve vigência;
- não exclui Auditoria.

### Canal

- inclui limites;
- inclui natureza;
- vigência 12 meses;
- não inclui texto de Auditoria.

### Diagnóstico

- inclui HSE-IT;
- inclui GRO/PGR;
- vigência até laudo / 30 dias;
- não exclui o próprio diagnóstico.

---

# 67. TESTE MAIS IMPORTANTE: COMBINAÇÃO DE ESCOPOS

Exemplo:

```text
Auditoria
+
Diagnóstico NR-1
```

Esperado:

```text
✓ objeto contém ambos
✓ exclusões não excluem nenhum dos dois
✓ cláusulas comuns aparecem uma vez
✓ numeração contínua
```

---

# 68. TESTES — MÚLTIPLAS EMPRESAS

1 empresa:

```text
CONTRATANTE
```

2 empresas:

```text
CONTRATANTES
```

Testar:

- preâmbulo;
- cláusulas;
- assinatura;
- concordância.

---

# 69. TESTES — INVESTIMENTO

Testar:

```text
mensal fixo
preço fechado
parcelado
entrada + parcelas
êxito
fixo + êxito
manutenção
```

Validar aritmética.

---

# 70. TESTES — DOCUMENTO

Após render:

- DOCX válido;
- abre como ZIP OOXML;
- sem placeholders;
- header existe;
- footer existe;
- página de assinatura existe;
- todas as empresas aparecem;
- valores corretos;
- escopos corretos.

---

# 71. TESTES — TRACK CHANGES

O master final não deve conter:

```xml
<w:ins>
<w:del>
```

Criar teste ou script de validação do template.

---

# 72. TESTES — PROPOSTA X CONTRATO

Criar fixture de proposta:

```text
Cliente: Empresa Teste
Escopo:
  Trabalhista > Auditoria
  Trabalhista > Diagnóstico NR-1

Investimento:
  R$ 20.000
```

Contrato precisa gerar:

```text
Empresa Teste
Auditoria
Diagnóstico
R$ 20.000
```

e nenhuma exclusão contraditória.

---

# 73. MIGRAÇÃO DO CÓDIGO ATUAL

A auditoria anterior identificou que o contrato atualmente:

- é gerado programaticamente pela lib `docx`;
- possui preview React separado;
- cláusulas podem divergir entre preview/Word/D4Sign;
- revisão não está ligada à versão.

Esta tarefa deve eliminar essas divergências progressivamente.

Não deixar dois motores ativos sem necessidade.

---

# 74. ESTRATÉGIA DE MIGRAÇÃO

Fase sugerida:

## Fase A

Criar domínio `CanonicalContractData`.

## Fase B

Criar perfis de escopo + mapeamento de cláusulas.

## Fase C

Importar/consolidar cláusulas dos três modelos para catálogo de revisão.

## Fase D

Criar master Word.

## Fase E

Gerar contrato do master.

## Fase F

Alinhar preview.

## Fase G

Amarrar revisão a versão.

## Fase H

D4Sign usa artefato aprovado.

## Fase I

Remover renderer legado.

---

# 75. IMPORTAÇÃO INICIAL DOS MODELOS

Não inserir diretamente em produção.

Criar script ou seed em modo draft:

```text
source_model
source_section
raw_text
suggested_stable_key
status = pending_legal_review
```

A equipe Societário aprova antes de ativar.

---

# 76. NÃO USAR IA PARA ESCOLHER CLÁUSULA EM PRODUÇÃO

A seleção deve ser determinística:

```text
scopeSubtypeId
+
rules
+
conditions
```

IA pode futuramente ajudar administrador a classificar modelos, mas não decidir contrato enviado ao cliente sem regra explícita.

---

# 77. ALERTAS PARA O USUÁRIO

Exemplos:

```text
Este contrato possui 2 escopos sem perfil contratual.
```

```text
O investimento foi alterado após a proposta.
```

```text
Uma cláusula foi modificada depois da última revisão jurídica.
```

```text
A versão aprovada não é a versão atual.
```

---

# 78. INDICADOR DE ORIGEM

Ao lado de campos:

```text
Empresa
Herdado da Proposta ✓

Investimento
Herdado da Proposta ✓

Primeiro vencimento
Definido no Contrato

Vigência
Regra: Auditoria Trabalhista

Cláusula 2.2
Origem: Perfil Trabalhista
```

---

# 79. PENDÊNCIAS

Antes de revisão:

```text
Dados do cliente            ✓
Escopos                     ✓
Investimento                ✓
Mapeamento contratual       ✓
Vigência                    ✓
Vencimento                  !
Signatário cliente          !
```

---

# 80. NÃO DUPLICAR DADOS DESNECESSARIAMENTE

Se o endereço já existe na proposta, não criar novo `cc_endereco` sem motivo.

Se precisar override:

```text
contract_override
```

e manter valor original para auditoria.

---

# 81. SEGURANÇA

Restringir:

### Comercial

- inicializa;
- visualiza;
- completa campos comerciais permitidos;
- envia para revisão;
- envia D4Sign apenas versão aprovada.

### Societário e Contratos

- revisa cláusulas;
- altera redação contratual;
- aprova.

### Admin

- catálogo;
- perfis;
- templates;
- overrides administrativos.

Não permitir usuário qualquer marcar revisão como concluída.

---

# 82. IDOR

Toda rota com:

```text
/leads/:id/contrato
```

deve validar acesso à oportunidade.

Não confiar apenas em:

```text
usuário autenticado
+
service_role
```

---

# 83. LOG DE OVERRIDES

Se Societário alterar cláusula:

```text
Base:
v3

Override:
texto específico

Motivo:
...

Responsável:
...

Data:
...
```

---

# 84. TEMPLATE VERSIONING

Master Word:

```text
Contrato BP Master v1
Contrato BP Master v2
```

Cada documento precisa saber:

```text
template_version_id
```

Nunca depender de um único arquivo mutável.

---

# 85. CLAUSE VERSIONING

Da mesma forma:

```text
clause_template_id
clause_version
```

O contrato V7 deve continuar sabendo qual texto foi usado, mesmo se catálogo for atualizado amanhã.

---

# 86. SNAPSHOT COMPLETO DA VERSÃO

`document_versions.data_snapshot` deve conter, direta ou referencialmente de forma imutável:

```text
partes
escopos
investimento
condições
cláusulas resolvidas
overrides
template version
signers
```

---

# 87. HASH

Calcular SHA-256 do DOCX final.

Guardar:

```text
sha256
file_size
mime_type
storage_path
```

---

# 88. STORAGE

Persistir a versão aprovada em bucket privado.

Exemplo:

```text
contract-documents/
{oportunidadeId}/{instanceId}/v7.docx
```

Não usar apenas `generated_file_path` sem arquivo real.

---

# 89. PDF

Não criar um segundo contrato com layout paralelo.

Se PDF for necessário:

```text
DOCX aprovado
↓
conversão
↓
PDF
```

Não:

```text
CanonicalData
↓
outro renderer visual independente
```

---

# 90. CRITÉRIOS DE ACEITE FUNCIONAL

A tarefa somente é considerada concluída se:

1. contrato herdar cliente da proposta;
2. contrato herdar escopos por ID;
3. contrato herdar investimento estruturado;
4. cada escopo resolver perfil contratual;
5. exclusões contraditórias forem bloqueadas;
6. múltiplos escopos funcionarem;
7. múltiplas contratantes funcionarem;
8. pagamento for derivado da proposta;
9. vigência puder variar por perfil;
10. cláusulas fixas forem catálogo/versionadas;
11. preview e Word usarem a mesma fonte documental;
12. revisão estiver ligada à versão;
13. D4Sign enviar versão aprovada;
14. nenhum placeholder ficar no documento;
15. nenhuma alteração controlada do template chegar ao cliente.

---

# 91. CRITÉRIOS DE ACEITE JURÍDICO-OPERACIONAL

Antes de ativar em produção:

- equipe Societário revisa texto-base;
- equipe Societário aprova cláusulas fixas;
- equipe Societário aprova os três perfis iniciais;
- cada exclusão possui regra de conflito;
- cada vigência possui regra;
- condições comerciais foram validadas;
- assinatura foi validada na D4Sign.

---

# 92. O QUE NÃO FAZER

NÃO:

- criar um Word por serviço;
- copiar textos dos modelos diretamente como verdade definitiva;
- usar nome textual do escopo como chave;
- duplicar dados da proposta;
- recalcular investimento por texto;
- inserir cláusula excluindo serviço contratado;
- deixar valores antigos dos modelos;
- usar IA para decidir cláusula em runtime;
- reescrever texto jurídico automaticamente;
- hardcodar partes;
- hardcodar valores;
- hardcodar vigência;
- hardcodar signatários no renderer;
- manter revisão por simples boolean/status desconectado de versão;
- regenerar Word na hora do D4Sign;
- manter preview e Word como documentos diferentes.

---

# 93. ENTREGÁVEIS

Ao final, entregar:

## 1. Código

Implementação.

## 2. Master Word

Template do contrato.

## 3. Migrações

Novas tabelas/colunas/mapeamentos necessários.

## 4. Seed inicial

Perfis:

```text
Auditoria Trabalhista
Canal de Denúncias
Diagnóstico Psicossocial NR-1
```

em status adequado para revisão jurídica se a redação ainda não estiver formalmente aprovada.

## 5. Documento técnico

Criar:

```text
docs/CONTRACT-DOCUMENT-ENGINE.md
```

## 6. Matriz de cláusulas

Criar:

```text
docs/CONTRACT-CLAUSE-MATRIX.md
```

com:

```text
stable_key
origem
modelos onde aparece
diferenças
status
perfil associado
```

## 7. Relatório de inconsistências dos arquivos fornecidos

Criar:

```text
docs/CONTRACT-SOURCE-MODELS-AUDIT.md
```

Sem corrigir juridicamente por conta própria.

---

# 94. RELATÓRIO FINAL DO CURSOR

Informar:

1. arquitetura escolhida;
2. arquivos criados;
3. arquivos alterados;
4. migrations;
5. tabelas;
6. APIs;
7. componentes;
8. contratos legados removidos;
9. perfis configurados;
10. cláusulas cadastradas;
11. conflitos de escopo implementados;
12. tratamento de múltiplas contratantes;
13. tratamento de investimento;
14. preview;
15. Word;
16. revisão;
17. D4Sign;
18. testes.

---

# 95. VERIFICAÇÃO OBRIGATÓRIA

Executar:

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
```

Além disso, gerar documentos de teste:

## Cenário A — Auditoria

```text
1 empresa
Auditoria Trabalhista
Preço fechado parcelado
```

## Cenário B — Diagnóstico

```text
1 empresa
Diagnóstico NR-1
Entrada + parcelas
```

## Cenário C — Canal

```text
1 empresa
Canal de Denúncias
12 meses
```

## Cenário D — Múltiplos escopos

```text
Auditoria
+
Diagnóstico NR-1
```

## Cenário E — Múltiplas empresas

```text
2 contratantes
Auditoria
```

Validar todos visualmente e por teste automatizado.

---

# 96. DECISÕES QUE NÃO DEVEM SER TOMADAS PELO CURSOR SEM EVIDÊNCIA

Se não for possível descobrir pelo código ou pelos documentos:

- qual cláusula jurídica é a definitiva;
- qual modelo é oficialmente vigente;
- qual multa deve ser padrão;
- qual prazo padrão;
- qual regra de marca;
- quais signatários BP são obrigatórios;
- se determinadas despesas sempre se aplicam;

NÃO inventar.

Criar configuração/pendência e documentar:

```text
REQUIRES LEGAL DECISION
```

---

# 97. VISÃO FINAL

O objetivo não é ter “um gerador de Word”.

O objetivo é ter um motor documental onde:

```text
PROPOSTA
  ↓
define exatamente o que foi vendido

CONTRACT SCOPE ENGINE
  ↓
traduz o que foi vendido para linguagem jurídica aprovada

CLAUSE ENGINE
  ↓
completa o instrumento sem contradições

WORD MASTER
  ↓
garante identidade e formatação

VERSIONAMENTO
  ↓
garante rastreabilidade

REVISÃO
  ↓
aprova uma versão específica

D4SIGN
  ↓
assina exatamente o arquivo aprovado
```

A regra central deve ser:

> **Nada pode entrar no contrato sem origem conhecida, e nada vendido na proposta pode desaparecer ou ser contradito no contrato sem override explícito e auditável.**

---

# 98. FONTES DESTA ESPECIFICAÇÃO

Arquivos de contrato fornecidos para análise:

- `MODELO DE CONTRATO TRABALHISTA - AUDITORIA.docx`
- `MODELO DE CONTRATO TRABALHISTA - CANAL DE DENÚNCIAS.docx`
- `MODELO DE CONTRATO TRABALHISTA - DIAGNÓSTICO.docx`

Também considerar:

- arquitetura atual da proposta;
- catálogo atual de escopos;
- auditoria técnica do módulo Proposta/Contrato/D4Sign;
- schema real do Supabase;
- código atual do builder de contrato.

---

# 99. OBSERVAÇÃO SOBRE REDAÇÃO JURÍDICA

Esta especificação é **técnico-funcional**.

Ela identifica padrões e diferenças dos modelos para que o sistema consiga:

- modelar;
- selecionar;
- versionar;
- combinar;
- auditar cláusulas.

Ela **não substitui a validação jurídica** da redação.

O Cursor não deve promover uma redação a “cláusula oficial BP” apenas porque ela aparece em um ou mais documentos antigos.

A aprovação do catálogo jurídico deve continuar sendo responsabilidade humana.

---

# 100. REGRA FINAL DE QUALIDADE

Antes de concluir, responder SIM às perguntas:

```text
O contrato sabe exatamente de qual proposta nasceu?
SIM

Cada escopo comercial possui correspondência jurídica identificável?
SIM

O contrato consegue ter vários escopos sem se contradizer?
SIM

O investimento é o mesmo aprovado na proposta?
SIM

O sistema suporta uma ou várias contratantes?
SIM

O contrato consegue variar vigência e pagamento sem criar um template por serviço?
SIM

As cláusulas padrão são versionadas?
SIM

A revisão aprova uma versão específica?
SIM

O Word aprovado é exatamente o Word enviado à D4Sign?
SIM

É possível reconstruir futuramente o que foi contratado e por quê?
SIM
```

Se qualquer resposta ainda for NÃO, documentar a lacuna antes de considerar a implementação concluída.
