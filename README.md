# Circuit Orbit · Impact HUD

Versão `2.0.0-beta.3`, branch `codex/impact-hud-v2`. A versão original está preservada na tag Git `v1.0.0`.

## Animação

Um primeiro tiro entra pela borda da tela e atinge um ícone. Somente no impacto surgem os arcos, segmentos e marcadores do display. Os anéis giram em sentidos diferentes, o indicador interno carrega e o brilho se concentra antes do disparo seguinte.

O destino é sorteado de uma lista de ícones disponíveis e retirado dela. Todos são visitados uma vez antes de a lista ser preenchida novamente. Na passagem entre rodadas, o próximo destino não pode ser o próprio emissor. O tiro percorre uma reta com aceleração progressiva e termina em um clarão local com partículas curtas. Não há circuito permanente, números sobre os ícones ou displays previamente acesos.

A aceleração dura 80 ms em qualquer distância; depois o tiro segue com velocidade constante, sem frear antes do impacto. Em percursos muito curtos, chega durante a própria rampa. A distância percorrida nos primeiros instantes é igual para destinos próximos ou distantes, até atingir o destino. Alterar a velocidade em voo preserva a posição atual.

A permanência dos displays é uma porcentagem do número de ícones da área escolhida, de 1% a 99%, com padrão de 60%. Com dez ícones e 60%, o primeiro display permanece intacto até o sexto impacto e começa a desaparecer no sétimo. O limite é arredondado para baixo, com mínimo de um ícone: `max(1, floor(total × porcentagem / 100))`. O fade começa no impacto, não durante o voo, e dura 900 ms. Um novo impacto no mesmo ícone reacende seu display.

Com um único ícone, o display recebe o tiro inicial e repete a carga local. Sem ícones no monitor, o fundo fica estático e a animação para.

## Configurar e abrir

1. Execute `Abrir-previa.cmd` para registrar o coletor local da v2 e abrir a prévia. A tecla **P** abre ou fecha as opções.
2. Clique em **Coletar posições dos ícones**. O Windows pode pedir autorização para abrir o utilitário. Ele executa uma vez, salva o mapa em `settings/` e encerra.
3. Se mover os ícones ou mudar os monitores, colete novamente. O mapa não muda automaticamente.

`Coletar-icones.cmd` executa a mesma coleta diretamente. Ao mover a pasta, execute `Configurar-utilitario.cmd` para atualizar o destino do botão. Não há servidor permanente, serviço, tarefa agendada, consulta de rede ou inicialização automática.

O atalho da v2 é `circuit-orbit-v2://collect`, registrado somente no usuário atual. Ele não interfere no atalho `circuit-orbit://collect` da versão 1. O comando de coleta é fixo e ignora argumentos da URL. `Remover-atalho-do-utilitario.cmd` remove apenas a associação desta versão.

## Opções

| Controle | Função |
| --- | --- |
| Cor dos efeitos | Cor dos tiros e displays |
| Velocidade do tiro | 40 a 800; atua no deslocamento acelerado |
| Brilho | Intensidade dos efeitos |
| Rastro do tiro | Comprimento do feixe atrás do projétil |
| Tamanho do display | 40% a 200%, relativo ao tamanho do ícone |
| Tempo de carga | 300 a 2400 ms antes do próximo disparo |
| Permanência | 1% a 99% do total de ícones; define quando os marcadores antigos começam o fade |
| Quadros por segundo | Limite de 30 ou 60 FPS; movimento baseado no tempo |
| Área | Automático, área estendida ou monitor explícito |

As alterações da prévia são temporárias; o Lively persiste suas próprias opções. Para simular sem mapa real, abra `index.html?preview&demo`; a tela informa **DEMONSTRAÇÃO**.

## Instalação no Lively

A v2 deve ficar em uma pasta separada, `Library/wallpapers/circuit-orbit-v2`. A instalação da versão 1 pode ser mantida. Arquivos necessários: `index.html`, `engine.js`, `hud.js`, `app.js`, `style.css`, `LivelyInfo.json`, `LivelyProperties.json`, os comandos de coleta/configuração, `tools/DesktopMap.cs`, `tools/Collect-Desktop.ps1`, `tools/Register-Collector.ps1` e o mapa salvo em `settings/`.

O leitor usa retângulos físicos, inclusive coordenadas negativas. O tema projeta cada ícone no monitor escolhido. Em escala mista, a seleção automática precisa de conferência no Lively; existe seleção explícita. A numeração do tema começa pelo principal e pode diferir da numeração do Windows. Uma janela de prévia redimensiona o mapa, portanto não permite confirmar o alinhamento físico com os ícones do desktop.

## Implementação e consumo

- `engine.js`: simulação independente do Canvas, sorteio, aceleração, fases e vida dos displays.
- `hud.js`: desenho dos arcos, carga, feixe e impacto.
- `app.js`: propriedades do Lively, projeção dos monitores, coleta manual e agendamento de quadros.
- Fundo e grade são CSS estático. Não há reconstrução da grade ou gradiente de tela inteira em cada quadro do Canvas.
- Não há histórico crescente de trilhas: somente os displays recentes, partículas curtas e um tiro ativo são mantidos.
- O limite de FPS não altera a velocidade da simulação. Monitores sem ícones não mantêm um laço de desenho.

Essas alterações reduzem trabalho desnecessário identificado na v1. O ganho real de CPU/GPU ainda precisa ser medido. `ANALISE_DE_DESEMPENHO.md` é o relatório histórico da v1, não uma medição desta versão.

## Verificar

A miniatura estática `thumbnail.jpg` e a prévia animada `preview.gif` são usadas pela biblioteca do Lively. A animação de seis segundos usa o motor e a geometria reais do HUD, com posições e ícones genéricos. É apenas uma prévia de catálogo e não altera o fundo do tema.

Para regenerar: execute `node tools/Build-Thumbnail.cjs`, depois `python tools/Render-Thumbnail.py` e converta os frames de `outputs/thumbnail/` para GIF com FFmpeg. As ferramentas de geração não são copiadas para a instalação.

```
node tests/engine.test.cjs
node tests/app.test.cjs
```

Os testes cobrem impacto antes de acender o HUD, carga, aceleração, destinos sem autorrepetição, desvanecimento, limites de objetos, monitores vazios/únicos, coordenadas negativas, limites de FPS e coleta pontual. A validação no navegador e os limites da validação física estão em `VALIDACAO.md`.
