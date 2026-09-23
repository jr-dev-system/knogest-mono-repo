# Module Pattern

Crie novos modulos dentro de `src/modules/<module-name>`.

Estrutura recomendada:

```text
src/modules/orders/
  orders.controller.ts
  orders.service.ts
  orders.dto.ts
  handlers/
    create-order.handler.ts
    get-order.handler.ts
    list-orders.handler.ts
```

## Controller

- Nome: `<module>.controller.ts`
- Exporta uma funcao que recebe `FastifyInstance`.
- Registra rotas, validacoes, Swagger e respostas.
- Chama o service.

## Service

- Nome: `<module>.service.ts`
- Exporta uma classe ou funcoes de caso de uso.
- Recebe `HandlerContext` no construtor quando precisar de persistencia.
- Chama handlers para ler ou gravar dados.

## DTO

- Nome: `<module>.dto.ts`
- Exporta schemas Zod e tipos `z.infer`.
- Deve ter um schema por entrada publica relevante: body, params e query.

## Handler

- Pasta: `handlers/`
- Nome: `<action>-<entity>.handler.ts`
- Recebe `HandlerContext`.
- E a unica camada que usa `context.prisma`.
- Retorna dados de domínio ou lança `AppError` normalizado. O controller, e
  somente ele, aplica o envelope HTTP por `jsonResponse`. Listagens paginadas
  usam o formato específico abaixo.

## Paginated List Endpoints

Every endpoint that powers a table or returns a potentially unbounded collection must follow `PAGINATION.md`.

- Add a `list-<entity>.handler.ts` handler.
- Validate cursor, limit, search, filters, `sortBy`, and `sortDirection` in a strict module DTO.
- Apply every authenticated scope defined by the module; tenant-aware modules also follow `TENANCY.md`.
- Use deterministic cursor ordering with `id` as the final tie-breaker.
- Return `{ data, pageInfo }` from the handler. The controller alone applies
  the standard HTTP envelope.
- Do not implement a paginated module until the shared implementation gate in `PAGINATION.md` is complete.
