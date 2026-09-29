# Frentes de serviço e quantitativos de terraplanagem

## Conceitos

O **quantitativo de referência** é a linha de base aprovada do projeto. Ele representa o total contratado ou planejado, usa precisão de três casas decimais e é versionado: uma revisão nova não altera a anterior.

Uma **frente de serviço** é uma área operacional da obra (trecho, setor, estaca ou acesso) que recebe parte desses quantitativos. A soma das frentes é uma alocação operacional; ela não reescreve o total de referência. A alocação pode ser parcial.

Uma frente recebe somente quantitativos de produção. Pessoas e máquinas são
mobilizadas para a obra e seu turno, não para uma frente. O início da frente
não depende de destinar esses recursos a ela.

A soma dos quantitativos das frentes não canceladas não pode ultrapassar o total da linha de base atual. O formulário avisa e bloqueia o envio assim que identifica um valor acima do saldo. A API repete a validação em transação serializável, evitando que cadastros simultâneos consumam o mesmo saldo. Um valor exatamente igual ao saldo é permitido; ao cancelar uma frente, sua parcela volta a ficar disponível.

O inverso também é protegido: uma revisão da linha de base não pode remover um serviço já distribuído nem reduzir seu total para menos do que a soma das frentes não canceladas. Datas planejadas e quantitativos são consultados no item Planejamento da navegação da obra e editados em modais independentes, com salvamentos separados.

O item **Planejamento** também permanece disponível na obra ativa. Nessa fase,
o quantitativo geral pode ser revisto respeitando o total distribuído, e uma
operação exclusiva permite substituir os serviços de uma frente ativa sem
alterar nome, localização, datas ou notas.

No detalhe da obra, a navegação passa a ocupar uma sidebar contextual, fixa no
desktop. A navegação global inicia compacta, com atalhos por ícone, e o seletor
de empresa permanece no cabeçalho fixo. Expandir uma sidebar recolhe a outra,
mantendo espaço útil para o conteúdo e preservando os atalhos de navegação.

**Planejamento**, Frentes, Visão geral e Produção são itens diretos da obra. O
**Calendário** também é um item direto, mas só é exibido depois do início real
da obra; ele não aparece para uma obra planejada e a URL da aba volta ao
planejamento nesse estado. Nesta primeira etapa, ele ocupa o painel de conteúdo
com uma grade mensal: abre no mês corrente de `America/Sao_Paulo`,
permite selecionar somente meses entre o início real e hoje, e libera o novo
dia à meia-noite de Brasília. Dias disponíveis abrem a Central operacional do
dia, sem criar registros até a confirmação de início de um turno. Os demais
recursos ficam agrupados: **Relatórios** abre RDO e Frequência e reserva espaço para
novos relatórios; **Configurações** abre Responsáveis, Máquinas e Equipe;
**Fornecedores** abre Combustível e Itens fornecidos; e **Financeiro** abre
Orçamento e Ciclos de pagamento. Os Ciclos de pagamento concentram os prazos
antes exibidos junto da equipe. Essa organização não altera as permissões de
edição de cada recurso após o início da obra.

Depois do início da obra, **Combustível** continua permitindo incluir, editar e
remover ofertas. A alteração de preço mantém a mesma oferta da obra e encerra
o período do preço anterior antes de registrar o novo valor; assim, consultas
operacionais e auditorias preservam o histórico de vigência. Os demais itens
do checklist de prontidão continuam restritos à obra planejada.

Quando um grupo está fechado, seu indicador resume a prontidão dos itens
internos: fica verde somente se todos estão prontos e fica âmbar se houver
pendências. O indicador âmbar abre uma lista dos itens pendentes; ao abrir o
grupo, o resumo desaparece para que os indicadores de cada item assumam essa
leitura. Enquanto a obra não puder iniciar, o rótulo **Checklist pendente** no
cabeçalho também oferece um popover com todos os bloqueadores de prontidão.

Ao editar a distribuição de uma frente, cada serviço possui limites inclusivos:

- mínimo: soma de `officialQuantity` de todas as produções em rascunho e
  aprovadas daquela frente e serviço;
- máximo: distribuição atual mais o saldo global ainda não distribuído;
- remover um serviço é proibido quando existe qualquer produção vinculada,
  inclusive um rascunho cuja quantidade oficial ainda seja zero.

