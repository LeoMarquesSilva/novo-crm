# PROMPT PARA O CURSOR — EVOLUÇÃO DO MOTOR DE CONTRATOS: OBJETO CONTRATUAL AUTOMÁTICO, ESCOPOS CONTRATADOS E CAMPOS DINÂMICOS

**Projeto:** CRM Jurídico — Bismarchi | Pires  
**Escopo desta tarefa:** evolução da etapa **Confecção do Contrato**  
**Data:** 03/09/2026  
**Base técnica atual:** motor de contratos já inicializado a partir da proposta, com `CanonicalContractData`, snapshot da proposta, perfis por `subtype_key`, regras de vigência, pagamento, conflitos e cláusulas em catálogo.  
**Objetivo desta tarefa:** fazer o contrato deixar de parecer um formulário genérico de configuração e passar a se comportar como um **builder jurídico inteligente**, no qual o **Objeto do Contrato já nasce redigido** a partir dos escopos aprovados na proposta.

---

# 0. CONTEXTO

Já existe no projeto um motor inicial de contratos a partir da proposta.

Leia antes de alterar qualquer código:

- `crm/docs/ESPECIFICACAO-MOTOR-CONTRATOS-A-PARTIR-DA-PROPOSTA.md`
- `crm/docs/CONTRACT-DOCUMENT-ENGINE.md`
- `crm/docs/CONTRACT-CLAUSE-MATRIX.md`
- `crm/docs/CONTRACT-SOURCE-MODELS-AUDIT.md`
- `crm/docs/AUDITORIA-PROPOSTAS-CONTRATOS-PREVIEW.md`
- o relatório mais recente do que já foi implementado

Também inspecione os contratos reais fornecidos como referência:

- `2026_07_28_CONTRATO_DE_HONORARIOS_GRUPO_NUTRIPLUS.docx`
- `2026_07_29_CONTRATO_DE_HONORARIOS_GRUPO_LE_BLOG_ (1).docx`
- `2026_07_17_CONTRATO_DE_HONORARIOS_ENGEFAZ_ENGENHARIA.docx`
- `CONTRATO_PAGUE MENOS_Trabalhista_ass.pdf`

Além dos modelos já analisados anteriormente:

- Auditoria Trabalhista
- Canal de Denúncias
- Diagnóstico Psicossocial NR-1
- Reclamante
- Reclamada
- Mensal Full

Não trate os contratos como templates para copiar integralmente.

Eles são **fontes de padrão jurídico e estrutural** para descobrir:

- como o objeto é redigido;
- quando o objeto é simples;
- quando o objeto é composto;
- quais dados adicionais o contrato precisa;
- como vários escopos são organizados dentro da cláusula 1;
- quais blocos devem ser específicos por serviço.

---

# 1. PROBLEMA ATUAL

O motor já herda:

- cliente;
- escopos;
- áreas;
- investimento;
- vigência;
- regras de pagamento;
- perfis trabalhistas;
- exclusões.

Porém, a etapa de contrato ainda está muito próxima de um formulário técnico do tipo:

```text
Áreas de atuação

Trabalhista     Sim
Cível           Sim
Societário      Não
```

Isso não representa bem a operação jurídica real.

Ao chegar em **Confecção do Contrato**, o sistema já sabe o que foi vendido na proposta.

Portanto, o usuário NÃO deveria começar montando novamente o objeto.

O contrato deve nascer já com:

```text
1. OBJETO DO CONTRATO

1.1. Objeto. [...]
```

redigido automaticamente com base nos `scopeSubtypeId/subtype_key` herdados da proposta.

---

# 2. RESULTADO ESPERADO

O fluxo desejado é:

```text
PROPOSTA APROVADA
        │
        ├── Área
        ├── Tipo
        ├── Subtipo
        ├── Escopo comercial
        └── Investimento
        │
        ▼
CONTRACT SCOPE PROFILE
        │
        ├── object clauses
        ├── object composition
        ├── required contract fields
        ├── limitations
        ├── exclusions
        ├── obligations
        ├── term rule
        └── start rule
        │
        ▼
CANONICAL CONTRACT DATA
        │
        ▼
1. OBJETO DO CONTRATO
        │
        ├── 1.1 Objeto Geral
        ├── 1.1.1 Escopo A
        ├── 1.1.2 Escopo B
        └── 1.2 / 1.3 blocos adicionais, se necessários
```

