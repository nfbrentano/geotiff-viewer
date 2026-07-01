# Pix Force - GeoTIFF Viewer

Visualizador simples e interativo de ortofotos integrado com a marca Pix Force.

## 🚀 Deploy
Acesse a aplicação rodando no GitHub Pages:
**[https://nfbrentano.github.io/geotiff-viewer/](https://nfbrentano.github.io/geotiff-viewer/)**

## 🌟 Funcionalidades
- **Carregamento Local e Remoto**: Suporta imagens locais (PNG, JPG, TIFF, GeoTIFF) e links diretos/compartilhados (Google Drive, Dropbox).
- **Georreferenciamento Automático**: Lê metadados EPSG/WGS84 embutidos no GeoTIFF para exibir coordenadas reais.
- **Ferramentas de Medição**: Cálculo de distância e área em tempo real (geodésico ou em pixels escalados).
- **Ajustes de Imagem**: Brilho, Contraste, Saturação e Opacidade.
- **Mapa de Fundo**: Alterna entre Satélite, Mapa Vetorial (OSM) ou Sem Fundo.
- **Otimização**: Converte grandes rasters usando `geotiff.js` no client-side.

## 🛠 Tecnologias
- **HTML5, CSS3, Vanilla JS** (Sem frameworks complexos, ideal para deploy estático).
- **Leaflet.js**: Para renderização e interação do mapa.
- **geotiff.js**: Para decodificação de imagens TIFF/GeoTIFF no navegador.
- **proj4js**: Para reprojeção de sistemas de coordenadas (UTM -> WGS84).
- **Lucide Icons**: Para iconografia leve e moderna.

## 🏃 Como usar localmente
Nenhuma dependência de build é necessária. Basta abrir o arquivo `index.html` em qualquer navegador moderno. Para evitar problemas de CORS ao usar links remotos, pode ser necessário hospedar localmente (ex: usando a extensão *Live Server* do VSCode ou `python3 -m http.server`).

---
*Desenvolvido com foco em inteligência artificial e visão computacional aplicadas à engenharia e indústria.*
