# Frentes de serviço e quantitativos de terraplanagem

## Conceitos

O **quantitativo de referência** é a linha de base aprovada do projeto. Ele representa o total contratado ou planejado, usa precisão de três casas decimais e é versionado: uma revisão nova não altera a anterior.

Uma **frente de serviço** é uma área operacional da obra (trecho, setor, estaca ou acesso) que recebe parte desses quantitativos. A soma das frentes é uma alocação operacional; ela não reescreve o total de referência. A alocação pode ser parcial.

Cada frente declara de quais classes de recurso precisa para começar: **equipe**, **máquinas** ou ambas. Ao menos uma classe é obrigatória. Isso é uma regra da frente, não uma reserva antecipada de recursos durante o planejamento.

A soma dos quantitativos das frentes não canceladas não pode ultrapassar o total da linha de base atual. O formulário avisa e bloqueia o envio assim que identifica um valor acima do saldo. A API repete a validação em transação serializável, evitando que cadastros simultâneos consumam o mesmo saldo. Um valor exatamente igual ao saldo é permitido; ao cancelar uma frente, sua parcela volta a ficar disponível.

O inverso também é protegido: uma revisão da linha de base não pode remover um serviço já distribuído nem reduzir seu total para menos do que a soma das frentes não canceladas. Datas planejadas e quantitativos são consultados no item Planejamento da navegação da obra e editados em modais independentes, com salvamentos separados.

O item **Planejamento** também permanece disponível na obra ativa. Nessa fase,
o quantitativo geral pode ser revisto respeitando o total distribuído, e uma
operação exclusiva permite substituir os serviços de uma frente ativa sem
alterar nome, localização, datas, notas ou requisitos de mobilização.

No detalhe da obra, a navegação passa a ocupar uma sidebar contextual, fixa no
desktop. A navegação global inicia compacta, com atalhos por ícone, e o seletor
de empresa permanece no cabeçalho fixo. Expandir uma sidebar recolhe a outra,
mantendo espaço útil para o conteúdo e preservando os atalhos de navegação.

**Planejamento**, Frentes, Visão geral e Produção são itens diretos da obra. O
**Calendário** também é um item direto, mas só é exibido depois do início real
da obra; ele não aparece para uma obra planejada e a URL da aba volta ao
planejamento nesse estado. Nesta primeira etapa, ele ocupa o painel de conteúdo
com uma grade mensal sem eventos: abre no mês corrente de `America/Sao_Paulo`,
permite selecionar somente meses entre o início real e hoje, e libera o novo
dia à meia-noite de Brasília. Dias disponíveis oferecem a afordância de clique,
mas ainda não persistem nem abrem uma ação. Os demais recursos ficam agrupados:
**Relatórios** abre RDO e reserva espaço para
novos relatórios; **Configurações** abre Responsáveis, Máquinas e Equipe;
**Fornecedores** abre Combustível e Itens fornecidos; e **Financeiro** abre
Orçamento e Ciclos de pagamento. Os Ciclos de pagamento concentram os prazos
antes exibidos junto da equipe. Essa organização não altera as permissões de
edição de cada recurso após o início da obra.

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
- top soil (`M3_KM`);
- remoção de solo impróprio (`M3`);
- aterro de substituição (`M3`).

Troca de solo não é um único volume: a remoção do material impróprio e o aterro compactado de reposição são serviços distintos.

## Fluxo

1. No planejamento, informe data final e os quantitativos de referência.
2. Cadastre uma ou mais frentes e distribua somente a parcela planejada para cada área operacional.
3. A frente é válida para o planejamento quando seus serviços existem na linha de base, usam a mesma unidade e a distribuição não excede o total.
4. Para iniciar a obra, o checklist operacional deve estar completo, deve existir ao menos uma frente válida e devem existir os recursos gerais exigidos pela prontidão da obra.
5. Iniciar a obra altera somente o projeto para `ACTIVE`. Nenhuma frente começa automaticamente.
6. Depois da mobilização geral da obra, prepare cada frente destinando recursos do pool do projeto conforme as classes exigidas pela frente.
7. Inicie a frente em uma ação separada, somente quando o projeto estiver ativo e a mobilização mínima da frente estiver atendida.
8. O RDO manual é consolidado por obra e turno, conforme `project-daily-reports.md`; a produção é vinculada explicitamente à frente e ao serviço, enquanto o RDO continua sem frente própria.

Ao acionar **Iniciar obra**, a interface abre um alert modal de confirmação e não chama a API até o usuário escolher **Sim, iniciar obra**. Escolher **Não, cancelar** ou fechar o alert encerra o modal e mantém a obra planejada, sem disparar a ativação. Depois da confirmação, a interface bloqueia novos cliques e informa que a ativação está em andamento. O sucesso aplica imediatamente o snapshot ativo devolvido pela API e libera os itens operacionais da navegação; a atualização da rota apenas reconcilia esse estado. Conflitos de prontidão e falhas de comunicação mantêm o projeto planejado, apresentam um toast acionável e permitem nova tentativa. A API continua sendo a autoridade final da prontidão.

## Mobilização de recursos

A mobilização ocorre em duas camadas:

- **obra**: define o pool atual de pessoas e máquinas disponíveis no projeto;
- **frente**: destina recursos desse pool para uma área operacional específica.

No wizard de criação, a mobilização inicial apenas forma o pool da obra; ela
não inicia projeto nem frente e não cria uma destinação de frente. Cada unidade
retornada nas opções informa se exige operador e, quando aplicável, a função
compatível para cada turno.

