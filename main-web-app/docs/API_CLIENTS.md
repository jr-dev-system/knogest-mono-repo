# Generated API Clients

Fastify route schemas generate the canonical `main-api/artifacts/openapi.json`. Kubb consumes that artifact and writes TypeScript models, Zod schemas, and server-only clients under `src/generated`.

```bash
pnpm --dir ../main-api generate:openapi
pnpm generate:api
pnpm validate:api
pnpm check:api
```

Never edit generated files or maintain duplicate request/response types.
Feature-level Server Actions and server queries adapt generated DTOs into
application view models. The OpenAPI artifact, not this document, is the
complete operation catalog.

## Transporte server-only

Na página da Central operacional do dia, somente uma resposta 404 real da API
vira `notFound()` no Next.js. Erros de banco, indisponibilidade da API e outras
falhas são propagados, para não serem apresentados falsamente como "página não
encontrada".

`src/lib/api/server-client.ts` e o adaptador compartilhado usado por clientes
gerados e chamadas server-only mantem as credenciais fora do navegador. Todas
as chamadas devem preservar estas regras:

- Sem body (`data === undefined`): nao envie `Content-Type`. O cliente define o
  header como `null` internamente para impedir que o Axios gere
  `application/x-www-form-urlencoded`.
- JSON: envie um body real e `content-type: application/json`.
- `FormData`: nao configure `Content-Type` manualmente; o Axios deve criar o
  boundary de `multipart/form-data`.
- Nao envie `{}` apenas para fazer um comando sem body atravessar o transporte.
  O contrato da rota decide se existe body.

Essa normalizacao tambem se aplica quando uma chamada e repetida depois da
renovacao da sessao.

Quando uma chamada autenticada recebe `401 SESSION_INVALID`, o transporte faz
uma única renovação controlada por vez, persiste as novas credenciais somente no
servidor e repete a chamada com o mesmo ID de correlação. Fluxos que precisam
redirecionar em vez de repetir usam a política `redirect`; o endpoint de
renovação sempre desabilita nova renovação recursiva.

## Server Actions and feature boundary

O status `200` de um `POST` para uma pagina Next.js confirma apenas que o
protocolo da Server Action respondeu. A chamada Fastify interna pode ter
retornado erro e sido convertida em um resultado serializavel pela action.
Componentes devem avaliar o resultado de dominio antes de atualizar a interface.

`src/app` monta rotas, layouts e dados de entrada. Cada domínio mantém suas
queries, actions, adaptadores e componentes em `src/features/<domínio>/`.
Componentes client-side nunca importam clientes Kubb, o transporte Axios ou
cookies; recebem apenas modelos seguros e callbacks de Server Actions.

O fluxo de RDO usa queries server-only para a pagina inicial e Server Actions
para opções temporais, detalhe, paginação, criação, edição e finalização. A
action de finalização chama
`POST /projects/:projectId/daily-reports/:reportId/finalize` sem `data` e sem
`Content-Type`. O componente só aplica o snapshot `finalized` quando o resultado
de domínio é `success`; um `200` do protocolo da Server Action não basta.

A Central operacional carrega
`GET /projects/:projectId/operational-days/:reportDate` no servidor e executa
início de turno, interferências e fechamento por Server
Actions finas em `src/features/projects/operational-day.actions.ts`. Cada ação
valida UUID/data, chama exclusivamente o cliente Kubb e recarrega o retrato do
dia devolvido ao componente. A tela também chama `router.refresh()` a cada 30
segundos e ao recuperar foco. Cada funcionário do RDO devolve
`shiftCostBrl`: `null` enquanto o turno está aberto ou quando um relatório
legado não possui snapshot financeiro, e uma string decimal em BRL depois da
finalização. O valor é calculado pela API a partir das taxas congeladas no RDO;
o browser apenas formata a moeda.

As mudanças de estado ao vivo usam a Server Action sobre `POST
/projects/:projectId/operational-shifts/:reportId/status-events`. Para turno e
máquina, o browser envia o alvo e o estado e a API define instante e ator. Para
ponto de funcionário, envia `action` (`start` ou `end`) e `occurredAt`; a API
valida a janela do turno e a sequência de marcações, registra o ator e devolve
o retrato atualizado. Estados finalizados e recursos ausentes permanecem em
modo somente leitura.

Cada turno habilitado devolve em `options.defaults.breakTemplates` os modelos
de intervalo vigentes, com `id`, `name` e `durationMinutes`. O componente coleta
o horário de início do intervalo geral e, no fechamento, envia a lista única de
`breaks`; a API a aplica a cada funcionário presente ao calcular o ponto.

