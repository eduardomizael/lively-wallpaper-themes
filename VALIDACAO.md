# Validação — Impact HUD 2.2.0-beta.1

## Testes locais

`node tests/engine.test.cjs`, `node tests/app.test.cjs` e `node tests/atmosphere.test.cjs` passaram.

- HUD inexistente antes do primeiro impacto e ativado somente na chegada.
- Tiro em linha reta, com rampa fixa de 80 ms seguida de velocidade constante. Na velocidade 160, percursos de 300 e 2.400 px avançam os mesmos 76,8 px nos primeiros 100 ms.
- Chegada testada em distâncias de 0 a 10.000 px e velocidades de 40 a 800, incluindo impactos antes do final da rampa e continuidade da posição na transição.
- Destinos retirados de uma lista de disponíveis; três rodadas consecutivas de dez ícones verificadas sem repetição interna ou autorrepetição na passagem entre rodadas.
- Carga completa antes do disparo, sem salto de posição ao alterar a velocidade durante o voo.
- Permanência percentual de 1% a 99%, com testes dos extremos. Para dez ícones e 60%, o primeiro display permanece intacto até o sexto impacto e começa o fade no sétimo, sem antecipar durante o voo.
- Simulação prolongada com quantidade limitada de displays e partículas.
- Casos sem ícones e com apenas um ícone.
- Projeção com monitor em coordenadas negativas.
- Agendamento de 30/60 FPS sob uma fonte simulada de 165 Hz, mantendo o tempo de movimento.
- Monitor vazio continua exibindo o ambiente quando habilitado; sem ambiente ativo, para de redesenhar. Não há consulta periódica ao mapa.
- Cache de cinco texturas mantido após mil desenhos da névoa, padrão de granulação reutilizado, quantidade configurável de partículas, limite de seis ondas e descarte após 1,6 segundo.
- Coleta manual com espera limitada e encerramento da espera em sucesso ou cancelamento.

## Navegador e equipamento

Prévia HTML da v2 conferida no Chrome com quinze posições simuladas e, depois, com o mapa real salvo de noventa ícones em dois monitores. Controles de tamanho, carga e 30 FPS exercitados. Não houve erros/avisos no console observado. Captura em `outputs/previa-impact-hud-v2.png` registra o mapa real; os próprios ícones do Windows não aparecem na janela de prévia.

Arquivos de execução copiados para `Library/wallpapers/circuit-orbit-v2` e conferidos. O mapa salvo foi reutilizado, sem nova coleta automática. O protocolo `circuit-orbit-v2://collect` foi registrado para essa pasta. A versão 1 e seu protocolo foram preservados. Nenhum serviço foi iniciado. O servidor temporário usado na conferência foi encerrado.

Abertura do protocolo pelo player, alinhamento físico sobre os ícones, escalas diferentes entre monitores e consumo real desta versão dependem de validação no Lively. O coletor Win32 e seu funcionamento pontual foram testados na v1; a v2 reutiliza o coletor e registra um protocolo separado.

O relatório `ANALISE_DE_DESEMPENHO.md` refere-se à v1. Não há comparação quantitativa de consumo entre versões.

## Miniatura do catálogo

`thumbnail.jpg` (640×360) e `preview.gif` (640×360, 120 quadros a 20 FPS, seis segundos, loop contínuo) gerados com os comandos do motor/HUD e do ambiente, com ícones genéricos. A miniatura desta versão inclui névoa, partículas e ondas. Um pequeno dissolve suaviza a volta do loop. Os campos `Thumbnail` e `Preview` seguem a configuração dos outros temas locais.

## Conferência do novo ambiente

Prévia no Chrome com o mapa real de 90 ícones: névoa e onda de impacto visíveis, com controles separados para os três efeitos. Controles desligados e restaurados aos padrões; sem erros/avisos no console observado. O custo real de CPU/GPU da nova camada ainda não foi medido.

A instalação conferiu os quinze arquivos de execução, preservou as opções existentes e recarregou uma instância ativa da v2 no Lively. O mapa salvo foi preservado e os novos controles foram acrescentados ao arquivo de propriedades. A miniatura de seis segundos foi regenerada e todos os seus 120 quadros foram decodificados para conferir integridade. O servidor temporário de prévia foi encerrado.

## Névoa do mouse

- Testes para atraso de acompanhamento, dissipação mesmo com eventos repetidos de coordenadas estacionárias, despertar de uma cena parada e retorno ao repouso.
- Rastro limitado a dezesseis amostras; saltos grandes e coordenadas fora da janela não deixam uma conexão entre monitores. Redimensionar a janela limpa a reação anterior.
- Controles de habilitação, intensidade e tamanho, incluindo desligamento sem capturar movimentos e limite de tamanho.
- Movimento do cursor exercitado na prévia do Chrome; nuvem observada, opção desligada e ligada novamente, sem erros/avisos no console. Captura: `outputs/previa-nevoa-mouse.png`.
- A miniatura usa uma trajetória de cursor sintética, sem capturar movimentos pessoais. O comportamento físico em telas com escalas diferentes ainda depende de conferência no desktop. Não foi feita medição de consumo específica desta reação.

## Suavização da névoa

- Nuvens procedurais de 512×512 com queda contínua, transparência com arredondamento estocástico e granulação fixa de até 2/255 de opacidade para reduzir faixas de luminosidade.
- Camada de névoa ampliada para acompanhar a densidade da tela, com teto de 3840×2160. Na prévia, o bitmap de 3440×1271 coincidiu com o tamanho visível, eliminando a ampliação da antiga camada de 960×540 nesse caso.
- Perfil próprio do mouse testado com pico central menor e maior distribuição lateral da luminosidade. Novo tamanho padrão: 260 px; limite máximo: 500 px.
- Prévia visual inspecionada, inclusive movimentação do cursor; sem erros/avisos observados no console. Captura: `outputs/previa-nevoa-suave.png`.
- Os testes confirmam cache das texturas e do padrão de granulação. O custo de GPU da resolução maior não foi medido e a aparência final depende também da tela.


## Fumaça fluida do mouse — 2.2.0-beta.1

Substitui o brilho 2D descrito nas revisões anteriores por uma simulação WebGL2 inspirada no tema local Fluids. Shaders adaptados com licença MIT e crédito preservados. A alternativa 2D permanece para equipamentos incompatíveis.

Os quatro testes (engine, app, atmosphere e mouse-fluid) passaram. O teste do fluido verifica fila limitada, descarte de recursos no redimensionamento, desligamento, repouso após 2,4 segundos e ausência segura de WebGL2; usa um contexto simulado e não comprova compilação dos shaders.

Na prévia do Chrome, o Canvas informou renderer fluid; movimento do mouse produziu redemoinhos e filamentos visíveis. Não houve erros ou avisos no console observado. Captura: outputs/previa-mouse-fluido.png. O mapa de noventa ícones foi reutilizado. Não foi feita nova medição de CPU/GPU nem validação física do ponteiro em escalas diferentes entre monitores.

A miniatura do catálogo representa ambiente e HUD, sem cursor sintético: o gerador offline não executa o fluido WebGL.

Instalação desta revisão: dezessete arquivos de execução copiados e hashes conferidos. Nenhuma instância da v2 estava ativa; o tema Fluids que estava selecionado foi mantido. Para visualizar a revisão instalada, selecione Circuit Orbit no catálogo do Lively.
