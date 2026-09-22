import { app, BrowserWindow, dialog, ipcMain, Menu } from "electron";
import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import { createDatabase } from "../src/domain/database";
import { isActivationCodeValid } from "../src/domain/activation";
import {
  cancelInvoice,
  createCustomer,
  createExpense,
  createProduct,
  createPurchase,
  createSale,
  createWithdrawal,
  getCustomerStatement,
  getDashboardSummary,
  getInvoiceDetails,
  getSettings,
  listAppointments,
  listAccounts,
  listFinancialTransactions,
  listParties,
  listProducts,
  listPurchaseInvoices,
  listSalesInvoices,
  listUnits,
  recordPayment,
  seedDefaults,
  setSetting,
  updateAppointmentStatus,
} from "../src/domain/services";
import type { InvoiceType } from "../src/domain/types";
import { rotateAutomaticBackups } from "../src/domain/backup";

let db: Database.Database | null = null;
let databasePath = "";
let mainWindow: BrowserWindow | null = null;
let isQuitting = false;
let backupInProgress = false;
const APP_LOGO_FILENAME = "logo-small-light-removebg-preview.png";

function applicationIconPath(): string | undefined {
  const candidates = [
    path.join(__dirname, "..", "..", "dist", APP_LOGO_FILENAME),
    path.join(process.cwd(), "public", APP_LOGO_FILENAME),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function startupLog(message: string, error?: unknown): void {
  try {
    const detail = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : error ? String(error) : "";
    const filename = path.join(app.getPath("userData"), "startup.log");
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.appendFileSync(filename, `[${new Date().toISOString()}] ${message}\n${detail}\n`, "utf8");
  } catch {
    // Startup logging must never prevent the application from opening.
  }
}

function requireDatabase(): Database.Database {
  if (!db) throw new Error("قاعدة البيانات غير جاهزة");
  return db;
}

function backupDirectory(): string {
  const configured = getSettings(requireDatabase()).backupDirectory;
  return configured || path.join(app.getPath("userData"), "backups");
}

function timestampForFilename(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function createBackupFile(directory: string, kind: "automatic" | "manual" = "automatic"): string {
  const currentDb = requireDatabase();
  fs.mkdirSync(directory, { recursive: true });
  currentDb.pragma("wal_checkpoint(TRUNCATE)");
  const filename = `marble-${kind === "manual" ? "manual-backup" : "backup"}-${timestampForFilename()}.sqlite`;
  const destination = path.join(directory, filename);
  fs.copyFileSync(databasePath, destination);
  if (kind === "automatic") rotateAutomaticBackups(directory, 3);
  return destination;
}

function restoreBackupFile(source: string): string {
  const sourceDb = new Database(source, { readonly: true });
  try {
    const version = sourceDb.prepare("SELECT value FROM schema_meta WHERE key = 'version'").get() as { value: string } | undefined;
    if (!version) throw new Error("ملف النسخة غير صالح");
  } finally {
    sourceDb.close();
  }
  const safetyCopy = createBackupFile(backupDirectory());
  requireDatabase().close();
  fs.copyFileSync(source, databasePath);
  db = createDatabase(databasePath);
  seedDefaults(requireDatabase());
  return safetyCopy;
}

function registerIpc(): void {
  ipcMain.handle("dashboard:summary", () => getDashboardSummary(requireDatabase()));
  ipcMain.handle("parties:list", (_event, kind?: "customer" | "supplier") => listParties(requireDatabase(), kind));
  ipcMain.handle("parties:create", (_event, input) => createCustomer(requireDatabase(), input));
  ipcMain.handle("parties:statement", (_event, id: string) => getCustomerStatement(requireDatabase(), id));
  ipcMain.handle("products:list", () => listProducts(requireDatabase()));
  ipcMain.handle("products:units", () => listUnits(requireDatabase()));
  ipcMain.handle("products:create", (_event, input) => createProduct(requireDatabase(), input));
  ipcMain.handle("purchases:list", () => listPurchaseInvoices(requireDatabase()));
  ipcMain.handle("purchases:create", (_event, input) => createPurchase(requireDatabase(), input));
  ipcMain.handle("invoices:details", (_event, invoiceType: InvoiceType, invoiceId: string) => getInvoiceDetails(requireDatabase(), { invoiceType, invoiceId }));
  ipcMain.handle("sales:list", () => listSalesInvoices(requireDatabase()));
  ipcMain.handle("sales:create", (_event, input) => createSale(requireDatabase(), input));
  ipcMain.handle("sales:cancel", (_event, id: string) => cancelInvoice(requireDatabase(), { invoiceType: "sale", invoiceId: id }));
  ipcMain.handle("payments:create", (_event, input) => recordPayment(requireDatabase(), input));
  ipcMain.handle("finance:transactions", () => listFinancialTransactions(requireDatabase()));
  ipcMain.handle("finance:accounts", () => listAccounts(requireDatabase()));
  ipcMain.handle("finance:expense", (_event, input) => createExpense(requireDatabase(), input));
  ipcMain.handle("finance:withdrawal", (_event, input) => createWithdrawal(requireDatabase(), input));
  ipcMain.handle("appointments:list", () => listAppointments(requireDatabase()));
  ipcMain.handle("appointments:update-status", (_event, id: string, status: string) => updateAppointmentStatus(requireDatabase(), id, status));
  ipcMain.handle("settings:get", () => getSettings(requireDatabase()));
  ipcMain.handle("settings:set", (_event, key: string, value: string) => setSetting(requireDatabase(), key, value));
  ipcMain.handle("activation:status", () => getSettings(requireDatabase()).activationStatus === "activated");
  ipcMain.handle("activation:activate", (_event, code: unknown) => {
    if (typeof code !== "string" || !isActivationCodeValid(code)) return false;
    setSetting(requireDatabase(), "activationStatus", "activated");
    setSetting(requireDatabase(), "activationActivatedAt", new Date().toISOString());
    return true;
  });
  ipcMain.handle("app:data-path", () => databasePath);
  ipcMain.handle("backup:choose-directory", async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, { properties: ["openDirectory", "createDirectory"] });
    const selected = result.canceled ? null : result.filePaths[0] ?? null;
    if (selected) setSetting(requireDatabase(), "backupDirectory", selected);
    return selected;
  });
  ipcMain.handle("backup:create", (_event, directory?: string) => createBackupFile(directory || backupDirectory(), "manual"));
  ipcMain.handle("backup:restore", async () => {
    if (!mainWindow) throw new Error("نافذة البرنامج غير جاهزة");
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openFile"],
      filters: [{ name: "Marble SQLite backup", extensions: ["sqlite"] }],
    });
    if (result.canceled || !result.filePaths[0]) throw new Error("تم إلغاء الاسترجاع");
    return restoreBackupFile(result.filePaths[0]);
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: "#f7f7f5",
    autoHideMenuBar: true,
    show: true,
    icon: applicationIconPath(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  mainWindow.setMenuBarVisibility(false);
  const showWindow = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.show();
    mainWindow.focus();
  };
  mainWindow.once("ready-to-show", showWindow);
  mainWindow.webContents.on("did-finish-load", showWindow);
  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    startupLog(`واجهة البرنامج فشلت في التحميل: ${errorCode} ${errorDescription} ${validatedURL}`);
    showWindow();
  });
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    startupLog(`عملية الواجهة توقفت: ${details.reason} ${details.exitCode}`);
    showWindow();
  });
  mainWindow.on("close", (event) => {
    if (isQuitting || backupInProgress) return;
    event.preventDefault();
    backupInProgress = true;
    try {
      createBackupFile(backupDirectory());
      isQuitting = true;
      mainWindow?.close();
    } catch (error) {
      backupInProgress = false;
      void dialog.showMessageBox(mainWindow!, {
        type: "warning",
        title: "تعذر إنشاء النسخة الاحتياطية",
        message: error instanceof Error ? error.message : "فشل إنشاء النسخة الاحتياطية",
        detail: "أعد المحاولة أو أغلق البرنامج يدويًا من خلال تأكيد الخروج بدون نسخة.",
        buttons: ["حسنًا"],
      });
    }
  });
  if (app.isPackaged) {
    void mainWindow.loadFile(path.join(__dirname, "..", "..", "dist", "index.html")).catch((error) => {
      startupLog("تعذر تحميل ملف الواجهة المعبأ", error);
      showWindow();
    });
  } else {
    void mainWindow.loadURL("http://127.0.0.1:5173").catch((error) => {
      startupLog("تعذر تحميل خادم التطوير", error);
      showWindow();
    });
  }
}

app.whenReady().then(() => {
  try {
    startupLog("بدء تشغيل إدارة الرخام");
    Menu.setApplicationMenu(null);
    databasePath = path.join(app.getPath("userData"), "marble-manager.sqlite");
    db = createDatabase(databasePath);
    seedDefaults(requireDatabase());
    registerIpc();
    createWindow();
    startupLog(`تم إنشاء النافذة: ${databasePath}`);
  } catch (error) {
    startupLog("فشل بدء تشغيل البرنامج", error);
    dialog.showErrorBox("تعذر تشغيل إدارة الرخام", error instanceof Error ? error.message : "حدث خطأ أثناء بدء البرنامج");
  }
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch((error) => {
  startupLog("فشل حدث app.whenReady", error);
  dialog.showErrorBox("تعذر تشغيل إدارة الرخام", error instanceof Error ? error.message : "حدث خطأ أثناء بدء البرنامج");
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (db) {
    db.close();
    db = null;
  }
});

export type { InvoiceType };
