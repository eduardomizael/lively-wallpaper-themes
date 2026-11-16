# Consumo do Circuit Orbit — 16/11/2026

## Alteração aplicada

Velocidade máxima ampliada de 500 para 800 na prévia, na biblioteca do Lively e nas propriedades salvas. A velocidade selecionada permanece em 160.

## Ambiente identificado antes da interrupção

- Windows, Lively 2.5.6.0, player WebView2.
- Tema ativo no monitor 3440×1440, configurado em 165 Hz; a frequência real da animação não foi medida.
- Segundo monitor 1920×1080 em 60 Hz.
- 12 processadores lógicos e cerca de 31,1 GiB de memória física.
- Adaptadores AMD Radeon Graphics e NVIDIA GeForce RTX 3070. A tela ultrawide foi reportada no adaptador NVIDIA.
- Mapa salvo com 90 ícones, todos no monitor principal; tamanho 100%, velocidade 160, brilho 70, rastro 180 e grade habilitada.

## Leitura real pontual

Antes da desconexão da tela principal, os contadores WMI retornaram:

| Processo | CPU, em equivalentes de um processador lógico | Memória residente privada |
| --- | ---: | ---: |
| Player do Lively | 0% | 16,2 MiB |
| Processo GPU do WebView2 | 68% | 43,9 MiB |
| Renderer do WebView2 | 17% | 98,4 MiB |

A soma desses três processos corresponde aproximadamente a **7,1% da capacidade total de CPU** da máquina com 12 processadores lógicos e **158,5 MiB de memória residente privada**. Esses números não incluem os demais subprocessos, a interface do Lively, memória compartilhada nem VRAM. O contador do motor 3D associado ao processo GPU estava em **15%**; isso não representa uma soma de todos os motores ou de todos os programas da GPU.

São leituras pontuais, não médias de um ensaio controlado. Elas mostram atividade relevante, principalmente no processo GPU do navegador, mas não sustentam uma média de consumo, conclusão sobre vazamento de memória ou comparação entre velocidades.

## Interrupção da medição

O registro do Lively informou a desconexão de DISPLAY1, de 3440×1440, e o encerramento do player. Ficou disponível a tela de 1920×1080. Por isso, a comparação planejada entre 160 e 800 não foi concluída; os números acima não devem ser apresentados como uma medição na velocidade 800.

## Custo observado no código

1. **Redesenho do fundo e da grade em todos os quadros.** O Canvas é apagado e recebe um novo gradiente de tela inteira a cada quadro. Na tela de 3440×1440 são 4.953.600 pixels, além de 2.160 chamadas para desenhar os pontos da grade por quadro. Se fossem renderizados 165 quadros por segundo, isso corresponderia a cerca de 817 milhões de pixels de preenchimento e 356 mil chamadas da grade por segundo. Essa é uma projeção pela frequência do monitor, não uma taxa observada.
2. **Brilho aplicado por segmento.** O rastro luminoso faz várias chamadas `stroke()` com `shadowBlur`. Isso é um candidato a custo de rasterização; não foi isolado em perfil de GPU.
3. **A trilha inteira é percorrida novamente a cada quadro.** Os pontos são examinados, agrupados por transparência e redesenhados. O agrupamento limita a aproximadamente 16 chamadas de desenho do resíduo, mas não elimina a passagem por todos os pontos. O custo cresce até preencher quase uma rodada e depois a geometria antiga é removida.
4. **Sem limite próprio de FPS.** A animação usa `requestAnimationFrame`, sem controle de 30/60 FPS no tema. A frequência efetiva depende do player e das políticas do Lively/navegador.
5. **Monitores sem ícones também redesenham o fundo continuamente.** Nesses monitores o conteúdo é estático, mas o laço de animação continua ativo.

O coletor de ícones não entra no consumo contínuo: ele só é iniciado por solicitação, salva o mapa e termina. Não há consulta de rede nem monitoramento automático de ícones durante a animação.

## Influência da velocidade

Para o mapa salvo, a estimativa geométrica da primeira rodada é de aproximadamente 29.922 pixels: 16.399 nos contornos e 13.522 nos deslocamentos. A duração ideal seria cerca de 187 segundos em 160 ou 37 segundos em 800, sem considerar perdas de tempo nas transições ou restrições de quadros.

Aumentar a velocidade em cinco vezes não significa multiplicar o consumo por cinco. O fundo continua sendo desenhado por quadro, independentemente da velocidade. A amostragem dos arcos aumenta o trabalho por quadro em velocidades altas, enquanto a densidade dos pontos das retas muda conforme velocidade e FPS. O impacto líquido precisa da comparação real.

## Otimizações indicadas, ainda não implementadas

1. Renderizar fundo e grade uma vez por alteração de tamanho/cor, em uma camada estática.
2. Adicionar limite de 30/60 FPS, mantendo a velocidade da luz baseada no tempo.
3. Agrupar o brilho do rastro em menos chamadas de desenho.
4. Evitar a animação contínua nas telas sem ícones.
5. Simplificar pontos antigos da trilha e reduzir alocações temporárias, caso um perfil confirme custo relevante nessa etapa.

Não há números de ganho medidos para essas propostas. A primeira combinação a avaliar é camada estática e limite de FPS; o custo visual e o desempenho precisam ser comparados no player.

## Repetir a medição

`tools/Measure-Performance.ps1` identifica a instância ativa, mede CPU e memória privada dos seus subprocessos e o motor 3D associado ao processo GPU. Usa temporariamente as velocidades 160 e 800 e restaura a velocidade anterior em `finally`. O resultado é salvo em `outputs/performance-lively.json` somente quando os ensaios terminam.

Os comandos de propriedades seguem a [documentação oficial do Lively](https://github.com/lively-community/lively/wiki/Command-Line-Controls#customize-wallpaper). O utilitário de medição pertence apenas à pasta de desenvolvimento e não é copiado para a biblioteca do tema.
