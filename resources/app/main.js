const { app, BrowserWindow, ipcMain } = require('electron');

const util = require('util');
const exec = util.promisify(require('child_process').exec);
const path = require('path');
const fs = require('fs');

const rcedit = path.join(__dirname, 'rcedit.exe');

let win;

// Allow only a single instance of the app
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (win) { // Bring running app to front
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.on('ready', createWindow)

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })

  app.on('activate', () => {
    if (win === null) {
      createWindow()
    }
  })

  function createWindow() {
    win = new BrowserWindow({
      show: false, // Hidden until 'ready-to-show'.
      width: 515,
      height: 450,
      // frame: false,
      title: 'Hexe',
      icon: __dirname + '/dist/favicon.ico',
      webPreferences: {
        webSecurity: false,
        nodeIntegration: true
      },
      resizable: false,
      maximizable: false,
      transparent: true
    });

    let exePath = '';
    const exeDetails = {};

    async function getExeDetail(detail, exePath) {
      const { stdout } = await exec(`"${rcedit}" "${exePath}" --get-version-string "${detail}"`, { encoding: 'latin1' });
      exeDetails[detail] = stdout;
    }

    async function procExeDetails(sender, result) {
      exePath = result.filePaths[0];
      return await Promise.all([
        getExeDetail('FileDescription', exePath),
        getExeDetail('LegalCopyright', exePath),
        getExeDetail('FileVersion', exePath),
        getExeDetail('ProductName', exePath),
        getExeDetail('ProductVersion', exePath),
        getExeDetail('OriginalFilename', exePath),
        getExeDetail('InternalName', exePath)
      ]).then(() => sender.send('proc_success', exeDetails))
        .catch(() => sender.send('proc_success', exeDetails)); // Return to sender
    }

    ipcMain.on('proc_exe_details', (event, arg) => { // Received from sender
      procExeDetails(event.sender, arg)
    });

    async function setExeDetails(exeDetails) {
      const argsArr = [];

      if (exeDetails.IconPath) {
        argsArr.push(`--set-icon "${exeDetails.IconPath}"`);
      }
      if (exeDetails.FileDescription) {
        argsArr.push(`--set-version-string "FileDescription" "${exeDetails.FileDescription}"`);
      }
      if (exeDetails.LegalCopyright) {
        argsArr.push(`--set-version-string "LegalCopyright" "${exeDetails.LegalCopyright}"`);
      }
      if (exeDetails.FileVersion) {
        argsArr.push(`--set-file-version "${exeDetails.FileVersion}"`);
      }
      if (exeDetails.ProductName) {
        argsArr.push(`--set-version-string "ProductName" "${exeDetails.ProductName}"`);
      }
      if (exeDetails.ProductVersion) {
        argsArr.push(`--set-version-string "ProductVersion" "${exeDetails.ProductVersion}"`);
      }
      if (exeDetails.OriginalFilename) {
        argsArr.push(`--set-version-string "OriginalFilename" "${exeDetails.OriginalFilename}"`);
      }
      if (exeDetails.InternalName) {
        argsArr.push(`--set-version-string "InternalName" "${exeDetails.InternalName}"`);
      }

      const argsStr = argsArr.join(' ');

      return await exec(`"${rcedit}" "${exeDetails.ExePath}" ${argsStr}`, { encoding: 'utf8' });
    }

    async function applyExeDetails(sender, exeDetails) {
      setExeDetails(exeDetails)
        .then(res => {
          const dest = path.join(path.dirname(exePath), exeDetails.OriginalFilename);
          fs.rename(exePath, dest, function (err) {
            if (err) {
              sender.send('mod_error', err);
            } else {
              sender.send('mod_success', res);
            }
          });
        })
        .catch(err => sender.send('mod_error', err)); // Return to sender
    }

    ipcMain.on('apply_exe_details', (event, arg) => { // Received from sender
      applyExeDetails(event.sender, arg)
    });

    win.loadFile('dist/index.html'); // The file to launch at start up.

    // win.webContents.openDevTools();

    win.setMenu(null);

    win.once('ready-to-show', () => {
      win.show();
    });

    win.on('closed', () => { win = null });
  }
}