A edição posterior do pool de máquinas na página da obra usa um wizard próprio
de seleção e resumo. Sua consulta paginada aceita tipo, fabricante, modelo,
versão e texto de nome, placa ou patrimônio; as máquinas já confirmadas ficam
fixas no topo em ordem de confirmação visual, mesmo após filtrar ou trocar de
página. Essa ordem é apenas de interface e não altera os períodos de
mobilização nem a ordem de recursos destinada às frentes. A configuração do
operador abre junto da máquina acionada e aplica as mesmas regras de turno,
função confirmada e exclusividade já usadas no pool.

Pessoas e máquinas só podem estar em uma frente por vez dentro da obra. Um recurso ocupado aparece indisponível e deve ser liberado da frente atual antes de outra destinação; não existe transferência automática.

Máquinas cujo modelo exige operador possuem um operador por turno. Ao selecionar
o par `máquina + turno` para uma frente, esse operador é incluído
automaticamente e conta como equipe. Máquinas sem requisito entram na frente
sem operador e não bloqueiam a mobilização por falta de funcionário. A mesma
máquina pode estar em frentes diferentes em turnos diferentes.

O modal de mobilização da frente separa **Funcionários** e **Máquinas** em tabs.
Cada tab consulta até 15 recursos por página e preserva as seleções ao trocar
de página, busca ou tipo de recurso. Funcionários podem ser buscados por nome ou
função; máquinas por nome, fabricante, modelo, placa ou patrimônio. A busca é
aplicada após 300 ms sem digitação.

Operadores atuais das máquinas que exigem operador não aparecem como seleção direta na tab
Funcionários. Na tab Máquinas, cada linha representa `máquina + turno` e mostra
operador e eventual frente ocupante. Recursos de outra frente continuam
visíveis, porém desabilitados, e precisam ser liberados antes de uma nova
destinação.

Os requisitos de equipe e máquinas bloqueiam apenas o **início** da frente. Depois de ativa, a frente pode ter sua mobilização alterada ou ficar temporariamente sem recursos sem ser encerrada automaticamente.

Alterar o pool da obra também é permitido durante a execução, desde que não remova uma pessoa, máquina ou operador ainda destinado a uma frente. A função confirmada de quem já integra o pool fica congelada quando a obra é iniciada; a mudança futura será tratada pela rotina de reclassificação, não pela mobilização. Mobilizações e desmobilizações encerram o período anterior e criam histórico auditável; registros históricos não são sobrescritos nem apagados.

## Estados

Projeto: `PLANNED → ACTIVE` nesta entrega. A transição do projeto não altera o estado das frentes.

Frente: `PLANNED → ACTIVE`; uma frente planejada também pode ser cancelada. Cancelar libera suas parcelas quantitativas e encerra suas destinações atuais. Pausa e conclusão ficam reservadas para a rotina de execução.

## Contratos de API

- `POST /projects/:projectId/quantity-baseline-revisions`
- `POST /projects/:projectId/fronts`
- `PATCH /projects/:projectId/fronts/:frontId`
- `PUT /projects/:projectId/fronts/:frontId/services`
- `PUT /projects/:projectId/mobilization/employees`
- `PUT /projects/:projectId/mobilization/machines`
- `GET /projects/:projectId/mobilization/machine-options`
- `PUT /projects/:projectId/fronts/:frontId/mobilization`
- `GET /projects/:projectId/fronts/:frontId/mobilization-options`
- `GET /projects/:projectId/mobilization-history`
- `POST /projects/:projectId/fronts/:frontId/start`
- `POST /projects/:projectId/fronts/:frontId/cancel`
- `POST /projects/:projectId/activate` não recebe frentes nem inicia frentes.

Os comandos de ativar obra, iniciar frente e cancelar frente não recebem body.
Clientes devem omitir `data` e `Content-Type`; não devem enviar `{}` nem
`application/x-www-form-urlencoded`. A ausência de body faz parte do contrato e
é preservada pelo cliente HTTP server-only compartilhado.

O detalhe de projeto retorna `quantityBaseline` com total, alocado, saldo e produzido por serviço. Cada serviço da frente retorna `produced`, `minimumQuantity`, `maximumQuantity` e `hasProductions`, além dos requisitos, destinações atuais, validade de planejamento (`planningEligibility`) e aptidão para início (`eligibility`). O histórico é paginado por cursor e pode ser filtrado por classe de recurso e frente.

`mobilization-options` exige `resourceType=employee|machine`, aceita `search` e
`cursor` e limita a página a 15 itens. O cursor é vinculado ao tenant, empresa,
obra, frente, tipo de recurso e busca normalizada; trocar qualquer filtro
invalida o cursor anterior.

## Regras para evoluções futuras

- Registros operacionais devem referenciar a frente ativa em que ocorreram, sem inferir a frente apenas pela máquina ou pelo colaborador.
- Transferências futuras devem encerrar a destinação atual e abrir outra em uma única transação auditável.
- Produção ou abastecimento não devem alterar implicitamente o pool da obra nem a mobilização da frente.
- O backend continua sendo a autoridade para escopo, exclusividade e elegibilidade; bloqueios visuais são antecipações de UX, não substitutos da regra transacional.
- O RDO atual pertence à obra. Uma evolução que o vincule a uma frente deve ser
  explícita e não pode inferir a frente apenas pela máquina ou pelo colaborador.
