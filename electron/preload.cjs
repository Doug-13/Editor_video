const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('editor', {
  chooseVideos: () => ipcRenderer.invoke('choose-videos'),
  chooseAudio: () => ipcRenderer.invoke('choose-audio'),
  saveProject: project => ipcRenderer.invoke('save-project', project),
  openProject: () => ipcRenderer.invoke('open-project'),
  exportVideo: project => ipcRenderer.invoke('export-video', project),
  makeProxy: file => ipcRenderer.invoke('make-proxy', file),
  makeReversed: (file, start, end, force) => ipcRenderer.invoke('make-reversed', file, start, end, !!force),
  onProgress: callback => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on('export-progress', listener);
    return () => ipcRenderer.removeListener('export-progress', listener);
  }
});