---

# 3. REGRA CENTRAL

A partir de agora:

> **Todo escopo aprovado na proposta deve possuir correspondência explícita dentro do Objeto do Contrato.**

E:

> **Nenhum texto do Objeto deve depender de redação manual do Comercial quando já existir um perfil contratual configurado para aquele escopo.**

---

# 4. O OBJETO DO CONTRATO NÃO É UMA STRING SIMPLES

Não modelar o objeto como:

```ts
objectText: string
```

Os contratos reais mostram pelo menos três estruturas diferentes.

---

# 5. TIPO 1 — OBJETO SIMPLES

Exemplo conceitual: contrato de acompanhamento de uma reclamação trabalhista específica.

Estrutura:

```text
1. OBJETO DO CONTRATO

1.1. Objeto. O objeto deste Contrato é a prestação de serviços advocatícios na área trabalhista, consistindo na defesa dos interesses da CONTRATANTE nos autos da reclamação trabalhista nº [NUMERO_PROCESSO], movida por [PARTE_CONTRARIA], em trâmite perante [VARA_TRIBUNAL], com valor da causa de [VALOR_CAUSA].
```

Esse modelo precisa suportar campos dinâmicos.

---

# 6. TIPO 2 — OBJETO COMPOSTO POR SUBESCOPOS

Exemplo: full service trabalhista.

Estrutura:

```text
1. OBJETO DO CONTRATO

1.1. Objeto. O objeto deste Contrato é a prestação mensal de serviços advocatícios na área trabalhista, em regime de full service [...].

1.1.1. Contencioso Trabalhista.
[...]

1.1.2. Consultivo Trabalhista.
[...]
```

Esse modelo se encaixa diretamente no catálogo atual da proposta:

```text
Área
  → Tipo
     → Subtipo
```

O sistema deve aproveitar isso.

---

# 7. TIPO 3 — OBJETO COMPLEXO / PROJETO

Exemplo: Reestruturação / Recuperação Judicial.

Pode ter:

```text
1.1 Objeto geral

1.2 Medidas abrangidas

1.3 A CONTRATADA se compromete, ainda:
    (i)
    (ii)
    (iii)
    (iv)

1.4 Limite do escopo
```

Portanto o modelo deve aceitar múltiplos blocos.

---

# 8. NOVA ESTRUTURA DO OBJETO

Criar conceito equivalente a:

```ts
type ContractObjectSection = {
  blocks: ContractObjectBlock[]
}
```

Com:

```ts
type ContractObjectBlock =
  | {
      kind: "paragraph"
      stableKey: string
      title?: string
      content: string
      order: number
    }
  | {
      kind: "subscope"
      stableKey: string
      title: string
      content: string
      order: number
    }
  | {
      kind: "ordered_list"
      stableKey: string
      intro?: string
      items: string[]
      order: number
    }
  | {
      kind: "limitation"
      stableKey: string
      content: string
      order: number
    }
```

Não precisa usar exatamente esses nomes.

O requisito é permitir que o objeto possua estrutura, e não apenas um texto corrido.

---

# 9. EVOLUIR `ContractScopeProfile`

O perfil atual precisa passar a ter responsabilidade explícita pela construção do objeto.

Conceitualmente:

```ts
type ContractScopeProfile = {
  scopeSubtypeId: string
  subtypeKey: string

  objectDefinition: {
    mode: "simple" | "subscope" | "complex"
    objectBlocks: ClauseReference[]
    objectGroupKey?: string
  }

  requiredContractFields: ContractRequiredField[]

  limitationClauses: ClauseReference[]
  exclusionClauses: ClauseReference[]

  contractedPartyObligations: ClauseReference[]
  contractingPartyObligations: ClauseReference[]

  defaultTermRule: ContractTermRule
  defaultStartRule: ContractStartRule
}
```

---

# 10. `requiredContractFields`

Alguns contratos precisam de dados que não necessariamente existem na proposta.

Cada perfil deve declarar esses dados.

Exemplo:

```ts
requiredContractFields: [
  {
    key: "numero_processo",
    label: "Número do processo",
    type: "text",
    required: true
  },
  {
    key: "parte_contraria",
    label: "Parte contrária",
    type: "text",
    required: true
  },
  {
    key: "vara_tribunal",
    label: "Vara / Tribunal",
    type: "text",
    required: true
  },
  {
    key: "valor_causa",
    label: "Valor da causa",
    type: "currency",
    required: false
  }
]
```

