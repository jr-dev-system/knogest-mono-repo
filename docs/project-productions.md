# Produção de terraplenagem

Este documento é a fonte canônica da produção de terraplenagem. O lançamento
é independente do RDO e pertence a uma obra, data e turno. A API interpreta o
calendário em `America/Sao_Paulo` e aceita o intervalo inclusivo entre hoje e
sete dias civis anteriores, limitado também pelo início real da obra. Datas
futuras são proibidas. Os limites calculados pela API são devolvidos em
`dateLimits`; a interface não usa o relógio do navegador como autoridade.

O turno precisa estar habilitado. Frente, serviço, responsável, rota,
máquinas, operadores e caminhões são revalidados no servidor no instante do
comando e sempre no escopo autenticado de corporação, empresa e obra. Material
é opcional na movimentação; referências antigas e catálogos continuam válidos.

Quando o lançamento nasce na Central operacional, data, turno e responsável
são herdados do RDO aberto, usando seu supervisor. A produção pertence ao
turno completo: não recebe início ou fim próprios nesse fluxo.

## Agregado e tipos de lançamento

`ProjectProduction` é a raiz e possui `kind`, `status`, `revision` e
`operationalRevision`. Há exatamente um subtipo funcional:

- `INDIVIDUAL_ACTIVITY`: uma atividade sem transporte agregado, com local,
  serviço, método e quantidade operacional;
- `MATERIAL_MOVEMENT`: um lote com origem e destino derivados de frentes
  ativas, material opcional, rota, camada,
  composição, caminhões e quantidades derivadas.

Uma movimentação contém componentes ordenados de corte, carga, transporte,
descarga, espalhamento, compactação, aterro ou acabamento. Cada componente
referencia sua própria frente e serviço. O banco impede dois subtipos para a
mesma produção e mantém `componentId + quantityKind` único.

As colunas legadas da raiz continuam como projeção compatível durante esta
versão, mas comandos novos não recebem `officialQuantity` nem quantidade
contratualmente medida editável.

## Wizard

A aba **Produção** e a Central operacional compartilham um único modal
operacional `xl`, com React Hook Form,
Zod, `FormWizardProgress`, `FormSection` e `FormErrorDeclaration`. O assistente
valida apenas a etapa visível ao avançar, preserva os dados ao voltar e valida
o comando completo na revisão. Cada grupo da revisão oferece **Editar**.

- Atividade individual: **Tipo e turno → Frente e serviço → Local e
  quantidade → Equipamentos → Qualidade → Revisão**.
- Movimentação: **Tipo e turno → Origem e destino → Composição e rota →
  Caminhões → Equipamentos → Recebimento → Revisão**.

Na Central, a primeira etapa mostra apenas o tipo porque o restante do contexto
já está definido pelo turno; fechar ou salvar mantém o usuário na Central.
Enquanto o modal estiver aberto, a Central pausa as atualizações automáticas
por foco e intervalo. Trocar de aplicativo e voltar ao navegador preserva a
etapa e os dados já preenchidos.
Um novo lançamento exige ao menos uma frente de serviço ativa: sem frente
iniciada, o modal informa o bloqueio e não permite avançar.
Fechar com mudanças, trocar tipo, data ou turno exige confirmação. A rota pode
ser cadastrada na própria etapa, sem modal aninhado. Material e cadastro de
material permanecem ocultos nesta versão.

Serviços cúbicos são gravados com condição explícita: `M3_BANK`, `M3_LOOSE`,
`M3_COMPACTED` ou `M3_PLACED`. Acabamento permanece `M2`. Aterro e compactação
iniciam em condição compactada. Topsoil distingue remoção de aplicação e
deriva `BANK` ou `PLACED`. Equipamentos de atividades individuais não são
limitados a linha branca.

## Catálogos versionados

O catálogo global `EarthworkServiceDefinition` possui revisões com unidade,
perfil, política de DMT, política de campos e vigência. A migration cria as
definições iniciais de corte, aterro, acabamento, topsoil, remoção de solo
impróprio e aterro de substituição sem alterar os IDs dos serviços já
distribuídos nas frentes.

Materiais técnicos e rotas continuam como catálogos por obra com listagem por cursor,
metadados ativos/inativos e revisões sem sobreposição de vigência:

- material: classificação, categoria, densidade, empolamento e fator
  solto–compactado;
- rota: origem, destino, distância carregada, retorno vazio, DMT e faixa
  contratual.

Ao selecionar uma revisão existente, a API confirma obra, vigência e estado ativo e usa
os valores persistidos, não os valores repetidos pelo cliente. Material,
fatores, rota e distâncias são copiados para snapshots do lote. Alterar
material/revisão, origem, destino, rota/revisão, camada ou composição produz
outro fingerprint. Um lote equivalente retorna
`409 PRODUCTION_DUPLICATE_BATCH` e o ID existente.

Origem e destino são IDs de frentes ativas e podem apontar para a mesma frente.
A API deriva os nomes persistidos dessas frentes; uma rota selecionada fornece
distâncias e condições contratuais, mas não substitui os extremos escolhidos.

## Equipamentos, caminhões e viagens

`MachineTransportSpecification` identifica caminhões elegíveis e guarda
capacidade nominal, capacidade efetiva, unidade e peso máximo. O cadastro de
frota mantém esta extensão sincronizada com os campos legados de carga nesta
versão. A capacidade efetiva é somente leitura no wizard e vira snapshot.

As opções separam:

- `equipment`: toda máquina ativa mobilizada na frente e turno, incluindo
  linha amarela, linha branca e apoio;
- `trucks`: somente máquinas mobilizadas com especificação de transporte e
  capacidade efetiva positiva.

