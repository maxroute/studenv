const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("miniTimer", {
  onState: (listener) => ipcRenderer.on("mini:state", (_event, state) => listener(state)),
  act: (action) => ipcRenderer.send("mini:action", action),
  ready: () => ipcRenderer.send("mini:ready"),
});
