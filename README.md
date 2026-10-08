# Eden Video Editor — MVP Windows

Editor de vídeos desktop em React + Electron + FFmpeg. Os arquivos de vídeo não são enviados a servidores.

## Requisitos

- Windows 10/11 64 bits
- Node.js LTS (inclui npm)
- FFmpeg e FFprobe instalados e presentes no PATH

### Instalação do FFmpeg

No PowerShell:

```powershell
winget install --id Gyan.FFmpeg --exact
```

Feche e reabra o PowerShell e verifique:

```powershell
ffmpeg -version
ffprobe -version
```

Se o comando não for reconhecido, configure o diretório `bin` do FFmpeg na variável PATH do Windows e abra novo terminal.

## Rodar em desenvolvimento

```powershell
cd C:\Projetos\eden-editor
npm install
npm run dev
```

## Abrir versão compilada localmente

```powershell
npm run start
```

## Gerar instalador Windows

```powershell
npm run dist
```

O instalador ficará em `release/`. **Importante:** nesta versão, o FFmpeg não é embutido no instalador; precisa ser instalado na máquina de destino.

## Recursos disponíveis

- Importação de vários vídeos, com duração obtida via FFprobe
- Reordenar cenas usando setas na timeline
- Cortar por segundo inicial/final sem modificar originais
- Velocidades 0,25x a 4x, incluindo áudio dos clipes
- Prévia da montagem (cena atual) e navegação na timeline
- Títulos na parte inferior com intervalos definidos em segundos
- Música de fundo com mixagem ao áudio original
- Salvar e abrir projeto JSON editável
- Exportar MP4 1280×720, H.264 + AAC

## Limitações da versão 0.1

- Exportação padronizada em 720p/30fps
- A prévia não reproduz a música adicional; ela entra no MP4 exportado
- Prévia de títulos aproximada (renderização final usa FFmpeg)
- A linha do tempo usa botões de ordenação, não arrastar-e-soltar
- Sem transições, formas de onda, legendas automáticas ou aceleração de GPU
- Cada título usa Arial centralizada na parte inferior; tamanhos e intervalos editáveis
- Recomendado testar primeiro com arquivos MP4 H.264/AAC, já que codecs e contêineres variam
- Arquivos removidos ou movidos invalidam caminhos do projeto salvo
- O instalador é sem assinatura de código, portanto o Windows SmartScreen pode exibir aviso

## Arquitetura

```text
src/           UI React + timeline e preview
  main.tsx
  style.css
electron/
  main.cjs       IPC, seletor de arquivos, ffprobe, pipeline de render
  preload.cjs    API segura e mínima disponível na interface
```

O renderer não possui Node.js habilitado. O processo principal somente acessa mídias importadas explicitamente, e o esquema `media://` serve os arquivos locais autorizados.

## Direitos de distribuição

Verifique as licenças do Electron, bibliotecas e da versão de FFmpeg distribuída/instalada, especialmente se comercializar o aplicativo ou incluir binários do FFmpeg no instalador.
