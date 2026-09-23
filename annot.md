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

## Relatórios de obra

- RDO (PREENCHIDO AUTOMATICAMENTE AO INICIAR E FECHAR TURNO)
- Relatório de frequência (preenchido automaticamente ao iniciar e fechar turno).

## Para iniciar um turno

-- Checklist dos funcionários (com biometria)
-- assinatura DDS
-- Checkslist das máquinas (todas marcadas, exceto em manutênção)

# OBS

1.  QUANDO UM OPERADOR DE UMA MÁQUINA SAIR NO MEIO EXPEDIENTE COMO SERÁ A SUBSTITUIÇÃO DE OPERADOR? TEM QUE SER DA MESMA FUNÇÃO OU PODE ADCIONAR UM PROFISSIONAL DE OUTRA FUNÇÃO COMO TEMPORÁRIO?

2.  Na hora de alocar uma máquina à obra não trazer operadores que já estão ocupados na mesma obra e melhorar a visualização mascarada do horímetro ou Km

3.
