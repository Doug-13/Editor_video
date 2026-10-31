# Eden Video Editor 0.9 — Windows

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

## Novidades na v0.9.0 — fontes, cores e posição dos textos; textos não se sobrepõem mais

Em cada texto, abra **“Fonte, cor e posição”**:

- **6 estilos prontos** (Clássico, Legenda, Cinema, Impacto, Destaque, Neon) e **16 fontes do Windows** (Arial, Arial Black, Segoe UI, Calibri, Verdana, Tahoma, Trebuchet MS, Franklin Gothic, Impact, Georgia, Times New Roman, Palatino, Courier New, Consolas, Comic Sans MS, Segoe Script).
- **Negrito** e **itálico** (desativados quando a fonte não tem essa variação, para a prévia ficar igual ao vídeo exportado), **tamanho** de 12 a 200.
- **Cor da letra** e **opacidade**, **contorno** (0 a 10 px) com cor própria, **sombra** e **tarja** atrás do texto (cor e opacidade).
- **Posição livre:** alinhar à esquerda/centro/direita, atalhos Topo/Meio/Base, controles horizontal e vertical — ou **arraste o texto direto na prévia** (gruda no centro).
- **Aplicar este estilo a todos os textos** copia fonte, tamanho e cores (não a posição).
- **Correção — textos sobrepostos:** dois textos que aparecem ao mesmo tempo na mesma posição eram desenhados um em cima do outro na exportação. Agora são **empilhados** automaticamente (um acima do outro), da mesma forma na prévia e no MP4.
- **Prévia = exportação:** o tamanho da letra na prévia agora corresponde ao vídeo exportado (antes a prévia mostrava a letra cerca de 1,5× maior). Textos com aspas, dois-pontos, `%`, vírgulas e acentos são exportados sem problemas de escape.
- Projetos antigos abrem com o mesmo visual de antes (Arial, branco, contorno preto). Fontes instaladas só para o usuário também são encontradas; se uma fonte faltar no computador, a exportação usa Arial.

## Novidades na v0.8.0 — cor e estilos; reforço da inversão

- **Cor e estilo** (painel do clipe, por vídeo): **Brilho, Contraste, Saturação, Temperatura (frio ↔ quente) e Desbotado**, mais **10 estilos prontos** com um clique: Original, Vívido, Cinematográfico, Quente, Frio, Preto e branco, Vintage, Dramático, Suave (matte) e Noturno. **Restaurar cor** volta ao original e **Aplicar a todos** copia a cor para todos os vídeos. Um ícone de paleta marca na linha do tempo os clipes com cor.
- A prévia e a exportação usam a mesma conta (erro médio de 1 a 2,5 em 255 nos 13 casos testados), e a cor não pesa na reprodução. A cor é aplicada ao quadro já enquadrado, antes do zoom, então também vale para o fundo desfocado.
- As barras pretas de vídeos “ajustados” agora fazem parte do quadro na prévia (como na exportação): recebem a cor e deslizam nas transições.
- **Inversão reforçada:** a cópia invertida da prévia agora é recodificada em um fluxo único (idêntico em estrutura a uma cópia leve normal), o cache foi renovado (arquivos antigos não são reaproveitados), os arquivos gerados pelo app nunca recebem “403” do servidor de mídia local (arquivos de fora da pasta continuam negados), o app confere o acesso ao arquivo invertido e informa o código exato se algo falhar, e, se o vídeo invertido falhar ao tocar, ele é reconstruído automaticamente.

## Novidades na v0.7.0 — vídeos verticais (9:16) em projetos 16:9

Painel do clipe → **Enquadramento** (por clipe):

