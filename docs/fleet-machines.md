# Catálogo de modelos e unidades de máquina

O catálogo pertence à empresa e separa definitivamente o **modelo** da
**unidade física**. O modelo pode existir sem unidades e define fabricante,
modelo, versão opcional, tipo, descrição, capacidades e regra de operador. A
combinação normalizada fabricante/modelo/versão é única por empresa; versão
vazia é a versão sem valor.

O medidor pertence à unidade física, é obrigatório e não muda depois do
cadastro. Cada unidade também guarda nome opcional, placa e/ou patrimônio,
leitura inicial, propriedade/locação, disponibilidade e histórico operacional.
`POST /machine-models` cria somente o modelo e
`POST /machine-models/:machineModelId/units` cria uma unidade por vez. Não há
mais criação pública direta de unidade nem alocação isolada que ignore o modelo.
Listagem e detalhe de modelos mantêm as unidades ativas como referências usadas
por obras, frentes, RDOs e produção.

Unidades novas são `OWNED` ou `RENTED`. Alugadas exigem locadora em texto livre
e valor-hora sugerido positivo em BRL, com duas casas. Ao mobilizá-las, a
alocação persiste locadora, valor-hora confirmado e horas mensais inteiras de 1
a 744; unidades próprias não aceitam esses termos. `THIRD_PARTY` legado segue
legível, mas não é oferecido em novos comandos.

O estado é derivado: `available` para unidade ativa com propriedade/locação
vigente sem alocação, `unavailable` para alocação aberta e `without_rental`
para unidade historicamente alugada sem locação vigente. Ao removê-la da obra,
a alocação e a locação vigente encerram juntas; uma unidade própria volta a
`available`. A reconciliação de mobilização preserva períodos inalterados.

`DELETE /machines/:machineId` faz soft delete apenas de unidade própria livre
ou alugada em `without_rental`; locação vigente, alocação, frente ou bloqueio
operacional impedem a exclusão. A operação fecha o período próprio aberto e
libera identificadores, preservando histórico. Ao coincidir placa ou patrimônio
com unidade excluída do mesmo modelo, a criação responde
`409 MACHINE_DELETED_IDENTIFIER_MATCH` com candidatos seguros. O cliente pode
restaurar o mesmo ID (com nova leitura não inferior à última) ou criar uma nova
unidade com as mesmas identificações.
Na inclusão posterior, a confirmação usa o toast global transitório e atualiza
o detalhe do modelo; uma falha permanece no formulário com a causa retornada
para que o cadastro possa ser corrigido e reenviado.

No detalhe do modelo, a inclusão de uma unidade usa quatro etapas:
identificação, medição/propriedade, alocação inicial e revisão. A alocação é
opcional e começa desativada; quando selecionada, aceita somente obras
`PLANNED` ou `ACTIVE`, carrega os turnos e a equipe atual da obra e solicita ao
menos um operador elegível quando o modelo exigir operador. A etapa final
permite retornar diretamente ao grupo que precisa de correção sem perder o
preenchimento. Avançar entre etapas nunca cria a unidade: somente a confirmação
explícita na revisão envia o comando.

Na criação do modelo, o formulário também é dividido em etapas: identificação,
capacidade condicional para linha branca, regra de operador e revisão. A etapa
de capacidade não aparece para linha amarela. Chegar à revisão nunca envia o
comando; somente **Criar modelo** persiste o catálogo. Após o sucesso, um
convite compacto pergunta se a pessoa deseja criar unidades agora.

Após o cadastro do modelo, uma confirmação compacta oferece iniciar a criação
de unidades, sem interromper a transição entre os modais. Quando aceita, o
fluxo cria de 1 a 15 unidades para uma única obra. Cada linha
mantém identificação, medidor, leitura, propriedade/locação e operadores por
turno próprios. `POST /machine-models/:machineModelId/units/batch` processa
cada unidade em uma transação independente e retorna os índices criados e
rejeitados. As válidas permanecem criadas; a interface remove essas linhas e
mantém somente as rejeitadas para correção, sem reenviar as já concluídas.

