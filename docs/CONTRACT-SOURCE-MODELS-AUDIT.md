# Auditoria dos modelos Word de contrato

**Pasta:** `C:\bkp\doc\new-crm\docs`  
**Data:** 02/09/2026  
**Regra:** extrair estrutura e divergências. Não corrigir redação jurídica.

## Arquivos

| Arquivo | Track changes | Comentários | Header/footer | Notas |
| --- | --- | --- | --- | --- |
| MODELO DE CONTRATO TRABALHISTA - AUDITORIA.docx | `w:ins` sim / `w:del` não | não | 3 headers, 1 footer | Melhor referência estrutural. 2 contratantes (Inovageo + Intrax). |
| MODELO DE CONTRATO TRABALHISTA - CANAL DE DENÚNCIAS.docx | `w:ins` e `w:del` | não | 3 headers, 1 footer | **Não usar como master.** Revisões de Letícia Santana Rodrigues (2026-04-01). Valor comercial idêntico ao da Auditoria (R$ 32.180 / 10x R$ 3.218). |
| MODELO DE CONTRATO TRABALHISTA - DIAGNÓSTICO.docx | `w:ins` e `w:del` | não | 3 headers, 1 footer | Typo `R$ R$ 4.000,00`. Entrada + 7 parcelas. |
| MODELO DE CONTRATO TRABALHISTA - RECLAMADA.docx | `w:ins` | não | 3 headers, 1 footer | Contencioso + consultivo. Vigência indeterminada. Placeholders `R$ X`. |
| MODELO DE CONTRATO TRABALHISTA - RECLAMANTE.docx | `w:ins` | não | 3 headers, 1 footer | Pessoa física. Sem cláusula de extinção padrão; tem “Rescisão Motivada”. Placeholders `XXX`. |
| MODELO MENSAL FULL.docx | `w:ins` | não | 3 headers, 1 footer | Multiárea. Honorários mensais duplicados. Êxito 8%. Exclusão geral contradiz objeto tributário/contratual. |

## Esqueleto comum (quase todos)

1. Objeto  
2. Objetos excluídos  
3. Preço e forma de pagamento  
4. Inadimplemento  
5. Vigência  
6. Extinção  
7. Obrigações da Contratada  
8. Obrigações da Contratante  
9. Despesas  
10. Compliance e Lei Anticorrupção  
11. Disposições Gerais (tributos, foro, assinaturas)

## Divergências que o motor precisa modelar

- 1 ou N contratantes
- Objeto/escopo/limites/natureza por serviço
- Exclusões que se contradizem se o serviço estiver contratado
- Vigência: até entregável, 12 meses, 30 dias, indeterminado, até o fim da demanda
- Início: assinatura vs primeiro pagamento
- Pagamento: conta/PIX vs boleto vs cronograma especial
- Reclamante tem extinção própria

## Erros que NÃO viram regra

- `R$ R$ 4.000,00`
- Valor da Auditoria reaproveitado no Canal
- `somente poderão ser realizar`
- Numeração/riscos de revisão no Canal e no Diagnóstico
- Exclusão geral do Mensal Full que exclui tributário apesar de o objeto incluir tributário
- Assinante/preâmbulo inconsistente (Diagnóstico fala “Contratantes” no singular)

## Master Word

Ainda não gerado. Próximo passo: copiar só visual da Auditoria (header/footer/estilos), aceitar revisões, remover `w:ins`/`w:del`, e deixar o conteúdo para o engine.
