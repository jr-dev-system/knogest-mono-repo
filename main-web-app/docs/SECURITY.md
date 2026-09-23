# Segurança

## Regras de chamadas

- Não use `fetch` ou `axios` em componentes, hooks ou stores.
- Não importe `src/generated/clients` fora de Server Actions ou módulos server-only.
- Toda Server Action deve verificar sessão e autorização própria.
- Não confie apenas em `proxy.ts` para proteger dados.
- O host recebido é normalizado e encaminhado somente pela fronteira server-only;
  componentes e ações não aceitam Corporation ou Company como escopo confiável.

## Headers

`src/proxy.ts` aplica:

- `Content-Security-Policy`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy`
- `frame-ancestors 'none'`

O CSP usa nonce por requisição e permite ajustes mínimos para o modo desenvolvimento.
Componentes de notificação usam CSS estático empacotado pelo aplicativo; não
dependem da injeção de `<style>` em tempo de execução, que a CSP bloqueia.

## Tokens

- Tokens nunca entram em Zustand.
- Tokens nunca são enviados como props para Client Components.
- Tokens nunca são adicionados ao retorno público de `session`.
- O client server-only injeta `Authorization` lendo o JWT no servidor.
- Uma resposta `401 SESSION_INVALID` usa a renovação single-flight do BFF; a
  renovação nunca é delegada ao navegador nem repetida recursivamente.

## Validação

- Inputs de login são validados com Zod na UI e no `authorize`.
- Clients Kubb validam payloads e respostas com schemas Zod.
- Server Actions devem validar qualquer dado recebido do formulário antes de chamar a API externa.

## Zustand seguro

Use Zustand apenas para estado de UI:

- filtros;
- modo de visualização;
- sidebar;
- preferências não sensíveis.

Não salve:

- token;
- sessão;
- permissões;
- dados pessoais;
- respostas completas de contratos privados.
