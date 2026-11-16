# Circuit Orbit

Wallpaper HTML/Canvas para Lively, com laser ciano configurável e trajetos de 45°/90° entre ícones reais. Esta pasta é a versão de desenvolvimento; nenhum tema instalado é alterado.

## Usar

1. Execute `Abrir-previa.cmd`: registra o atalho local `circuit-orbit://collect` no Windows e abre a prévia. Não inicia servidor, monitoramento ou serviço. Requer apenas Windows PowerShell, já incluído no Windows.
2. Nas opções, clique em **Coletar posições dos ícones**. Autorize a abertura do utilitário se o navegador perguntar. Ele consulta os ícones uma única vez, salva as configurações em `settings/desktop-map.json` e encerra. A confirmação aparece abaixo do botão. A tecla **P** mostra/oculta os controles.
3. Se mover, adicionar ou remover ícones, ou alterar os monitores, clique novamente no botão. O mapa salvo continua em uso até uma nova coleta. Não há atualização automática.
4. Quando aprovado, importar esta pasta como tema no Lively. As propriedades de cor, velocidade, brilho, rastro, margem, monitor e o botão de coleta ficam em **Personalizar**. Configurações visuais da prévia são temporárias; o Lively persiste suas próprias configurações.

Depois de mover/copiar o tema, execute `Configurar-utilitario.cmd` na nova pasta para atualizar o destino do botão. `Coletar-icones.cmd` executa a mesma coleta diretamente, se o player bloquear a abertura do atalho. `Remover-atalho-do-utilitario.cmd` remove apenas o registro deste projeto. Nenhuma tarefa agendada ou inicialização automática é criada.

## Monitores e escala

O leitor consulta os retângulos físicos dos monitores e dos desenhos dos ícones, incluindo monitores com coordenadas negativas. As legendas não entram no cálculo do círculo. O raio usa metade da menor dimensão da região do desenho, com margem padrão de 3 px; assim o contorno fica mais próximo do ícone.

Em modo individual/duplicado do Lively, cada instância anima os ícones do monitor correspondente. Em modo estendido, a animação percorre a área virtual inteira. Um monitor sem ícones exibe o fundo. A seleção **Automático** usa tamanho e posição da janela; ambientes com escalas diferentes precisam de validação no Lively. Se necessário, selecione explicitamente o monitor em cada instância ou **Todos — área estendida**. A numeração do tema começa pelo principal e depois segue as coordenadas; pode diferir da numeração do Windows.

Não há números nem círculos previamente desenhados. O contorno aparece somente quando a luz passa: o rastro principal é curto, enquanto um risco fraco permanece por quase toda a rodada. O trecho mais antigo começa a se apagar quando a luz percorre cerca de 80% do caminho, desaparecendo gradualmente na ordem em que foi desenhado. A duração depende do percurso, sem limite de três segundos. Não há pulso de círculo completo. Na prévia, o mapa é redimensionado para a janela; o alinhamento físico deve ser conferido no desktop. O modo de demonstração só existe com `demo` na URL e é identificado como simulação.

## Funcionamento

`tools/DesktopMap.cs` consulta a lista de ícones do Explorer pelas APIs Win32. Aloca um pequeno buffer temporário no processo do Explorer para obter os retângulos, liberando-o ao terminar; não move, clica ou altera os ícones. Não lê nomes, arquivos nem conteúdos pessoais. `Collect-Desktop.ps1` publica o mapa e o resultado da coleta em `settings/` e termina. O tema carrega o mapa ao abrir e, após o clique, verifica o resultado por no máximo 30 segundos; depois para de consultar arquivos.

O botão usa um protocolo local registrado em `HKCU\Software\Classes\circuit-orbit`. O comando é fixo e ignora os argumentos da URL. O registro associa o atalho ao coletor, sem manter processo aberto. O controle nas opções do Lively segue a [documentação oficial de botões](https://github.com/lively-community/lively/wiki/Web-Guide-IV-%3A-Interaction#button); a abertura do protocolo ainda precisa ser conferida no player.

O percurso visita o vizinho mais próximo ainda não visitado; completa a rodada antes de reiniciar. Mudanças no mapa reiniciam o percurso para evitar visitar coordenadas antigas. Em área estendida, os trajetos podem passar por lacunas físicas entre monitores.

## Validação

Execute `node tests/engine.test.cjs` para conferir geometria, vizinho mais próximo, projeção de coordenadas negativas e seleção dos ícones por monitor. `node tests/app.test.cjs` verifica a ausência de círculos prévios/números e a espera limitada pela coleta. Execute `Coletar-icones.cmd` para coletar um mapa real uma única vez.
