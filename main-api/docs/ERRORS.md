# Errors

Canonical API errors use a stable code and correlation identifier:

```json
{
  "success": false,
  "code": "AUTHENTICATION_FAILED",
  "message": "Invalid credentials",
  "details": null,
  "requestId": "00000000-0000-4000-8000-000000000000"
}
```

## HTTP status

- `400`: invalid input or validation failure.
- `401`: unauthenticated, invalid credentials, or invalid Session.
- `403`: authenticated without the required trusted scope.
- `404`: resource not found.
- `409`: conflict or uniqueness violation.
- `415`: unsupported request media type.
- `422`: invalid business transition.
- `429`: bounded rate limit exceeded.
- `500`: sanitized unexpected failure.

## Rules

- Never return stack traces, queries, request bodies, raw Prisma errors, credentials, tokens, hashes, or cookies.
- Authentication enumeration paths share one code, status, public message, and response shape.
- Handlers map persistence failures, services raise `AppError`, and the global Fastify error handler owns HTTP formatting.
- Fastify request-format errors with an original 4xx status remain 4xx and use the canonical envelope; they must never degrade to a generic 500.
- Unsupported media types return `415` with code `BAD_REQUEST`. Empty, malformed, or length-inconsistent JSON returns `400` with code `BAD_REQUEST`.
- Logs identify operation, request ID, safe host fingerprint, source metadata, outcome, and timing without credential material.
- Error logs may include only safe diagnostics: `requestId`, `errorType`, stable `errorCode`, `statusCode`, and stack frames without the exception message. Never log request bodies, authorization headers, cookies, tokens, raw SQL, Prisma metadata, or credential material.
- Unexpected failures remain a sanitized `500 INTERNAL_ERROR`; internal diagnostics are recorded only in the safe log context.

## Project daily reports

RDO usa `409` para conflitos esperados e mantém códigos públicos estáveis:

- `DAILY_REPORT_ALREADY_EXISTS`: a obra já possui RDO na data e turno;
- `DAILY_REPORT_IMMUTABLE`: tentativa de alterar ou finalizar novamente um RDO
  finalizado;
- `DAILY_REPORT_PROJECT_UNAVAILABLE`: obra ou período indisponível;
- `DAILY_REPORT_RESOURCE_UNAVAILABLE`: pessoa, alocação ou máquina não é mais
  elegível;
- `DAILY_REPORT_METER_READING_CONFLICT`: a cadeia oficial de uma máquina mudou
  ou impede finalização retroativa.
- `PROJECT_SHIFT_NOT_ENABLED`: o turno solicitado não está habilitado na obra.
- `OPERATIONAL_SHIFT_NOT_STARTED`: uma ação operacional exige um turno aberto;
- `OPERATIONAL_STATUS_CONFLICT`: a transição ao vivo repete o estado atual,
  excede seis intervalos, tenta alterar recurso somente leitura ou perdeu uma
  atualização concorrente;
- `OPERATIONAL_SHIFT_INCOMPLETE`: o início ou fechamento ainda possui um grupo
  obrigatório pendente, identificado em `details.resource`.

Detalhes podem expor somente identificadores, nomes e categorias seguras do
recurso. Não inclua leitura interna não solicitada, body, SQL ou metadados
Prisma. A finalização sem body documenta também `415 BAD_REQUEST` para media
type indevido.

## Project productions

Produção de terraplenagem usa os seguintes códigos públicos:

- `PRODUCTION_PROJECT_UNAVAILABLE`: obra inativa ou indisponível;
- `PRODUCTION_DATE_OUT_OF_RANGE`: data fora da janela operacional calculada em
  `America/Sao_Paulo`;
- `PROJECT_SHIFT_NOT_ENABLED`: turno não habilitado para a obra;
- `PRODUCTION_RESOURCE_UNAVAILABLE`: frente, serviço, responsável, operador ou
  máquina não elegível no turno, ou revisão de material/rota fora da obra ou
  vigência;