---

# 11. CAMPOS DINÂMICOS POR ESCOPO

Não criar dezenas de campos globais `cc_*`.

O formulário precisa derivar campos dos perfis contratados.

Exemplo:

```text
ESCOPO
Trabalhista > Contencioso > Acompanhamento de ação judicial

Dados necessários para o contrato

Número do processo        [________________]
Parte contrária           [________________]
Vara / Tribunal           [________________]
Valor da causa             [R$ _____________]
```

Outro escopo pode exigir campos diferentes.

---

# 12. NÃO PEDIR DADOS QUE JÁ EXISTEM

Antes de exibir um campo, tentar resolver valor a partir de:

1. proposta;
2. intake;
3. oportunidade;
4. dados da empresa;
5. dados processuais já existentes no CRM.

Exemplo:

se `numero_processo` já existe no lead, preencher automaticamente.

Mostrar origem:

```text
Número do processo
0010789-21.2026.5.15.0126
Origem: oportunidade ✓
```

---

# 13. OBJETO DEVE SER GERADO AUTOMATICAMENTE

Ao abrir o builder:

```text
2. OBJETO E ESCOPO

Trabalhista
✓ Contencioso — Acompanhamento de Ação Judicial
✓ Consultivo

OBJETO CONTRATUAL GERADO

1. OBJETO DO CONTRATO

1.1. Objeto. [...]

1.1.1. Contencioso Trabalhista. [...]

1.1.2. Consultivo Trabalhista. [...]
```

O usuário não deve clicar em “Gerar objeto”.

A resolução deve acontecer automaticamente.

---

# 14. USUÁRIO PODE AJUSTAR, MAS NÃO DESTRUIR A ORIGEM

Permitir:

```text
[Ajustar redação]
```

Mas qualquer alteração cria um override.

Registrar:

```text
base_clause_version
original_content
override_content
reason
changed_by
changed_at
```

Não sobrescrever o catálogo.

---

# 15. ORIGEM VISÍVEL

Na UI, cada bloco deve mostrar origem.

Exemplo:

```text
1.1.1. Contencioso Trabalhista

Origem:
Perfil contratual
Trabalhista > Contencioso
v3
```

Se alterado:

```text
Override específico deste contrato
Alterado por: ...
```

---

# 16. RENOMEAR “ÁREAS DE ATUAÇÃO”

Na etapa do contrato, substituir conceitualmente:

```text
Áreas de atuação
```

por:

```text
Escopos Contratados
```

Porque os escopos são herdados da proposta e representam o que efetivamente foi vendido.

---

# 17. ESCOPOS CONTRATADOS DEVEM SER READ-ONLY POR PADRÃO

Exemplo:

```text
ESCOPOS CONTRATADOS

Trabalhista
  ✓ Contencioso — Acompanhamento de ação judicial
  ✓ Consultivo

Cível
  ✓ Contencioso — 4 processos
```

Origem:

```text
Herdado da proposta ✓
```

O Comercial não deve poder simplesmente desmarcar.

---

# 18. ALTERAR ESCOPO = OVERRIDE FORMAL

Se alguém realmente precisar retirar ou adicionar escopo no contrato:

```text
[Alterar escopos do contrato]
```

Abrir confirmação:

```text
Este contrato ficará diferente da proposta aprovada.

Motivo da alteração:
[________________________________]

[Cancelar]
[Confirmar alteração]
```

Registrar evento.

---

# 19. VALIDAÇÃO DE COBERTURA DO OBJETO

Criar:

```ts
validateContractObjectCoverage()
```

Entrada:

```text
escopos aprovados
objeto resolvido
```

Saída:

```ts
{
  ok: boolean
  representedScopes: []
  missingScopes: []
  unexpectedScopes: []
}
```

---

# 20. INDICADOR NA UI

Mostrar:

```text
Objeto Contratual
✓ 3 de 3 escopos representados
```

ou:

```text
Objeto Contratual
⚠ 2 de 3 escopos representados

Sem perfil:
Societário > Acordo de Sócios
```

---

# 21. BLOQUEAR REVISÃO SE OBJETO ESTIVER INCOMPLETO

Antes de:

```text
Enviar para revisão
```

bloquear se:

```text
missingScopes.length > 0
```

Mensagem:

```text
Não é possível enviar o contrato para revisão.

O escopo "Acordo de Sócios" ainda não possui redação contratual configurada.
```

---

# 22. COMPOSIÇÃO DE OBJETO

Precisamos de regra específica para escopos que devem formar um único objeto.

Exemplo:

```text
Trabalhista
  Contencioso
  Consultivo
```

pode compor:

```text
Full Service Trabalhista
```

Mas NÃO inferir isso apenas porque os dois escopos estão presentes.

Criar conceito:

```ts
ContractObjectCompositionProfile
```

Exemplo:

```ts
{
  key: "trabalhista_full_service",
  requiredSubtypeKeys: [
    "contencioso_acompanhamento_de_acao_judicial",
    "consultivo"
  ],
  compositionMode: "explicit_only"
}
```

---

# 23. NÃO INFERIR FULL SERVICE AUTOMATICAMENTE

Somente aplicar quando houver evidência comercial.

Possíveis fontes:

```text
type_key
subtype_key
modalidade da contratação
flag própria da proposta
```

Se não existir, manter escopos separados.

---

# 24. PERFIL — CONTENCIOSO TRABALHISTA

Evoluir o perfil existente:

```text
contencioso_acompanhamento_de_acao_judicial
```

para possuir objeto jurídico estruturado.

Campos candidatos:

```text
numero_processo
parte_contraria
vara_tribunal
valor_causa
```

Não inventar redação nova se não houver uma cláusula aprovada.

Usar como referência os contratos reais e manter `pending_legal_review` até aprovação.

---

# 25. PERFIL — CONSULTIVO TRABALHISTA

Precisa resolver um bloco de objeto específico.

Exemplo conceitual:

```text
Consultivo Trabalhista. Emissão de pareceres, orientações e consultas jurídicas relacionadas à legislação trabalhista e às atividades desenvolvidas pela CONTRATANTE.
```

A redação oficial deve permanecer em status de revisão jurídica até aprovação.

---

# 26. PERFIL — AUDITORIA TRABALHISTA

O Objeto deve ser completo, não apenas label.

Precisa representar:

- auditoria;
- identificação de riscos;
- análise documental;
- entrevistas;
- visita técnica, se aplicável;
- relatório;
- recomendações.

Usar os modelos anteriores como fonte de referência.

---

# 27. PERFIL — CANAL DE DENÚNCIAS

Objeto deve representar:

- disponibilização;
- operação da plataforma;
- recebimento;
- triagem;
- classificação;
- encaminhamento;
- registro.

Também deve manter blocos próprios de limites/natureza.

---

# 28. PERFIL — DIAGNÓSTICO NR-1

Objeto deve representar:

- riscos psicossociais;
- HSE-IT;
- análise;
- validação;
- relatório GRO/PGR.

Não deixar o objeto com uma descrição genérica de “serviços trabalhistas”.

---

# 29. PERFIS FUTUROS — CÍVEL / SOCIETÁRIO / REESTRUTURAÇÃO

Não inventar cláusulas.

Se o perfil não existe:

```text
Perfil contratual não configurado
```

Exibir pendência.

---

# 30. REESTRUTURAÇÃO — MODELO COMPLEXO

Os contratos Nutriplus e Le Blog demonstram que a área de Reestruturação exige suporte a um objeto longo.

O motor deve estar preparado para:

```text
1.1 Objeto
1.2 Atuação compreendida
1.3 Lista de atividades
1.4 Limitação
```

Mesmo que o perfil ainda não seja ativado nesta tarefa.

---

# 31. FULL SERVICE — MODELO COM SUBITENS

O contrato Pague Menos demonstra outro padrão:

```text
1.1 Objeto geral

1.1.1 Contencioso

1.1.2 Consultivo

Parágrafo único
```

O motor deve suportar `subscope`.

---

# 32. PARÁGRAFO ÚNICO

Criar suporte a bloco:

```text
Parágrafo único.
```

Não tratar tudo como numeração decimal.

---

# 33. LISTAS ROMANAS

Criar suporte a listas:

```text
(i)
(ii)
(iii)
```

Útil para contratos complexos.

---

# 34. PREVIEW DO OBJETO

Enquanto o master Word ainda não estiver pronto, o builder pode continuar mostrando preview React.

Porém:

o preview da cláusula 1 deve ser gerado a partir do **mesmo `CanonicalContractData.objectSection`** que será usado pelo Word.