O bloco opcional `allocation` de
`POST /machine-models/:machineModelId/units` contém a obra, as designações de
operador por turno e, para unidade alugada, valor-hora confirmado e horas
mensais. Criação, leitura inicial, propriedade/locação e mobilização são
executadas na mesma transação. Obra indisponível, operador incompatível ou já
ocupado, termos de locação inválidos e demais conflitos desfazem toda a
operação; não permanece uma unidade parcialmente criada. Sem `allocation`, o
comportamento permanece a criação de uma unidade disponível no catálogo.

As unidades existentes aparecem em uma tabela operacional com busca local por
nome, placa ou patrimônio, filtros de disponibilidade e medidor, ordenação e
paginação. Esses controles operam sobre as unidades ativas já retornadas pelo
detalhe.

A seleção de obra para mobilização busca páginas de 15 registros pelo nome ou
contrato. A API aplica o filtro `statuses=planned,active` antes da paginação;
assim, somente obras planejadas ou em andamento aparecem e o cursor não avança
por páginas de obras inelegíveis.

Todo modelo declara `requiresOperator`. Quando verdadeiro, `requiredJobRoleId`
é obrigatório e precisa apontar para uma função ativa da mesma empresa; quando
falso, a função é nula e a unidade não aceita operador em mobilizações. Modelos
legados usam a função padrão **Qualquer um**, que conserva a exigência de
operador sem restringir a função do funcionário. Alterações de requisito ou
função são bloqueadas enquanto alguma unidade do modelo estiver mobilizada.

As opções de mobilização inicial da obra retornam por unidade `manufacturer`,
`model`, `meterType`, `requiresOperator`, `requiredJobRoleId`,
`requiredJobRoleName` e `acceptsAnyJobRole`. A interface apresenta a última
leitura com máscara brasileira e unidade (`h` ou `km`), solicita operador
somente para máquinas que o exigem e, nesse caso, mostra apenas integrantes do
mesmo turno, da função **confirmada na alocação da obra** e ainda não vinculados
a outra máquina da obra. A função atual do cadastro do funcionário não altera
essa elegibilidade. Ao editar uma máquina, seu operador atual continua elegível
para que a alocação possa ser corrigida, mesmo quando ficou incompatível. A
exceção é `acceptsAnyJobRole`, que aceita qualquer função.

No editor de máquinas da página da obra, `GET
/projects/:projectId/mobilization/machine-options` oferece a mesma elegibilidade
em páginas de até 15 unidades. Aceita `type` (linha amarela ou branca),
`manufacturer`, `model`, `version` e `search` (nome, placa ou patrimônio). Os
filtros de fabricante, modelo e versão são dependentes, e o cursor fica ligado
a todos os filtros normalizados; trocar qualquer filtro exige começar da
primeira página. A resposta também traz as máquinas já mobilizadas, inclusive
quando não correspondem ao filtro atual, para que a revisão local nunca perca
uma seleção. Unidades mobilizadas em outra obra permanecem indisponíveis.

O editor é um wizard de inclusão: primeiro seleciona e configura, depois
apresenta o resumo antes do salvamento. Ele lista e conta somente máquinas
confirmadas na abertura atual; mobilizações existentes são preservadas nesse
fluxo. Ao abrir uma máquina, a configuração de operadores aparece junto à
própria linha e rola o modal até ela, preservando filtro, resultado e página.
Enquanto as opções são consultadas, o modal reserva a área da lista com
skeletons para evitar salto de layout. O salvamento continua em `PUT
/projects/:projectId/mobilization/machines` para obra ativa e em `PUT
/projects/:projectId/readiness` para obra planejada.