O CTA de produção abre o assistente compartilhado sobre a própria Central e
consulta as opções para a data e o turno do RDO. O comando recebe o supervisor
como responsável, omite início e fim, envia `source=operational_center` e exige
`climateConditions`. A Central salva a produção como rascunho; a confirmação é
reservada ao fechamento coletivo do turno. Fechar ou salvar não navega para a
aba Produção. Os modais operacionais ignoram `Esc` e descarte por clique fora,
mantendo somente as ações explícitas de fechamento. Manutenção é um estado ao
vivo de máquina, sem abertura de ordem de serviço. O CTA de abastecimento é
deliberadamente local nesta versão e apenas informa indisponibilidade.

O fechamento consulta o resumo de produções e adiciona **Atividades
executadas** antes da revisão. A atividade fixa Terraplanagem permanece visível
e desabilitada; os blocos derivados da produção são somente leitura e somente
`activityNotes` é texto livre. Editar um registro preserva data, turno, frente e
serviço, podendo alterar valores, viagens, equipamentos, destino e clima. Sem
produções, `fallbackClimateConditions` é opcional e o fechamento continua.

O fluxo de produção usa os clientes gerados para opções do turno, listagem,
detalhe, comando discriminado, catálogos, workflow, qualidade, histórico e
viagens legadas. `productions.actions.ts` é a fronteira server-only;
componentes não repetem tipos de transporte gerados. O wizard envia
`individualActivity` ou `materialMovement`, nunca `officialQuantity`.

O wizard atual possui quatro passos. Ao entrar no passo de caminhões, a
interface consulta automaticamente
`GET /projects/:projectId/productions/truck-options` em páginas de 25, mantém as
seleções fora das páginas carregadas e reinicia os cursores quando data ou turno
muda. Cada resumo envia viagens, carga e descarga médias no formato decimal
`minutos.segundos`, com segundos entre `00` e `59`, e DMT em km.
Quando um corte destina material a uma frente com aterro, a action chama
`POST /projects/:projectId/productions/cut-fill-pair`; a API recalcula o volume
do aterro aplicando `compactionReductionPercent`, de `0.00` a `100.00`, sobre o
volume solto e cria os dois lançamentos na mesma transação. Um erro nunca é
tratado pelo componente como sucesso parcial.

Rotas criadas inline passam primeiro pelas rotas versionadas do catálogo e o
comando de produção recebe o ID da revisão retornada. Material e seu cadastro
inline permanecem ocultos, e `materialName` pode ser `null`. O
resumo por caminhão é salvo junto ao agregado; a capacidade efetiva vem das
opções da API e é somente leitura. A prévia decimal é apresentação local, mas o
snapshot devolvido pela API sempre substitui o estado do componente.

Movimentações enviam os IDs das frentes de origem e destino, inclusive quando
são iguais. A API valida as duas frentes como ativas e deriva seus nomes; dados
de origem e destino existentes na rota não substituem essa escolha.

No modo compatível de eventos, o componente nunca incrementa viagens apenas em
estado local: cada toque envia UUID de idempotência e substitui o detalhe pela
revisão retornada pela API.

O cadastro de equipe envia `shift` em cada alocação e pode reconciliar
`weeklySchedule` e `breakTemplates` na mesma chamada de mobilização. Máquinas
usam `operatorAssignments` por turno; frentes usam `machineAssignments` com o
par `machineId + shift`. Ao trocar data ou turno na produção, a interface
reconsulta as opções antes de substituir responsáveis, frente e máquinas.