Não manter lógica separada.

---

# 35. CANONICAL DATA

Adicionar ao canônico:

```ts
contractObject: {
  blocks: []
  representedScopeIds: []
  missingScopeIds: []
  overrides: []
}
```

---

# 36. NÃO GERAR OBJETO DIRETO NO COMPONENTE

Nunca:

```tsx
if (subtype === "...") {
  return <p>...</p>
}
```

Toda regra deve ficar no domínio `contract-engine`.

---

# 37. CATÁLOGO DE REDAÇÃO DO OBJETO

Criar stable keys.

Exemplo:

```text
object.trabalhista.contencioso.single_case
object.trabalhista.consultivo
object.trabalhista.auditoria
object.trabalhista.canal_denuncias
object.trabalhista.diagnostico_nr1
```

Versionadas.

---

# 38. CAMPOS USADOS POR CADA CLAUSE

Cada cláusula deve declarar:

```text
requiredPlaceholders
optionalPlaceholders
```

Exemplo:

```json
{
  "requiredPlaceholders": [
    "numero_processo",
    "parte_contraria",
    "vara_tribunal"
  ],
  "optionalPlaceholders": [
    "valor_causa"
  ]
}
```

---

# 39. RESOLUÇÃO DE PLACEHOLDERS

Criar helper central.

Exemplo:

```ts
resolveContractClausePlaceholders()
```

Não fazer `.replace()` espalhado.

---

# 40. PLACEHOLDER AUSENTE

Se obrigatório:

```text
[NUMERO_PROCESSO]
```

não resolvido, o objeto deve entrar como pendente.

Na UI:

```text
Número do processo *
Campo necessário para gerar o Objeto do Contrato.
```

---

# 41. NUNCA DEIXAR PLACEHOLDER VISÍVEL NO WORD FINAL

Bloquear geração final se houver:

```text
[...]
{{...}}
XX/XX
R$ X
```

---

# 42. UX PROPOSTA

A proposta continua sendo o local de definição comercial.

Não mover configuração comercial para o contrato.

---

# 43. UX CONTRATO

Estrutura sugerida do modal:

```text
1. Partes

2. Escopos Contratados

3. Objeto do Contrato

4. Condições Comerciais

5. Vigência e Início

6. Cláusulas Contratuais

7. Signatários
```

---

# 44. SEÇÃO “OBJETO DO CONTRATO” NO BUILDER

Essa seção deve existir explicitamente.

Exemplo:

```text
OBJETO DO CONTRATO

Status
✓ Completo

Escopos cobertos
✓ Trabalhista > Contencioso
✓ Trabalhista > Consultivo

Redação

1. OBJETO DO CONTRATO

1.1. Objeto. ...

1.1.1. Contencioso Trabalhista. ...

1.1.2. Consultivo Trabalhista. ...

[Ajustar redação]
```

---

# 45. CAMPOS PENDENTES DEVEM FICAR PRÓXIMOS DO OBJETO

Não esconder pendência em outro painel.

Exemplo:

```text
OBJETO DO CONTRATO

Faltam informações:

• Número do processo
• Parte contrária

[Preencher agora]
```

---

# 46. NÃO MOSTRAR TOGGLE DE ÁREA COMO CONTROLE PRINCIPAL

O antigo:

```text
Trabalhista  Sim/Não
```

deve deixar de ser a UI principal.

Pode permanecer temporariamente em seção avançada/legada durante migração, se necessário.

---

# 47. MIGRAÇÃO SEM QUEBRAR LEADS EXISTENTES

Contratos já iniciados não devem perder dados.

Estratégia:

```text
se canonicalContractData.contractObject existe
→ usar

senão
→ resolver a partir dos escopos atuais

se existe override legado
→ preservar como override
```

---

# 48. ADMIN DE PERFIS

A UI futura deve permitir editar:

```text
Perfil:
Trabalhista > Contencioso

Objeto
[cláusulas]

Campos necessários
[campos]

Limitações
[cláusulas]

Exclusões
[cláusulas]

Vigência
[regra]
```

Nesta tarefa, implemente o domínio e, se já houver admin compatível, conecte.

Não criar um admin enorme se ampliar demais o escopo.

---

# 49. STATUS JURÍDICO

Todos os novos textos extraídos dos contratos reais devem entrar como:

```text
pending_legal_review
```

até validação humana.