A aba **Máquinas e operadores** consulta `GET
/projects/:projectId/mobilization/machines` em páginas de até 15 alocações
atuais. A busca encontra nome, fabricante, modelo, versão, placa e patrimônio;
o cursor é vinculado a tenant, empresa, obra e busca normalizada. Cada cartão
mostra a máquina, leitura de abertura e operadores por turno. A ação de lápis
abre um modal focado somente nos operadores, pré-preenche as designações e usa
a mesma elegibilidade da inclusão: turno correspondente, função confirmada
compatível e exclusividade por turno. Salvar reconcilia a lista completa de
alocações e preserva máquina, leitura e termos de locação. Máquinas sem
exigência de operador não podem abrir essa edição.

Para modelos que exigem operador, cada turno habilitado precisa de um operador
compatível. O seletor não oferece “não mobilizar” nesses turnos; se não houver
integrante elegível, a máquina fica sem confirmação, a interface explica a
causa e desabilita a confirmação. A mesma regra é validada pela API, inclusive
na criação atômica de unidade.

Cada alocação de equipe persiste `confirmedJobRoleId` e, quando a confirmação
coincide com o vínculo atual, `confirmedJobRolePeriodId`. Registros legados que
não possuem um identificador confiável de função não são associados por nome:
ficam indisponíveis para modelos com função específica até que a equipe da obra
seja atualizada e a função seja confirmada novamente.

O salvamento da mobilização bloqueia novas tentativas enquanto está em curso.
Ao concluir, a confirmação usa o toast global transitório; se falhar, o modal
fica aberto e exibe a causa acionável. Conflitos de recurso retornados pela API,
como leitura alterada, máquina já alocada, operador obrigatório ou função
incompatível, não dependem exclusivamente de toast para chegar ao usuário.

Máquinas podem ser de linha amarela (`YELLOW_LINE`) ou linha branca
(`WHITE_LINE`). Somente a linha branca aceita as especificações opcionais. A
capacidade canônica usa `loadCapacity` com `loadCapacityUnitCode`, aceitando:

- `M3_LOOSE`: metro cúbico solto;
- `M3_COMPACTED`: metro cúbico compactado;
- `LITER`: litro;
- `CUBIC_YARD`: jarda cúbica.

`loadVolumeM3` permanece no contrato como projeção legada em m³. Para produção,
litros são convertidos por `0,001` e jardas cúbicas por `0,764555`; as duas
variações de m³ preservam o valor numérico, enquanto o snapshot conserva a
unidade original. `maxSupportedWeightT` continua representando o peso máximo
suportado em toneladas.

Quando informados, os valores devem ser positivos e ter no máximo três casas
decimais. Linha amarela não persiste esses campos. O banco e a API repetem a
restrição; valores incompatíveis retornam
`422 MACHINE_LOAD_SPEC_NOT_APPLICABLE`.

O catálogo, a listagem de unidades e o detalhe expõem ambos os campos. Máquinas de linha
branca existentes podem ser atualizadas por
`PATCH /machines/:machineId/load-specification`; string decimal define o valor
e `null` o remove.

Na produção, equipamentos operacionais e caminhões são opções separadas. Toda
máquina ativa mobilizada na frente e turno pode participar como equipamento,
inclusive linha amarela. Somente a existência de
`MachineTransportSpecification` com capacidade efetiva positiva torna a
máquina elegível como caminhão.

A extensão mantém capacidade nominal, capacidade efetiva, unidade (por padrão
`M3_LOOSE`) e peso máximo. Nesta versão, criar, alterar ou remover a
especificação legada de carga sincroniza a extensão 1:1. A migration faz o
backfill das máquinas com `loadVolumeM3 > 0`, copiando o valor para as duas
capacidades.

Capacidade, unidade, identificação e motorista viram snapshots do resumo por
caminhão e não podem ser sobrescritos pelo comando. Eventos detalhados antigos
continuam aceitando `adjustedVolumeM3`. O período de propriedade agora também
suporta `OWNED`, `RENTED` e `THIRD_PARTY`, com proprietário externo opcional;
RBAC e gestão administrativa completa desses campos permanecem posteriores.