- **Ajustar (barras pretas):** como antes.
- **Fundo desfocado (sem cortar):** o vídeo inteiro no centro e, atrás, o próprio vídeo ampliado, desfocado e escurecido. É o padrão para vídeos **verticais** recém-importados.
- **Preencher o quadro (recorta):** o vídeo ocupa toda a tela e você escolhe a parte mantida (vertical e/ou horizontal). Para vídeos verticais há **“Varrer de cima para baixo”**, que desliza a janela de recorte ao longo do clipe.
- **Aplicar este enquadramento a todos** copia o modo (e a posição) para todos os vídeos da sequência.
- A orientação é detectada na importação, inclusive em vídeos de celular gravados “deitados” com marca de rotação. O zoom do clipe continua funcionando por cima do enquadramento.
- Exportação e prévia usam a mesma geometria (fundo desfocado: erro médio ≈ 7 em 255; demais modos ≈ 2–3).
- Ao dividir um clipe em varredura, cada metade continua de onde a outra parou.
- Corrigido: os botões “Aproximar/Afastar devagar” estavam espremidos no painel.

## v0.6.1 — correção: “Falha na leitura do arquivo (código 3)” em sequências longas

- **Causa:** o Web Audio (usado desde a v0.4 para volume acima de 100% e curvas) mantém vivo todo `<video>` ligado a ele, e a prévia criava um `<video>` novo a cada clipe. Os decodificadores se acumulavam e, depois de vários clipes, a reprodução falhava com erro de decodificação. Medido: 14 clipes tocados → 12 elementos retidos mesmo após forçar o coletor de lixo.
- **Correção:** a prévia agora usa um conjunto **fixo de 6 elementos reutilizáveis**; ao trocar de clipe só a fonte muda. O número de decodificadores deixa de crescer com o tamanho do projeto.
- A prévia usa **decodificação por software** (as cópias leves são 540p). Para reativar o hardware: defina a variável de ambiente `EDEN_HW_DECODE=1`.
- **Recuperação automática:** se um vídeo falhar, o app recarrega o elemento sem parar a reprodução; na segunda falha usa o arquivo original; só então mostra o erro (agora com o nome do clipe). Os detalhes da falha vão para o console (View → Toggle Developer Tools).

## Novidades na v0.6.0

- **Vídeo ao contrário** (por clipe): marque “Reproduzir ao contrário” no painel do clipe; o som também é invertido. A prévia usa uma cópia leve invertida gerada em segundo plano (só na primeira vez por trecho; o Play fica bloqueado enquanto isso). A exportação inverte em qualidade total, em pedaços, para não consumir memória demais.
- **Zoom por clipe:** zoom de 100% a 400%, posição horizontal/vertical, zoom animado do início ao fim do vídeo e atalhos “Aproximar devagar” / “Afastar devagar”. Vale só para o clipe selecionado.
- **Volume por vídeo** (0–200%) e **Duplicar vídeo** (a cópia leva os textos e as configurações).
- **Áudio:** **arraste as bordas** da barra para cortar o início ou o fim (a curva de volume acompanha); a borda “gruda” na linha de reprodução; **Duplicar** e **Dividir no cursor** no painel da faixa; campo “Parar de tocar o arquivo em”.
- **Texto vinculado ao vídeo:** o texto inserido fica preso ao vídeo sob a linha de reprodução e **acompanha o vídeo** quando ele muda de posição. Ao dividir um vídeo, o texto vai para a metade onde está (se atravessa o corte, continua nas duas). Se o vídeo sai da sequência, o texto fica oculto; se o vídeo é removido, o texto some. É possível **Desvincular** (tempos fixos) e **Vincular** de novo.
- **Desfazer / Refazer** (botões no topo): guarda até 100 passos; gestos contínuos (arrastar um controle) valem um passo só.
- **Atalhos:** Espaço tocar/pausar • F tela inteira • S dividir (vídeo, ou faixa de áudio se ela estiver selecionada) • Delete remover • Ctrl+D duplicar • Ctrl+Z desfazer • Ctrl+Y ou Ctrl+Shift+Z refazer • ← → um quadro (com Shift, 1 s) • Home / End. Os atalhos não funcionam enquanto você digita num campo.

## v0.5.2 — faixas de áudio compartilhando linhas

