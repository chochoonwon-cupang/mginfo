const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("brandStudio", {
  load: () => ipcRenderer.invoke("brand:load"),
  saveSettings: (payload) => ipcRenderer.invoke("brand:save-settings", payload),
  verifyToken: () => ipcRenderer.invoke("brand:verify-token"),
  saveDraft: (payload) => ipcRenderer.invoke("brand:save-draft", payload),
  deleteDraft: (id) => ipcRenderer.invoke("brand:delete-draft", id),
  preview: (payload) => ipcRenderer.invoke("brand:preview", payload),
  publishBatch: (payload) => ipcRenderer.invoke("brand:publish-batch", payload),
  clearSites: () => ipcRenderer.invoke("brand:clear-sites"),
  applyVendorGroups: (payload) => ipcRenderer.invoke("brand:apply-vendor-groups", payload),
  parseVendorGroupsText: (text) => ipcRenderer.invoke("brand:parse-vendor-groups-text", text),
  updateSite: (payload) => ipcRenderer.invoke("brand:update-site", payload),
  open: (url) => ipcRenderer.invoke("brand:open", url),
  onLog: (handler) => {
    const wrap = (_e, msg) => handler(msg);
    ipcRenderer.on("brand:log", wrap);
    return () => ipcRenderer.removeListener("brand:log", wrap);
  },
});
