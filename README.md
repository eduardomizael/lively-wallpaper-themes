# Circuit Orbit · Impact HUD

Versão `2.1.0-beta.3`, branch `codex/ambiente-energia`. A versão anterior está preservada na branch `codex/impact-hud-v2` e a versão original na tag Git `v1.0.0`.

## Animação

Um primeiro tiro entra pela borda da tela e atinge um ícone. Somente no impacto surgem os arcos, segmentos e marcadores do display. Os anéis giram em sentidos diferentes, o indicador interno carrega e o brilho se concentra antes do disparo seguinte.

O destino é sorteado de uma lista de ícones disponíveis e retirado dela. Todos são visitados uma vez antes de a lista ser preenchida novamente. Na passagem entre rodadas, o próximo destino não pode ser o próprio emissor. O tiro percorre uma reta com aceleração progressiva e termina em um clarão local com partículas curtas. Não há circuito permanente, números sobre os ícones ou displays previamente acesos.

A aceleração dura 80 ms em qualquer distância; depois o tiro segue com velocidade constante, sem frear antes do impacto. Em percursos muito curtos, chega durante a própria rampa. A distância percorrida nos primeiros instantes é igual para destinos próximos ou distantes, até atingir o destino. Alterar a velocidade em voo preserva a posição atual.

A permanência dos displays é uma porcentagem do número de ícones da área escolhida, de 1% a 99%, com padrão de 60%. Com dez ícones e 60%, o primeiro display permanece intacto até o sexto impacto e começa a desaparecer no sétimo. O limite é arredondado para baixo, com mínimo de um ícone: `max(1, floor(total × porcentagem / 100))`. O fade começa no impacto, não durante o voo, e dura 900 ms. Um novo impacto no mesmo ícone reacende seu display.

Com um único ícone, o display recebe o tiro inicial e repete a carga local. Sem ícones no monitor, a névoa e as partículas continuam animando o fundo. Se também estiverem desligadas, o laço de desenho para.

## Ambiente de energia

Três nuvens difusas em ciano e azul se deslocam lentamente ao fundo. Poucas partículas atravessam a tela em profundidades e velocidades diferentes. Cada impacto em um ícone produz uma onda suave que ilumina uma área maior e desaparece em 1,6 segundo. O ambiente usa a cor escolhida nos efeitos e não altera a rampa, a ordem das visitas nem os marcadores.

Os efeitos são independentes: coloque a intensidade ou a quantidade em zero para desligar névoa, partículas ou ondas. Padrões: névoa 45%, 32 partículas e ondas 40%. Não há núcleo central nem filamentos adicionais.

O movimento do mouse perturba o campo: uma nuvem pequena segue com cerca de 85 ms de atraso, deixa um rastro difuso e se dissipa em aproximadamente um segundo após parar. As partículas próximas se afastam levemente e depois retomam o fluxo. O primeiro evento apenas localiza o ponteiro; coordenadas repetidas com o mouse parado não mantêm um halo. Saltos entre monitores não geram uma trilha atravessando a tela.

A névoa usa perfis contínuos com lóbulos suaves e arredondamento estocástico da transparência, além de uma granulação fixa inferior a 1% para reduzir faixas de luminosidade em fundos escuros. A nuvem do mouse possui um perfil próprio, com brilho central menor e distribuição mais larga. Seu tamanho padrão passou de 160 para 260 px; valores personalizados são preservados na atualização.

