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
  update: {
    get: () => ipcRenderer.invoke('update:get'),
    check: () => ipcRenderer.invoke('update:check'),
    install: () => ipcRenderer.invoke('update:install'),
    onState: (cb: (s: unknown) => void) => {
      const h = (_e: unknown, st: unknown) => cb(st);
      ipcRenderer.on('update:state', h);
      return () => ipcRenderer.removeListener('update:state', h);
    },
  },
};

contextBridge.exposeInMainWorld('api', api);

export type Api = typeof api;
