import { contextBridge, ipcRenderer } from 'electron';

const api = {
  bank: {
    index: () => ipcRenderer.invoke('bank:index'),
    question: (id: string) => ipcRenderer.invoke('bank:question', id),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (patch: unknown) => ipcRenderer.invoke('settings:update', patch),
    setSecret: (name: 'llm' | 'desmos', value: string | null) => ipcRenderer.invoke('settings:setSecret', name, value),
    getDesmosKey: () => ipcRenderer.invoke('settings:getDesmosKey'),
  },
  store: {
    get: (name: string) => ipcRenderer.invoke('store:get', name),
    set: (name: string, data: unknown) => ipcRenderer.invoke('store:set', name, data),
  },
  ai: {
    complete: (req: unknown) => ipcRenderer.invoke('ai:complete', req),
    test: () => ipcRenderer.invoke('ai:test'),
  },
  app: {
    info: () => ipcRenderer.invoke('app:info'),
    openExternal: (url: string) => ipcRenderer.invoke('app:openExternal', url),
  },
};

contextBridge.exposeInMainWorld('api', api);

export type Api = typeof api;
