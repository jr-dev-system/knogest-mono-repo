# Relatório Diário de Obra (RDO)

Este documento é a fonte canônica da primeira versão do RDO manual. O RDO é
um registro consolidado da obra, não de uma frente específica.

O calendário da obra também oferece a **Central operacional do dia**, que usa
o mesmo RDO como registro oficial e conduz seu preenchimento ao longo do turno.
O fluxo manual permanece disponível para consulta dos registros existentes.

## Central operacional do dia

Ao selecionar uma data disponível no calendário, a interface abre uma central
com uma faixa para cada turno habilitado. A abertura de um turno exige:

- checklist de todos os funcionários alocados, como presente ou ausente, com
  motivo de ausência opcional;
- checklist de todas as máquinas alocadas, como apta ou não apta; máquina não
  apta exige justificativa e não gera leitura final;
- ao menos um funcionário e uma máquina alocados no contexto operacional.

As opções refletem o contexto vigente no instante real de início. Antes de o
turno ser iniciado, a data atual usa o instante corrente e uma abertura
retroativa usa o último contexto vigente naquele dia. Isso permite incluir uma
mobilização efetivada depois do horário planejado sem misturar recursos de
outro dia. Ao confirmar, a API cria o RDO em rascunho e registra a entrada dos
presentes e a leitura inicial das máquinas de forma automática.

Com o turno aberto, a central atualiza a cada 30 segundos e ao retomar foco.
Ela permite completar as perguntas obrigatórias do RDO, abrir o lançamento de
produção em modal sem sair da Central, registrar e confirmar interferências e
revisar o encerramento. A produção herda data, turno e supervisor do RDO e não
solicita uma janela de horas própria. Manutenção e abastecimento aparecem como
ações táteis, mas ainda não persistem dados nesta versão.

Interferências registram categoria, descrição, impacto, início e fim opcional.
Cada registro precisa ser confirmado individualmente antes do fechamento.

O encerramento revisa, em uma única operação atômica:

- entrada, saída, até seis intervalos e confirmação de horas extras de cada
  funcionário presente;
- leitura final de toda máquina apta;
- confirmação de todas as interferências;
- respostas obrigatórias do RDO e, quando aplicável, o motivo do encerramento
  anterior ao fim planejado.

Se qualquer item estiver incompleto, o turno continua em andamento. Quando a
operação é confirmada, o RDO, as jornadas e os medidores são finalizados juntos
e tornam-se imutáveis. A frequência é derivada dessas entradas e saídas e fica
disponível em **Relatórios → Frequência**.

## Identidade e ciclo de vida

- A chave funcional é `obra + data + turno`; nem dois rascunhos podem ocupar a
  mesma chave.
- O turno `DIURNO` está sempre disponível; `NOTURNO` só pode ser usado quando
  habilitado na equipe da obra. A data do turno noturno é a data em que ele
  começa.
- O ciclo é `RASCUNHO → FINALIZADO`. Rascunhos podem ser substituídos;
  finalizados são imutáveis quanto ao conteúdo principal, jornadas e
  medidores. O vínculo versionado de produções pode ser reconfirmado.
- Não há exclusão, reabertura ou correção de RDO finalizado nesta versão.
- Um RDO só pode ser criado para uma obra ativa, entre a data civil do início
  real da obra e a data atual.
- Datas e horários operacionais são interpretados em `America/Sao_Paulo`.

O relatório persiste snapshots do nome, município/UF, contrato, escala,
supervisor, técnicos, funções, funcionários e identificação/modelo das
máquinas. Mudanças posteriores nos cadastros não reescrevem o RDO.

## Preenchimento

Ao iniciar um RDO, a API resolve o contexto vigente na data e turno:

- dados da obra e escala específica do turno;
- funcionários e máquinas mobilizados naquele turno e período;
- última leitura oficial da máquina anterior ao início do turno.

Supervisor e técnicos vêm pré-selecionados somente quando também pertencem à
equipe do turno e podem ser trocados por pessoas ativas dessa equipe. Recursos
externos à mobilização ou de outro turno não são aceitos. Turno desabilitado
retorna `409 PROJECT_SHIFT_NOT_ENABLED`.

