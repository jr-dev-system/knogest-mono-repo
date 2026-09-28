KnoGest

## Obra

Nome da Obra
Localização
Prazo (horas)
Valor orçado
Metríca de produção (metro cúbico)
Nivelamento de terreno (metro quadrado)
Top Soil (metro cúbico/Km)
Equipamentos da Obra.

## Rotinas

- RDO
  - DSS (resumo)
  - Checklist de equipamento
  - Direcionamento (Resumo)
  - Clima com índice pluviométrico.
  - Interferência
    - Mecanica
    - Clima (Descrição)
    - Externo (Descrição)

- Abastecimento
  - Máquina
  - Orímetro
  - Quantidade (L)
  - Tipo combustível
  - Identificação do comboio (Opcional, placa ou tag)
  - Foto (foto da nota e do orímetro)

- Manutenção
- Tipo de manuntenção (Preventiva, Corretiva)
- Data início
- Data Fim
- Descrição.
- Equipamento
- Status (Iniciado, Finalizado)
- Custo manutenção

- Corte
- Quantidade de carrada (metro cúbico)
- Equipamento

- Aterro
- Equipamentos
- Quantidade de carradas (metro cúbico automático pelo corte)

## Entidades

- Equipamentos
  - Tipo: Linha amarela ou Linha Branca
  - Identifação: Tag ou Placa do veículo..
  - Nome da máquina
  - Orímetro

- Funcionario
  - Nome
  - Função
  - H/H trabalhada (valor)

- Mão de Obra (Recurso)
  - Hora extra de funcionários.
  - Salário dos funcionários
  - Alimentação (valor).
  - Manuntenção de Canteiro (valor).
  - Diesel (por máquina/Geral)

rotina de ajuste histórico fica para outra
-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=--

## Classificação de máquinas

- Linha branca e linha amarela

sugestão do cliente da obra no RDO.

1. Ponto de entrada com facial.
2. Início DSS com tema do DSS e assinatura do DSS com a facial da entrada.
3.

medir eficiencia da máquina em horas e em Km (horas mensais)
medir progresso da obra com metas diárias
Rotina de combustível
Rotina de manutenção
Montar página do orçamento. (valor por hora do caminhao, horas totais mensais, comida, combustível)

Ao cadastrar o item de fornecimento deixar claro quais são os campos obrigatórios e não com um \* vermelho após a label. Isso serve para todos os formulários da aplicação.

Remover autcomplete de todos os inputs.
Na página de fornecedores adcionar os botões de adcionar item e criar subcategoria no cabeçalho da categoria ou subcategoria mas separando visualmente dos botões editat e desativar como se tivesse um | entre as 2 seções de botões

as tabs itens fornecidos e fornecedores devem ficar no start e não no end
Eu posso deletar um item fornecido com soft delete ao invés de só desativado.
Erros do modal de criação/edição de item mantém para modais abertos posteriormente que não tem nada a ver
adcionar recurso visual para um item que não
UNIDADE DE VALOR NÃO PERSISTE PARA EDIÇÃO, O CHECKBOX FICA DESMARCADO
Edição não funciona, sempre retornar um erro.
Ao cadastrar um fornecedor a tab pessoa juridica deve vir primeiro
Melhorar experiência do preenchimento do endereço na criação do fornecedor

Na tab de items dentro da página da obra pode criar presets. que são items que facilitam na adição do consumo. Por exemplo deixar criado 20 unidades da oferta de marmita. Esses presets não valem para combustível. Quando estiver finalizando o turno, no wizard deve ter um step de itens fornecidos que pode selecionar os presets ou montar alí mesmo selecionando o item, etc... E partir desse item poder criar até um preset selecionando um checkbox. O preset não deve ser ter um titúlo, ele é composto pelo a junção das características.

O processo de criação de RDO deve ser automático de modo que quando iniciar o turno começar captura os items inicias que são necessários para criar o turno como condição climática, confirmar máquinas que vão trabalhar, funcionários que bateram o ponto, etc... Quando finalizar o turno ele vai inputar todas as informações referente ao final do turno como confirmar horário final do turno, intervalos, quantidade de horas extras, profissionais que receberam horas extras e confirmar suas respectivas quantidades, horímetro ou km final de todas as máquinas, imprevistos e impedimentos, Resumo dos serviços executados sendo puxados automaticamente pelos lançamentos de produção e todas as informações que fazem no input de criação de um novo RDO, etc...

A distinção entre um card e outro ainda causa um certo peso cgnitivo, não é está muito natural. Ainda tenho uma certa impressão de que as cores se misturam.

## Biometria

-- É feita sempre por um usuário apontador no dispositivo
-- Facial na entrada, entre intervalos e saída da empresa
-- A partir dela confirmar todos os funcionários participantes no dia.

## Relatórios

- RDO (PREENCHIDO AUTOMATICAMENTE AO INICIAR E FECHAR TURNO)
- Relatório de frequência (preenchido automaticamente ao iniciar e fechar turno).

## Para iniciar um turno

-- Checklist dos funcionários (com biometria)
-- assinatura DDS
-- Checkslist das máquinas (todas marcadas, exceto em manutênção)

## Para finalizar um turno

-- Checklist dos funcionários, confirmação de horas extras, horários de saída e intervalos.
-- Marcação final de todas as máquinas
-- Confirmar todas as interferencias

# OBS

