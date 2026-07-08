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
// currently-active layer's key layout. It never quits the app -- losing
// focus just hides it, same as a native menu-bar popover. Sized to fit the
// keyboard grid at its natural (unscaled) size -- this is a legend meant to
// be read at a glance while typing on blank keycaps, so shrinking it to fit
// a smaller window isn't worth the loss of legibility.
const POPUP_WIDTH = 720
const POPUP_HEIGHT = 360

// Remembered across toggles/recreations for the rest of this run (not
// persisted to disk) -- once the user drags or resizes the popup, or picks
// an opacity, later opens should respect that instead of snapping back.
let popupOpacity = 1
let popupUserMoved = false
let showMinimap = true

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

  popupWin.on('moved', () => { popupUserMoved = true })
  popupWin.on('blur', () => popupWin?.hide())
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
  ])
  menu.popup({ window: popupWin })
}

function togglePopup() {
  if (!popupWin) createPopupWindow()
  if (popupWin.isVisible()) {
    popupWin.hide()
    return
  }
  if (!popupUserMoved) positionPopupNearTray()
  popupWin.show()
  popupWin.focus()
  if (latestLayerState) popupWin.webContents.send('layer-state', latestLayerState)
  popupWin.webContents.send('show-minimap', showMinimap)
}

function createTray() {
  const iconPath = path.join(__dirname, 'trayIcon.png')
  tray = new Tray(nativeImage.createFromPath(iconPath))
  tray.setToolTip('ConductorD Studio')

  const menu = Menu.buildFromTemplate([
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
      label: 'Quit',
      click: () => {
        isQuitting = true
        app.quit()
      },
    },
  ])

  // Don't use setContextMenu: on macOS that makes every click (left or
  // right) open the menu, which kills left-click-to-toggle. Show the menu
  // manually on right-click instead. Left-click shows the layer popup (the
  // quick-glance action); the full editor stays one right-click menu away.
  tray.on('click', togglePopup)
  tray.on('right-click', () => tray.popUpContextMenu(menu))
}

ipcMain.on('layer-state', (_event, state) => {
  latestLayerState = state
  if (popupWin) popupWin.webContents.send('layer-state', state)
})

ipcMain.on('popup-context-menu', showPopupContextMenu)

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
