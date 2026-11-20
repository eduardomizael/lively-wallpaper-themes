# Tucunaré Azul · Visão Isométrica 3D

Um papel de parede interativo 3D para **Lively Wallpaper** baseado na arquitetura do `koi-pond`, mas com câmera **lateral-isométrica** e um **tucunaré azul (*Cichla piquiti*)** modelado proceduralmente em Three.js + GLSL.

## Destaques

- **Visão lateral-isométrica:** perspectiva teleobjetiva inclinada (~19°), revelando o perfil completo do tucunaré, profundidade da coluna d'água, fundo arenoso com cáusticas Voronoi, algas subaquáticas opcionais (*Vallisneria*) e raios de luz solar.
- **Anatomia e coloração de Tucunaré Azul:** corpo comprimido lateralmente, mandíbula inferior prognata com abertura articulada ao comer, íris vermelho-âmbar, cinco barras verticais escuras, escamas imbricadas com relevo e iridescência azul-turquesa, dorsal em duas partes (espinhosa escura retrátil + mole azul pintada), cauda arredondada com ocelo preto de anel dourado e lobo inferior alaranjado.
- **Comportamento de predador de emboscada:**
  - **Espairar (Hover):** para quase imóvel na coluna d'água, equilibrando-se com remadas alternadas das nadadeiras peitorais e leve flutuação na cauda.
  - **Patrulha 3D (*kick-and-glide*):** alterna batidas de cauda e deslizes suaves mudando de profundidade (`Y`) com inclinação natural de nariz (*pitch*) e leve rolagem nas curvas (*bank*).
  - **Espreita e Bote (Stalk → Strike):** ao clicar na água para soltar uma isca (ou ao pressionar `Espaço`), o tucunaré gira na direção dela, eriça a dorsal espinhosa e dispara abrindo a boca para engolir a isca com bolhas e ondulação.
  - **Reação ao cursor:** movimentos bruscos muito próximos geram arrancada defensiva; cursor parado desperta observação cautelosa.

## Prévia local

Execute `Abrir-previa.cmd` ou abra `preview.html` no navegador.

- Tecla **`P`** ou **`H`**: exibe/oculta o painel de controles (`lil-gui`).
- Tecla **`Espaço`** ou **clique na água**: solta uma isca para o tucunaré atacar.
