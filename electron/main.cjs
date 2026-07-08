const { app, BrowserWindow, session, dialog, Tray, Menu, nativeImage } = require('electron')
const path = require('node:path')

const isDev = !app.isPackaged

let win = null
let tray = null
let isQuitting = false

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'ConductorD Studio',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
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
  // manually on right-click instead.
  tray.on('click', toggleWindow)
  tray.on('right-click', () => tray.popUpContextMenu(menu))
}

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
