# Componentização

Antes de criar ou alterar qualquer componente visual, leia `docs/STYLING.md`. A estilização inicial do starter é demonstrativa: ela orienta estrutura, consistência e forma de trabalho, mas não representa a identidade visual oficial de uma aplicação derivada.

## Regra de pastas

Componentes reutilizáveis ficam em:

```text
src/components
```

Componentes específicos de página ficam em:

```text
src/components/pages/<caminho-da-rota>
```

Exemplos:

```text
src/components/ui/button.tsx
src/components/layout/app-shell.tsx
src/components/pages/auth/login/login-form.tsx
src/components/pages/home/home-dashboard.tsx
```

## Server e Client Components

- Server Component é o padrão.
- Use `"use client"` somente para interação, estado local, Zustand, `signIn`, `signOut` ou APIs do navegador.
- Componentes client-side não importam clients OpenAPI nem módulos server-only.

## UI

- Use `src/components/ui` para primitivas reutilizáveis.
- Use ícones `lucide-react` em botões e ações.
- Prefira controles familiares: botões com ícone, inputs, segmentados, toggles e menus.
- Evite guardar regra de negócio em componentes de UI.

## Estilização Demonstrativa

- Cores, espaçamentos, sombras, radius e composições atuais são exemplos do starter.
- A identidade visual só deve ser considerada oficial quando o registro em `docs/STYLING.md` estiver preenchido com status `Oficial`.
- Ao trocar a aparência, preserve a separação entre componentes reutilizáveis e componentes específicos de página.
- Não duplique padrões visuais locais se eles puderem virar primitiva reutilizável em `src/components/ui`.

## Páginas

Arquivos em `src/app` devem compor dados, auth e layout. A UI específica deve ficar em `src/components/pages`.

## Formulário Operacional

Use `OperationsModal` para a casca de criação/edição e
`src/components/ui/form-section.tsx` para agrupar campos relacionados. A seção
é um `fieldset` com título obrigatório e descrição opcional; não deve conter
regras de negócio nem controlar o envio.

Validação, mensagens em português, opcionais e máscaras seguem
`docs/FORM_VALIDATION.md`.

Anatomia: cabeçalho com ícone, título e descrição; corpo rolável com seções;
erros bloqueantes via `FormErrorDeclaration`; e rodapé fixo, fora da rolagem,
com cancelar e ação primária. Feedback positivo pós-envio pode usar
`role="status"` fora do formulário.
Funcionários, clientes e fornecedores de combustível são as referências do
padrão reutilizável.

## Navegação por abas

Use `OperationTabs` em modais operacionais que separam duas ou mais tarefas do
mesmo contexto e `OperationTabPanel` para o conteúdo ativo. O `tablist` precisa
de rótulo acessível e prefixo de IDs compartilhado com os painéis. Somente a
aba ativa participa da ordem de tabulação; setas esquerda/direita, `Home` e
`End` mudam seleção e foco. Em telas estreitas, a faixa é horizontal e rolável,
sem comprimir os rótulos.

O seletor de contexto (por exemplo, Diurno/Noturno) fica antes das abas de
tarefa. Trocar contexto com rascunho deve pedir confirmação, e cada painel deve
manter seus estados de vazio, erro e carregamento no próprio corpo do modal.
