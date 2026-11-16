# Validação — Impact HUD 2.0.0-beta.3

## Testes locais

`node tests/engine.test.cjs` e `node tests/app.test.cjs` passaram.

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
- Monitor vazio sem redesenho contínuo e sem consulta periódica ao mapa.
- Coleta manual com espera limitada e encerramento da espera em sucesso ou cancelamento.

## Navegador e equipamento

Prévia HTML da v2 conferida no Chrome com quinze posições simuladas e, depois, com o mapa real salvo de noventa ícones em dois monitores. Controles de tamanho, carga e 30 FPS exercitados. Não houve erros/avisos no console observado. Captura em `outputs/previa-impact-hud-v2.png` registra o mapa real; os próprios ícones do Windows não aparecem na janela de prévia.

Arquivos de execução copiados para `Library/wallpapers/circuit-orbit-v2` e conferidos. O mapa salvo foi reutilizado, sem nova coleta automática. O protocolo `circuit-orbit-v2://collect` foi registrado para essa pasta. A versão 1 e seu protocolo foram preservados. Nenhum serviço foi iniciado. O servidor temporário usado na conferência foi encerrado.

Abertura do protocolo pelo player, alinhamento físico sobre os ícones, escalas diferentes entre monitores e consumo real desta versão dependem de validação no Lively. O coletor Win32 e seu funcionamento pontual foram testados na v1; a v2 reutiliza o coletor e registra um protocolo separado.

O relatório `ANALISE_DE_DESEMPENHO.md` refere-se à v1. Não há comparação quantitativa de consumo entre versões.

## Miniatura do catálogo

`thumbnail.jpg` (640×360) e `preview.gif` (640×360, 120 quadros a 20 FPS, seis segundos, loop contínuo) gerados com os comandos do motor/HUD reais e ícones genéricos. Quadros inspecionados visualmente e todos os quadros do GIF decodificados para conferir integridade. Um pequeno dissolve suaviza a volta do loop. Os campos `Thumbnail` e `Preview` seguem a configuração dos outros temas locais. Não houve mudança no fundo ou na animação de execução do wallpaper.
