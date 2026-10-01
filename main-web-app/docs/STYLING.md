# Estilização

KnoGest já possui uma identidade visual oficial para a aplicação web inicial. O visual é claro, operacional e robusto para uso em escritório, tablet e campo sob sol.

Esta documentação deve orientar novas telas, componentes e ajustes visuais. Não crie um segundo design system paralelo.

## Regras Para IAs/Agentes

- Trate as cores, sombras, espaçamentos, bordas e composições atuais como base oficial do MVP.
- Preserve a regra de componentização: primitives, layout e cascas compartilhadas
  em `src/components`; novas telas e componentes de domínio em
  `src/features/<domínio>/components`.
- Use `src/components/ui` para primitivas reutilizáveis e evite duplicar controles visuais comuns.
- Ao alterar estilos, mantenha acessibilidade, contraste, foco visível, responsividade e estados de erro/carregamento.
- Alterações visuais não podem quebrar as regras server-only, autenticação, Zustand seguro ou restrições de ESLint.
- Novas páginas devem copiar a linguagem estrutural e estética atual, adaptando apenas o conteúdo e a densidade da tarefa.

## Registro Da Identidade Visual Da Aplicação

Preencha esta seção quando uma aplicação derivada do starter tiver identidade visual própria, aprovada e pronta para substituir a estilização demonstrativa.