- `PRODUCTION_IMMUTABLE`: operação incompatível com estado ou forma de
  lançamento;
- `PRODUCTION_REVISION_CONFLICT`: revisão otimista desatualizada;
- `PRODUCTION_APPROVAL_INCOMPLETE`: campos técnicos obrigatórios ausentes;
- `PRODUCTION_TRANSITION_REASON_REQUIRED`: rejeição ou reabertura sem motivo;
- `PRODUCTION_QUALITY_PENDING`: ensaio obrigatório ainda não aceito;
- `PRODUCTION_QUALITY_REJECTED`: verificação técnica rejeitada impede aprovação;
- `PRODUCTION_CATALOG_CONFLICT`: código ou período de vigência conflita com o
  histórico do material/rota;
- `PRODUCTION_DUPLICATE_BATCH`: fingerprint do lote já existe; `details` pode
  conter somente `existingProductionId`;
- `PRODUCTION_BATCH_IDENTITY_IMMUTABLE`: alteração de material, rota, origem,
  destino, camada ou composição deve criar outro lote;
- `PRODUCTION_MIXED_TRANSPORT_BASIS`: o lote mistura resumos com e sem peso de
  balança;
- `PRODUCTION_DMT_REQUIRED`: rota ou DMT obrigatória incompleta;
- `PRODUCTION_DMT_NOT_APPLICABLE`: DMT informada para serviço incompatível;
- `PRODUCTION_EQUIPMENT_HAS_TRIPS`: tentativa de remover caminhão com viagens;
- `PRODUCTION_SHIFT_LIMIT_EXCEEDED`: limite de 200 lançamentos no turno;
- `PRODUCTION_RDO_CONFIRMATION_REQUIRED`: produção em rascunho, revisão
  operacional não confirmada ou confirmação operacional invalidada;
- `IDEMPOTENCY_PAYLOAD_CONFLICT`: chave de viagem reutilizada com outro
  payload.

A paginação de caminhões disponíveis usa o contrato opaco de cursor; cursor de
outra obra, data ou turno retorna `400 VALIDATION_ERROR`. A criação conjunta de
corte e aterro é transacional: erros de validação, indisponibilidade de frente,
serviço, caminhão ou limite do turno desfazem ambos os lançamentos e usam os
códigos de produção existentes, sem resposta de sucesso parcial.
Tempos médios de carga e descarga fora do formato `minutos.segundos`, com a
parcela de segundos entre `00` e `59`, e percentuais de redução por compactação
fora de `0.00` a `100.00` retornam `400 VALIDATION_ERROR`.

Conflitos retornam apenas identificadores, campos pendentes, limites e
categorias seguras.

## Project scope, work fronts, and fleet

- `COMPANY_CONTEXT_REQUIRED` returns `403` when a Company-scoped operation has
  no Company persisted in the authenticated Session.
- `PROJECT_WORKSPACE_CHANGED` and `PROJECT_RESOURCE_CONFLICT` return `409`
  when the selected workspace or project resource snapshot changes
  concurrently. Safe `details.resources` may identify the affected resource.
  Em uma mobilização de máquina, `reason: "operator-role-mismatch"` identifica
  que a função confirmada na alocação da obra não atende à função exigida pelo
  modelo; o cliente deve orientar a atualização da equipe, sem inferir função
  pelo nome exibido.
- Em obra ativa, `PROJECT_RESOURCE_CONFLICT` com o recurso seguro
  `reason: "reclassification-required"` informa que uma função confirmada já
  não pode ser alterada pela mobilização. A troca exige a futura rotina de
  reclassificação; carga, remuneração, turno e composição da equipe continuam
  sujeitos às regras próprias de mobilização.
- `PROJECT_QUANTITY_BASELINE_BELOW_ALLOCATED`,
  `WORK_FRONT_QUANTITY_EXCEEDS_BALANCE`,
  `WORK_FRONT_QUANTITY_BELOW_PRODUCED`, `WORK_FRONT_SERVICE_HAS_PRODUCTION`,
  and `WORK_FRONT_NOT_ELIGIBLE` return `422` for protected project and work
  front transitions.
