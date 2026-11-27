// All the website can do with the computer: report its timer, and hear the
// small timer's buttons.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("studenvDesktop", {
  sendTimer: (state) => ipcRenderer.send("timer:state", state),
  onCommand: (listener) => {
    const handle = (_event, command) => listener(command);
    ipcRenderer.on("timer:command", handle);
    return () => ipcRenderer.removeListener("timer:command", handle);
  },
});