- **Faixas de áudio agrupadas automaticamente:** as que não se sobrepõem no tempo ficam na mesma linha (“ÁUDIO 1”, “ÁUDIO 2”…); uma nova linha só aparece quando há conflito. Encostar (uma termina onde a outra começa) não conta como conflito. Ao arrastar ou mudar o início de uma faixa, as linhas se reorganizam sozinhas.
- Cada barra tem seu próprio botão de silenciar (aparece quando a barra é larga o bastante; use zoom ou o painel Propriedades nas barras estreitas).
- **A linha de reprodução agora atravessa todas as faixas**, da régua até a última (antes parava na régua).

## v0.5.1 — posição e mudo no painel do clipe

- **Posição na sequência:** caixa no painel Propriedades. Digite o número e tecle Enter para mover o vídeo; números acima do total vão para o fim.
- **Silenciar o som deste vídeo:** deixa mudo apenas aquele clipe (na prévia e na exportação), sem alterar a duração nem as transições. Aparece um ícone no trecho da linha do tempo e a indicação “mudo” na barra lateral.

## Novidades na v0.5.0 — biblioteca numerada e tela inteira

- **Importar não insere mais na sequência.** Os vídeos ficam na barra lateral, em **“Biblioteca • fora da sequência”**, cada um com um campo de posição já sugerindo o próximo número (se a sequência tem 1–6, aparece 7). Digite a posição desejada e tecle **Enter** (ou clique em **+**) para inseri-lo; os demais se reorganizam.
- Os vídeos já na sequência também têm o campo numérico: digite outro número e tecle Enter para movê-lo. Esc cancela.
- **Inserir todos** coloca tudo da biblioteca no fim da sequência, na ordem da lista (útil na primeira importação). O botão de desfazer ao lado de cada vídeo o **tira da sequência** sem apagá-lo.
- A biblioteca é salva junto com o projeto.
- **Tela inteira:** botão na barra de reprodução, tecla **F** ou duplo clique na prévia. Em tela inteira há play/pausa, barra de busca, tempo e sair; os controles somem sozinhos após alguns segundos parado. **Espaço** toca/pausa em qualquer lugar do app (exceto enquanto você digita em um campo); **Esc** sai.
- A prévia é sempre desenhada em 16:9 e os títulos escalam junto com a imagem.

## v0.4.1 — correção

- Corrigido o erro ao exportar (`Option vf ... cannot be applied to input url ...loop-0.wav`): a exportação falhava quando havia **texto** junto com faixas de áudio adicionais. Agora as opções do FFmpeg são montadas na ordem correta.
- Mensagens de erro da exportação mostram apenas as últimas linhas relevantes, sem o banner de configuração do FFmpeg.

## Novidades na v0.4.0 — várias faixas de áudio e mixagem

- **Várias faixas de áudio:** **Adicionar áudio** aceita vários arquivos de uma vez; cada um vira uma faixa independente na linha do tempo (fundo, narração, efeitos…). Arraste o título da faixa para posicioná-la no tempo, ou use os campos no painel.
- **Som dos vídeos:** faixa própria (“Som dos vídeos”) com volume, mudo e curva, para baixar o som original e deixar o fundo e a narração em destaque.
- **Volume de 0 a 200 %** por faixa (inclui reforço) e botão de mudo na lateral de cada faixa.
- **Curva de volume ao longo do tempo:** dê duplo clique na faixa para criar um ponto, arraste para subir/descer, duplo clique (ou botão direito) no ponto para remover. Atalhos **Fade in / Fade out** com duração configurável e **Limpar curva**.
- Por faixa: **início na linha do tempo**, **começar a tocar o arquivo em…** (pular o começo) e **repetir até o fim do vídeo**.
- A prévia toca todas as faixas juntas (Web Audio); a exportação mixa com FFmpeg (`volume` por curva, `adelay`, `amix`) e aplica um limitador contra distorção.
- Projetos antigos (uma música em loop) são convertidos automaticamente para uma faixa em loop com os mesmos volumes de antes (original 85 %, música 22 %).

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
