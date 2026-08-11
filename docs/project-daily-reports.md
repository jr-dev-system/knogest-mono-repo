# Relatório Diário de Obra (RDO)

Este documento é a fonte canônica da primeira versão do RDO manual. O RDO é
um registro consolidado da obra, não de uma frente específica.

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

Detalhes de conflito contêm somente identificadores, nomes ou categorias
seguras dos recursos afetados.

## Interface e compartilhamento

A aba **Relatórios** oferece criação, continuação de rascunho, paginação e
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
