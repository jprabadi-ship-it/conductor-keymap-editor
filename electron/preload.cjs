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
  showPopupMenu: () => ipcRenderer.send('popup-context-menu'),
  onShowMinimap: (callback) => {
    const listener = (_event, show) => callback(show)
    ipcRenderer.on('show-minimap', listener)
    return () => ipcRenderer.removeListener('show-minimap', listener)
  },
  onSetTheme: (callback) => {
    const listener = (_event, theme) => callback(theme)
    ipcRenderer.on('set-theme', listener)
    return () => ipcRenderer.removeListener('set-theme', listener)
  },
  adjustPopupOpacity: (delta) => ipcRenderer.send('adjust-popup-opacity', delta),

  // Serial-port handoff between the Studio window and the tray popup: the
  // port is exclusive, so when Studio wants to connect it asks the popup to
  // release its own connection first, and hands it back on disconnect.
  openStudio: () => ipcRenderer.send('open-studio'),
  hidePopup: () => ipcRenderer.send('hide-popup'),
  stealPort: () => ipcRenderer.invoke('steal-port'),
  studioReleasedPort: () => ipcRenderer.send('studio-released-port'),
  onReleasePort: (callback) => {
    const listener = () => callback()
    ipcRenderer.on('release-port', listener)
    return () => ipcRenderer.removeListener('release-port', listener)
  },
  portReleased: (info) => ipcRenderer.send('port-released', info),
  onReclaimPort: (callback) => {
    const listener = () => callback()
    ipcRenderer.on('reclaim-port', listener)
    return () => ipcRenderer.removeListener('reclaim-port', listener)
  },
})