1.  QUANDO UM OPERADOR DE UMA MÁQUINA SAIR NO MEIO EXPEDIENTE COMO SERÁ A SUBSTITUIÇÃO DE OPERADOR? TEM QUE SER DA MESMA FUNÇÃO OU PODE ADCIONAR UM PROFISSIONAL DE OUTRA FUNÇÃO COMO TEMPORÁRIO?

2.  Na hora de alocar uma máquina à obra não trazer operadores que já estão ocupados na mesma obra e melhorar a visualização mascarada do horímetro ou Km

3.

## Princípio

- Quando se cria uma máquina pega apenas fabricante e modelo do jeito que já está. As unidades físicas não são mais do jeito que estão projetadas agora. Essa unidade física ela pode ser tanto alugada quanto pertencer a propria empresa. Na maioria das vezes, alugada.

\*\* exigir mais um campo opcional chamado versão para criar um modelo e fabricante.

## SE FOR ALUGADA:

- RECEBER QUAL É LOCADORA
- VALOR DA HORA (Mas confirma ao alocar em uma obra)
- QUANTIDADE DE HORAS POR MÊS (Somente quando for alocada em uma obra)

## Onde criar essas unidades físicas

- Dentro do modelo pode criar uma unidade e já alocar em uma obra passando a quantidade de horas por mês e até mesmo alocando um funcionário já da obra ou somente criar a unidade mesmo.
- Dentro do modal de máquinas dentro da obra deve permitir criar uma unidade selecionando fabricante/modelo/versão.

## Listagens

- Na listagem de modelos na página de máquinas da empresa os únicos campos que quero é:
  \*\* Fabricante/Modelo/Versão em uma única linha, pode fazer em 2 linhas na célula de maneira clara, visível, e com contraste de destaque entre modelo e versão.
  Ex: Escavadeira - HX220L
  HYUNDAI

  \*\* Unidades com "?" (caso tenha pelo menos 1) popover já documentado que vai mostrar a identificação de todas as máquinas e o seu status de disponibilidade. Deletados não aparecem aqui.

  \*\* Tipo

  \*\* Capacidade de carga

  \*\* Quantidade de unidades

## Obs

- O tipo de Medidor da máquina deve ser atrlado à unidade física e não ao modelo.
- Quando uma obra acabar e a máquina for alugada, ela não fica nem disponível nem indiponível, ela vai ter um status "Sem Locação". Essa unidade pode ser excluída by soft delete nesse status mas histórico ainda mantém. Se ela for excluída não impede de ser recriada com a mesma identificação, mesmo tudo (só impede se estiver no catálogo de unidades ainda). Nesse caso, quando for criar tem que buscar se já existe algum deletado com as mesmas identificação (placa ou patrimonio) dentro do mesmo fabricante, modelo e versão. Se encontrar deve perguntar ao usuário se ele quer trazer de volta a máquina ou criar uma máquina nova com as mesmas identificações.

## Proximas implementações de maquinas

- Filtro avançado por fabricante modelo, versão, tipo, capacidade de carga

---

## Equipe

- O único turno que deve vir habilitado é diurno. Noturno não deve vir ativado por padrão. Deve ter um switch de ativação no modal de editar jornada.
  Ao vincular operador à máquina o turno noturno deve aparecer somente se ele estiver ativado. Todas as operações com turno noturno devem ficar desativadas caso esteja off. Mesmo desativado ele não deve perder nenhuma informação atrelado ao turno noturno.

\*\* No modal de adcionar oferta de combustivel só deve trazer as categorias de combustiveis nao deve ter um select para mais

\*\* Modal wizard de adcionar oferta de combustivel na obra não está seguindo o padrão ou existe mais de um padrão na aplicação?

\*\* O início real da obra na verdade é a data do primeiro turno realizado.

## Ajustes página da obra no calendário.

[x] quando abre modal de produção ele vai para a tab de produção e depois não volta para a obra.
[x] No modal de produção não precisa dessa descrição idiota "Janela autorizada pela API: 2026-09-24 a 2026-09-25 (America/Sao_Paulo).". Adcionar a documentação para não adcionar descrição inúteis para o usuário.
[x] Para adcionar a produção direto pela página da obra não deve perguntar informações que já são explicitas na obra como por exemplo responsável, data, turno, etc... Para adcionar a produção não precisa de início e fim, ele faz parte do turno, idenpendente da hora que foi adcionado, é só mais uma informação para o apontador anotar e consumir tempo
[] Remover os campos de material e cadastro de material. deixe somente a origem e destino neste card. e por enquanto, deixe somente oculto
[] origem e destino devem ser as frentes ativas de serviço e podem ser usado o mesmo valor nos 2.

-- Se o turno diuno que está iniciado o turno noturno não deve aparecer, principalmente se não tiver habilitado o turno noturno na obra. E se tiver habilitado para iniciar o turno deve ser um botão discreto e combinando com a interface. Se coincidir dos turnos estarem iniciados ao mesmo tempo. ooS 2 PAINEIS NÃO PODEM EM HIPOTESE ALGUMA APARECER AO MESMO TEMPO. Tem que ser um ou outro e o tiítulo de noturno ou diurno deve ser bem explicito, claro e visível para não causar confusão.

-- Quando adcionar produção e não tiver nenhuma frente iniciada aparecer um alerta no formulário indicando isso.

-- O modal de criar unidades para uma obra deve aparecer somente se tiver alguma obra em planejamento ou em andamento. Caso contrário o alert modal nem deve aparecer. A mesma coisa para a alocação na criação da unidade dentro da página da máquina.

-- Na máquina não vai mais existir a propriedade se é alugada ou própria, em todos vai aparecer o campo opcional Valor/hora sugerido