No cadastro de funcionário, a criação inline de função chama a Server Action
que encapsula `POST /api/v1/job-roles`. `JOB_ROLE_ALREADY_EXISTS` é apresentado
como duplicidade na empresa; falhas inesperadas usam mensagem segura e mantêm o
`requestId` retornado no resultado da action para suporte, sem expor o erro
interno da API.
Cada alocação envia `monthlyWorkloadHours` como inteiro entre 1 e 744. O RDO
não recebe nem devolve snapshot dessa carga: `completedFullShift` faz a API
resolver as horas normais pela janela efetiva do próprio relatório.
`Editar turno` consulta `GET /projects/:projectId/team-members` para a lista
principal, preservando páginas por turno. `Adicionar funcionários` abre um
modal separado, já preso ao turno visível, e consulta `GET
/projects/:projectId/team-candidates` em páginas de 15. A Server Action reinicia
sua paginação quando turno ou busca mudar e nunca reutiliza cursores entre
esses filtros. Cada modal salva somente o turno selecionado em `PUT
/projects/:projectId/mobilization/employees/:shift`.
Na obra planejada, o editor parte da classificação ativa no cadastro da empresa;
uma troca da função aplicada à obra requer confirmação explícita e só permite
selecionar funções existentes. A exceção não altera o vínculo corporativo. Em
obra ativa, a interface não oferece essa troca e a API rejeita uma alteração de
função já confirmada com `409 PROJECT_RESOURCE_CONFLICT`, identificando o
recurso seguro com `reason: "reclassification-required"`; a futura rotina de
reclassificação será a única via para isso.
A visualização da aba Equipe consulta
`GET /projects/:projectId/team-members?shift=&search=&jobRole=&cursor=&limit=15`
por uma Server Action. A busca textual é debounced em 300 ms e encontra nome ou
cargo; o filtro exato de cargo é aplicado imediatamente. A resposta devolve os
cargos disponíveis no turno atual. Alterar turno, busca, cargo ou a mobilização
invalida as páginas e cursores anteriores; respostas de consultas antigas não
substituem o resultado mais recente.
O editor de mobilização de máquinas da página da obra consulta
`GET /projects/:projectId/mobilization/machine-options` por uma Server Action.
A consulta é paginada em até 15 unidades e aceita `type`, `manufacturer`,
`model`, `version`, `search` (nome, placa ou patrimônio) e cursor. A busca tem
debounce de 300 ms; mudança de qualquer filtro reinicia a paginação e não
reutiliza o cursor anterior. A resposta inclui os filtros facetados e as
máquinas atualmente mobilizadas. Elas permanecem no comando, mas o wizard de
inclusão não as exibe nem permite alterá-las: sua lista e resumo cobrem apenas
máquinas confirmadas na abertura atual. A seleção usa uma ordem visual local,
sem mudar a ordem persistida. Na primeira consulta, skeletons mantêm a área dos
resultados estável.

Cada máquina retornada inclui fabricante, modelo, versão, identificadores,
`meterType`, leitura e regra de operador. O modal identifica a unidade por
esses dados, apresenta a leitura decimal com máscara brasileira e unidade, e
filtra a equipe do turno por `requiredJobRoleId` comparado a
`confirmedJobRoleId` da alocação da obra devolvida no snapshot. A função atual
do cadastro do funcionário não é usada nessa decisão. Operadores já vinculados
a outra máquina da mesma obra não são exibidos; o operador da máquina em edição
permanece selecionável para correção. Alocações legadas sem
`confirmedJobRoleId` não são inferidas pelo nome exibido e precisam ter a
equipe atualizada antes de operar modelos com função específica. O indicador
`acceptsAnyJobRole` preserva o comportamento legado da função “Qualquer um”. As Server Actions de
mobilização convertem validações locais em resultados de domínio e o wizard
mantém a edição aberta, com feedback persistente dentro do próprio modal,
quando uma gravação falha. Conflitos seguros em `details.resources` são
preservados no resultado da action para que o editor explique, por exemplo,
leitura desatualizada, operador obrigatório, função incompatível ou recurso já
alocado. Modelos que exigem operador precisam de uma escolha válida em cada
turno habilitado, e a confirmação fica indisponível quando não houver
candidato. O `requestId`, quando presente, pode ser usado no atendimento. Um
sucesso usa o toast global transitório e fecha o modal após atualizar o
snapshot.
A aba de máquinas consulta separadamente
`GET /projects/:projectId/mobilization/machines` para renderizar somente as
alocações vigentes. A busca de nome, fabricante, modelo, versão, placa ou
patrimônio é debounced em 300 ms; alteração da busca invalida páginas e
cursores anteriores. O lápis de uma máquina que exige operador abre o mesmo
formulário de designação por turno da inclusão, atualiza apenas suas
`operatorAssignments` no comando completo e salva pelo transporte de
mobilização já existente. O botão de engrenagem é apenas uma affordance visual
nesta versão e não inicia transporte nem altera estado.
O modal de mobilização de uma frente consulta
`GET /projects/:projectId/fronts/:frontId/mobilization-options` pela Server
Action correspondente. Funcionários e máquinas mantêm caches separados por
frente, tipo de recurso e busca; a paginação usa 15 itens e nunca reaproveita um
cursor depois de mudar esses filtros. As seleções ficam no estado do comando,
fora das páginas retornadas, para sobreviver a buscas e navegação.

A linha de base e as distribuições usam strings decimais com três casas. A
edição de serviços de uma frente ativa chama
`PUT /projects/:projectId/fronts/:frontId/services`; ela não reutiliza o PATCH
de metadados da frente. A interface consome `produced`, `minimumQuantity` e
`maximumQuantity` do snapshot, sem recalcular a regra de domínio.

