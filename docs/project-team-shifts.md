# Turnos da equipe da obra

Este documento é a fonte canônica dos turnos fixos da equipe de uma obra.

## Modelo funcional

- Toda obra possui o turno `DIURNO`; ele é criado por padrão e não pode ser
  removido.
- O turno `NOTURNO` é opcional. Ao ser habilitado, começa copiando os dias de
  trabalho e intervalos do diurno, com janela sugerida de `18:00` a `06:00` do
  dia seguinte. Depois disso, as duas escalas são independentes.
- Cada turno tem exatamente sete dias configurados. Dias úteis possuem início,
  fim e indicador de encerramento no mesmo dia ou no dia seguinte.
- Cada trabalhador mobilizado pertence a exatamente um turno. A mudança de
  turno é imediata, permanente e auditada; não existe remanejamento temporário
  ou agendado entre turnos.
- A função da obra começa pela classificação ativa do vínculo do funcionário na
  empresa. Durante o planejamento, o usuário apenas a confirma ou, por uma
  exceção explícita, escolhe outra função já cadastrada na empresa. A exceção
  nunca altera o cadastro corporativo do funcionário e não permite criar nova
  função dentro da obra.
- Depois que a obra fica ativa, a função confirmada de cada integrante fica
  preservada. Alterações de turno, carga e remuneração continuam seguindo suas
  regras, mas uma troca de função exige a futura rotina de reclassificação.
- Cada alocação registra `monthlyWorkloadHours`. A interface oferece 220 h e
  180 h como atalhos e aceita um inteiro personalizado entre 1 h e 744 h; novas
  alocações e registros migrados usam 220 h quando não houver outra definição.
- O valor-hora sugerido não inclui adicional: mensal usa
  `valor mensal / carga mensal`; semanal, quinzenal e diária são convertidos
  ao equivalente mensal antes da divisão; pagamento por hora preserva o
  próprio valor. O usuário pode substituir a sugestão manualmente.

## Recursos operacionais

- Uma máquina cujo modelo exige operador pode ter um operador diferente em cada
  turno. O operador precisa pertencer à equipe do mesmo turno, ter a função
  configurada no modelo (exceto a função legada **Qualquer um**) e não pode
  operar outra máquina simultaneamente na obra. Máquinas que não exigem
  operador não possuem designação de operador.
- A mesma máquina física pode ser destinada a frentes diferentes em turnos
  diferentes. A identidade da mobilização operacional é `máquina + turno`.
- Ao mudar o turno de um trabalhador, suas vinculações atuais como operador e
  participante de frente são realocadas na mesma transação. A mudança é
  bloqueada se o destino da máquina já estiver ocupado naquele turno.
- O turno noturno só pode ser removido quando não houver trabalhadores,
  operadores, máquinas ou vínculos de frente ainda associados a ele.

## RDO e produção

RDO e produção aceitam somente turnos habilitados. As opções de responsáveis,
trabalhadores, máquinas e frentes são filtradas pelo turno solicitado. Gestor e
responsáveis técnicos só ficam operacionalmente elegíveis quando também
pertencem à equipe daquele turno.

Na produção, aparecem somente máquinas ativas de linha branca, com volume de
carga positivo, mobilizadas na frente selecionada e no turno selecionado; a
listagem não expõe toda a frota nem todas as máquinas da obra. RDOs finalizados
e produções aprovadas preservam seus snapshots e não são reescritos por
mudanças posteriores de turno.

## Transporte

- Alocações de equipe incluem `shift: day | night`.
- Jornadas e intervalos incluem `shift`; jornadas incluem `endDayOffset`.
- Máquinas que exigem operador usam `operatorAssignments[]`, com `shift` e
  `operatorEmploymentId`; máquinas sem requisito enviam a lista vazia.
- Mobilização de frente usa `machineAssignments[]`, com `machineId` e `shift`.
- `PUT /projects/:projectId/mobilization/employees` pode reconciliar equipe,
  jornada e intervalos juntos.
- `PUT /projects/:projectId/mobilization/employees/:shift` reconcilia somente o
  turno informado e preserva o turno oposto. Uma transferência exige que a
  mesma pessoa seja enviada explicitamente no turno de destino.
- `GET /projects/:projectId/team-candidates?shift=&search=&cursor=&limit=15`
  busca nome ou função e pagina 15 funcionários por vez. O cursor é vinculado
  a tenant, obra, turno e busca; qualquer mudança de filtro invalida o cursor.
- `GET /projects/:projectId/team-members?shift=&search=&jobRole=&cursor=&limit=15`
  lista a equipe operacional do turno em páginas de até 15 pessoas. `search`
  encontra nome ou cargo; `jobRole` restringe ao cargo exato. A resposta inclui
  os cargos distintos com funcionários ativos no turno para preencher o filtro.
  Cada linha apresenta nome, função, carga mensal, modalidade e valor da hora
  extra. O cursor é vinculado a tenant, empresa, obra, turno e filtros; qualquer
  mudança de busca ou cargo exige reiniciar a paginação.
- A aba Equipe mantém históricos de paginação independentes para Diurno e
  Noturno. Ao lado de `Editar turno`, o turno visível oferece `Adicionar
funcionários`. Cada ação abre um modal já limitado àquele turno — sem um
  segundo seletor de Diurno/Noturno. O editor usa `team-members` e mostra
  exclusivamente a equipe mobilizada; a mobilização usa `team-candidates` e
  mostra somente os controles necessários para incluir pessoas. Uma pessoa no
  turno oposto aparece nessa mobilização como transferência e exige confirmação
  antes de ser realocada.
- A seção da obra e, na aba Equipe, o turno visível são mantidos na URL por
  `section` e `teamShift`. Recarregar a página restaura esse contexto, sem
  retornar automaticamente à visão geral ou ao turno diurno.
- A aba Equipe aplica a busca por nome ou cargo com atraso de 300 ms. O seletor
  de cargo é imediato e mostra somente cargos presentes no turno visível; os
  contadores de Diurno e Noturno continuam representando o total não filtrado.
- A carga mensal caracteriza o contrato da pessoa e nunca determina quantas
  horas ela trabalhou em um dia específico.
- O editor de funcionário mostra a classificação da empresa como referência.
  A troca de função na obra começa no botão **Alterar função**, abre uma
  confirmação que explica o escopo da exceção e só então libera funções já
  existentes. Enquanto a edição não for salva, **Restaurar classificação da
  empresa** desfaz a exceção e volta à função herdada. Em obra ativa, o controle não é apresentado e a API também
  rejeita a tentativa com `PROJECT_RESOURCE_CONFLICT` e o recurso seguro
  `reason: "reclassification-required"`.