Não transformar automaticamente em cláusula oficial BP.

---

# 50. OBJETO NÃO DEVE SER GERADO POR IA EM PRODUÇÃO

Determinístico:

```text
scopeSubtypeId
→ profile
→ clause version
→ placeholders
```

---

# 51. REGRAS PARA VÁRIOS ESCOPOS

Quando houver vários escopos:

1. resolver todos;
2. agrupar por área;
3. aplicar composição explícita quando existir;
4. eliminar duplicação;
5. preservar todos os escopos;
6. calcular numeração.

---

# 52. ORDEM

Usar:

```text
areaSortOrder
typeSortOrder
subtypeSortOrder
objectBlockOrder
```

Não depender de ordem de objeto JSON.

---

# 53. ESCOPOS SEM PERFIL

Exemplo:

```text
Societário > Acordo de Sócios
```

se ainda não tiver profile:

```text
⚠ Sem perfil contratual
```

O sistema pode permitir salvar draft.

Não permitir revisão final.

---

# 54. COBERTURA DO CONTRATO

Além do Objeto, validar:

```text
Proposta:
3 escopos

Contrato:
Objeto = 3
Exclusões = sem conflitos
```

Reusar `validateProposalContractAlignment()`.

---

# 55. EVITAR EXCLUSÕES CONTRADITÓRIAS

Manter a regra já implementada.

Agora incluir na validação:

```text
objectCoverage
+
exclusionConflicts
```

---

# 56. DIFERENÇA PROPOSTA X CONTRATO

Na UI:

```text
Proposta
Contencioso + Consultivo

Contrato
Contencioso + Consultivo

✓ alinhado
```

Se override:

```text
⚠ Contrato diverge da proposta
```

---

# 57. EVENTOS

Adicionar:

```text
contract_object_resolved
contract_object_field_completed
contract_object_overridden
contract_scope_removed_from_object
contract_scope_added_to_object
```

---

# 58. BANCO

Antes de criar tabelas novas, investigar se:

```text
contract_scope_profiles
contract_scope_profile_clauses
contract_clause_templates
document_instances
```

já suportam a nova estrutura.

Criar migration apenas se necessário.

---

# 59. POSSÍVEL EXTENSÃO DE `contract_scope_profiles`

Adicionar, se necessário:

```text
object_mode
object_group_key
required_fields_json
```

---

# 60. POSSÍVEL EXTENSÃO DE `contract_scope_profile_clauses`

Permitir role:

```text
object
object_subscope
object_limitation
object_list
object_paragraph_unique
```

---

# 61. TESTES — OBJETO SIMPLES

Fixture:

```text
Trabalhista > Contencioso
```

Dados:

```text
processo
parte contrária
vara
valor
```

Esperado:

```text
1. OBJETO DO CONTRATO
1.1 Objeto...
```

com todos os valores resolvidos.

---

# 62. TESTES — CAMPO OBRIGATÓRIO AUSENTE

Sem número do processo:

```text
object.status = incomplete
```

e:

```text
missingRequiredFields = ["numero_processo"]
```

---

# 63. TESTES — CONSULTIVO

Escopo:

```text
consultivo
```

Esperado:

```text
objeto consultivo
```

sem cláusula de contencioso.

---

# 64. TESTES — CONTENCIOSO + CONSULTIVO

Sem full-service explícito:

```text
ambos devem aparecer
```

mas não transformar em full service automaticamente.

---

# 65. TESTES — FULL SERVICE EXPLÍCITO

Quando perfil/composição indicar full service:

```text
1.1 Objeto Geral
1.1.1 Contencioso
1.1.2 Consultivo
```

---

# 66. TESTES — REESTRUTURAÇÃO COMPLEXA

Mesmo que perfil fique pending:

testar renderer estrutural com:

```text
paragraph
ordered_list
limitation
```

---

# 67. TESTES — VÁRIAS ÁREAS

```text
Trabalhista
+
Cível
```

esperado:

```text
todos representados
```

ou:

```text
Cível missing profile
```

nunca simplesmente ignorar.

---

# 68. TESTES — OVERRIDE

Editar bloco de objeto:

- base permanece intacta;
- override fica só no contrato;
- evento registrado;
- revisão anterior invalidada se existir.

---

# 69. TESTES — NUMERAÇÃO

Adicionar/remover blocos:

a numeração final não pode duplicar:

```text
1.1
1.1
```