A entrada usa os [eventos JavaScript normais encaminhados pelo Lively](https://github.com/lively-community/lively/wiki/Web-Guide-IV-%3A-Interaction#mouse--keyboard), em coordenadas locais da janela, sem consultar a posição global do mouse ou iniciar utilitário. Depende da entrada de mouse habilitada no Lively. Mover o cursor sobre os controles da prévia não alimenta o efeito.

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
| Névoa de energia | Intensidade de 0% a 100% |
| Partículas de energia | Quantidade de 0 a 70, em camadas |
| Ondas de impacto | Intensidade de 0% a 100% |
| Névoa do mouse | Habilita ou desliga a reação ao cursor |
| Intensidade do mouse | 0% a 100%, padrão 35% |
| Tamanho da nuvem | 60 a 500 px, padrão 260 px |

As alterações da prévia são temporárias; o Lively persiste suas próprias opções. Para simular sem mapa real, abra `index.html?preview&demo`; a tela informa **DEMONSTRAÇÃO**.

## Instalação no Lively

A v2 deve ficar em uma pasta separada, `Library/wallpapers/circuit-orbit-v2`. A instalação da versão 1 pode ser mantida. Arquivos necessários: `index.html`, `engine.js`, `hud.js`, `atmosphere.js`, `app.js`, `style.css`, `LivelyInfo.json`, `LivelyProperties.json`, `thumbnail.jpg`, `preview.gif`, os comandos de coleta/configuração, `tools/DesktopMap.cs`, `tools/Collect-Desktop.ps1`, `tools/Register-Collector.ps1` e o mapa salvo em `settings/`.

`tools/Install-Theme.ps1 -LibraryPath <biblioteca>` copia somente esses arquivos, confere as cópias, preserva o mapa e os valores das opções existentes e acrescenta os novos controles. Se a v2 estiver ativa, encerra e reabre somente suas instâncias nos mesmos monitores para atualizar também os controles em memória.

O leitor usa retângulos físicos, inclusive coordenadas negativas. O tema projeta cada ícone no monitor escolhido. Em escala mista, a seleção automática precisa de conferência no Lively; existe seleção explícita. A numeração do tema começa pelo principal e pode diferir da numeração do Windows. Uma janela de prévia redimensiona o mapa, portanto não permite confirmar o alinhamento físico com os ícones do desktop.

## Implementação e consumo

- `engine.js`: simulação independente do Canvas, sorteio, aceleração, fases e vida dos displays.
- `hud.js`: desenho dos arcos, carga, feixe e impacto.
- `atmosphere.js`: névoa, partículas ambientais e ondas de impacto.
- `app.js`: propriedades do Lively, projeção dos monitores, coleta manual e agendamento de quadros.
- Fundo base e grade são CSS estático. A névoa reutiliza texturas de nuvem de 512×512, em uma camada que acompanha a densidade da tela até 3840×2160 pixels, atualizada no máximo 20 vezes por segundo. A onda usa uma textura de 256×256 e a granulação uma de 64×64. Não há reconstrução de gradientes de tela inteira em cada quadro. A resolução maior pode elevar o custo da camada; não foi medido um ganho de desempenho nesta revisão.
- Não há histórico crescente de trilhas: somente os displays recentes, partículas curtas e um tiro ativo são mantidos.
- O limite de FPS não altera a velocidade da simulação. Há no máximo 70 partículas ambientais e seis ondas simultâneas; as ondas expiram. Um monitor sem ícones e sem ambiente ativo não mantém um laço de desenho.
- O cursor reutiliza a textura da névoa e mantém no máximo dezesseis amostras do rastro. A reação acorda uma cena parada e deixa de redesenhar quando se dissipa, caso não haja outros efeitos ativos.

Essas alterações reduzem trabalho desnecessário identificado na v1. O ganho real de CPU/GPU ainda precisa ser medido. `ANALISE_DE_DESEMPENHO.md` é o relatório histórico da v1, não uma medição desta versão.

## Verificar

A miniatura estática `thumbnail.jpg` e a prévia animada `preview.gif` são usadas pela biblioteca do Lively. A animação de seis segundos usa o motor e a geometria reais do HUD, com posições e ícones genéricos. É apenas uma prévia de catálogo e não altera o fundo do tema.

Para regenerar: execute `node tools/Build-Thumbnail.cjs`, depois `python tools/Render-Thumbnail.py` e converta os frames de `outputs/thumbnail/` para GIF com FFmpeg. As ferramentas de geração não são copiadas para a instalação.

```
node tests/engine.test.cjs
node tests/app.test.cjs
node tests/atmosphere.test.cjs
```

Os testes cobrem impacto antes de acender o HUD, carga, aceleração, destinos sem autorrepetição, desvanecimento, limites de objetos, monitores vazios/únicos, coordenadas negativas, limites de FPS e coleta pontual. A validação no navegador e os limites da validação física estão em `VALIDACAO.md`.