O modo principal é `TRUCK_SUMMARY`. Cada linha registra motorista, viagens
aceitas, rejeitadas e parciais, volume parcial, peso real, fator de carga,
ciclo médio e ocorrência. Viagens rejeitadas não entram nos totais e
`partialTripCount` não pode superar as aceitas. Misturar caminhões com e sem
base de balança no mesmo lote é rejeitado para evitar uma quantidade
operacional incompleta.

O modo detalhado `TRIPS` continua disponível para registros compatíveis. Seus
eventos conservam UUID de idempotência, ajuste de volume, ticket e observação;
reutilizar a chave com payload diferente retorna conflito. Máquinas com
eventos não podem ser removidas do rascunho.

Equipamentos registram função, operador, medidores, minutos produtivos, em
espera e parados, além das ocorrências. Alterações operacionais incrementam
`revision` e `operationalRevision` e tornam confirmações do RDO obsoletas.

## Quantidades e cálculos

Cada componente mantém naturezas independentes:

- `OPERATIONAL`;
- `ESTIMATED`;
- `TECHNICALLY_ACCEPTED`;
- `CONTRACT_MEASURED`.

Uma natureza nunca sobrescreve outra. `officialQuantity` permanece apenas
como projeção legada de leitura. O port `ProductionMeasurementPort` delimita a
futura medição comercial; esta versão não expõe comando web de faturamento.

Sem balança, o volume solto é:

`Vs = Σ((aceitas - parciais) × capacidadeEfetiva × fatorCarga + volumeParcial)`

Com balança, o peso real é a quantidade operacional em toneladas. Conversão
por densidade, empolamento ou fator solto–compactado gera somente quantidade
`ESTIMATED`. Sem densidade não há conversão volumétrica inferida.

Quando um registro legado ou outro cliente informa fatores de material, a API
continua aplicando os cálculos abaixo. Esses fatores não são solicitados pelo
wizard enquanto o material estiver oculto.

- corte estimado: `Vb = Vs / fatorEmpolamento`;
- aterro estimado: `Vc = Vs × fatorSoltoCompactado`;
- momento: `MT = quantidadeNaBaseContratual × DMTContratual`;
- DMT agrupada: `Σ(quantidade × distância) / Σ(quantidade)`.

Backend e prévia do wizard usam inteiros escalados e os mesmos vetores de
teste, sem arredondamento intermediário. A API recalcula e é autoritativa.

## Qualidade, auditoria e workflow

O ciclo principal é:

`DRAFT → SUBMITTED → FIELD_CHECKED → AWAITING_TECHNICAL → APPROVED → RELEASED`

`REJECTED` pode ocorrer depois do envio ou das conferências. Correção ou
reabertura exige motivo, cria evento append-only e volta a `DRAFT`. Produção
`MEASURED` é reservada ao módulo comercial e não pode ser reaberta diretamente.
Produções liberadas só voltam a ser editáveis após reabertura.

Qualidade registra conferência de campo, topografia, densidade, Proctor,
compactação, umidade ou acabamento, com decisão, valor, unidade, evidências por
URL, ator e instante. Mudanças técnicas incrementam somente `revision`; não
alteram o fato operacional já confirmado no RDO. Aprovações e transições têm
histórico paginado e snapshot da revisão.

Quando uma topografia ou um ensaio de laboratório aceito informa
`acceptedQuantity`, o backend grava ou atualiza somente a natureza
`TECHNICALLY_ACCEPTED` do componente indicado. Conferência de campo e acabamento
não podem originar essa quantidade, e nenhuma aceitação técnica altera as
naturezas operacional ou estimada.

O contrato de capacidades expõe `createDraft`, `submit`, `check`,
`recordTopography`, `recordLaboratory`, `approve`, `reject`, `release`,
`reopen`, `viewHistory` e `measure`. `publishDirect` e `approveOthers` seguem
temporariamente no contrato por compatibilidade. Somente `MASTER_ADMIN` é
autenticável nesta entrega e recebe todas as capacidades, exceto a ação web de
medição ainda inexistente.

## RDO

O RDO consulta todas as produções da mesma obra, data e turno. Só `DRAFT`
bloqueia a confirmação; qualidade pendente é destacada, mas não impede o
fechamento. A confirmação grava `confirmedOperationalRevision`. Alterações
técnicas posteriores não invalidam o RDO; edição operacional, reabertura ou
novo lançamento retroativo exigem reconfirmação.

## API

Produções:

- `GET|POST /projects/:projectId/productions`;
- `GET /projects/:projectId/productions/options`;
- `GET|PUT /projects/:projectId/productions/:productionId`;
- `GET /projects/:projectId/productions/:productionId/history`;
- `POST .../:productionId/submit|check|approve|reject|release|reopen`;
- `POST .../:productionId/quality-checks`;
- `POST .../:productionId/trips` e `DELETE .../:productionId/trips/:tripId`.

Catálogos:

- `GET /projects/:projectId/earthwork-service-definitions`;
- `GET|POST /projects/:projectId/earthwork-materials`;
- `PUT /projects/:projectId/earthwork-materials/:materialId`;
- `POST /projects/:projectId/earthwork-materials/:materialId/revisions`;
- `GET|POST /projects/:projectId/haul-routes`;
- `PUT /projects/:projectId/haul-routes/:routeId`;
- `POST /projects/:projectId/haul-routes/:routeId/revisions`.

RDO:

- `GET /projects/:projectId/daily-reports/:reportId/productions`;
- `POST /projects/:projectId/daily-reports/:reportId/productions/confirm`.

Evidências continuam sendo até 20 URLs versionadas. Upload binário, RBAC por
perfil e faturamento permanecem fora desta versão.
