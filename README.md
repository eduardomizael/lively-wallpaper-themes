# Lively Wallpaper · Coleção de temas

Quatro papéis de parede animados para o Lively Wallpaper no Windows. Cada tema pode ser instalado e personalizado separadamente.

| Prévia | Tema | O que faz |
| --- | --- | --- |
| <img src="circuit-orbit/thumbnail.jpg" width="216" alt="Marcadores luminosos"> | [Circuit Orbit](circuit-orbit/README.md) | Feixes entre os ícones do desktop, sete marcadores e efeitos de energia que reagem ao mouse. |
| <img src="koi-pond/thumbnail.jpg" width="216" alt="Carpas em um lago"> | [Koi Pond](koi-pond/README.md) | Cinco variedades de carpa 3D reagem ao cursor e disputam petiscos. |
| <img src="lantern-sky-clima-e-lua/thumbnail.jpg" width="216" alt="Lanternas no céu"> | [Lantern Sky · Edição Clima e Lua](lantern-sky-clima-e-lua/README.md) | Adaptação de Lantern Sky, de Dre, com Lua, Sol e clima local. |
| <img src="ori-energy-spheres/thumbnail.jpg" width="216" alt="Cinco esferas de energia"> | [Ori · Spirit Energy Spheres](ori-energy-spheres/README.md) | Cinco esferas procedurais com vórtices, coroas e plasma. |

## Build e instalação

1. Instale o [Node.js](https://nodejs.org/) e execute `npm install` na raiz do projeto para instalar as dependências de build (`esbuild` e `html-minifier-terser`).
2. Instale o [Lively Wallpaper](https://www.rocksdanister.com/lively/) e abra-o ao menos uma vez para criar a biblioteca.
3. Execute `build-install.cmd` com a sua conta do Windows. O utilitário verifica as dependências, permite escolher entre **buildar e instalar no Lively** ou **apenas buildar** (gerando o `index.html` único minificado + metadados em `dist/`).
4. Se escolher instalar, confira o caminho exibido da biblioteca do Lively e escolha os números dos temas separados por vírgula, como `1,3`, ou digite `T` para todos. Se um tema já existir, o instalador pergunta se você quer atualizá-lo com backup.
5. Para recarregar a biblioteca, clique com o botão direito no ícone do Lively perto do relógio e escolha **Sair**. Abra **Lively Wallpaper** pelo menu Iniciar e selecione o tema. Se a cópia falhar porque um tema está em uso, saia do Lively e rode o script novamente.

### Pelo PowerShell

Na raiz do projeto, use Windows PowerShell 5.1 ou PowerShell 7.

~~~powershell
.\build-install.ps1
.\build-install.ps1 -BuildOnly -Theme all
.\build-install.ps1 -Library 'D:\Lively\Library' -Theme koi-pond,lantern-sky-clima-e-lua
.\build-install.ps1 -Library 'D:\Lively\Library' -Theme all -Update
~~~

Com `-BuildOnly`, o script apenas gera os temas minificados em `dist/` sem instalar no Lively (também disponível via `npm run build` ou especificando `-OutDir`). Com `-Library` e `-Theme`, a instalação roda sem perguntas. Use `-Update` para substituir um tema existente. A pasta anterior é guardada em `Library\BackupsTemas` e o instalador exibe o caminho do backup.

Para recuperar um backup, saia do Lively, mova a versão atual para fora de `wallpapers` e coloque o backup nessa pasta com o nome original do tema. Reabra o aplicativo.

As preferências que o Lively grava em `Library\SaveData` permanecem na biblioteca. Se novos controles de um tema atualizado estiverem ausentes, a opção de restaurar os padrões em **Personalizar** redefine as preferências desse tema e carrega os controles atuais.

## Prévia e personalização

Abra o `preview.html` do tema no navegador. No Lively, use **Personalizar** no menu do tema. Temas que reagem ao cursor precisam da entrada de mouse habilitada nas configurações do Lively. Koi Pond usa WebGL e Ori exige WebGL2 com suporte a renderização em buffers de ponto flutuante.

Para usar o Circuit Orbit com os seus ícones, siga a documentação de coleta do tema. O Lantern Sky usa serviços meteorológicos para acompanhar o clima e também tem cenários de demonstração offline.

## Manutenção

- `catalogo.json` registra os temas, seus destinos e os arquivos que serão copiados.
- Cada tema inclui `index.html`, `LivelyInfo.json`, `LivelyProperties.json`, miniatura e documentação. Os caminhos em `LivelyInfo.json` são relativos à pasta do tema.
- Para adicionar um tema, registre sua pasta e seus arquivos no catálogo e teste a instalação em uma biblioteca descartável com uma subpasta `wallpapers`.
- O histórico do Circuit Orbit anterior à coleção está nos branches locais `archive/circuit-orbit/*` e nas tags `circuit-orbit/*`.

## Autoria e licenças

As contribuições originais de **Eduardo Mizael Clemente** estão sob a [licença MIT](LICENSE). Você pode usar, modificar, publicar e vender essas contribuições, desde que preserve o aviso de autoria e o texto da licença nas cópias ou em partes substanciais. O instalador inclui a licença e os créditos com cada tema.

| Tema | Créditos e referências |
| --- | --- |
| [Circuit Orbit](circuit-orbit/README.md#créditos) | Fluidos de Pavel Dobryakov, a partir da adaptação de rocksdanister para o Lively. Marcadores derivados de Ori · Spirit Energy Spheres, com hash de David Hoskins. |
| [Koi Pond](koi-pond/README.md#créditos) | Three.js e lil-gui. Ruído celular e cáusticas com referências de Inigo Quilez e *The Book of Shaders*. |
| [Lantern Sky · Edição Clima e Lua](lantern-sky-clima-e-lua/README.md#créditos-e-licença) | Tema original de **Dre**, com adaptações de Eduardo Mizael Clemente. SunCalc de Vladimir Agafonkin e dados de Open-Meteo, WeatherAPI e RainViewer. |
| [Ori · Spirit Energy Spheres](ori-energy-spheres/README.md#créditos) | Referência visual de *Ori and the Blind Forest*, desenvolvido pela Moon Studios e publicado pela Microsoft Studios. Hash de David Hoskins. |

Os componentes de terceiros mantêm suas próprias licenças. O pacote original de Lantern Sky identifica Dre como autor, com o campo de licença em branco. A licença MIT desta coleção cobre as contribuições de Eduardo à edição, e a redistribuição do material original depende das condições de Dre.
