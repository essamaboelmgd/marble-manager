import { contextBridge, ipcRenderer } from "electron";
import type { MarbleApi } from "../src/shared/api";

const api: MarbleApi = {
  dashboard: {
    summary: () => ipcRenderer.invoke("dashboard:summary"),
  },
  parties: {
    list: (kind) => ipcRenderer.invoke("parties:list", kind),
    create: (input) => ipcRenderer.invoke("parties:create", input),
    statement: (id) => ipcRenderer.invoke("parties:statement", id),
  },
  products: {
    list: () => ipcRenderer.invoke("products:list"),
    units: () => ipcRenderer.invoke("products:units"),
    create: (input) => ipcRenderer.invoke("products:create", input),
    update: (id, input) => ipcRenderer.invoke("products:update", id, input),
    delete: (id) => ipcRenderer.invoke("products:delete", id),
  },
  purchases: {
    list: () => ipcRenderer.invoke("purchases:list"),
    create: (input) => ipcRenderer.invoke("purchases:create", input),
  },
  invoices: {
    details: (invoiceType, invoiceId) => ipcRenderer.invoke("invoices:details", invoiceType, invoiceId),
  },
  sales: {
    list: () => ipcRenderer.invoke("sales:list"),
    create: (input) => ipcRenderer.invoke("sales:create", input),
    cancel: (id) => ipcRenderer.invoke("sales:cancel", id),
  },
  payments: {
    create: (input) => ipcRenderer.invoke("payments:create", input),
  },
  finance: {
    accounts: () => ipcRenderer.invoke("finance:accounts"),
    transactions: () => ipcRenderer.invoke("finance:transactions"),
    expense: (input) => ipcRenderer.invoke("finance:expense", input),
    withdrawal: (input) => ipcRenderer.invoke("finance:withdrawal", input),
  },
  appointments: {
    list: () => ipcRenderer.invoke("appointments:list"),
    updateStatus: (id, status) => ipcRenderer.invoke("appointments:update-status", id, status),
  },
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    set: (key, value) => ipcRenderer.invoke("settings:set", key, value),
  },
  activation: {
    status: () => ipcRenderer.invoke("activation:status"),
    activate: (code) => ipcRenderer.invoke("activation:activate", code),
  },
  backup: {
    chooseDirectory: () => ipcRenderer.invoke("backup:choose-directory"),
    create: (directory) => ipcRenderer.invoke("backup:create", directory),
    restore: () => ipcRenderer.invoke("backup:restore"),
  },
  app: {
    getDataPath: () => ipcRenderer.invoke("app:data-path"),
  },
};

contextBridge.exposeInMainWorld("marbleApi", api);
