const { app, BrowserWindow, session, Menu, MenuItem, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { shell } = require('electron');

const config = require('./config');
const { 
  defaultUrl, 
  defaultProxy, 
  defaultUserAgent, 
  defaultBackgroundColor, 
  appName,
  whitelist
} = config;

const userDataPath = path.join(app.getPath('userData'), appName);
const configPath = path.join(userDataPath, 'window-config.json');
const proxyConfigPath = path.join(userDataPath, 'proxy-config.json');

app.setPath('userData', userDataPath);

let mainWindow;
let isWindowVisible = false;

function isAllowedURL(url) {
  try {
    const parsed = new URL(url);
    return whitelist.some(allowedDomain => parsed.hostname === allowedDomain || parsed.hostname.endsWith('.' + allowedDomain));
  } catch (error) {
    return false;
  }
}

const autoLaunchKey = {
  set: (key, type, value, callback) => {
    if (process.platform === 'win32') {
      const Registry = require('winreg');
      const regKey = new Registry({
        hive: Registry.HKCU,
        key: '\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
      });
      regKey.set(key, type, value, callback);
    } else if (process.platform === 'darwin') {
      const { exec } = require('child_process');
      const script = `osascript -e 'tell application "System Events" to make login item at end with properties {path:"${app.getPath('exe')}", name:"${appName}", hidden: true}'`;
      exec(script, callback);
    } else {
      const { exec } = require('child_process');
      const script = `echo "@${appName} ${app.getPath('exe')} --min" | tee -a ~/.config/autostart/${appName}.desktop > /dev/null`;
      exec(script, callback);
    }
  },
  remove: (key, callback) => {
    if (process.platform === 'win32') {
      const Registry = require('winreg');
      const regKey = new Registry({
        hive: Registry.HKCU,
        key: '\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
      });
      regKey.remove(key, callback);
    } else if (process.platform === 'darwin') {
      const { exec } = require('child_process');
      const script = `osascript -e 'tell application "System Events" to delete login item "${appName}"'`;
      exec(script, callback);
    } else {
      const { exec } = require('child_process');
      const script = `sed -i '/@${appName} ${app.getPath('exe')} --min/d' ~/.config/autostart/${appName}.desktop`;
      exec(script, callback);
    }
  },
  get: (key, callback) => {
    if (process.platform === 'win32') {
      const Registry = require('winreg');
      const regKey = new Registry({
        hive: Registry.HKCU,
        key: '\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
      });
      regKey.get(key, callback);
    } else if (process.platform === 'darwin') {
      const { exec } = require('child_process');
      const script = `osascript -e 'tell application "System Events" to get login item "${appName}"'`;
      exec(script, (err, stdout, stderr) => {
        if (err) {
          callback(false);
        } else {
          const hasMinimized = stdout.includes('--min');
          callback(hasMinimized);
        }
      });
    } else {
      const { exec } = require('child_process');
      const script = `grep -q '@${appName} ${app.getPath('exe')} --min' ~/.config/autostart/${appName}.desktop && echo 'true' || echo 'false'`;
      exec(script, (err, stdout, stderr) => {
        callback(stdout.trim() === 'true');
      });
    }
  }
};

function addToStartupWithArgs() {
  autoLaunchKey.set(appName, 'REG_SZ', `"${app.getPath('exe')}" --min`, function(err) {
    if (err) console.error('Error adding to startup:', err);
  });
}

function removeFromStartup() {
  autoLaunchKey.remove(appName, function(err) {
    if (err) console.error('Error removing from startup:', err);
  });
}

function checkStartupStatus(callback) {
  autoLaunchKey.get(appName, function(err, item) {
    if (err) {
      callback(false);
    } else {
      if (item && item.value) {
        const hasMinimizedArg = item.value.includes('--min');
        callback(hasMinimizedArg);
      } else {
        callback(false);
      }
    }
  });
}

function saveWindowConfig() {
  if (!mainWindow) return;

  const windowBounds = mainWindow.getBounds();
  const config = {
    width: windowBounds.width,
    height: windowBounds.height,
    x: windowBounds.x,
    y: windowBounds.y,
    lastUrl: mainWindow.webContents.getURL()
  };

  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }

  fs.writeFileSync(configPath, JSON.stringify(config));
}

function loadWindowConfig() {
  try {
    const configContent = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(configContent);
  } catch (e) {
    return { width: 800, height: 600, lastUrl: defaultUrl, x: undefined, y: undefined };
  }
}

function saveProxyConfig(config) {
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }
  fs.writeFileSync(proxyConfigPath, JSON.stringify(config));
}

function loadProxyConfig() {
  try {
    const configContent = fs.readFileSync(proxyConfigPath, 'utf8');
    return JSON.parse(configContent);
  } catch (e) {
    return { useProxy: false, proxyServer: defaultProxy };
  }
}

