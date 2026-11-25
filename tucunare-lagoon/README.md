# Tucunaré Azul · Visão Isométrica 3D

Um papel de parede interativo 3D para **Lively Wallpaper**, com câmera **lateral-isométrica** e arquitetura baseada no `koi-pond`. A lagoa reúne **dois modelos de tucunaré azul (*Cichla piquiti*)** e **uma piranha-vermelha**, modelados proceduralmente em Three.js + GLSL.

## Destaques

- **Visão lateral-isométrica:** perspectiva teleobjetiva inclinada (~19°), revelando o perfil completo do tucunaré, profundidade da coluna d'água, fundo arenoso com cáusticas Voronoi, algas subaquáticas opcionais (*Vallisneria*) e raios de luz solar.
- **Anatomia e coloração de Tucunaré Azul:** corpo compacto, focinho arredondado e boca inclinada sob o olho, com mandíbula projetada e cavidade bucal modelada para o bote. Os flancos dourados têm cinco barras irregulares, manchas na bochecha, opérculos em relevo e escamas sobrepostas. As nadadeiras se abrem em leque, com duas seções na dorsal e um ocelo dourado junto à base da cauda larga.
- **Comportamento de predador de emboscada:**
  - **Espairar (Hover):** para quase imóvel na coluna d'água, equilibrando-se com remadas alternadas das nadadeiras peitorais e leve flutuação na cauda.
  - **Patrulha 3D (*kick-and-glide*):** alterna batidas de cauda e deslizes suaves mudando de profundidade (`Y`) com inclinação natural de nariz (*pitch*) e leve rolagem nas curvas (*bank*).
  - **Espreita e Bote (Stalk → Strike):** ao clicar na água para soltar uma isca (ou ao pressionar `Espaço`), o tucunaré gira na direção dela, eriça a dorsal espinhosa e dispara abrindo a boca para engolir a isca com bolhas e ondulação.
  - **Reação ao cursor:** movimentos bruscos muito próximos geram arrancada defensiva; cursor parado desperta observação cautelosa.

## Piranha-vermelha

A piranha-vermelha (*Pygocentrus nattereri*) divide a lagoa com os dois tucunarés. O corpo alto, o focinho curto, a mandíbula arredondada, o ventre vermelho e a cauda bifurcada seguem as fotografias de referência. A boca fica entreaberta, com a cavidade e as duas fileiras de dentes modeladas em 3D. Nesta etapa ela paira ao fundo com batidas leves da cauda. [Referência anatômica do Smithsonian](https://nationalzoo.si.edu/animals/red-bellied-piranha).

## Prévia local

Abra `preview.html` no navegador.

- Tecla **`P`** ou **`H`**: exibe/oculta o painel de controles (`lil-gui`).
- Tecla **`Espaço`** ou **clique na água**: solta uma isca para o tucunaré atacar.
- [Ver os três peixes](index.html?inspect=peixes) ou [inspecionar a piranha de perto](index.html?inspect=piranha).
- Compare os dois tucunarés em `index.html?inspect` ou isole um deles com `&fish=1` ou `&fish=2`. Acrescente `&mouth` para ver a abertura da boca ou `&angle=34` para a vista em três quartos do tucunaré V2.
- Na inspeção, arraste para girar a câmera e use a roda do mouse para aproximar.

## Referência visual

O modelo procedural usa como referência as imagens de tucunaré fornecidas para o projeto e a apresentação de [Tucunaré (Peacock bass), de Guilherme Freitas](https://sketchfab.com/3d-models/tucunare-peacock-bass-779403b865fb4cfdab59126988f80477).
