# Componentização

Antes de criar ou alterar qualquer componente visual, leia `docs/STYLING.md`. A estilização inicial do starter é demonstrativa: ela orienta estrutura, consistência e forma de trabalho, mas não representa a identidade visual oficial de uma aplicação derivada.

## Regra de pastas

Componentes reutilizáveis ficam em:

```text
src/components
```

Componentes de domínio novos ficam preferencialmente em:

```text
src/features/<domínio>/components
```

Exemplos:

```text
src/components/ui/button.tsx
src/components/layout/app-shell.tsx
src/features/projects/components/project-detail.tsx
src/features/employees/components/employee-detail-page.tsx
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

## Páginas e features

Arquivos em `src/app` compõem rota, dados de entrada, auth e layout. A UI e as
regras de apresentação específicas ficam em `src/features/<domínio>`. Actions,
queries server-only, adaptadores e schemas do mesmo domínio permanecem próximos
dos componentes que os usam. `src/components/pages` contém cascas de rota
compartilhadas já existentes (login, dashboard e empresa); não deve receber
novas regras de domínio ou transporte.

## Formulário Operacional

Use `OperationsModal` para a casca de criação/edição e
`src/components/ui/form-section.tsx` para agrupar campos relacionados. A seção
é um `fieldset` com título obrigatório e descrição opcional; não deve conter
regras de negócio nem controlar o envio.

Validação, mensagens em português, opcionais e máscaras seguem
`docs/FORM_VALIDATION.md`.

Anatomia: cabeçalho com ícone, título e descrição; corpo rolável com seções;
erros bloqueantes via `FormErrorDeclaration`; e rodapé fixo, fora da rolagem,
com cancelar e ação primária. Feedback transitório pós-envio usa o Sonner
global no topo central, com o CSS estático oficial incluído no bundle para
permanecer visível sob CSP; `role="status"` fica reservado para estados que fazem
parte do conteúdo, como carregamento ou indicador operacional persistente.
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
tarefa quando o contexto precisa mudar dentro do mesmo fluxo. Em editores de
equipe, o turno é escolhido na aba Equipe antes de abrir um modal: não repita
esse seletor dentro dele. `Editar turno` e `Adicionar funcionários` abrem
modais focados, cada um com apenas os controles pertinentes. Preserve conteúdo
já carregado por turno e use transições curtas que respeitem
`prefers-reduced-motion`, sem redimensionar o diálogo durante a troca de
conteúdo. A seção aberta e o turno visível usam os parâmetros de URL `section`
e `teamShift`, para que um recarregamento restaure o mesmo contexto.