```text
Status da estilização: Oficial
Nome da aplicação: KnoGest
Responsável pela aprovação visual: Usuário do projeto
Data da oficialização: 2026-06-18
Fonte de verdade: PRODUCT.md + direção visual "Map-First Project Operations"

Tokens oficiais:
- Cores: OKLCH em `src/app/globals.css`; base clara mineral/azul, estados operacionais em verde, âmbar, vermelho e azul. Verde é reservado para estados positivos/ativos, não para identidade de marca.
- Tipografia: Inter/Geist via `next/font`, escala fixa em rem para produto.
- Espaçamento: escala Tailwind com densidade robusta para campo/celular.
- Radius: 10px base; controles e blocos internos usam até `rounded-lg`.
  Painéis principais e cartões de recursos operacionais usam `rounded-2xl`
  para separar entidades completas de linhas e controles auxiliares.
- Sombras: evitar sombra decorativa; profundidade por borda, contraste e hierarquia.

Componentes auditados:
- `src/components/layout/app-shell.tsx`
- `src/components/pages/auth/login/*`
- `src/components/pages/home/home-dashboard.tsx`
- `src/components/ui/operations-table.tsx`
- `src/components/ui/operations-modal.tsx`
- `src/components/ui/form-section.tsx`
- `src/features/projects/components/project-detail.tsx`
- `src/features/machines/components/machines-page.tsx`

As cascas legadas em `src/components/pages` continuam válidas, mas novos fluxos
de domínio não devem ampliar essa árvore.

Páginas auditadas:
- `/auth/login`
- `/home`
- `/home/funcionarios`
- `/home/maquinas`
- `/home/obras`
- `/home/fornecedores`
- `/home/configuracoes`

Critérios para considerar a identidade visual pronta:
- Não parecer ERP genérico nem dashboard cripto escuro.
- Funcionar em desktop, tablet e celular com contraste forte para uso em campo.
- Preservar fluxo multiempresa: login/empresa, admin da empresa e dashboard de projeto orientado por mapa.
```

Com `Status da estilização: Oficial`, a fonte de verdade registrada acima passa a orientar alterações visuais futuras.

## Cabeçalhos de Área

- Mostre um rótulo superior, título e subtítulo somente quando cada nível acrescentar contexto distinto; não repita o nome da área entre eles.
- Não explicite "da empresa" quando a empresa ativa já define o escopo da tela.
- Use subtítulos apenas para comunicar uma ação, estado ou consequência útil à tarefa atual.
- Não use copy para explicar detalhes de implementação, navegação ou permissões que a interface já torna implícitos.
- Não exponha janelas, fusos, códigos, limites ou autoridades da API em textos
  auxiliares quando os próprios controles já aplicam essas regras. Uma
  descrição só deve existir quando acrescenta contexto que muda a decisão ou a
  próxima ação do usuário.

## Formulários Operacionais

- Use `OperationsModal` para criação e edição administrativa: ícone, título,
  descrição curta, corpo rolável e rodapé de ações fixo fora da rolagem.
- Separe campos por `FormSection`; uma seção representa uma tarefa clara como
  Identificação, Contato ou Endereço. Não aninhe seções nem crie cartões dentro
  delas.
- Inputs de operação devem ter ao menos 44px de altura, label visível, foco
  perceptível e `inputMode="numeric"` quando a entrada for numérica.
- Erros bloqueantes de modais e wizards devem aparecer em um bloco formal
  `FormErrorDeclaration` acima do conteúdo do formulário ou da etapa atual.
  Não coloque mensagens de erro logo abaixo de inputs nesses fluxos.
- Máscaras são reservadas a formatos estruturais brasileiros (CPF, CNPJ,
  telefone e CEP). Nome, e-mail e endereço permanecem sem máscara.
- Em formulários com PF/PJ, preserve os rascunhos específicos de cada tipo e
  mantenha contato e endereço compartilhados ao alternar.

## Componentes Reutilizáveis Do MVP

### Tabela Operacional

Use `src/components/ui/operations-table.tsx` para listagens administrativas de empresa.

Contrato visual:

- Container único com borda forte, toolbar superior e rodapé de paginação.
- Busca sempre à esquerda; filtros ficam ao lado; ações ficam à direita.
- Tabela com largura mínima e rolagem horizontal em telas pequenas.
- Cabeçalho ordenável com setas, linhas densas e hover discreto.
- Estado vazio dentro da própria tabela, sem modal ou toast.
- Paginação local obrigatória quando a lista tiver mais que uma tela útil.

Contrato técnico:

- Passe `columns` no formato TanStack `ColumnDef<TData>[]`.
- Passe dados com `id: string`.
- Filtragem por domínio deve acontecer na página; a tabela só renderiza e pagina.
- Use `actions` para o botão de criação e `filters` para selects/controles reais.

### Modal Operacional

Use `src/components/ui/operations-modal.tsx` para criação e edição de entidades do MVP.

Contrato visual:

- Cabeçalho com ícone do módulo, título e descrição curta.
- Corpo rolável, largura `md`, `lg` ou `xl`, radius até `rounded-lg`.
- Rodapé de formulário dentro do conteúdo, com cancelar à esquerda visual e salvar como ação primária.
- Nada de modal full-screen em desktop para cadastros simples.

Contrato técnico:

- Use `open`/`onOpenChange` quando o formulário precisar fechar após salvar.
- O backdrop de qualquer modal deve desfocar e escurecer moderadamente o
  conteúdo de fundo. O clique externo não fecha o modal por padrão; preserve
  `Escape`, o botão de fechar e as ações explícitas como saídas acessíveis.
- O formulário deve ter labels visíveis, foco visível e campos obrigatórios nativos.
- Erros de validação e de API devem usar `FormErrorDeclaration`; reserve
  `role="status"` para sucesso ou mensagens não bloqueantes.
- Criação de funcionários, máquinas, obras e fornecedores deve acontecer em modal.
- Não use páginas separadas de criação para este MVP inicial.

### Abas operacionais

- Use uma única faixa segmentada, rolável horizontalmente no celular, seguida
  do `tabpanel`; não envolva cada aba em um card próprio.
- Preserve foco visível, alvos de ao menos 36 px e rótulos curtos orientados à
  tarefa. Abas não substituem etapas sequenciais de um wizard.
- Quando houver um seletor de turno acima das abas, mantenha hierarquia e
  espaçamento distintos para evitar que os dois controles pareçam duplicados.

### Cartão de recurso operacional

Use o cartão de recurso operacional nas listagens em que cada registro reúne
identidade, classificação, dados de operação e ações próprias, como máquinas
mobilizadas e funcionários da equipe da obra. Ele existe para permitir leitura
rápida em campo sem transformar a listagem em uma tabela genérica.

Contrato visual:

- Casca `rounded-2xl`, borda neutra e faixa lateral de 6 px como âncora de
  classificação.
- Cabeçalho em superfície neutra suave (`bg-muted/30`), nunca preenchido com a
  cor da classificação.
- A cor da faixa é repetida somente no bloco do ícone e na etiqueta curta.
- Linha branca e funcionários usam o azul-ardósia existente; âmbar é exclusivo
  da linha amarela. Não crie variações intermediárias dessas cores.
- Conteúdo e ações são separados por divisores. A área de ações usa contraste
  discreto e mantém alvos de toque de pelo menos 40 px.
- Cartões consecutivos usam 12 px de intervalo; filtros, paginação e outros
  blocos estruturais mantêm separação maior.

Na página da obra, o cartão vive dentro de uma única seção principal. Não
adicione outra moldura de card ao redor do conteúdo da aba: cabeçalho da obra,
navegação contextual e seções já estabelecem a hierarquia necessária.
