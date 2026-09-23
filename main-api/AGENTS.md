# Agent Instructions

Leia este arquivo antes de alterar o projeto.

## Regras obrigatorias

- Nao use `bmad-quick-dev` a menos que o usuario chame explicitamente esse skill/workflow. Se ele nao chamar, trabalhe com o modelo puro Codex.
- Preserve o fluxo `controller -> service -> handler`.
- Somente arquivos em `handlers/`, `src/db/` e plugins de infraestrutura podem acessar Prisma.
- Controllers nao importam Prisma, nao usam `app.prisma` e nao fazem query.
- Services nao importam Prisma Client e nao chamam `prisma.model`.
- DTOs contem schemas Zod e tipos inferidos; nao contem regra de negocio.
- Validacao de formato fica nos DTOs e preHandlers.
- Regra de negocio fica nos services.
- Persistencia e filtros de banco ficam nos handlers.
- Em dados com escopo de negócio, `corporationId` e `companyId` vêm do contexto
  autenticado, nunca do body, query ou header livre. Consulte `docs/TENANCY.md`.
- Todas as listagens potencialmente ilimitadas usam paginacao por cursor conforme `docs/PAGINATION.md`.
- Nao vaze detalhes internos de erro em respostas HTTP.
- Erros Fastify de formato com status 4xx permanecem 4xx e usam o envelope canonico; nao os transforme em 500 generico.
- Mudancas em rotas, status HTTP ou schemas de resposta atualizam
  `docs/ERRORS.md`, o OpenAPI, os clientes gerados no dashboard e os testes no
  mesmo trabalho.
- Siga a definicao de pronto documental do `AGENTS.md` da raiz.

## Antes de criar codigo novo

1. Leia `docs/ARCHITECTURE.md`.
2. Siga `docs/MODULE_PATTERN.md` para novos modulos.
3. Use `docs/VALIDATION.md` para DTOs e preHandlers.
4. Use `docs/TENANCY.md` se o dado pertencer a uma Corporation ou Company.
5. Use `docs/PAGINATION.md` para toda listagem paginada.
6. Use `docs/ERRORS.md` para status HTTP e mensagens.
7. Consulte `../docs/` quando a mudanca alterar um fluxo funcional compartilhado.
8. Para RDO, jornadas e leituras geradas por finalizacao, leia
   `../docs/project-daily-reports.md` antes de alterar o modulo `daily-reports`.

## Verificacao

Rode antes de finalizar:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm check:openapi
```

Quando o contrato público mudar, execute também em `../main-web-app`:

```bash
pnpm validate:api
pnpm check:api
```
