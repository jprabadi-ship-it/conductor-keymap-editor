const { app, BrowserWindow, session, dialog, Tray, Menu, nativeImage, ipcMain } = require('electron')
const path = require('node:path')

const isDev = !app.isPackaged
const preloadPath = path.join(__dirname, 'preload.cjs')

let win = null
let tray = null
let popupWin = null
let isQuitting = false
let latestLayerState = null

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'ConductorD Studio',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: preloadPath,
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:5173/conductor-keymap-editor/')
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  // Keep the app alive in the menu bar instead of quitting when the window
  // is closed — the tray icon is the app's real lifecycle from here on.
  win.on('close', (event) => {
    if (isQuitting) return
    event.preventDefault()
    win.hide()
  })

  return win
}

function toggleWindow() {
  if (!win) {
    createWindow()
    return
  }
  if (win.isVisible()) {
    win.hide()
  } else {
    win.show()
    win.focus()
  }
}

// Small frameless window anchored under the tray icon, showing the
// currently-active layer's key layout. Shown/hidden only via the tray's
// "キーマップを表示する" checkbox -- once up, it stays on top and doesn't
// auto-hide on blur, since it's meant to sit there as a running overlay
// while typing, not a click-away popover. Sized to fit the keyboard grid at
// its natural (unscaled) size -- this is a legend meant to be read at a
// glance while typing on blank keycaps, so shrinking it to fit a smaller
// window isn't worth the loss of legibility.
const POPUP_WIDTH = 720
const POPUP_HEIGHT = 360

// Remembered across toggles/recreations for the rest of this run (not
// persisted to disk) -- once the user drags or resizes the popup, or picks
// an opacity, later opens should respect that instead of snapping back.
let popupOpacity = 1
let popupUserMoved = false
let showMinimap = true
let popupTheme = 'light'

function createPopupWindow() {
  popupWin = new BrowserWindow({
    width: POPUP_WIDTH,
    height: POPUP_HEIGHT,
    minWidth: 320,
    minHeight: 160,
    show: false,
    frame: false,
    resizable: true,
    movable: true,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    opacity: popupOpacity,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: preloadPath,
    },
  })

  if (isDev) {
    popupWin.loadURL('http://localhost:5173/conductor-keymap-editor/#/popup')
  } else {
    popupWin.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), { hash: '/popup' })
  }

  popupWin.on('moved', () => {
    popupUserMoved = true
    // Re-assert alwaysOnTop after every move to fix a macOS bug where dragging
    // a frameless alwaysOnTop window to a different display desynchronises its
    // NSWindowLevel, leaving the window stuck and unresponsive to further drags.
    popupWin.setAlwaysOnTop(true, 'floating')
  })
  popupWin.on('closed', () => { popupWin = null })

  return popupWin
}

function positionPopupNearTray() {
  const trayBounds = tray.getBounds()
  const popupBounds = popupWin.getBounds()
  const x = Math.round(trayBounds.x + trayBounds.width / 2 - popupBounds.width / 2)
  const y = Math.round(trayBounds.y + trayBounds.height + 4)
  popupWin.setPosition(x, y, false)
}

const POPUP_OPACITY_LEVELS = [100, 85, 70, 55, 40]
const POPUP_OPACITY_MIN = 0.15

function showPopupContextMenu() {
  if (!popupWin) return
  const menu = Menu.buildFromTemplate([
    ...POPUP_OPACITY_LEVELS.map(pct => ({
      label: `不透明度 ${pct}%`,
      type: 'radio',
      checked: Math.round(popupOpacity * 100) === pct,
      click: () => {
        popupOpacity = pct / 100
        popupWin.setOpacity(popupOpacity)
      },
    })),
    { type: 'separator' },
    {
      label: 'ミニマップを表示',
      type: 'checkbox',
      checked: showMinimap,
      click: () => {
        showMinimap = !showMinimap
        popupWin.webContents.send('show-minimap', showMinimap)
      },
    },
    { type: 'separator' },
    {
      label: 'ライトモード',
      type: 'radio',
      checked: popupTheme === 'light',
      click: () => {
        popupTheme = 'light'
        popupWin.webContents.send('set-theme', popupTheme)
      },
    },
    {
      label: 'ダークモード',
      type: 'radio',
      checked: popupTheme === 'dark',
      click: () => {
        popupTheme = 'dark'
        popupWin.webContents.send('set-theme', popupTheme)
      },
    },
  ])
  menu.popup({ window: popupWin })
}

function showPopup() {
  if (!popupWin) createPopupWindow()
  if (!popupUserMoved) positionPopupNearTray()
  popupWin.show()
  popupWin.focus()
  if (latestLayerState) popupWin.webContents.send('layer-state', latestLayerState)
  popupWin.webContents.send('show-minimap', showMinimap)
  popupWin.webContents.send('set-theme', popupTheme)
}

