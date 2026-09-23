<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

## Agent Instructions

- Nao use `bmad-quick-dev` a menos que o usuario chame explicitamente esse skill/workflow. Se ele nao chamar, trabalhe com o modelo puro Codex.
- Leia `docs/API_CLIENTS.md` antes de alterar Server Actions, queries server-only ou o cliente HTTP compartilhado.
- Mantenha fluxos de domínio em `src/features/<domínio>/`; `src/app` compõe
  rotas, layout e dados de entrada, e `src/components` contém primitives e
  cascas reutilizáveis.
- Requisicoes sem body nao enviam `Content-Type`. Nao use um objeto vazio como body para contornar comportamento do cliente HTTP.
- Mudancas em transporte, Server Actions ou contratos de API devem atualizar `docs/API_CLIENTS.md`, os testes de transporte e, quando aplicavel, o OpenAPI no mesmo trabalho.
- Siga a definicao de pronto documental do `AGENTS.md` da raiz.
- Para a aba Relatorios, formulario, mensagem e clipboard do RDO, leia
  `../docs/project-daily-reports.md` antes de alterar o fluxo.
- Para fluxos de obra, frota ou turnos, consulte os documentos canônicos em
  `../docs/` antes de alterar a interface.

## Verificacao

Rode antes de finalizar:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm validate:api
pnpm check:api
```
