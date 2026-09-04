# Motor de contratos a partir da proposta

**Situação — 02/09/2026**

A etapa de elaboração de contrato deixa de começar vazia. O CRM congela um snapshot da proposta, resolve perfis contratuais pelos `subtype_key` do catálogo e monta um `CanonicalContractData` único para preview, Word e validação.

## O que já existe

- Domínio em `src/lib/crm/contract-engine/`
- Inicialização `POST /api/crm/leads/:id/contrato/initialize-from-proposal`
- GET/PATCH `/contrato` devolve o motor e recusa overwrite silencioso (`409 CONTRACT_DRAFT_CHANGED`)
- Geração Word usa o canónico quando o snapshot existe
- Aba Contrato permanece em `contrato_elaborado`, `contrato_enviado` e `contrato_assinado`

## Regra de partes

- Empresa principal da proposta = contratante
- Empresas extras da proposta = contratantes
- Demais empresas do intake = apenas relacionadas

## Perfis iniciais (`pending_legal_review`)

Chaves reais do catálogo, não labels:

| subtype_key | Vigência default | Início |
| --- | --- | --- |
| `auditoria_trabalhista` | até relatório + 4 meses | assinatura |
| `canal_de_denuncias_gestao_e_triagem` | 12 meses | primeiro pagamento |
| `diagnostico_organizacional_de_riscos_psicossociais_nr_1` | até laudo + 30 dias | primeiro pagamento |
| `contencioso_acompanhamento_de_acao_judicial` | indeterminado | assinatura |
| `consultivo` | indeterminado | assinatura |

Exclusões contraditórias são filtradas pelo conjunto completo de escopos contratados.

## Object Resolution Engine

O Objeto do Contrato **não** é um textarea nem um toggle de área. Ele nasce no domínio `contract-engine` a partir dos `subtype_key` da proposta.

Fluxo:

```text
escopos da proposta
        │
        ▼
ContractScopeProfile.objectDefinition
        │
        ├── blocos (paragraph / subscope / ordered_list / limitation / paragraph_unique)
        ├── campos obrigatórios do perfil
        └── composição explícita (full service só com evidência)
        │
        ▼
CanonicalContractData.contractObject
        │
        ├── blocks + numberedLines
        ├── representedScopeIds / missingScopeIds
        └── fieldValues + overrides
```

Regras:

- Todo escopo aprovado precisa de correspondência no objeto (`validateContractObjectCoverage`).
- Sem perfil → pendência `missing_profile` + `object_coverage`. Não inventar cláusula.
- Contencioso + consultivo **não** viram Full Service sozinhos. Só com `explicitCompositionKey` ou evidência em `type_key` / modalidade (`compositionMode: "explicit_only"`).
- Campos dinâmicos vêm do perfil (`numero_processo`, etc.), resolvidos da proposta/oportunidade antes de pedir ao comercial.
- Override de redação é auditável e **não** altera o catálogo.
- Preview da cláusula 1 e Word usam o mesmo `contractObject`.
- Placeholders obrigatórios em falta deixam `status = incomplete`. Tokens `[...]`, `{{ }}`, `R$ X` bloqueiam o Word final.

Ficheiros: `object-catalog.ts`, `object-engine.ts`, `object-composition.ts`, `object-fields.ts`, `object-events.ts`.

## O que ainda não está pronto

- Master Word institucional (`CONTRATO-BP-MASTER-V1.docx`)
- Freeze SHA-256 + Storage + D4Sign do artefato aprovado (o envio ainda pode regenerar)
- Revisão amarrada de facto a `document_version_id` na UI
- Admin de perfis/cláusulas
- Conversão DOCX→PDF

Textos jurídicos estão em `pending_legal_review`. Não são cláusula oficial BP.

## Modelos-fonte

Arquivos em `C:\bkp\doc\new-crm\docs`. Ver `CONTRACT-SOURCE-MODELS-AUDIT.md`.