- `MACHINE_LOAD_SPEC_NOT_APPLICABLE` and
  `MACHINE_MODEL_JOB_ROLE_INVALID` return `422` when a model or load
  specification is incompatible with the selected Company or machine type.
- Machine identifier, reading, and allocation conflicts return stable
  `MACHINE_*` codes with `409`; these include unavailable operational state and
  attempts to break the monotonic reading chain.
- `MACHINE_MODEL_ALREADY_EXISTS` identifies the normalized
  manufacturer/model/version uniqueness conflict. `MACHINE_DELETED_IDENTIFIER_MATCH`
  returns safe matching identifiers and deleted candidates so the caller can
  choose restore or a new unit. `MACHINE_DELETE_BLOCKED` and
  `MACHINE_RENTAL_ACTIVE` protect history and active rental terms. Operator
  compatibility during unit creation uses `MACHINE_OPERATOR_REQUIRED`,
  `MACHINE_OPERATOR_NOT_ALLOWED`, or `MACHINE_OPERATOR_INVALID`.
- `MACHINE_MODEL_DELETE_BLOCKED` retorna `409` quando um modelo ainda possui
  qualquer unidade com `isActive = true`. O cliente deve remover essas unidades
  antes de tentar arquivar o modelo novamente; unidades históricas inativas não
  bloqueiam nem são alteradas pela operação.
- Em `POST /machine-models/:machineModelId/units`, erros da alocação inicial
  pertencem ao mesmo comando da criação. Qualquer `4xx` desfaz unidade,
  identificadores, leitura, propriedade/locação e mobilização; o cliente pode
  corrigir os dados e reenviar o formulário completo com segurança.
- Em `POST /machine-models/:machineModelId/units/batch`, erros de negócio de
  uma unidade aparecem em `data.rejected[]` com índice, código e mensagem; a
  resposta permanece `200` e `data.created[]` identifica as unidades válidas.
  Erros de formato do envelope ou do limite de 15 itens continuam usando o
  envelope canônico `4xx` e impedem o processamento do lote inteiro.

Quantitative limits may appear in safe `blockers` or resource data, but errors
must not expose request payloads, SQL, Prisma metadata, credentials, or
personal-data ciphertext.

## Filtros da equipe da obra

`GET /projects/:projectId/team-members` valida `shift`, `search`, `jobRole` e
`cursor` como query estrita. Valores inválidos ou cursores emitidos para outra
busca, cargo ou turno retornam `400 VALIDATION_ERROR` no envelope canônico; não
há novos códigos de erro públicos para a filtragem.

## Filtros de máquinas mobilizadas

`GET /projects/:projectId/mobilization/machines` valida `search` e `cursor`
como query estrita. Valores inválidos ou cursores emitidos para outra busca ou
obra retornam `400 VALIDATION_ERROR` no envelope canônico; não há novo código
público para a listagem.

## Funções da empresa

- `JOB_ROLE_ALREADY_EXISTS` retorna `409` quando o nome normalizado da função
  já existe na mesma empresa. O mesmo nome pode existir em outra empresa da
  corporação.
- `JOB_ROLE_UNAVAILABLE` e `JOB_ROLE_CHANGE_CONFLICT` retornam `409` quando a
  função não está ativa no escopo da empresa ou a alteração concorrente não é
  mais aplicável.

## Workforce and commercial records

Workforce lifecycle conflicts use stable `EMPLOYMENT_*` and
`EMPLOYEE_ALLOCATION_*` codes with `409` or `422`, depending on whether the
state changed concurrently or the requested terms are invalid. Commercial
duplicates and unavailable records use their documented `*_ALREADY_EXISTS`,
`*_NOT_FOUND`, and `*_UNAVAILABLE` codes. Consumers should branch on the
stable code and HTTP status, never on an internal error message.
