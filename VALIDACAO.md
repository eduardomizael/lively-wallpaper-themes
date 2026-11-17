# Validação — Circuit Orbit 2.5.0-beta.2

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

## Marcador núcleo de névoa — 2.3.0-beta.1

- Cinco testes passaram: engine, app, atmosphere, mouse-fluid e nucleus. O novo teste verifica texturas deformadas, centro com pelo menos 92% de transparência, ausência antes do impacto, ausência de arcos no estilo névoa, preservação do HUD original e descarte visual após o fade.
- Chrome: novo controle seleciona os dois estilos; o HUD foi observado novamente após a troca e a névoa restaurada. Os ícones atingidos permaneceram na cena. Sem erros ou avisos no console observado. Captura em `outputs/previa-nucleo-nevoa.png`.
- O atlas procedural compartilhado contém 24 quadros de 192×192 (~3,4 MiB de pixels RGBA antes das cópias do navegador). Usa até quatro imagens por estação e não mantém histórico por ícone.
- A nova miniatura usa o mesmo atlas e renderizador dos marcadores. Não há simulação de refração do desktop: o efeito de calor é visual, por pulsação, deformação e pluma ascendente.
- A medição de CPU/GPU e a conferência de legibilidade sobre os ícones físicos no desktop ainda não foram realizadas nesta revisão.
- Instalação: dezoito arquivos conferidos por hash e uma instância ativa da v2 recarregada no mesmo monitor. O mapa e as preferências existentes foram preservados; o seletor de marcador foi acrescentado. O GIF regenerado foi decodificado integralmente sem erro.

## Orb com núcleo emissor — 2.3.0-beta.2

Reformulação a partir das imagens de Ori fornecidas pelo usuário: núcleo central preenchido e translúcido, cor clareando para branco no centro, filamentos radiais irregulares e propagação para fora. O centro vazado e a pluma única da beta.1 foram removidos. A coroa contrai na carga e expande no impacto/disparo. Não usa imagens ou recursos do jogo.

Os testes nucleus e app passaram após a alteração. O teste do atlas verifica a presença do núcleo em todos os quadros e transparência nas extremidades, além da deformação, ativação por impacto, alternância e fade. A grade de ruído é calculada uma vez e reutilizada na geração do atlas. O desenho usa duas imagens por estação, sem histórico crescente. Os testes anteriores de engine, atmosphere e mouse-fluid não foram repetidos: esses módulos não mudaram.

A prévia do Chrome foi inspecionada com o mapa real salvo e não apresentou erros ou avisos no console observado. Miniatura regenerada com o mesmo renderizador. A legibilidade sobre os ícones físicos e o consumo desta revisão ainda dependem de avaliação no desktop.

Captura desta revisão: `outputs/previa-orb-energia.png`. GIF decodificado integralmente sem erros. Instalação conferiu os dezoito arquivos por hash e recarregou uma instância ativa da v2, preservando mapa e preferências.

## Tiro de energia fluida — 2.4.0-beta.1

Novo seletor independente do marcador: Laser / Energia fluida. O tiro alternativo usa uma instância própria do simulador já usado pelo mouse; funciona com a névoa do cursor desligada. A explosão injeta um núcleo e oito impulsos radiais. Rastro influencia a largura e a duração residual. Trocar para Laser, mudar o mapa ou redimensionar limpa o efeito anterior.

Testes app, mouse-fluid e shot-fluid passaram. Cobrem interpolação do trajeto na velocidade 800, explosão no impacto, ausência de contexto extra no estilo Laser, independência dos controles do mouse, fila de no máximo 48 entradas, repouso após a duração configurada e alternativa 2D de no máximo 96 amostras expirantes. Testes com contexto simulado não validam shaders.

Chrome executou a camada com renderer fluid. Rastro e turbulência do impacto foram observados com o mapa salvo, sem erros/avisos no console. Controles de estilo e velocidade exercitados, incluindo 800; efeito do mouse desligado durante parte da conferência. Não foi feita medição de CPU/GPU desta camada adicional. A miniatura existente representa a opção Laser e o orb, pois o gerador offline não executa WebGL.

Instalação conferiu dezenove arquivos por hash, preservou mapa/opções e recarregou uma instância no monitor 3440×1440. O Lively registrou abertura bem-sucedida. Captura da prévia: `outputs/previa-tiro-fluido.png`.

## Explosão ao clicar — 2.4.0-beta.2

