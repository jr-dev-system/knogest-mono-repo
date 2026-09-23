# Catálogo de modelos e unidades de máquina

O catálogo pertence à empresa e separa o **modelo** da **unidade física**. Um
modelo define fabricante, modelo, tipo, medidor, descrição, capacidade e a
regra de operador; uma ou mais unidades registram nome, placa/patrimônio,
leituras, disponibilidade e histórico operacional.

`POST /machine-models` cria o modelo e ao menos uma unidade no mesmo comando.
`POST /machine-models/:machineModelId/units` acrescenta unidades a um modelo.
Listagem e detalhe de modelos são paginados e mantêm as unidades físicas como
referências usadas por obras, frentes, RDOs e produção.
Na inclusão posterior, a confirmação usa o toast global transitório e atualiza
o detalhe do modelo; uma falha permanece no formulário com a causa retornada
para que o cadastro possa ser corrigido e reenviado.

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
(`WHITE_LINE`). Somente a linha branca aceita as especificações opcionais:

- `loadVolumeM3`: volume de carga em metros cúbicos;
- `maxSupportedWeightT`: peso máximo suportado em toneladas.

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