O horário padrão possui de uma a seis faixas ordenadas, positivas e sem
sobreposição. A janela efetiva de início e encerramento é obrigatória e não
pode exceder 24 horas. No turno noturno, encerramento menor ou igual ao início
é interpretado como o dia seguinte.

As atividades são uma seleção múltipla entre Terraplanagem, Drenagem e
Pavimentação. O clima é uma seleção múltipla entre Chuva, Seco e Solo
Encharcado. Chuva diária e acumulado mensal são valores manuais não negativos,
iniciados em zero.

Atividades executadas são obrigatórias; interferências são opcionais. O RDO
exige ao menos uma atividade e um participante. Máquinas são opcionais.

Na revisão, o RDO também consulta as produções da mesma obra, data e turno.
Rascunhos aparecem com alerta e são o único estado de produção que bloqueia o
fechamento. Produções enviadas, conferidas, aguardando técnica, aprovadas,
rejeitadas ou liberadas preservam o fato diário e podem ser vinculadas. A
interface destaca qualidade pendente sem bloquear o RDO.

A confirmação fixa `operationalRevision`, não a revisão técnica geral.
Topografia, laboratório, aprovação, rejeição ou liberação posteriores não
invalidam o fato diário. Edição de campos operacionais, viagens, reabertura ou
uma produção retroativa nova para o mesmo turno torna o resumo obsoleto e exige
reconfirmação antes de uma nova finalização/validação operacional.

## Jornadas

Cada participante registra função, minutos normais, minutos extras e se
completou o turno. **Turno completo** é um atalho opcional que preenche os
minutos normais pela janela efetiva informada no próprio RDO. Editar as horas
normais desmarca esse atalho. Exceções usam duração `HH:MM`; horas extras ficam
sempre separadas. A carga mensal da alocação não define horas diárias e não é
copiada para o relatório.

Cada alocação de funcionário possui **Habilitar hora extra**, ligado por padrão.
O valor é copiado para o RDO ao iniciar o turno. Para quem está com a opção
desligada, o fechamento usa automaticamente o início e o fim reais do turno
como marcações de frequência, limita os minutos regulares à jornada planejada
e registra zero minuto de hora extra. A interface não solicita horários ou
confirmação individual de hora extra para esse funcionário. Para quem está com
a opção ligada, o preenchimento individual e a conferência de horas extras
continuam disponíveis.

As linhas do rascunho ainda não são oficiais. A finalização torna as jornadas
oficiais em conjunto com o RDO; consumidores devem considerar somente jornadas
cujo relatório pai está `FINALIZED`. Essas horas são declarações operacionais
confirmadas e formarão a base de uma futura frequência; não representam
marcações de entrada e saída nem substituem um sistema de ponto.

## Horímetros e odômetros

- A leitura inicial vem da última leitura oficial anterior ao turno, é
  persistida como snapshot e não é editável pelo cliente.
- O usuário informa apenas a leitura final, maior ou igual à inicial.
- Na finalização, cada máquina é bloqueada e a leitura inicial é revalidada
  contra a última leitura oficial.
- Uma leitura posterior, uma sequência alterada ou uma tentativa retroativa
  fora da cadeia retorna conflito e desfaz toda a transação.
- O encerramento do turno é o `recordedAt` da nova leitura `ORDINARY`.
- As referências são `PROJECT_DAILY_REPORT_START` e
  `PROJECT_DAILY_REPORT_END`; a leitura final fica vinculada ao item do RDO.
- `HOUR_METER` alimenta horímetro e `ODOMETER` alimenta odômetro.

Nenhuma jornada, leitura ou mudança de status pode permanecer parcialmente
gravada quando uma máquina entra em conflito.

## API

As operações da central usam:

- `GET /projects/:projectId/operational-days/:reportDate`;
- `POST /projects/:projectId/operational-days/:reportDate/shifts/:shift/start`;
- `PUT /projects/:projectId/operational-shifts/:reportId/rdo`;
- `POST /projects/:projectId/operational-shifts/:reportId/interferences`;
- `POST /projects/:projectId/operational-shifts/:reportId/interferences/:interferenceId/confirm`;
- `POST /projects/:projectId/operational-shifts/:reportId/close`;
- `GET /projects/:projectId/frequency`.