Testes app e shot-fluid passaram. Cobrem clique esquerdo, controle de desligamento, exclusão dos controles da prévia e do botão direito, coordenadas inválidas sem alocação, explosão sem ícones/névoa do mouse/tiro fluido e retorno ao repouso após a duração configurada.

Na prévia do Chrome, cliques produziram nuvens de energia nas coordenadas escolhidas com Laser selecionado e névoa do mouse desligada; renderer fluid, sem erros ou avisos observados. Captura: `outputs/previa-explosao-clique.png`. A resposta a cliques encaminhados pelo desktop do Windows não foi conferida fisicamente nesta revisão. Nenhuma simulação adicional foi criada: o efeito reutiliza a camada dos tiros. O custo real de CPU/GPU não foi medido.

## Cinco orbes dos estudos v7 — 2.5.0-beta.1

Integração dos cinco arquétipos presentes no estudo local `ori-energy-spheres`: Vórtice Solar, Combustão Radial, Pulso de Éter, Tempestade de Plasma e Estrela Solar. O shader de composição estava identificado como v7, embora painel e README do estudo ainda descrevessem versões anteriores. A pasta de estudo não foi alterada.

São reutilizados os shaders, as paletas HDR e os oito emissores de cada arquétipo. As adaptações removem o fundo opaco, suavizam a borda da imagem e limitam a simulação a uma textura compartilhada de 256×256/grade física 128×128. O conteúdo interno é compartilhado entre todos os marcadores do estilo selecionado; cada cópia tem orientação, carga, pulso e opacidade próprios. Não há uma simulação por ícone.

Sete testes passaram: engine, app, atmosphere, mouse-fluid, shot-fluid, nucleus e ori-orbs. O teste novo cobre os cinco tipos, alocação somente após impacto, um único contexto para os cinco, limite de atualização, cópia em noventa marcadores sem novos passes de simulação, troca de paleta, liberação dos oito buffers e alternativa para WebGL indisponível. Os testes com contexto simulado não comprovam compilação dos shaders.

Na prévia do Chrome com noventa posições salvas, o renderizador informou v7; os shaders executaram sem erros observados. O fundo permaneceu visível através da camada e os estilos selecionados atualizaram as estações existentes. Os tempos de submissão JavaScript observados ficaram aproximadamente em 0,13–0,28 ms por atualização da textura, nessa prévia. Isso não mede tempo de GPU, CPU total do processo, FPS sustentado ou consumo no Lively; não constitui comparação quantitativa entre versões. O custo de simulação é fixo por tipo ativo, enquanto o custo de desenhar as cópias cresce com a quantidade de marcadores visíveis.

Os cinco tipos foram inspecionados visualmente, assim como a cor personalizada e o retorno ao HUD original. Capturas: `outputs/orbe-v7-vortice.png`, `orbe-v7-combustao.png`, `orbe-v7-eter.png`, `orbe-v7-plasma.png` e `orbe-v7-estrela.png`. A prévia não desenha os ícones reais do Windows e não comprova a legibilidade sobre cada ícone físico. O servidor temporário da conferência foi encerrado.

Instalação: vinte e um arquivos conferidos por hash e uma instância ativa recarregada no monitor 3440×1440. Mapa e preferências preservados; as cinco opções e a escolha de paleta foram acrescentadas ao esquema de propriedades.

## Todos os marcadores aleatórios — 2.5.0-beta.2

Novo item 7 do seletor mistura os sete estilos, com escolha estável baseada na amostra aleatória de orientação que já existe em cada estação. Não modifica o sorteio dos destinos. Os tipos v7 agora mantêm campos separados, compartilhando contexto WebGL e programas dos shaders. Limite: cinco campos, independente do número de ícones; campos sem estações são liberados.

Testes engine, ori-orbs, app e nucleus passaram. A extensão do teste ori-orbs verifica os sete resultados de seleção, cinco imagens diferentes simultâneas, apenas um contexto adicional e retorno a um único campo ao selecionar um estilo fixo. Não há nova medição quantitativa de CPU/GPU para o modo misto.

Prévia do Chrome inspecionada com estilos distintos simultâneos (HUD, Vórtice e Combustão), sem erros ou avisos no console observado. Captura: `outputs/previa-marcadores-aleatorios.png`. Os cinco campos simultâneos foram verificados pelo teste com contexto simulado; não houve medição de consumo no desktop para essa combinação.