async function createWindow() {
  const { width, height, lastUrl, x, y } = loadWindowConfig();
  const customUserAgent = defaultUserAgent;

  const proxyConfig = loadProxyConfig();
  const ses = session.fromPartition('persist:app', { cache: false });

  if (proxyConfig.useProxy) {
    await ses.setProxy({ proxyRules: proxyConfig.proxyServer });
  } else {
    await ses.setProxy({ proxyRules: '' });
  }

  mainWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    backgroundColor: defaultBackgroundColor,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      nativeWindowOpen: true,
      sandbox: true,
      session: ses
    }
  });

  mainWindow.webContents.setUserAgent(customUserAgent);
  const urlToLoad = lastUrl || defaultUrl;
  mainWindow.loadURL(urlToLoad);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedURL(url)) {
      return { action: 'allow' };
    } else {
      shell.openExternal(url);
      return { action: 'deny' };
    }
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedURL(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
  mainWindow.webContents.on('wnew-window', (event, url) => {
    if (!isAllowedURL(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.on('close', (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      mainWindow.minimize();
    }
  });

  mainWindow.on('show', () => {
    isWindowVisible = true;
  });

  mainWindow.on('hide', () => {
    isWindowVisible = false;
  });

  mainWindow.on('resize', saveWindowConfig);
  mainWindow.on('move', saveWindowConfig);
  mainWindow.webContents.on('did-navigate', saveWindowConfig);
  mainWindow.on('close', saveWindowConfig);



  createMenu();
}

function createMenu() {
  const defaultMenu = Menu.getApplicationMenu();
  const template = defaultMenu ? defaultMenu.items.map(item => item) : [];
  const fileMenuIndex = template.findIndex(item => item.label === 'File');
  if (fileMenuIndex !== -1) {
    template.splice(fileMenuIndex, 1);
  }

  template.unshift({
    label: 'File',
    submenu: [
      {
        label: 'Proxy Settings',
        accelerator: 'CmdOrCtrl+P',
        click() {
          openProxySettings();
        }
      },
      {
        id: 'auto-launch', 
        label: 'Auto Launch',
        type: 'checkbox',
        checked: false,
        click(menuItem) {
          const isEnabled = menuItem.checked;
          if (isEnabled) {
            addToStartupWithArgs();
          } else {
            removeFromStartup();
          }
        }
      },
      {
        label: 'Exit',
        click: () => { app.isQuiting = true; app.quit(); }
      }
    ]
  });

  const viewMenu = template.find(item => item.label === 'View');
  if (viewMenu) {
    const newMenuItems = [];
    viewMenu.submenu.items.forEach((item, index) => {
      if (index === 0) {
        newMenuItems.push(new MenuItem({
          label: 'Back to Main Page',
          accelerator: 'CmdOrCtrl+H',
          click() {
            mainWindow.loadURL(defaultUrl);
          }
        }));
      }
      newMenuItems.push(item);
    });
    viewMenu.submenu.clear();
    newMenuItems.forEach(item => viewMenu.submenu.append(item));
  } else {
    template.push({
      label: 'View',
      submenu: [
        {
          label: 'Back to Main Page',
          accelerator: 'CmdOrCtrl+H',
          click() {
            mainWindow.loadURL(defaultUrl);
          }
        },
        { role: 'reload' },
        { role: 'forcereload' },
        { role: 'toggledevtools' },
        { type: 'separator' },
        { role: 'resetzoom' },
        { role: 'zoomin' },
        { role: 'zoomout' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ]
    });
  }

  const helpMenuIndex = template.findIndex(item => item.label === 'Help');
  if (helpMenuIndex !== -1) {
    template.splice(helpMenuIndex, 1);
  }

  const windowMenuIndex = template.findIndex(item => item.label === 'Window');
  if (windowMenuIndex !== -1) {
    template.splice(windowMenuIndex, 1);
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}


function openProxySettings() {
  const proxyConfig = loadProxyConfig();

  const proxySettingsWindow = new BrowserWindow({
    parent: mainWindow,
    modal: true,
    width: 350,
    height: 290,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  proxySettingsWindow.loadFile('proxy-settings.html');

  proxySettingsWindow.webContents.on('did-finish-load', () => {
    proxySettingsWindow.webContents.send('load-proxy-config', proxyConfig);
  });

  ipcMain.once('save-proxy-config', (event, newProxyConfig) => {
    saveProxyConfig(newProxyConfig);
    proxySettingsWindow.close();
    applyProxySettings(newProxyConfig);
  });
}

function applyProxySettings(proxyConfig) {
  const ses = session.fromPartition('persist:app', { cache: false });

  if (proxyConfig.useProxy) {
    ses.setProxy({ proxyRules: proxyConfig.proxyServer });
  } else {
    ses.setProxy({ proxyRules: '' });
  }
  if (mainWindow) {
    mainWindow.reload();
  }
}

app.on('ready', async () => {
  try {
    if (!app.requestSingleInstanceLock()) {
      app.quit();
    } else {
      const args = process.argv;
      const starMinimized = args.includes('--min');

      await createWindow();

      if (starMinimized) {
        mainWindow.minimize();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }

      checkStartupStatus((isEnabled) => {
        updateAutoLaunchMenuItem(isEnabled);
      });
    }
  } catch (error) {
    console.error('Error during app ready:', error);
  }
});

function updateAutoLaunchMenuItem(isEnabled) {
  const menu = Menu.getApplicationMenu();
  const autoLaunchMenuItem = menu.getMenuItemById('auto-launch');
  if (autoLaunchMenuItem) {
    autoLaunchMenuItem.checked = isEnabled;
  }
}

app.on('second-instance', (event, commandLine, workingDirectory) => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
      mainWindow.show();
      mainWindow.focus(); 
    } else {
      event.preventDefault();
      mainWindow.minimize();
    }
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (mainWindow.isVisible()) mainWindow.focus();
    else mainWindow.show();
  } else {
    createWindow();
  }
});