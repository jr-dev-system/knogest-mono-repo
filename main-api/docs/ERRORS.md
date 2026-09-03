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

Conflitos retornam apenas identificadores, campos pendentes, limites e
categorias seguras.

## Frentes e frota

- `WORK_FRONT_QUANTITY_BELOW_PRODUCED`: a distribuição proposta ficou abaixo
  da soma oficial produzida na frente e no serviço;
- `WORK_FRONT_SERVICE_HAS_PRODUCTION`: tentativa de remover um serviço que tem
  ao menos um lançamento vinculado, ainda que seja rascunho zerado;
- `MACHINE_LOAD_SPEC_NOT_APPLICABLE`: volume de carga ou peso máximo enviado
  para máquina que não pertence à linha branca.
- `MACHINE_MODEL_JOB_ROLE_INVALID`: a função de operador do modelo não está
  ativa ou não pertence à empresa selecionada.

Os três casos usam `422`. Limites quantitativos podem aparecer em `blockers`,
sem expor payload, SQL ou detalhes de persistência.

## Funções da empresa

- `JOB_ROLE_ALREADY_EXISTS` retorna `409` quando o nome normalizado da função
  já existe na mesma empresa. O mesmo nome pode existir em outra empresa da
  corporação.
