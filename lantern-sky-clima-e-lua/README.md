# Lantern Sky · Edição Clima e Lua

![Lanternas flutuando no céu](thumbnail.jpg)

Adaptação de **Lantern Sky**, tema original de **Dre**. A edição de Eduardo Mizael Clemente acrescenta clima local, astronomia e novas paisagens à cena de lanternas interativas.

1. Instale `lantern-sky-clima-e-lua` pelo [instalador da coleção](../README.md#instalar) e abra **Personalizar** no Lively. A pasta instalada conserva o nome `lantern-sky2` para atualizar instalações anteriores.
2. Em **Clima e Lua locais**, informe a cidade e o código do país, como `BR`. Se houver cidades homônimas, confira **Local encontrado**.
3. Clique na linha de cidade, temperatura e condição para expandir o painel. Use **Experimentar cenário** para ver chuva, tempestade, neve, Lua cheia e outros cenários.

Abra `preview.html` para testar no navegador. Os cenários de demonstração funcionam offline. Para condições reais, o tema busca a localidade no Open-Meteo. A configuração padrão usa Open-Meteo como alternativa à WeatherAPI, que exige uma chave própria. O radar RainViewer, quando habilitado e disponível, pode sinalizar chuva nas proximidades.

Veja o [guia completo](LEIA-ME.txt) para entender os controles, as fontes de dados e o funcionamento offline.

## Créditos e licença

- **Dre** criou o tema original **Lantern Sky**, que fornece a cena, o desenho das lanternas e a interação com o cursor.
- **Eduardo Mizael Clemente** assina as adaptações de clima, astronomia, paisagem e painel de informações. A licença MIT que acompanha a edição cobre essas contribuições. O pacote original identifica Dre como autor e traz o campo de licença em branco.
- **Vladimir Agafonkin** criou o SunCalc 1.9.0, usado nos cálculos astronômicos. [Código do SunCalc](https://github.com/mourner/suncalc/tree/v1.9.0) · [Licença BSD-2-Clause](SunCalc-LICENSE.txt)
- **Open-Meteo** fornece geocodificação e previsão como alternativa à **WeatherAPI**. **RainViewer** fornece as imagens de radar. Cada serviço tem suas próprias condições de acesso e atribuição. [Open-Meteo](https://open-meteo.com/en/terms) · [WeatherAPI](https://www.weatherapi.com/terms) · [RainViewer](https://www.rainviewer.com/api.html)
