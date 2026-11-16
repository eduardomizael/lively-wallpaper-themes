# Validação — 16/11/2026

- Leitura Win32 real: 90 ícones, monitor principal 3440×1440 e secundário 1920×1080; todos os ícones estavam no principal.
- A versão inicial com leitor contínuo foi substituída: agora o coletor executa uma vez e encerra, salvando o mapa em `settings/`. Não há serviço ou atualização automática.
- Testes Node aprovados: vizinho ainda não visitado, caminhos com segmentos horizontais/verticais/45°, pontos inicial/final e projeção por monitor com coordenadas negativas.
- Prévia no Chrome por servidor HTTP restrito a 127.0.0.1: animação renderizada, mapa real carregado e sem erros/avisos no console observado.
- Seleção principal/automático: 90 ícones. Secundário: 0 ícones e fundo. Área estendida: 90 ícones.
- O modo de conferência, os números, os círculos persistentes e os pulsos foram removidos. `outputs/previa-mapeamento.png` é uma captura histórica da versão anterior; não representa a versão atual.
- A ferramenta de navegador bloqueou navegação ao protocolo `file:`. A leitura por arquivo local deve ser conferida ao abrir `Abrir-previa.cmd` ou no Lively; a prévia HTTP foi validada.

Ainda não validado: instalação/recarregamento no Lively, abertura do protocolo local pelo botão no player, alinhamento visual diretamente sobre os ícones do desktop, escalas diferentes entre monitores e layout de monitor com coordenadas negativas em equipamento real. A geometria de coordenadas negativas foi coberta nos testes locais. Mudanças de ícones só passam a valer depois de uma nova coleta manual.

Nenhum tema foi copiado para a biblioteca do Lively e o wallpaper instalado não foi alterado. O leitor antigo foi encerrado. O protocolo local foi registrado para o utilitário desta pasta.

## Conferência da versão atual

- Coleta única executada com sucesso: mapa salvo com 90 ícones; processo encerrado.
- Atalho `circuit-orbit://collect` exercitado via Windows: atualizou o mapa salvo.
- Após a coleta, o mapa permaneceu inalterado; nenhum coletor/serviço do projeto ficou ativo.
- `tests/app.test.cjs` aprovado: nenhum círculo prévio ou número, configuração antiga de debug ignorada, espera do resultado interrompida no sucesso e no limite de 30 segundos.
- Prévia visual atual conferida no Chrome sem erros/avisos observados. Captura: `outputs/previa-atual.png`.
- O servidor HTTP usado somente para a conferência visual foi encerrado. A versão entregue usa arquivos locais e o utilitário pontual.

## Ajuste do contorno e da trilha

- Raio de exemplo para o mapa real (região de 76×52 px): reduzido de aproximadamente 60 para 29 px na escala 1:1. Nova opção de margem padrão: 3 px.
- A trilha fraca permanece por distância equivalente a quase uma rodada; começa a apagar a parte mais antiga perto dos 80% do percurso, sem apagar todo o desenho ao mudar de ícone.
- Testes aprovados para raio, estimativa do percurso, opacidade no início/meio/fim do desvanecimento e manutenção do começo de um caminho longo após mais de três segundos.
- Prévia no Chrome conferida com mapa real: o caminho acumulado permanece visível, sem números ou contornos prévios. Captura: `outputs/previa-trilha-persistente.png`.
- Arquivos de execução e propriedades salvas do monitor 1 atualizados na biblioteca do Lively; demais preferências preservadas. Recarregamento do tema no player não foi verificado.
