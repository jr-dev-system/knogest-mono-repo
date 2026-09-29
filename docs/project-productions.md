# Produção de terraplanagem

Este documento descreve o lançamento manual atual. A produção pertence à obra,
data e turno e referencia uma frente ativa e uma atividade distribuída nela. A
frente fornece o serviço e seu quantitativo planejado; pessoas e máquinas vêm
do pool da obra no turno, sem mobilização por frente. A API é a autoridade
para escopo, disponibilidade e cálculo. Datas futuras são proibidas; a janela
vai de hoje até sete dias civis anteriores, limitada pelo início real da obra
em `America/Sao_Paulo`.

## Lançamento manual

A aba Produção e a Central operacional do dia usam o mesmo formulário. Quando
aberto pela Central, data, turno e responsável são herdados do RDO aberto e
não são solicitados novamente. O usuário escolhe frente e atividade, pode
informar local e material, seleciona os caminhões e registra a quantidade de
viagens por caminhão. Outras máquinas da obra são opcionais. Não há campos de
qualidade, evidências, URLs, medidores, tempos de equipamento nem opção de
movimentação de material no novo lançamento manual.

O formulário mostra atividades e unidades em português: por exemplo, Corte,
Aterro, Solo vegetal, m³ e m³ solto. Códigos como `cut` e `M3_LOOSE` permanecem
apenas no contrato e no banco, não como rótulos da interface. Antes de
confirmar, a revisão apresenta viagens, volume calculado, DMT médio e momento
de transporte. Um rascunho ainda pode ser salvo sem confirmar; registros
históricos detalhados continuam legíveis, sem reabrir o fluxo antigo para novos
lançamentos.

## Caminhões, volume e DMT

As opções de caminhões incluem somente máquinas ativas da obra e do turno com
especificação de transporte volumétrica e capacidade efetiva positiva.
Caminhões-pipa ou outros veículos medidos em litros não entram na seleção de
transporte de terra. A capacidade efetiva é exibida em unidade legível e não é
editável no lançamento.

Para atividades volumétricas, o volume solto em m³ é a soma de viagens aceitas
multiplicadas pela capacidade efetiva de cada caminhão, convertida para m³
quando necessário. A quantidade oficial é calculada no servidor; o cliente
mostra apenas uma prévia. O DMT médio em km é informado manualmente, e o
momento de transporte é o volume solto multiplicado pelo DMT, em m³·km.
Viagens rejeitadas, parciais e fatores de carga não são solicitados no novo
formulário.

No aterro e no aterro de substituição há duas formas de entrada:

- volume direto em m³, sem caminhões obrigatórios;
- carradas: volume solto calculado pelas viagens, dividido pelo fator de
  empolamento maior que 1 para chegar ao volume oficial compactado.

Atividades não volumétricas usam quantidade direta na unidade do serviço.
Todas as operações decimais da API usam escala fixa e arredondamento apenas
no resultado persistido.

## Ciclo e compatibilidade

O novo registro é uma `INDIVIDUAL_ACTIVITY`. A confirmação o envia como
`SUBMITTED`; a conferência de campo permite aprovação sem registrar qualidade.
Rejeição, reabertura, liberação e histórico de revisões continuam disponíveis.
O RDO consulta as produções da obra, data e turno; somente rascunhos bloqueiam
sua confirmação. Alteração operacional posterior torna a confirmação do RDO
obsoleta.

O banco e a API preservam registros antigos de `MATERIAL_MOVEMENT`, viagens
detalhadas, catálogos de rota/material, evidências e qualidade para leitura e
compatibilidade. Esses dados não são apagados. O OpenAPI gerado a partir dos
schemas Fastify é o catálogo canônico das operações e payloads; este documento
define apenas o comportamento funcional do fluxo manual atual.
