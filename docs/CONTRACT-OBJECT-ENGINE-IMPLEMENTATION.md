# Motor do Objeto Contratual — implementação

**Data:** 03/09/2026  
**Prompt de origem:** `PROMPT-CURSOR-OBJETO-CONTRATUAL-AUTOMATICO.md`  
**Idioma:** português do Brasil

## Arquitetura

```text
PROPOSTA (subtype_key)
        │
        ▼
ContractScopeProfile
        ├── objectDefinition.objectBlockKeys
        ├── requiredContractFields
        └── term / start / exclusions
        │
        ▼
resolveContractObject()
        ├── resolveContractObjectFields()
        ├── resolveApplicableComposition()  // explicit_only
        ├── numberContractObjectBlocks()
        └── validateContractObjectCoverage()
        │
        ▼
CanonicalContractData.contractObject
        │
        ▼
Builder (Escopos + Objeto)  ==  Preview  ==  Word
```

Nenhuma redação do objeto é montada no React. O builder só exibe e completa campos.

## Perfis alterados

Os 5 perfis trabalhistas ganharam `objectDefinition`, `requiredContractFields` e ordem (`areaSortOrder` / `typeSortOrder` / `subtypeSortOrder`).

| subtype_key | Modo | Campos |
| --- | --- | --- |
| `contencioso_acompanhamento_de_acao_judicial` | simple | processo, parte, vara (obrigatórios); valor da causa (opcional) |
| `consultivo` | simple | — |
| `auditoria_trabalhista` | simple | — |
| `canal_de_denuncias_gestao_e_triagem` | simple | — |
| `diagnostico_organizacional_de_riscos_psicossociais_nr_1` | simple | — |

Cível / Societário / Reestruturação: sem perfil. O motor marca pendência e **não** inventa cláusula. O renderer já aceita objeto complexo (paragraph + lista romana + limitation) para quando esses perfis existirem.

## Campos dinâmicos

Não foram criados `cc_*` globais. Os campos nascem do perfil e são resolvidos nesta ordem:

1. preenchimento manual neste contrato (`contract_object_fields`)
2. placeholders do escopo da proposta
3. `fieldByCode` da oportunidade/proposta

A UI mostra origem (proposta, oportunidade, manual, pendente).

## UI

No builder, a ordem passou a ser:

1. Partes  
2. Escopos Contratados (read-only; alterar exige motivo)  
3. Objeto do Contrato (já redigido + campos pendentes + override)  
4. Condições Comerciais  
5. Vigência e Início  
6. Cláusulas  
7. Signatários  

Toggles **Áreas de Atuação** Sim/Não ficaram em **Avançado / legado**.

Revisão e Word bloqueiam se `missingScopeIds.length > 0`, campos obrigatórios faltarem ou restarem tokens de rascunho.

## Persistência

Sem migration nova. O runtime continua a ler o catálogo TypeScript.

Em `document_instances.data_json`:

- `canonical_contract.contractObject`
- `contract_object_fields`
- `contract_object_overrides`
- `contract_scope_adjustments`
- `contract_engine_events`
- `explicit_composition_key`

Rascunhos antigos sem `contractObject` são reconstruídos na inicialização, preservando overrides/campos se existirem.

## Eventos

- `contract_object_resolved`
- `contract_object_field_completed`
- `contract_object_overridden` (invalida revisão em curso)
- `contract_scope_removed_from_object`
- `contract_scope_added_to_object`

## Testes

`contract-object.test.ts` + suite anterior do motor: objeto simples, campo ausente, consultivo, combinação sem full service, full service explícito, renderer complexo, várias áreas, override, numeração, placeholders.

## Limitações

- Preview React ainda não é o master Word institucional.
- Textos jurídicos permanecem `pending_legal_review`.
- Full Service só entra com evidência explícita; não há flag comercial nativa no catálogo da proposta além de `explicit_composition_key` / type_key.
- Contratos reais Nutriplus / Le Blog / Engefaz / Pague Menos não estavam no workspace para extração literal; a estrutura complexa está no renderer, sem ativar perfil de Reestruturação.

## Pendências jurídicas

- Validar redação de `object.trabalhista.contencioso.single_case` e do wrapper de full service.
- Decidir se valor da causa deve ser obrigatório em algum rito.
- Ativar perfis Cível / Societário / Reestruturação só depois de cláusulas aprovadas.
