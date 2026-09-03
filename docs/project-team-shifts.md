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
- A função temporária aplicada somente à obra continua existindo e não deve ser
  confundida com remanejamento temporário de turno.
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
- `GET /projects/:projectId/team-members?shift=&cursor=&limit=15` lista a equipe
  operacional do turno em páginas de até 15 pessoas. Cada linha apresenta nome,
  função, carga mensal, modalidade e valor da hora extra. O cursor é vinculado
  a tenant, empresa, obra e turno.
- A aba Equipe mantém históricos de paginação independentes para Diurno e
  Noturno. A ação `Editar turno` abre o editor já no turno visível e salva
  somente esse recorte; contagens, carregamento, erro e estado vazio são
  apresentados separadamente por turno.
- A carga mensal caracteriza o contrato da pessoa e nunca determina quantas
  horas ela trabalhou em um dia específico.
