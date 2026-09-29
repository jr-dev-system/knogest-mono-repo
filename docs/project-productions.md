# Produção de terraplanagem

Este documento descreve o lançamento manual atual. A produção pertence à obra,
data e turno e referencia uma frente ativa e uma atividade distribuída nela. A
frente fornece o serviço e seu quantitativo planejado; pessoas e máquinas vêm
do pool da obra no turno, sem mobilização por frente. A API é a autoridade
para escopo, disponibilidade e cálculo. Datas futuras são proibidas; a janela
vai de hoje até sete dias civis anteriores, limitada pelo início real da obra
em `America/Sao_Paulo`.

## Lançamento manual

A aba Produção e a Central operacional do dia usam o mesmo wizard de quatro
passos: atividade, caminhões, destino e quantidade, e revisão. Quando aberto
pela Central, data, turno e responsável são herdados do RDO aberto e não são
solicitados novamente. A revisão possui ações de edição que retornam
diretamente ao passo responsável por cada informação.

O passo de caminhões carrega automaticamente uma listagem paginada por cursor
e mantém as escolhas entre páginas. Ao selecionar um caminhão, a própria linha
é expandida para receber viagens, tempo médio de carga, tempo médio de descarga
e DMT. Esse formulário usa uma coluna em celulares e duas colunas em tablets e
desktop, evitando rolagem horizontal e preservando áreas de toque confortáveis.
Enquanto essa configuração estiver aberta, as outras linhas e a
paginação ficam ocultas; confirmar consolida a seleção e cancelar retorna à
lista sem aplicar as alterações. Caminhões confirmados permanecem editáveis e
removíveis na própria lista. A identificação prioriza placa e usa o patrimônio
quando não houver placa; fabricante, modelo e funcionário alocado no turno
também são apresentados. Não há seleção de outras máquinas, campos de
qualidade, evidências, URLs ou medidores no novo lançamento.

O formulário mostra atividades e unidades em português: por exemplo, Corte,
Aterro, Solo vegetal, m³ e m³ solto. Códigos como `cut` e `M3_LOOSE` permanecem
apenas no contrato e no banco, não como rótulos da interface. Antes de
confirmar, a revisão apresenta viagens, volume calculado, DMT médio ponderado e
momento de transporte. Um rascunho ainda pode ser salvo sem confirmar; registros
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
mostra apenas uma prévia. O DMT em km é informado para cada caminhão. O DMT do
lançamento é a média ponderada pelo volume transportado, e o momento de
transporte é a soma do volume de cada caminhão multiplicado pelo seu DMT, em
m³·km.
Viagens rejeitadas, parciais e fatores de carga não são solicitados no novo
formulário.

No aterro e no aterro de substituição há duas formas de entrada:

- volume direto em m³, sem caminhões obrigatórios;
- carradas: volume solto calculado pelas viagens, reduzido pelo percentual de
  compactação informado entre 0,00% e 100,00%, com duas casas decimais, para
  chegar ao volume oficial compactado.

Atividades não volumétricas usam quantidade direta na unidade do serviço.
Todas as operações decimais da API usam escala fixa e arredondamento apenas
no resultado persistido.

## Destino do corte

Todo corte informa se o material segue para aterro, descarte ou outro destino.
Descarte e outro são categorias do próprio lançamento. Para aterro, o usuário
seleciona outra frente ativa que possua o serviço de aterro e informa um fator
de redução por compactação entre 0,00% e 100,00%. O wizard mostra o volume
compactado final no mesmo passo.

A confirmação de corte para aterro cria duas produções individuais, uma de
corte e outra de aterro, dentro da mesma transação. O volume de corte é o volume
solto calculado pelas viagens; o volume de aterro é esse total menos o
percentual de redução por compactação. Por exemplo, 23 m³ soltos com redução de
20,00% geram 18,400 m³ compactados. Qualquer falha desfaz os dois registros. O
mesmo vale ao salvar o par como rascunho.

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
