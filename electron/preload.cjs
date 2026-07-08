const { contextBridge, ipcRenderer } = require('electron')

// Exposed to both the main editor window and the tray popup window. The
// editor window only calls sendLayerState; the popup only calls onLayerState.
contextBridge.exposeInMainWorld('electronAPI', {
  sendLayerState: (state) => ipcRenderer.send('layer-state', state),
  onLayerState: (callback) => {
    const listener = (_event, state) => callback(state)
    ipcRenderer.on('layer-state', listener)
    return () => ipcRenderer.removeListener('layer-state', listener)
  },
})