Alterar somente a quantidade preserva o ID do serviço. O registro só é criado
ou removido quando o serviço efetivamente entra ou sai. Produções futuras não
são limitadas pela distribuição; se passarem dela, a inconsistência será
apresentada e bloqueada na edição seguinte. Quando o produzido já for superior
ao máximo disponível, primeiro é necessário aumentar o quantitativo geral.

Cada serviço carrega sua própria unidade. Os serviços iniciais são:

- corte (`M3`);
- aterro (`M3`);
- acabamento (`M2`);
- solo vegetal (`M3_KM`);
- remoção de solo impróprio (`M3`);
- aterro de substituição (`M3`).

Troca de solo não é um único volume: a remoção do material impróprio e o aterro compactado de reposição são serviços distintos.

## Fluxo

1. No planejamento, informe data final e os quantitativos de referência.
2. Cadastre uma ou mais frentes e distribua somente a parcela planejada para cada área operacional.
3. A frente é válida para o planejamento quando seus serviços existem na linha de base, usam a mesma unidade e a distribuição não excede o total.
4. Para iniciar a obra, o checklist operacional deve estar completo, deve existir ao menos uma frente válida e devem existir os recursos gerais exigidos pela prontidão da obra.
5. Iniciar a obra altera somente o projeto para `ACTIVE`. Nenhuma frente começa automaticamente.
6. Inicie a frente em uma ação separada quando o projeto estiver ativo; não há
   checklist de equipe ou máquinas da frente.
7. O RDO manual é consolidado por obra e turno, conforme `project-daily-reports.md`; a produção é vinculada explicitamente à frente e ao serviço, enquanto o RDO continua sem frente própria.
8. Cada data disponível do calendário abre a Central operacional do dia. Nela,
   os turnos habilitados podem ser iniciados, acompanhados e finalizados; o
   fechamento alimenta automaticamente o RDO e a frequência.

Ao acionar **Iniciar obra**, a interface abre um alert modal de confirmação e não chama a API até o usuário escolher **Sim, iniciar obra**. Escolher **Não, cancelar** ou fechar o alert encerra o modal e mantém a obra planejada, sem disparar a ativação. Depois da confirmação, a interface bloqueia novos cliques e informa que a ativação está em andamento. O sucesso aplica imediatamente o snapshot ativo devolvido pela API e libera os itens operacionais da navegação; a atualização da rota apenas reconcilia esse estado. Conflitos de prontidão e falhas de comunicação mantêm o projeto planejado, apresentam um toast acionável e permitem nova tentativa. A API continua sendo a autoridade final da prontidão.

## Mobilização de recursos

A mobilização da equipe e das máquinas acontece apenas na obra. A seleção de
máquinas para uma produção consulta o pool da obra no turno; a frente informa
qual serviço e quantitativo estão sendo produzidos. O formulário da frente não
exibe exigências nem destinação de recursos.

Alocações antigas por frente permanecem no histórico, encerradas pela migração
de domínio, sem participar da disponibilidade operacional atual. A edição do
pool da obra permanece auditável e sujeita às regras de turno e operador.

## Estados

Projeto: `PLANNED → ACTIVE` nesta entrega. A transição do projeto não altera o estado das frentes.

Frente: `PLANNED → ACTIVE`; uma frente planejada também pode ser cancelada.
Cancelar libera suas parcelas quantitativas. Pausa e conclusão ficam
reservadas para a rotina de execução.

## Contratos de API

Os schemas Fastify e `main-api/artifacts/openapi.json` são o catálogo de
operações. Comandos atuais de frente recebem identificação, planejamento e
serviços, sem `requiresEmployees` ou `requiresMachines`. O detalhe ainda pode
expor campos históricos de destinação para leitura de registros antigos; eles
não participam da aptidão de início.

## Regras para evoluções futuras

- Registros operacionais devem referenciar a frente ativa em que ocorreram,
  sem inferir a frente apenas pela máquina ou pelo colaborador.
- Produção ou abastecimento não devem alterar implicitamente o pool da obra.
- O backend continua sendo a autoridade para escopo e elegibilidade; bloqueios
  visuais são antecipações de UX, não substitutos da regra transacional.
- O RDO atual pertence à obra. Uma evolução que o vincule a uma frente deve ser
  explícita e não pode inferir a frente apenas pela máquina ou pelo colaborador.