nem pular incoerentemente.

---

# 70. TESTES — PLACEHOLDERS

Nenhum placeholder obrigatório pode chegar no documento final.

---

# 71. CRITÉRIOS DE ACEITE DE UI

Ao abrir um lead na etapa contrato:

```text
Escopos Contratados
```

já aparecem.

E abaixo:

```text
Objeto do Contrato
```

já aparece redigido.

Se faltar dado:

```text
Objeto incompleto
```

com campos específicos.

---

# 72. CRITÉRIOS DE ACEITE DO ENGINE

Responder SIM:

```text
O objeto nasce sem input manual do Comercial?
SIM

Todo escopo aprovado aparece no objeto?
SIM

O motor suporta objeto simples?
SIM

O motor suporta objeto composto?
SIM

O motor suporta objeto complexo?
SIM

Cada perfil pode pedir campos adicionais?
SIM

Campos adicionais podem ser herdados do CRM?
SIM

Override fica auditável?
SIM

Objeto e Word usam a mesma estrutura canônica?
SIM
```

---

# 73. NÃO FAZER

NÃO:

- criar textarea vazio “Objeto do contrato” como solução principal;
- copiar texto da proposta literalmente;
- gerar cláusula via IA;
- usar label como chave;
- hardcodar texto no React;
- inferir full service sem evidência;
- ignorar escopo sem perfil;
- permitir retirar escopo sem override;
- manter `Áreas de Atuação Sim/Não` como UX principal;
- editar cláusula do catálogo ao editar um contrato específico.

---

# 74. ENTREGÁVEIS

Ao final:

## Código

Implementação completa.

## Testes

Novos testes do objeto.

## Documento técnico

Atualizar:

```text
crm/docs/CONTRACT-DOCUMENT-ENGINE.md
```

Criar ou atualizar seção:

```text
Object Resolution Engine
```

## Matriz

Atualizar:

```text
crm/docs/CONTRACT-CLAUSE-MATRIX.md
```

com stable keys do objeto.

## Relatório

Criar:

```text
crm/docs/CONTRACT-OBJECT-ENGINE-IMPLEMENTATION.md
```

com:

```text
arquitetura
perfis alterados
campos dinâmicos
UI
migrations
testes
limitações
pendências jurídicas
```

---

# 75. VERIFICAÇÃO OBRIGATÓRIA

Executar:

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
```

Se o projeto tiver scripts diferentes, usar equivalentes.

---

# 76. CENÁRIOS MANUAIS OBRIGATÓRIOS

## Cenário A

```text
Trabalhista
Contencioso
1 empresa
processo preenchido
```

Resultado:

```text
objeto simples completo
```

---

## Cenário B

```text
Trabalhista
Contencioso + Consultivo
```

Resultado:

```text
os dois escopos aparecem
```

---

## Cenário C

```text
Full Service Trabalhista explicitamente configurado
```

Resultado:

```text
objeto geral
+ contencioso
+ consultivo
```

---

## Cenário D

```text
Auditoria Trabalhista
```

Resultado:

```text
objeto de auditoria
```

---

## Cenário E

```text
Cível sem perfil
```

Resultado:

```text
bloqueio de revisão
```

---

# 77. RESULTADO FINAL ESPERADO NA EXPERIÊNCIA DO USUÁRIO

O usuário entra em:

```text
Confecção do Contrato
```

e vê:

```text
PARTES
✓ Herdadas da proposta

ESCOPOS CONTRATADOS
✓ Trabalhista > Contencioso
✓ Trabalhista > Consultivo

OBJETO DO CONTRATO
✓ 2 de 2 escopos representados

1. OBJETO DO CONTRATO

1.1. Objeto. [...]

1.1.1. Contencioso Trabalhista. [...]

1.1.2. Consultivo Trabalhista. [...]

CONDIÇÕES COMERCIAIS
✓ Herdadas da proposta

VIGÊNCIA
✓ Resolvida pelo perfil
```

Isso deve substituir a sensação atual de que o contrato ainda precisa ser “montado do zero”.

---

# 78. PRINCÍPIO FINAL

A regra desta fase é:

> **A proposta define o que foi vendido. O perfil contratual traduz juridicamente o que foi vendido. O Comercial apenas completa os dados específicos que não existiam na proposta.**

E:

> **Ao chegar na etapa do contrato, o Objeto do Contrato já deve existir.**