O cadastro de máquinas usa `POST /machine-models` somente para o catálogo:
fabricante, modelo, `version` opcional, campos comuns, `requiresOperator` e
`requiredJobRoleId` condicional. A unidade é criada individualmente por
`POST /machine-models/:machineModelId/units`, com medidor, identificadores,
leitura e propriedade próprios; se alugada, inclui locadora e valor sugerido.
O wizard do detalhe sempre passa por identificação, medição/propriedade,
alocação opcional e revisão. Os botões intermediários apenas validam e avançam;
somente a ação final da revisão chama a Server Action.

O cadastro do modelo envia `loadCapacity` e `loadCapacityUnitCode` somente para
linha branca. A etapa de capacidade é condicional e a revisão final é uma etapa
de navegação real: entrar nela não chama a Server Action. O resultado da criação
devolve o ID e a regra de operador para o alerta pós-sucesso e para o fluxo de
unidades, sem importar o cliente gerado no componente.

O detalhe do modelo reutiliza os mesmos campos e validações para chamar `PATCH
/machine-models/:machineModelId`. A exclusão usa `DELETE
/machine-models/:machineModelId`: a ação fica desabilitada enquanto o detalhe
informar unidades ativas e, quando elegível, exige confirmação em
`AlertDialog`. Um conflito concorrente permanece visível no diálogo. Após o
soft delete, a Server Action revalida o catálogo e a interface retorna para
`/home/maquinas`; unidades históricas não são alteradas.

Depois da saída animada do formulário de modelo, uma confirmação compacta pode
iniciar `POST
/machine-models/:machineModelId/units/batch`. A Server Action recebe uma obra
comum e entre 1 e 15 unidades completas. O retorno contém `created[]` e
`rejected[]`; o componente retira as linhas criadas e preserva as rejeitadas
com feedback persistente para reenvio. Um sucesso parcial não é convertido em
erro global e nunca repete as unidades já persistidas.

Quando a pessoa escolhe mobilizar a nova unidade, a Server Action consulta
`GET /projects` com `statuses=planned,active`, busca por texto e cursor. O
filtro é aplicado pela API antes da paginação, e a interface preserva as páginas
já carregadas ao pedir mais obras. Em seguida, a Server Action acrescenta o
bloco `allocation` ao mesmo comando, com `projectId`,
`operatorAssignments[]` por turno e, para unidade alugada,
`confirmedHourlyRate` e `monthlyHours`. As obras são buscadas de forma
paginada entre estados elegíveis, e o contexto da obra selecionada é carregado
server-only para filtrar turnos e integrantes compatíveis. O cliente nunca
substitui a lista de máquinas já mobilizadas da obra: a API cria somente a nova
alocação dentro da mesma transação da unidade. Uma falha mantém o modal aberto e
não produz cadastro parcial.

O envelope de conflito `MACHINE_DELETED_IDENTIFIER_MATCH` inclui candidatos
seguros para que o fluxo de interface solicite a decisão explícita de restaurar
ou criar nova unidade. Sucesso é anunciado pelo toast global transitório e
falhas ficam acionáveis no formulário.
Ações Server-only carregam as funções ativas para o select e nunca aceitam
função quando o modelo não exige operador. `loadCapacity`, sua unidade e
`maxSupportedWeightT` são enviados somente para `WHITE_LINE`. A API mantém
`loadVolumeM3` como projeção compatível em m³ e sincroniza esses campos com
`MachineTransportSpecification`, que define capacidade nominal/efetiva,
unidade e peso máximo para a seleção de caminhões. A edição usa
`PATCH /machines/:machineId/load-specification`, enviando cada campo como string
decimal ou `null`. Em produção, a capacidade é somente leitura e vem das opções
do turno; valores legados enviados no comando são ignorados pela API.

Antes de finalizar o RDO, a interface:

1. salva o rascunho do relatório;
2. consulta todas as produções da data e turno;
3. interrompe se encontrar rascunhos;
4. confirma os IDs de todas as produções não rascunho e fixa suas
   `operationalRevision`;
5. chama a finalização do RDO.

Qualidade pendente é exibida, mas não interrompe a sequência. Falha em qualquer
etapa mantém o RDO em rascunho e mostra o erro de domínio.

## Testes e manutencao

- Testes que mockam uma Server Action cobrem o componente, mas nao validam o
  formato HTTP enviado pelo Axios.
- Alteracoes no cliente compartilhado exigem teste de transporte com Axios real,
  incluindo body, `Content-Type` e comportamento de retry.
- Alteracoes em endpoints ou envelopes exigem regenerar e validar OpenAPI e
  clientes gerados.
- Execute `pnpm validate:api` antes da geração e `pnpm check:api` depois dela;
  o segundo comando confirma que o diretório gerado já está sincronizado.
- Mantenha este documento sincronizado com toda mudanca de transporte ou Server
  Action, conforme a definicao de pronto do `AGENTS.md` da raiz.
