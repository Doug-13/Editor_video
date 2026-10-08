# Eden Video Editor 0.2 — Windows

Editor local de vídeos com Electron, React, Vite, TypeScript e FFmpeg.

## Requisitos

- Windows 10/11
- Node.js instalado
- FFmpeg e FFprobe acessíveis no PATH (`ffmpeg -version` e `ffprobe -version`)

## Instalação

```powershell
npm install
npm run dev
```

Para gerar o instalador:

```powershell
npm run dist
```

**Importante:** o terminal do `npm run dev` precisa permanecer aberto enquanto o aplicativo é usado.

## Novidades na v0.3.0 — transições entre cenas

- Cada emenda da linha do tempo tem um marcador (**+** = corte seco, **✦** roxo = transição). Clique nele, ou selecione o clipe, e use **Transição de entrada** em Propriedades.
- 13 efeitos: dissolver, fade para preto/branco, deslizar (4 direções), cortina (4 direções), círculo abrindo/fechando. Duração de 0,2 a 3 s, botão **Testar** (toca desde 1 s antes da emenda) e **Aplicar a todas**.
- A transição **sobrepõe** o fim da cena anterior ao início da seguinte (o vídeo final fica mais curto, como em editores profissionais). Cada cena cede no máximo metade da própria duração; a duração é limitada automaticamente quando a cena é curta.
- A exportação usa o filtro `xfade` (vídeo) e `acrossfade` (áudio) do FFmpeg; a prévia reproduz as mesmas fórmulas. Emendas sem transição continuam sendo cortes secos, sem recodificação extra.
- A prévia agora mantém o próximo clipe pré-carregado, eliminando o pequeno corte preto entre clipes.
- Palco da prévia sempre em 16:9 e régua alinhada com as faixas.

## Novidades na v0.2.2 — correção de travamentos

- **Prévia otimizada (proxy):** ao importar, o FFmpeg gera uma cópia leve (540p, 30 fps, keyframe a cada 12 quadros) usada somente na pré-visualização. A exportação continua usando os arquivos originais, em qualidade total. Os proxies ficam em cache (`%APPDATA%\eden-video-editor\proxies`) e são apagados após 30 dias sem uso.
- Relógio de reprodução por `requestAnimationFrame`: o corte entre clipes agora é detectado a cada quadro (antes, até 250 ms do trecho seguinte apareciam) e a interface atualiza ~20×/s em vez de 4×/s.
- Servidor de mídia local com leitura em blocos de 1 MB e sem `no-store`.
- Processos do FFmpeg são encerrados ao fechar o aplicativo.
- O botão Reproduzir fica desativado enquanto a prévia está sendo otimizada (indicado sobre o vídeo).

## Novidades na v0.2

- Pré-visualização confinada ao painel, sem invadir a timeline
- Ordenação de clipes arrastando e soltando na faixa de vídeo
- Escala temporal proporcional à duração, com zoom
- Reprodução sequencial de clipes e navegação pela régua
- Dividir clipe no cursor (corte não destrutivo)
- Velocidade numérica personalizada de 0,25× a 4×
- Correção da leitura da música durante exportação e reabertura dos projetos
- Compatibilidade com projetos `.eden.json` da v0.1

## Uso

1. Importe seus vídeos.
2. Clique no botão Reproduzir. Clique na régua para posicionar o cursor.
3. Arraste clipes sobre outros para reorganizar a sequência.
4. Posicione o cursor no interior de um clipe e use **Dividir**.
5. Selecione um clipe para ajustar seu corte e velocidade.
6. Adicione música e textos e exporte para MP4.

## Limitações atuais

- A timeline ainda não oferece arraste de alças de início/fim (use o painel Propriedades).
- Transições entre cenas, miniaturas geradas automaticamente, múltiplas faixas de áudio e legendas automáticas ainda não foram implementadas.
- Exportação em 1280×720, 30 fps; FFmpeg instalado separadamente.
- Prévia de velocidade e renderização devem ser testadas no computador de destino; não foi possível executar um teste completo no Windows neste ambiente.

## Solução de problemas

Se `ffprobe` não for reconhecido, feche o terminal, abra outro e execute `where.exe ffprobe`. Em instalações Winget, o terminal antigo pode não receber a atualização de PATH.

O botão **Exportar MP4** usa FFmpeg e gera o vídeo selecionado pelo diálogo do Windows.