function hidePopup() {
  popupWin?.hide()
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    {
      label: 'Show ConductorD Studio',
      click: () => {
        if (!win) {
          createWindow()
        } else {
          win.show()
          win.focus()
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Open miniMap',
      type: 'checkbox',
      checked: !!(popupWin && popupWin.isVisible()),
      click: (menuItem) => {
        if (menuItem.checked) showPopup()
        else hidePopup()
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true
        app.quit()
      },
    },
  ])
}

function createTray() {
  const iconPath = path.join(__dirname, 'trayIcon.png')
  tray = new Tray(nativeImage.createFromPath(iconPath))
  tray.setToolTip('ConductorD Studio')

  // Left-click does nothing -- everything lives behind right-click now.
  // Rebuild the menu each time so the checkbox reflects current visibility.
  tray.on('right-click', () => tray.popUpContextMenu(buildTrayMenu()))
}

ipcMain.on('layer-state', (_event, state) => {
  latestLayerState = state
  if (popupWin) popupWin.webContents.send('layer-state', state)
})

ipcMain.on('popup-context-menu', showPopupContextMenu)

// Serial-port handoff (the port is exclusive, one renderer at a time):
// Studio invokes steal-port before connecting; if the popup holds a
// connection it releases it and answers with what it was using. When
// Studio disconnects, the popup is told to reclaim what it gave up.
ipcMain.handle('steal-port', async () => {
  if (!popupWin) return null
  const ack = new Promise((resolve) => {
    const timer = setTimeout(() => {
      ipcMain.removeAllListeners('port-released')
      resolve(null)
    }, 3000)
    ipcMain.once('port-released', (_event, info) => {
      clearTimeout(timer)
      resolve(info)
    })
  })
  popupWin.webContents.send('release-port')
  return await ack
})

ipcMain.on('studio-released-port', () => {
  if (popupWin) popupWin.webContents.send('reclaim-port')
})

// Hidden feature: scroll over the popup to fade it steplessly, instead of
// picking from the menu's fixed percentages. Delta is relative so the
// renderer never needs to know the current opacity.
ipcMain.on('adjust-popup-opacity', (_event, delta) => {
  if (!popupWin) return
  popupOpacity = Math.min(1, Math.max(POPUP_OPACITY_MIN, popupOpacity + delta))
  popupWin.setOpacity(popupOpacity)
})

// Web Serial: Electron doesn't show its own port picker, so we must answer
// navigator.serial.requestPort() ourselves. Auto-select when there's exactly
// one candidate (the common case). With more than one — e.g. macOS always
// lists a phantom "Bluetooth-Incoming-Port" cu device alongside real USB
// serial ports — ask the user, the same way a real browser's native picker
// would, instead of guessing and silently connecting to the wrong port.
function wireSerialPermissions(ses) {
  ses.on('select-serial-port', (event, portList, webContents, callback) => {
    event.preventDefault()

    if (portList.length <= 1) {
      callback(portList.length === 1 ? portList[0].portId : '')
      return
    }

    const labels = portList.map((p, i) => p.displayName || p.portName || `Port ${i + 1}`)
    const result = dialog.showMessageBoxSync({
      type: 'question',
      title: 'Select a serial port',
      message: 'Multiple serial ports were found. Which one is your Conductor device?',
      buttons: [...labels, 'Cancel'],
      cancelId: labels.length,
    })

    callback(result < labels.length ? portList[result].portId : '')
  })

  ses.setDevicePermissionHandler((details) =>
    details.deviceType === 'serial' || details.deviceType === 'bluetooth',
  )
}

// Web Bluetooth: same story as serial — Electron requires the host app to
// resolve navigator.bluetooth.requestDevice() via this event. Same
// single-candidate auto-select / multi-candidate prompt pattern.
function wireBluetoothPermissions(ses) {
  ses.on('select-bluetooth-device', (event, deviceList, callback) => {
    event.preventDefault()

    if (deviceList.length <= 1) {
      callback(deviceList.length === 1 ? deviceList[0].deviceId : '')
      return
    }

    const labels = deviceList.map((d, i) => d.deviceName || `Device ${i + 1}`)
    const result = dialog.showMessageBoxSync({
      type: 'question',
      title: 'Select a Bluetooth device',
      message: 'Multiple Bluetooth devices were found. Which one is your Conductor device?',
      buttons: [...labels, 'Cancel'],
      cancelId: labels.length,
    })

    callback(result < labels.length ? deviceList[result].deviceId : '')
  })

  ses.setBluetoothPairingHandler((details, callback) => {
    callback({ confirm: true })
  })
}

app.whenReady().then(() => {
  const ses = session.defaultSession
  wireSerialPermissions(ses)
  wireBluetoothPermissions(ses)

  ses.setPermissionCheckHandler((_webContents, permission) =>
    permission === 'serial' || permission === 'bluetooth',
  )

  // Menu-bar-resident app: no Dock icon, lives as a tray icon instead.
  if (process.platform === 'darwin') app.dock.hide()

  createTray()
  createWindow()

  app.on('activate', () => toggleWindow())
})

app.on('window-all-closed', () => {
  // The window hides rather than closes, and the tray keeps the app alive —
  // this only fires on the real, quitting close (or on non-mac platforms).
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  isQuitting = true
})