As rotas de criação manual continuam sendo:

- `GET /projects/:projectId/daily-reports`
- `GET /projects/:projectId/daily-reports/options?reportDate=&shift=`
- `GET /projects/:projectId/daily-reports/:reportId`
- `POST /projects/:projectId/daily-reports`
- `PUT /projects/:projectId/daily-reports/:reportId`
- `POST /projects/:projectId/daily-reports/:reportId/finalize`
- `GET /projects/:projectId/daily-reports/:reportId/productions`
- `POST /projects/:projectId/daily-reports/:reportId/productions/confirm`

A listagem usa cursor e ordena por data, turno e identificador. Todas as rotas
usam o escopo autenticado de corporação e empresa. Leituras iniciais e
snapshots são resolvidos pela API e nunca são confiados ao cliente.

A finalização é um comando sem body e sem `Content-Type`; não envie `{}`. Media
type indevido pode retornar `415 BAD_REQUEST`.

Conflitos funcionais retornam `409` com códigos públicos:

- `DAILY_REPORT_ALREADY_EXISTS`;
- `DAILY_REPORT_IMMUTABLE`;
- `DAILY_REPORT_PROJECT_UNAVAILABLE`;
- `DAILY_REPORT_RESOURCE_UNAVAILABLE`;
- `DAILY_REPORT_METER_READING_CONFLICT`.
- `PROJECT_SHIFT_NOT_ENABLED`.
- `PRODUCTION_RDO_CONFIRMATION_REQUIRED`.
- `OPERATIONAL_SHIFT_NOT_STARTED`.
- `OPERATIONAL_SHIFT_INCOMPLETE`.

Detalhes de conflito contêm somente identificadores, nomes ou categorias
seguras dos recursos afetados.

## Interface e compartilhamento

A aba **RDO** oferece criação, continuação de rascunho, paginação e
visualização de finalizados. O formulário usa modal operacional `xl`, React
Hook Form, Zod e `FormErrorDeclaration`. O preenchimento é um assistente de
seis etapas: **Dados do dia**, **Horários**, **Serviço**, **Equipe**,
**Máquinas** e **Revisão**. Cada avanço valida somente a etapa visível e a
revisão permite voltar diretamente ao grupo que precisa de ajuste.

Os horários previstos vêm preenchidos com a escala vigente e ficam recolhidos
até que o usuário escolha ajustá-los. Trocar data ou turno recarrega
responsáveis, equipe, máquinas e leituras do período; antes disso, a interface
pede confirmação porque qualquer alteração local ainda não salva será
descartada. Fechar um formulário alterado também exige confirmação.

Na revisão, **Salvar e sair** cria ou substitui o rascunho, fecha o modal e
mantém o RDO disponível para continuação. **Finalizar RDO** também está
disponível em um relatório novo: a interface cria o rascunho necessário e, em
seguida, executa a finalização sem expor essa etapa técnica. Falha ao salvar
interrompe a sequência; falha ao finalizar mantém o rascunho e apresenta o
erro no formulário.

Antes da finalização, um `AlertDialog` informa que jornadas e medidores serão
gravados, as revisões operacionais não rascunho serão vinculadas e o RDO ficará
imutável. Existindo produção em rascunho, a sequência é interrompida; qualidade
pendente é apenas sinalizada. O detalhe finalizado é somente leitura e exibe
**Copiar mensagem** no footer.

A mensagem é determinística em português e contém título/data, obra,
responsáveis, localização/contrato/turno, horário/escala, checklists, chuva,
mão de obra agregada, jornadas individuais, equipamentos, abastecimento como
`Não informado`, horímetros/odômetros, narrativas, janela efetiva e dia da
semana. Quantidades têm dois dígitos, durações usam `HH:MM` e leituras usam
duas casas no padrão brasileiro.

A cópia tenta `navigator.clipboard.writeText` e usa textarea temporária,
seleção e `execCommand("copy")` como fallback para navegadores/dispositivos sem
a API moderna. Sucesso e falha são informados por toast.

## Fora desta versão

Abastecimentos persistidos no RDO, assinaturas, PDF, exclusão, reabertura e
correção do conteúdo principal de finalizados.
