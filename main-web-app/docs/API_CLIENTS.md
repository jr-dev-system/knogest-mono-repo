# Generated API Clients

Fastify route schemas generate the canonical `main-api/artifacts/openapi.json`. Kubb consumes that artifact and writes TypeScript models, Zod schemas, and server-only clients under `src/generated`.

```bash
pnpm --dir ../main-api generate:openapi
pnpm generate:api
pnpm validate:api
pnpm check:api
```

Never edit generated files or maintain duplicate request/response types. Presentation code adapts generated DTOs inside feature-level Server Actions or queries.

Current authentication operations are:

- `POST /api/v1/auth/login`
- `GET /api/v1/auth/session`

## Transporte server-only

`src/lib/api/server-client.ts` e o adaptador compartilhado usado por clientes
gerados e chamadas server-only mantem as credenciais fora do navegador. Todas
as chamadas devem preservar estas regras:

- Sem body (`data === undefined`): nao envie `Content-Type`. O cliente define o
  header como `null` internamente para impedir que o Axios gere
  `application/x-www-form-urlencoded`.
- JSON: envie um body real e `content-type: application/json`.
- `FormData`: nao configure `Content-Type` manualmente; o Axios deve criar o
  boundary de `multipart/form-data`.
- Nao envie `{}` apenas para fazer um comando sem body atravessar o transporte.
  O contrato da rota decide se existe body.

Essa normalizacao tambem se aplica quando uma chamada e repetida depois da
renovacao da sessao.

## Server Actions

O status `200` de um `POST` para uma pagina Next.js confirma apenas que o
protocolo da Server Action respondeu. A chamada Fastify interna pode ter
retornado erro e sido convertida em um resultado serializavel pela action.
Componentes devem avaliar o resultado de dominio antes de atualizar a interface.

O fluxo de RDO usa queries server-only para a pagina inicial e Server Actions
para opções temporais, detalhe, paginação, criação, edição e finalização. A
action de finalização chama
`POST /projects/:projectId/daily-reports/:reportId/finalize` sem `data` e sem
`Content-Type`. O componente só aplica o snapshot `finalized` quando o resultado
de domínio é `success`; um `200` do protocolo da Server Action não basta.

O fluxo de produção usa os clientes gerados para opções do turno, listagem,
detalhe, rascunho, aprovação, reabertura e viagens rápidas. O componente nunca
incrementa viagens apenas em estado local: cada toque envia UUID de
idempotência e substitui o detalhe pela revisão retornada pela API.

O cadastro de equipe envia `shift` em cada alocação e pode reconciliar
`weeklySchedule` e `breakTemplates` na mesma chamada de mobilização. Máquinas
usam `operatorAssignments` por turno; frentes usam `machineAssignments` com o
par `machineId + shift`. Ao trocar data ou turno na produção, a interface
reconsulta as opções antes de substituir responsáveis, frente e máquinas.
Cada alocação envia `monthlyWorkloadHours` como inteiro entre 1 e 744. O RDO
não recebe nem devolve snapshot dessa carga: `completedFullShift` faz a API
resolver as horas normais pela janela efetiva do próprio relatório.
O editor de equipe consulta
`GET /projects/:projectId/team-candidates` em páginas de 15 e salva somente o
turno ativo em `PUT /projects/:projectId/mobilization/employees/:shift`. A
Server Action deve reiniciar a paginação quando turno ou busca mudar e nunca
reutilizar cursores entre esses filtros.
A visualização da aba Equipe consulta
`GET /projects/:projectId/team-members?shift=&cursor=&limit=15` por uma Server
Action. Cada turno mantém suas páginas já carregadas e seu índice atual; trocar
entre Diurno e Noturno não reinicia a navegação do outro turno.

A linha de base e as distribuições usam strings decimais com três casas. A
edição de serviços de uma frente ativa chama
`PUT /projects/:projectId/fronts/:frontId/services`; ela não reutiliza o PATCH
de metadados da frente. A interface consome `produced`, `minimumQuantity` e
`maximumQuantity` do snapshot, sem recalcular a regra de domínio.

O cadastro de máquina envia `loadVolumeM3` e `maxSupportedWeightT` somente para
`WHITE_LINE`. A edição usa
`PATCH /machines/:machineId/load-specification`, enviando cada campo como string
decimal ou `null`. Em produção, a capacidade é somente leitura e vem das opções
do turno; valores legados enviados no comando são ignorados pela API.

Antes de finalizar o RDO, a interface:

1. salva o rascunho do relatório;
2. consulta todas as produções da data e turno;
3. interrompe se encontrar rascunhos;
4. confirma os IDs das produções aprovadas;
5. chama a finalização do RDO.

Falha em qualquer etapa mantém o RDO em rascunho e mostra o erro de domínio.

## Testes e manutencao

- Testes que mockam uma Server Action cobrem o componente, mas nao validam o
  formato HTTP enviado pelo Axios.
- Alteracoes no cliente compartilhado exigem teste de transporte com Axios real,
  incluindo body, `Content-Type` e comportamento de retry.
- Alteracoes em endpoints ou envelopes exigem regenerar e validar OpenAPI e
  clientes gerados.
- Mantenha este documento sincronizado com toda mudanca de transporte ou Server
  Action, conforme a definicao de pronto do `AGENTS.md` da raiz.
