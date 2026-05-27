const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  roiOpenFiles:     (opts)   => ipcRenderer.invoke('roi:openFiles', opts),
  roiAddFiles:      (opts)   => ipcRenderer.invoke('roi:addFiles', opts),
  roiReparse:       (opts)   => ipcRenderer.invoke('roi:reparse', opts),
  roiValidate:      (params) => ipcRenderer.invoke('roi:validate', params),
  roiExportCsv:     (opts)   => ipcRenderer.invoke('roi:exportCsv', opts),
  roiExportMainCsv: (params) => ipcRenderer.invoke('roi:exportMainCsv', params),
  roiExportParquet: (opts)   => ipcRenderer.invoke('roi:exportParquet', opts),
  roiExportSkipped: (params) => ipcRenderer.invoke('roi:exportSkipped', params),
  roiGetPresets:    ()       => ipcRenderer.invoke('roi:getPresets'),
  roiSavePresets:   (data)   => ipcRenderer.invoke('roi:savePresets', data),
  onFileProgress:   (cb)     => ipcRenderer.on('roi:fileProgress', (_, data) => cb(data)),
  offFileProgress:  ()       => ipcRenderer.removeAllListeners('roi:fileProgress'),
});
