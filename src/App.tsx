import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowDownRight,
  ArrowUpLeft,
  ArrowUpRight,
  Banknote,
  BarChart3,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  FileBarChart,
  FileText,
  LayoutDashboard,
  LockKeyhole,
  Package,
  Plus,
  Receipt,
  RefreshCw,
  Settings,
  ShoppingBag,
  ShoppingCart,
  SlidersHorizontal,
  Trash2,
  UserRound,
  Users,
  WalletCards,
  Warehouse,
} from "lucide-react";
import { toast } from "sonner";
import type {
  PartyRecord,
  ProductRecord,
  SaleLineInput,
} from "./domain/types";
import type { MarbleApi } from "./shared/api";

type View = "dashboard" | "customers" | "products" | "purchases" | "sales" | "finance" | "invoices" | "appointments" | "reports" | "settings";
type Summary = Awaited<ReturnType<MarbleApi["dashboard"]["summary"]>>;
type Party = PartyRecord;
type Product = ProductRecord;
type Unit = { id: string; name: string; symbol: string; quantityScale: number };
type SaleInvoice = {
  id: string;
  invoiceNumber: number;
  customerId: string;
  customerName: string;
  date: string;
  totalMinor: number;
  paidMinor: number;
  remainingMinor: number;
  status: string;
};
type PurchaseInvoice = {
  id: string;
  invoiceNumber: number;
  supplierId: string;
  supplierName: string;
  date: string;
  totalMinor: number;
  paidMinor: number;
  remainingMinor: number;
  status: string;
};
type Transaction = {
  id: string;
  accountId: string;
  accountName: string;
  direction: "in" | "out";
  amountMinor: number;
  kind: string;
  description: string;
  date: string;
};
type Account = { id: string; name: string; type: "cash" | "bank"; balanceMinor: number };
type Appointment = {
  id: string;
  customerId: string;
  customerName: string;
  saleInvoiceId: string;
  invoiceNumber: number;
  scheduledAt: string;
  status: string;
  notes: string;
};
type Statement = {
  party: Party;
  balanceMinor: number;
  invoices: Array<{ id: string; invoiceNumber: number; date: string; totalMinor: number; paidMinor: number; remainingMinor: number; status: string }>;
};

const emptySummary: Summary = {
  salesTotalMinor: 0,
  purchasesTotalMinor: 0,
  receivablesMinor: 0,
  payablesMinor: 0,
  cashBalanceMinor: 0,
  bankBalanceMinor: 0,
};

const appLogoPath = "./logo-small-light-removebg-preview.png";

const navGroups = [
  {
    label: "نظرة عامة",
    items: [{ id: "dashboard" as View, label: "الرئيسية", icon: LayoutDashboard }],
  },
  {
    label: "التشغيل",
    items: [
      { id: "customers" as View, label: "العملاء والمواعيد", icon: Users },
      { id: "appointments" as View, label: "المواعيد", icon: CalendarDays },
      { id: "products" as View, label: "المخزن والأصناف", icon: Warehouse },
      { id: "purchases" as View, label: "المشتريات", icon: ShoppingBag },
      { id: "sales" as View, label: "المبيعات", icon: ShoppingCart },
      { id: "invoices" as View, label: "الفواتير", icon: Receipt },
    ],
  },
  {
    label: "الحسابات",
    items: [
      { id: "finance" as View, label: "المالية", icon: WalletCards },
      { id: "reports" as View, label: "التقارير", icon: BarChart3 },
    ],
  },
  {
    label: "الإعدادات",
    items: [{ id: "settings" as View, label: "الإعدادات والنسخ", icon: Settings }],
  },
];

const viewTitles: Record<View, string> = {
  dashboard: "الرئيسية",
  customers: "العملاء والمواعيد",
  products: "المخزن والأصناف",
  purchases: "المشتريات",
  sales: "المبيعات",
  finance: "المالية",
  invoices: "الفواتير",
  appointments: "المواعيد",
  reports: "التقارير",
  settings: "الإعدادات والنسخ",
};

function money(minor: number): string {
  return `${(minor / 100).toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج.م`;
}

function quantity(scaled: number): string {
  return (scaled / 1000).toLocaleString("ar-EG", { maximumFractionDigits: 3 });
}

function dateLabel(date: string): string {
  return new Date(date).toLocaleDateString("ar-EG", { day: "numeric", month: "short", year: "numeric" });
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) return String((error as { message: string }).message);
  return "حدث خطأ غير متوقع";
}

async function hashPin(pin: string): Promise<string> {
  const bytes = new TextEncoder().encode(pin);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function escapePrintText(value: string): string {
  return value.replace(/[&<>\"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character] ?? character);
}

function printThermalStatement(statement: Statement): void {
  const printWindow = window.open("", "_blank", "width=420,height=720");
  if (!printWindow) {
    toast.error("اسمح بفتح نافذة الطباعة من إعدادات البرنامج");
    return;
  }
  const rows = statement.invoices.map((invoice) => `
    <tr><td>#${invoice.invoiceNumber}</td><td>${escapePrintText(dateLabel(invoice.date))}</td><td>${escapePrintText(money(invoice.totalMinor))}</td></tr>
    <tr class="sub-row"><td colspan="2">مدفوع: ${escapePrintText(money(invoice.paidMinor))}</td><td>متبقي: ${escapePrintText(money(invoice.remainingMinor))}</td></tr>
  `).join("");
  printWindow.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/><title>كشف حساب ${escapePrintText(statement.party.name)}</title><style>
    @page{size:80mm auto;margin:4mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:11px;color:#111;margin:0}h1{font-size:16px;margin:0 0 4px}p{margin:0 0 10px;color:#555;font-size:10px}.summary{border-top:1px solid #111;border-bottom:1px solid #111;padding:7px 0;margin:8px 0 10px;font-weight:bold}table{width:100%;border-collapse:collapse}th,td{padding:5px 0;text-align:right;border-bottom:1px dashed #bbb;font-size:10px}th{font-weight:bold}.sub-row td{color:#555;font-size:9px;border-bottom:1px solid #111}.footer{margin-top:12px;text-align:center;color:#666;font-size:9px}
  </style></head><body><h1>كشف حساب</h1><p>${escapePrintText(statement.party.name)}${statement.party.phone ? ` · ${escapePrintText(statement.party.phone)}` : ""}</p><div class="summary">الرصيد المستحق: ${escapePrintText(money(statement.balanceMinor))}</div><table><thead><tr><th>الفاتورة</th><th>التاريخ</th><th>الإجمالي</th></tr></thead><tbody>${rows || "<tr><td colspan=\"3\">لا توجد فواتير</td></tr>"}</tbody></table><div class="footer">تمت الطباعة من إدارة الرخام</div></body></html>`);
  printWindow.document.close();
  printWindow.focus();
  printWindow.setTimeout(() => { printWindow.print(); printWindow.close(); }, 250);
}

function App() {
  const [view, setView] = useState<View>("dashboard");
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [refreshToken, setRefreshToken] = useState(0);
  const [businessName, setBusinessName] = useState("إدارة الرخام");
  const [pinHash, setPinHash] = useState("");
  const [locked, setLocked] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [activationState, setActivationState] = useState<"checking" | "required" | "activated">("checking");

  const refresh = () => setRefreshToken((value) => value + 1);

  useEffect(() => {
    Promise.all([window.marbleApi.dashboard.summary(), window.marbleApi.settings.get(), window.marbleApi.activation.status()]).then(([nextSummary, settings, isActivated]) => {
      setSummary(nextSummary);
      setBusinessName(settings.businessName || "إدارة الرخام");
      setPinHash(settings.pinHash || "");
      if (!settingsLoaded) setLocked(Boolean(settings.pinHash));
      setActivationState(isActivated ? "activated" : "required");
      setSettingsLoaded(true);
    }).catch((error) => {
      toast.error(errorMessage(error));
      setActivationState("required");
      setSettingsLoaded(true);
    });
  }, [refreshToken]);

  if (!settingsLoaded || activationState === "checking") return <div className="boot-screen">جارٍ تجهيز البرنامج...</div>;
  if (activationState === "required") return <ActivationPage onActivated={() => setActivationState("activated")} />;
  if (locked && pinHash) return <PinLock expectedHash={pinHash} onUnlock={() => setLocked(false)} />;

  const renderPage = () => {
    const common = { refreshToken, onChanged: refresh };
    switch (view) {
      case "customers": return <CustomersPage {...common} />;
      case "products": return <ProductsPage {...common} />;
      case "purchases": return <PurchasesPage {...common} />;
      case "sales": return <SalesPage {...common} />;
      case "finance": return <FinancePage {...common} summary={summary} />;
      case "invoices": return <InvoicesPage {...common} />;
      case "appointments": return <AppointmentsPage {...common} />;
      case "reports": return <ReportsPage {...common} />;
      case "settings": return <SettingsPage {...common} />;
      default: return <DashboardPage summary={summary} refreshToken={refreshToken} onChanged={refresh} />;
    }
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark"><img className="brand-logo" src={appLogoPath} alt="" /></div>
          <div><strong>{businessName}</strong><span>نظام تشغيل محلي</span></div>
        </div>
        <div className="sidebar-scroll">
          {navGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <p className="nav-label">{group.label}</p>
              {group.items.map((item) => {
                const Icon = item.icon;
                return <button key={item.id} className={`nav-item ${view === item.id ? "active" : ""}`} onClick={() => setView(item.id)}><Icon size={18} /><span>{item.label}</span></button>;
              })}
            </div>
          ))}
        </div>
        <div className="sidebar-footer"><span className="status-dot" /> البيانات محفوظة على هذا الجهاز</div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div><p className="eyebrow">إدارة النشاط</p><h1>{viewTitles[view]}</h1></div>
          <div className="topbar-actions">
            <button className="icon-button" title="تحديث" onClick={refresh}><RefreshCw size={18} /></button>
            <span className="date-chip"><CalendarDays size={16} /> {new Date().toLocaleDateString("ar-EG", { day: "numeric", month: "long" })}</span>
          </div>
        </header>
        <div className="content-wrap">{renderPage()}</div>
      </main>
    </div>
  );
}

function ActivationPage({ onActivated }: { onActivated: () => void }) {
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!code) return;
    setChecking(true);
    setMessage("");
    try {
      const activated = await window.marbleApi.activation.activate(code);
      if (!activated) {
        setMessage("كود التفعيل غير صحيح");
        setCode("");
      } else {
        toast.success("تم تفعيل البرنامج على هذا الجهاز");
        onActivated();
      }
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setChecking(false);
    }
  };

  return <main className="pin-lock activation-page"><section className="pin-lock-card"><div className="brand-mark"><img className="brand-logo" src={appLogoPath} alt="" /></div><h1>تفعيل إدارة الرخام</h1><p>أدخل كود التفعيل لأول مرة لفتح البرنامج على هذا الجهاز.</p><form className="form-stack" onSubmit={submit}><Field label="كود التفعيل"><input className="activation-input" autoFocus autoComplete="off" spellCheck={false} type="password" value={code} onChange={(event) => { setCode(event.target.value); setMessage(""); }} placeholder="أدخل الكود" /></Field>{message && <span className="pin-error">{message}</span>}<button className="primary-button" type="submit" disabled={checking}>{checking ? "جارٍ التحقق..." : "تفعيل البرنامج"}</button></form></section></main>;
}

function PinLock({ expectedHash, onUnlock }: { expectedHash: string; onUnlock: () => void }) {
  const [pin, setPin] = useState("");
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState("");
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!pin) return;
    setChecking(true);
    try {
      if ((await hashPin(pin)) !== expectedHash) {
        setMessage("الرمز غير صحيح");
        setPin("");
      } else {
        onUnlock();
      }
    } catch {
      setMessage("تعذر التحقق من الرمز");
    } finally {
      setChecking(false);
    }
  };
  return <main className="pin-lock"><section className="pin-lock-card"><div className="brand-mark"><LockKeyhole size={24} /></div><h1>إدارة الرخام</h1><p>أدخل الـ PIN لفتح بيانات هذا الجهاز.</p><form className="form-stack" onSubmit={submit}><Field label="الرمز السري"><input autoFocus inputMode="numeric" type="password" maxLength={8} value={pin} onChange={(event) => { setPin(event.target.value.replace(/\D/g, "")); setMessage(""); }} placeholder="••••" /></Field>{message && <span className="pin-error">{message}</span>}<button className="primary-button" type="submit" disabled={checking}>{checking ? "جارٍ التحقق..." : "فتح البرنامج"}</button></form></section></main>;
}

function PageIntro({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <div className="page-intro"><div><h2>{title}</h2><p>{description}</p></div>{action}</div>;
}

function StatCard({ label, value, hint, tone = "stone", icon: Icon }: { label: string; value: string; hint: string; tone?: string; icon: typeof WalletCards }) {
  return <div className={`stat-card tone-${tone}`}><div className="stat-icon"><Icon size={20} /></div><div><span>{label}</span><strong>{value}</strong><small>{hint}</small></div></div>;
}

function DashboardPage({ summary, refreshToken }: { summary: Summary; refreshToken: number; onChanged: () => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  useEffect(() => {
    window.marbleApi.products.list().then((items) => setProducts(items as Product[])).catch(() => undefined);
    window.marbleApi.appointments.list().then((items) => setAppointments(items as Appointment[])).catch(() => undefined);
  }, [refreshToken]);
  const lowStock = products.filter((product) => product.stockQtyScaled <= product.minStockQtyScaled);
  return <>
    <PageIntro title="صباح الخير 👋" description="صورة سريعة لحركة محل الرخام اليوم." action={<span className="local-badge"><span className="status-dot" /> يعمل محليًا</span>} />
    <div className="stats-grid">
      <StatCard label="مبيعات الفترة" value={money(summary.salesTotalMinor)} hint="إجمالي الفواتير المفتوحة" tone="green" icon={ShoppingCart} />
      <StatCard label="المستحق من العملاء" value={money(summary.receivablesMinor)} hint="رصيد يحتاج متابعة" tone="amber" icon={ArrowDownLeft} />
      <StatCard label="المطلوب للموردين" value={money(summary.payablesMinor)} hint="التزامات المشتريات" tone="rose" icon={ArrowUpRight} />
      <StatCard label="الرصيد المتاح" value={money(summary.cashBalanceMinor + summary.bankBalanceMinor)} hint={`خزينة ${money(summary.cashBalanceMinor)} · بنك ${money(summary.bankBalanceMinor)}`} tone="blue" icon={Banknote} />
    </div>
    <div className="dashboard-grid">
      <section className="panel panel-large"><div className="panel-heading"><div><h3>المواعيد القادمة</h3><p>التركيبات المرتبطة بفواتير البيع</p></div><CalendarDays size={20} /></div>
        {appointments.length === 0 ? <EmptyState text="لا توجد مواعيد مسجلة" /> : <div className="list-stack">{appointments.slice(0, 5).map((appointment) => <div className="list-row" key={appointment.id}><div className="avatar avatar-purple"><CalendarDays size={16} /></div><div className="row-main"><strong>{appointment.customerName}</strong><span>فاتورة #{appointment.invoiceNumber} · {dateLabel(appointment.scheduledAt)}</span></div><StatusBadge value={appointment.status} /></div>)}</div>}
      </section>
      <section className="panel"><div className="panel-heading"><div><h3>تنبيهات المخزون</h3><p>أصناف وصلت لحد الطلب</p></div><Package size={20} /></div>
        {lowStock.length === 0 ? <EmptyState text="المخزون في حالة جيدة" /> : <div className="list-stack">{lowStock.slice(0, 5).map((product) => <div className="list-row" key={product.id}><div className="avatar avatar-amber"><Package size={16} /></div><div className="row-main"><strong>{product.name}</strong><span>{quantity(product.stockQtyScaled)} متاح · الحد {quantity(product.minStockQtyScaled)}</span></div><span className="warning-text">منخفض</span></div>)}</div>}
      </section>
    </div>
    <section className="quick-actions"><h3>اختصارات التشغيل</h3><div className="quick-grid"><QuickAction label="فاتورة مبيعات" icon={ShoppingCart} /><QuickAction label="فاتورة شراء" icon={ShoppingBag} /><QuickAction label="إضافة عميل" icon={UserRound} /><QuickAction label="إضافة صنف" icon={Package} /></div></section>
  </>;
}

function QuickAction({ label, icon: Icon }: { label: string; icon: typeof Package }) {
  return <button className="quick-action" onClick={() => toast.info(`افتح قسم ${label} من القائمة الجانبية`)}><span><Icon size={18} /></span>{label}<ArrowDownLeft size={15} /></button>;
}

function EmptyState({ text }: { text: string }) { return <div className="empty-state"><FileText size={28} /><span>{text}</span></div>; }
function StatusBadge({ value }: { value: string }) {
  const labels: Record<string, string> = { open: "مفتوحة", cancelled: "ملغى", scheduled: "مجدول", confirmed: "مؤكد", completed: "منفذ" };
  return <span className={`status-badge status-${value}`}>{labels[value] || value}</span>;
}

function CustomersPage({ refreshToken, onChanged }: { refreshToken: number; onChanged: () => void }) {
  const [customers, setCustomers] = useState<Party[]>([]);
  const [form, setForm] = useState({ name: "", phone: "", address: "" });
  const [selected, setSelected] = useState<Statement | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<Record<string, string>>({});
  const load = () => window.marbleApi.parties.list("customer").then((items) => setCustomers(items as Party[])).catch((error) => toast.error(errorMessage(error)));
  useEffect(() => { load(); }, [refreshToken]);
  const addCustomer = async (event: React.FormEvent) => {
    event.preventDefault();
    try { await window.marbleApi.parties.create(form); setForm({ name: "", phone: "", address: "" }); toast.success("تم إضافة العميل"); await load(); onChanged(); } catch (error) { toast.error(errorMessage(error)); }
  };
  const openStatement = async (id: string) => { try { setSelected((await window.marbleApi.parties.statement(id)) as Statement); } catch (error) { toast.error(errorMessage(error)); } };
  const pay = async (invoiceId: string) => {
    const amountMinor = Math.round(Number(paymentAmount[invoiceId] || 0) * 100);
    try { await window.marbleApi.payments.create({ invoiceType: "sale", invoiceId, accountId: "account-cash-main", amountMinor, method: "cash" }); toast.success("تم تسجيل الدفعة"); if (selected) await openStatement(selected.party.id); onChanged(); } catch (error) { toast.error(errorMessage(error)); }
  };
  return <>
    <PageIntro title="العملاء" description="ملف كامل لكل عميل، فواتيره ودفعاته ورصيده." />
    <div className="split-layout">
      <section className="panel"><div className="panel-heading"><div><h3>إضافة عميل</h3><p>سجل البيانات الأساسية فقط</p></div><UserRound size={20} /></div><form className="form-stack" onSubmit={addCustomer}><Field label="اسم العميل" required><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="مثال: محمد علي" /></Field><Field label="رقم الهاتف"><input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="01xxxxxxxxx" /></Field><Field label="العنوان"><input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} placeholder="العنوان" /></Field><button className="primary-button" type="submit"><Plus size={17} /> حفظ العميل</button></form></section>
      <section className="panel panel-large"><div className="panel-heading"><div><h3>دليل العملاء</h3><p>{customers.length} عميل مسجل</p></div><Users size={20} /></div>{customers.length === 0 ? <EmptyState text="لم تضف عملاء بعد" /> : <div className="table-wrap"><table><thead><tr><th>الاسم</th><th>الهاتف</th><th>العنوان</th><th>إجراء</th></tr></thead><tbody>{customers.map((customer) => <tr key={customer.id}><td className="strong-cell">{customer.name}</td><td>{customer.phone || "—"}</td><td>{customer.address || "—"}</td><td><button className="text-button" onClick={() => openStatement(customer.id)}>كشف الحساب <ArrowDownLeft size={14} /></button></td></tr>)}</tbody></table></div>}</section>
    </div>
    {selected && <section className="panel statement-panel" id="print-area"><div className="panel-heading"><div><h3>كشف حساب: {selected.party.name}</h3><p>{selected.party.phone || "بدون هاتف"} · الرصيد الحالي {money(selected.balanceMinor)}</p></div><div className="button-row"><button className="ghost-button" onClick={() => window.print()}><FileText size={16} /> A4</button><button className="ghost-button" onClick={() => printThermalStatement(selected)}><Receipt size={16} /> 80mm</button></div></div><div className="table-wrap"><table><thead><tr><th>الفاتورة</th><th>التاريخ</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th><th>تحصيل</th></tr></thead><tbody>{selected.invoices.map((invoice) => <tr key={invoice.id}><td>#{invoice.invoiceNumber}</td><td>{dateLabel(invoice.date)}</td><td>{money(invoice.totalMinor)}</td><td className="positive-text">{money(invoice.paidMinor)}</td><td className="negative-text">{money(invoice.remainingMinor)}</td><td>{invoice.remainingMinor > 0 && invoice.status === "open" ? <div className="inline-payment"><input type="number" min="0" placeholder="ج.م" value={paymentAmount[invoice.id] || ""} onChange={(event) => setPaymentAmount({ ...paymentAmount, [invoice.id]: event.target.value })} /><button className="small-button" onClick={() => pay(invoice.id)}>تحصيل</button></div> : <span className="muted">مكتملة</span>}</td></tr>)}</tbody></table></div></section>}
  </>;
}

function ProductsPage({ refreshToken, onChanged }: { refreshToken: number; onChanged: () => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [form, setForm] = useState({ name: "", unitId: "unit-cubic-meter", purchasePrice: "", salePrice: "", minStock: "" });
  const load = () => Promise.all([window.marbleApi.products.list(), window.marbleApi.products.units()]).then(([items, unitItems]) => { setProducts(items as Product[]); setUnits(unitItems as Unit[]); }).catch((error) => toast.error(errorMessage(error)));
  useEffect(() => { load(); }, [refreshToken]);
  const addProduct = async (event: React.FormEvent) => {
    event.preventDefault();
    try { await window.marbleApi.products.create({ name: form.name, unitId: form.unitId, purchasePriceMinor: Math.round(Number(form.purchasePrice || 0) * 100), salePriceMinor: Math.round(Number(form.salePrice || 0) * 100), minStockQtyScaled: Math.round(Number(form.minStock || 0) * 1000) }); toast.success("تم إضافة الصنف"); setForm({ name: "", unitId: form.unitId, purchasePrice: "", salePrice: "", minStock: "" }); await load(); onChanged(); } catch (error) { toast.error(errorMessage(error)); }
  };
  return <><PageIntro title="المخزن والأصناف" description="مخزن رئيسي واحد مع وحدات قياس مناسبة لتجارة الرخام." /><div className="split-layout"><section className="panel"><div className="panel-heading"><div><h3>إضافة صنف</h3><p>الكمية تزيد من المشتريات وتقل من المبيعات</p></div><Package size={20} /></div><form className="form-stack" onSubmit={addProduct}><Field label="اسم الصنف" required><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="رخام كرارا" /></Field><Field label="الوحدة"><select value={form.unitId} onChange={(event) => setForm({ ...form, unitId: event.target.value })}>{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name} ({unit.symbol})</option>)}</select></Field><div className="form-grid"><Field label="سعر الشراء"><input type="number" min="0" value={form.purchasePrice} onChange={(event) => setForm({ ...form, purchasePrice: event.target.value })} /></Field><Field label="سعر البيع"><input type="number" min="0" value={form.salePrice} onChange={(event) => setForm({ ...form, salePrice: event.target.value })} /></Field></div><Field label="حد إعادة الطلب"><input type="number" min="0" step="0.001" value={form.minStock} onChange={(event) => setForm({ ...form, minStock: event.target.value })} /></Field><button className="primary-button" type="submit"><Plus size={17} /> حفظ الصنف</button></form></section><section className="panel panel-large"><div className="panel-heading"><div><h3>رصيد المخزن</h3><p>{products.length} صنف مسجل · المخزن الرئيسي</p></div><Warehouse size={20} /></div>{products.length === 0 ? <EmptyState text="لم تضف أصناف بعد" /> : <div className="table-wrap"><table><thead><tr><th>الصنف</th><th>الوحدة</th><th>الرصيد</th><th>متوسط التكلفة</th><th>سعر البيع</th><th>الحالة</th></tr></thead><tbody>{products.map((product) => <tr key={product.id}><td className="strong-cell">{product.name}</td><td>{units.find((unit) => unit.id === product.unitId)?.symbol || "وحدة"}</td><td className="strong-cell">{quantity(product.stockQtyScaled)}</td><td>{money(product.avgCostMinor)}</td><td>{money(product.salePriceMinor)}</td><td>{product.stockQtyScaled <= product.minStockQtyScaled ? <span className="status-badge status-warning">منخفض</span> : <span className="status-badge status-complete">متاح</span>}</td></tr>)}</tbody></table></div>}</section></div></>;
}

type PurchaseLine = { productId: string; qty: string; price: string };
function PurchasesPage({ refreshToken, onChanged }: { refreshToken: number; onChanged: () => void }) {
  const [suppliers, setSuppliers] = useState<Party[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [form, setForm] = useState({ supplierId: "", paid: "", accountId: "account-cash-main", method: "cash" });
  const [newSupplier, setNewSupplier] = useState({ name: "", phone: "" });
  const [lines, setLines] = useState<PurchaseLine[]>([{ productId: "", qty: "", price: "" }]);
  const load = () => Promise.all([window.marbleApi.parties.list("supplier"), window.marbleApi.products.list(), window.marbleApi.purchases.list(), window.marbleApi.finance.accounts()]).then(([s, p, i, a]) => { setSuppliers(s as Party[]); setProducts(p as Product[]); setInvoices(i as PurchaseInvoice[]); setAccounts(a as Account[]); }).catch((error) => toast.error(errorMessage(error)));
  useEffect(() => { load(); }, [refreshToken]);
  const total = lines.reduce((sum, line) => sum + Math.round(Number(line.qty || 0) * Number(line.price || 0) * 100), 0);
  const addSupplier = async () => { try { const supplier = await window.marbleApi.parties.create({ ...newSupplier, kind: "supplier" }); setNewSupplier({ name: "", phone: "" }); setForm({ ...form, supplierId: (supplier as Party).id }); await load(); toast.success("تم إضافة المورد"); } catch (error) { toast.error(errorMessage(error)); } };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    try { await window.marbleApi.purchases.create({ supplierId: form.supplierId, accountId: form.accountId, method: form.method as "cash" | "bank" | "transfer" | "card" | "cheque" | "other", paidMinor: Math.round(Number(form.paid || 0) * 100), items: lines.filter((line) => line.productId && Number(line.qty) > 0).map((line) => ({ productId: line.productId, qtyScaled: Math.round(Number(line.qty) * 1000), unitPriceMinor: Math.round(Number(line.price) * 100) })) }); toast.success("تم حفظ فاتورة الشراء وتحديث المخزن"); setForm({ supplierId: "", paid: "", accountId: "account-cash-main", method: "cash" }); setLines([{ productId: "", qty: "", price: "" }]); await load(); onChanged(); } catch (error) { toast.error(errorMessage(error)); }
  };
  return <><PageIntro title="المشتريات" description="سجل التوريد والرصيد المستحق للموردين." /><div className="split-layout"><section className="panel"><div className="panel-heading"><div><h3>فاتورة شراء جديدة</h3><p>اختر الخزينة أو البنك الذي تم الدفع منه</p></div><ShoppingBag size={20} /></div><form className="form-stack" onSubmit={save}><Field label="المورد" required><select value={form.supplierId} onChange={(event) => setForm({ ...form, supplierId: event.target.value })}><option value="">اختر المورد</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></Field><div className="inline-create"><input placeholder="مورد جديد" value={newSupplier.name} onChange={(event) => setNewSupplier({ ...newSupplier, name: event.target.value })} /><input placeholder="الهاتف" value={newSupplier.phone} onChange={(event) => setNewSupplier({ ...newSupplier, phone: event.target.value })} /><button type="button" className="small-button" onClick={addSupplier}><Plus size={14} /> إضافة</button></div><div className="line-items">{lines.map((line, index) => <div className="line-item" key={index}><select value={line.productId} onChange={(event) => updatePurchaseLine(lines, setLines, index, "productId", event.target.value)}><option value="">الصنف</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select><input type="number" min="0" step="0.001" placeholder="الكمية" value={line.qty} onChange={(event) => updatePurchaseLine(lines, setLines, index, "qty", event.target.value)} /><input type="number" min="0" placeholder="سعر الوحدة" value={line.price} onChange={(event) => updatePurchaseLine(lines, setLines, index, "price", event.target.value)} />{lines.length > 1 && <button type="button" className="remove-line" onClick={() => setLines(lines.filter((_, i) => i !== index))}><Trash2 size={15} /></button>}</div>)}</div><button type="button" className="outline-button" onClick={() => setLines([...lines, { productId: "", qty: "", price: "" }])}><Plus size={16} /> إضافة صنف</button><div className="form-grid"><Field label="المدفوع الآن"><input type="number" min="0" value={form.paid} onChange={(event) => setForm({ ...form, paid: event.target.value })} /></Field><Field label="طريقة الدفع"><select value={form.method} onChange={(event) => setForm({ ...form, method: event.target.value })}><option value="cash">نقدي</option><option value="transfer">تحويل</option><option value="card">بطاقة</option><option value="cheque">شيك</option></select></Field></div><Field label="الحساب"><select value={form.accountId} onChange={(event) => setForm({ ...form, accountId: event.target.value })}>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></Field><div className="total-line"><span>الإجمالي</span><strong>{money(total)}</strong></div><button className="primary-button" type="submit"><Receipt size={17} /> حفظ الفاتورة</button></form></section><section className="panel panel-large"><div className="panel-heading"><div><h3>فواتير المشتريات</h3><p>{invoices.length} فاتورة</p></div><FileText size={20} /></div><InvoiceTable type="purchase" rows={invoices} /></section></div></>;
}

function updatePurchaseLine(lines: PurchaseLine[], setLines: (value: PurchaseLine[]) => void, index: number, key: keyof PurchaseLine, value: string) { const next = [...lines]; next[index] = { ...next[index], [key]: value }; setLines(next); }

type SaleLine = { kind: "stock" | "extra"; productId: string; name: string; qty: string; price: string };
function SalesPage({ refreshToken, onChanged }: { refreshToken: number; onChanged: () => void }) {
  const [customers, setCustomers] = useState<Party[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [invoices, setInvoices] = useState<SaleInvoice[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [form, setForm] = useState({ customerId: "", paid: "", installationDate: "", accountId: "account-cash-main", method: "cash" });
  const [newCustomer, setNewCustomer] = useState({ name: "", phone: "" });
  const [lines, setLines] = useState<SaleLine[]>([{ kind: "stock", productId: "", name: "", qty: "", price: "" }]);
  const load = () => Promise.all([window.marbleApi.parties.list("customer"), window.marbleApi.products.list(), window.marbleApi.sales.list(), window.marbleApi.finance.accounts()]).then(([c, p, i, a]) => { setCustomers(c as Party[]); setProducts(p as Product[]); setInvoices(i as SaleInvoice[]); setAccounts(a as Account[]); }).catch((error) => toast.error(errorMessage(error)));
  useEffect(() => { load(); }, [refreshToken]);
  const total = lines.reduce((sum, line) => sum + Math.round(Number(line.qty || 0) * Number(line.price || 0) * 100), 0);
  const addCustomer = async () => { try { const customer = await window.marbleApi.parties.create({ ...newCustomer, kind: "customer" }); setNewCustomer({ name: "", phone: "" }); setForm({ ...form, customerId: (customer as Party).id }); await load(); toast.success("تم إضافة العميل"); } catch (error) { toast.error(errorMessage(error)); } };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const items: SaleLineInput[] = lines.filter((line) => (line.kind === "stock" ? line.productId : line.name) && Number(line.qty) > 0).map((line) => line.kind === "stock" ? { kind: "stock", productId: line.productId, qtyScaled: Math.round(Number(line.qty) * 1000), unitPriceMinor: Math.round(Number(line.price) * 100) } : { kind: "extra", name: line.name, qtyScaled: Math.round(Number(line.qty) * 1000), unitPriceMinor: Math.round(Number(line.price) * 100) });
    try { await window.marbleApi.sales.create({ customerId: form.customerId, accountId: form.accountId, method: form.method as "cash" | "bank" | "transfer" | "card" | "cheque" | "other", paidMinor: Math.round(Number(form.paid || 0) * 100), items, installation: form.installationDate ? { scheduledAt: `${form.installationDate}T09:00:00.000Z` } : undefined }); toast.success("تم حفظ فاتورة البيع وتحديث حساب العميل"); setForm({ customerId: "", paid: "", installationDate: "", accountId: "account-cash-main", method: "cash" }); setLines([{ kind: "stock", productId: "", name: "", qty: "", price: "" }]); await load(); onChanged(); } catch (error) { toast.error(errorMessage(error)); }
  };
  return <><PageIntro title="المبيعات" description="فاتورة مباشرة للعميل مع دفعة وموعد تركيب اختياري." /><div className="split-layout"><section className="panel"><div className="panel-heading"><div><h3>فاتورة بيع جديدة</h3><p>الرصيد لا يسمح ببيع كمية أكبر من المخزن</p></div><ShoppingCart size={20} /></div><form className="form-stack" onSubmit={save}><Field label="العميل" required><select value={form.customerId} onChange={(event) => setForm({ ...form, customerId: event.target.value })}><option value="">اختر العميل</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></Field><div className="inline-create"><input placeholder="عميل جديد" value={newCustomer.name} onChange={(event) => setNewCustomer({ ...newCustomer, name: event.target.value })} /><input placeholder="الهاتف" value={newCustomer.phone} onChange={(event) => setNewCustomer({ ...newCustomer, phone: event.target.value })} /><button type="button" className="small-button" onClick={addCustomer}><Plus size={14} /> إضافة</button></div><div className="line-items">{lines.map((line, index) => <div className="line-item sale-line" key={index}><select value={line.kind} onChange={(event) => updateSaleLine(lines, setLines, index, "kind", event.target.value as "stock" | "extra")}><option value="stock">صنف</option><option value="extra">إضافي</option></select>{line.kind === "stock" ? <select value={line.productId} onChange={(event) => { const product = products.find((item) => item.id === event.target.value); updateSaleLine(lines, setLines, index, "productId", event.target.value); if (product) { updateSaleLine(lines, setLines, index, "price", String(product.salePriceMinor / 100)); } }}><option value="">الصنف</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name} · {quantity(product.stockQtyScaled)}</option>)}</select> : <input placeholder="اسم البند الإضافي" value={line.name} onChange={(event) => updateSaleLine(lines, setLines, index, "name", event.target.value)} />}<input type="number" min="0" step="0.001" placeholder="الكمية" value={line.qty} onChange={(event) => updateSaleLine(lines, setLines, index, "qty", event.target.value)} /><input type="number" min="0" placeholder="سعر الوحدة" value={line.price} onChange={(event) => updateSaleLine(lines, setLines, index, "price", event.target.value)} />{lines.length > 1 && <button type="button" className="remove-line" onClick={() => setLines(lines.filter((_, i) => i !== index))}><Trash2 size={15} /></button>}</div>)}</div><button type="button" className="outline-button" onClick={() => setLines([...lines, { kind: "extra", productId: "", name: "", qty: "1", price: "" }])}><Plus size={16} /> إضافة بند إضافي</button><div className="form-grid"><Field label="المدفوع الآن"><input type="number" min="0" value={form.paid} onChange={(event) => setForm({ ...form, paid: event.target.value })} /></Field><Field label="طريقة الدفع"><select value={form.method} onChange={(event) => setForm({ ...form, method: event.target.value })}><option value="cash">نقدي</option><option value="transfer">تحويل</option><option value="card">بطاقة</option><option value="cheque">شيك</option></select></Field></div><div className="form-grid"><Field label="الحساب"><select value={form.accountId} onChange={(event) => setForm({ ...form, accountId: event.target.value })}>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></Field><Field label="موعد التركيب"><input type="date" value={form.installationDate} onChange={(event) => setForm({ ...form, installationDate: event.target.value })} /></Field></div><div className="total-line"><span>الإجمالي</span><strong>{money(total)}</strong></div><button className="primary-button" type="submit"><Receipt size={17} /> حفظ الفاتورة</button></form></section><section className="panel panel-large"><div className="panel-heading"><div><h3>فواتير المبيعات</h3><p>{invoices.length} فاتورة</p></div><FileText size={20} /></div><InvoiceTable type="sale" rows={invoices} onCancel={async (id) => { try { await window.marbleApi.sales.cancel(id); toast.success("تم إلغاء الفاتورة وعكس الحركات"); await load(); onChanged(); } catch (error) { toast.error(errorMessage(error)); } }} /></section></div></>;
}

function updateSaleLine(lines: SaleLine[], setLines: (value: SaleLine[]) => void, index: number, key: keyof SaleLine, value: string | "stock" | "extra") { const next = [...lines]; next[index] = { ...next[index], [key]: value }; setLines(next); }

function InvoiceTable({ type, rows, onCancel }: { type: "sale" | "purchase"; rows: SaleInvoice[] | PurchaseInvoice[]; onCancel?: (id: string) => void }) {
  return rows.length === 0 ? <EmptyState text="لا توجد فواتير بعد" /> : <div className="table-wrap"><table><thead><tr><th>الرقم</th><th>{type === "sale" ? "العميل" : "المورد"}</th><th>التاريخ</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th><th>الحالة</th>{onCancel && <th>إجراء</th>}</tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>#{row.invoiceNumber}</td><td className="strong-cell">{type === "sale" ? (row as SaleInvoice).customerName : (row as PurchaseInvoice).supplierName}</td><td>{dateLabel(row.date)}</td><td>{money(row.totalMinor)}</td><td className="positive-text">{money(row.paidMinor)}</td><td className="negative-text">{money(row.remainingMinor)}</td><td><StatusBadge value={row.status} /></td>{onCancel && <td>{row.status === "open" && <button className="text-button danger" onClick={() => onCancel(row.id)}>إلغاء</button>}</td>}</tr>)}</tbody></table></div>;
}

function FinancePage({ refreshToken, onChanged, summary }: { refreshToken: number; onChanged: () => void; summary: Summary }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [expense, setExpense] = useState({ category: "", amount: "", notes: "", accountId: "account-cash-main" });
  const [withdrawal, setWithdrawal] = useState({ amount: "", notes: "", accountId: "account-cash-main" });
  const load = () => Promise.all([window.marbleApi.finance.transactions(), window.marbleApi.finance.accounts()]).then(([items, accountItems]) => { setTransactions(items as Transaction[]); setAccounts(accountItems as Account[]); }).catch((error) => toast.error(errorMessage(error)));
  useEffect(() => { load(); }, [refreshToken]);
  const saveExpense = async (event: React.FormEvent) => { event.preventDefault(); try { await window.marbleApi.finance.expense({ accountId: expense.accountId, category: expense.category, amountMinor: Math.round(Number(expense.amount) * 100), notes: expense.notes }); toast.success("تم تسجيل المصروف"); setExpense({ category: "", amount: "", notes: "", accountId: "account-cash-main" }); await load(); onChanged(); } catch (error) { toast.error(errorMessage(error)); } };
  const saveWithdrawal = async (event: React.FormEvent) => { event.preventDefault(); try { await window.marbleApi.finance.withdrawal({ accountId: withdrawal.accountId, amountMinor: Math.round(Number(withdrawal.amount) * 100), notes: withdrawal.notes }); toast.success("تم تسجيل المسحوب"); setWithdrawal({ amount: "", notes: "", accountId: "account-cash-main" }); await load(); onChanged(); } catch (error) { toast.error(errorMessage(error)); } };
  return <><PageIntro title="المالية" description="تابع الخزينة والبنك والمصروفات والمسحوبات من شاشة واحدة." /><div className="stats-grid compact"><StatCard label="الخزينة" value={money(summary.cashBalanceMinor)} hint="الرصيد الحالي" tone="amber" icon={Banknote} /><StatCard label="البنك" value={money(summary.bankBalanceMinor)} hint="الرصيد الحالي" tone="blue" icon={WalletCards} /><StatCard label="حركة اليوم" value={`${transactions.length}`} hint="حركة مسجلة" tone="green" icon={BarChart3} /></div><div className="split-layout"><section className="panel"><div className="panel-heading"><div><h3>مصروف جديد</h3><p>يخصم من الحساب المختار</p></div><ArrowUpLeft size={20} /></div><form className="form-stack" onSubmit={saveExpense}><Field label="بند المصروف" required><input value={expense.category} onChange={(event) => setExpense({ ...expense, category: event.target.value })} placeholder="نقل، عمالة، كهرباء..." /></Field><Field label="الحساب"><select value={expense.accountId} onChange={(event) => setExpense({ ...expense, accountId: event.target.value })}>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></Field><Field label="المبلغ" required><input type="number" min="0" value={expense.amount} onChange={(event) => setExpense({ ...expense, amount: event.target.value })} /></Field><Field label="ملاحظات"><textarea value={expense.notes} onChange={(event) => setExpense({ ...expense, notes: event.target.value })} /></Field><button className="primary-button" type="submit">تسجيل المصروف</button></form><div className="separator" /><div className="panel-heading"><div><h3>مسحوب شخصي</h3><p>تسجيل سحب من الحساب المختار</p></div><ArrowUpRight size={20} /></div><form className="form-stack" onSubmit={saveWithdrawal}><Field label="الحساب"><select value={withdrawal.accountId} onChange={(event) => setWithdrawal({ ...withdrawal, accountId: event.target.value })}>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></Field><Field label="المبلغ" required><input type="number" min="0" value={withdrawal.amount} onChange={(event) => setWithdrawal({ ...withdrawal, amount: event.target.value })} /></Field><Field label="ملاحظات"><textarea value={withdrawal.notes} onChange={(event) => setWithdrawal({ ...withdrawal, notes: event.target.value })} /></Field><button className="outline-button" type="submit">تسجيل المسحوب</button></form></section><section className="panel panel-large"><div className="panel-heading"><div><h3>سجل الحركات</h3><p>المقبوضات والمدفوعات والمصروفات</p></div><ClipboardList size={20} /></div>{transactions.length === 0 ? <EmptyState text="لا توجد حركات مالية بعد" /> : <div className="table-wrap"><table><thead><tr><th>التاريخ</th><th>الحساب</th><th>الوصف</th><th>النوع</th><th>المبلغ</th></tr></thead><tbody>{transactions.map((transaction) => <tr key={transaction.id}><td>{dateLabel(transaction.date)}</td><td>{transaction.accountName}</td><td>{transaction.description || "—"}</td><td>{transaction.kind}</td><td className={transaction.direction === "in" ? "positive-text" : "negative-text"}>{transaction.direction === "in" ? "+" : "-"}{money(transaction.amountMinor)}</td></tr>)}</tbody></table></div>}</section></div></>;
}

function InvoicesPage({ refreshToken }: { refreshToken: number; onChanged: () => void }) {
  const [sales, setSales] = useState<SaleInvoice[]>([]);
  const [purchases, setPurchases] = useState<PurchaseInvoice[]>([]);
  useEffect(() => { Promise.all([window.marbleApi.sales.list(), window.marbleApi.purchases.list()]).then(([s, p]) => { setSales(s as SaleInvoice[]); setPurchases(p as PurchaseInvoice[]); }).catch((error) => toast.error(errorMessage(error))); }, [refreshToken]);
  return <><PageIntro title="الفواتير" description="أرشيف موحد لفواتير البيع والشراء مع المدفوع والمتبقي." /><section className="panel"><div className="panel-heading"><div><h3>فواتير المبيعات</h3><p>{sales.length} فاتورة</p></div><Receipt size={20} /></div><InvoiceTable type="sale" rows={sales} /></section><section className="panel spaced-panel"><div className="panel-heading"><div><h3>فواتير المشتريات</h3><p>{purchases.length} فاتورة</p></div><ShoppingBag size={20} /></div><InvoiceTable type="purchase" rows={purchases} /></section></>;
}

function AppointmentsPage({ refreshToken, onChanged }: { refreshToken: number; onChanged: () => void }) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const load = () => window.marbleApi.appointments.list().then((items) => setAppointments(items as Appointment[])).catch((error) => toast.error(errorMessage(error)));
  useEffect(() => { load(); }, [refreshToken]);
  const update = async (id: string, status: string) => { try { await window.marbleApi.appointments.updateStatus(id, status); toast.success("تم تحديث حالة الموعد"); await load(); onChanged(); } catch (error) { toast.error(errorMessage(error)); } };
  return <><PageIntro title="المواعيد" description="كل مواعيد التركيب المرتبطة بعمليات البيع." /><section className="panel"><div className="panel-heading"><div><h3>تقويم التشغيل</h3><p>{appointments.length} موعد</p></div><CalendarDays size={20} /></div>{appointments.length === 0 ? <EmptyState text="لا توجد مواعيد مسجلة" /> : <div className="appointment-grid">{appointments.map((appointment) => <div className="appointment-card" key={appointment.id}><div className="appointment-date"><span>{new Date(appointment.scheduledAt).toLocaleDateString("ar-EG", { weekday: "long" })}</span><strong>{new Date(appointment.scheduledAt).getDate()}</strong></div><div className="row-main"><strong>{appointment.customerName}</strong><span>فاتورة #{appointment.invoiceNumber} · {dateLabel(appointment.scheduledAt)}</span><select value={appointment.status} onChange={(event) => update(appointment.id, event.target.value)}><option value="scheduled">مجدول</option><option value="confirmed">مؤكد</option><option value="completed">منفذ</option><option value="cancelled">ملغى</option></select></div></div>)}</div>}</section></>;
}

function ReportsPage({ refreshToken }: { refreshToken: number; onChanged: () => void }) {
  const [customers, setCustomers] = useState<Party[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [statement, setStatement] = useState<Statement | null>(null);
  const [sales, setSales] = useState<SaleInvoice[]>([]);
  const [purchases, setPurchases] = useState<PurchaseInvoice[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  useEffect(() => {
    Promise.all([
      window.marbleApi.parties.list("customer"),
      window.marbleApi.sales.list(),
      window.marbleApi.purchases.list(),
      window.marbleApi.products.list(),
      window.marbleApi.finance.transactions(),
    ]).then(([customerItems, saleItems, purchaseItems, productItems, transactionItems]) => {
      setCustomers(customerItems as Party[]);
      setSales(saleItems as SaleInvoice[]);
      setPurchases(purchaseItems as PurchaseInvoice[]);
      setProducts(productItems as Product[]);
      setTransactions(transactionItems as Transaction[]);
    }).catch((error) => toast.error(errorMessage(error)));
  }, [refreshToken]);
  const load = async (id: string) => { setSelectedId(id); if (!id) { setStatement(null); return; } try { setStatement((await window.marbleApi.parties.statement(id)) as Statement); } catch (error) { toast.error(errorMessage(error)); } };
  const salesTotal = sales.reduce((sum, invoice) => sum + invoice.totalMinor, 0);
  const purchasesTotal = purchases.reduce((sum, invoice) => sum + invoice.totalMinor, 0);
  return <>
    <PageIntro title="التقارير" description="تقارير تشغيلية سريعة مناسبة لنشاط بيع وتركيب الرخام." />
    <div className="report-cards">
      <div className="report-card"><FileBarChart size={22} /><strong>كشف حساب عميل</strong><span>الفواتير والمدفوع والمتبقي</span><select value={selectedId} onChange={(event) => load(event.target.value)}><option value="">اختر عميلًا</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></div>
      <div className="report-card"><BarChart3 size={22} /><strong>ملخص الحركة</strong><span>مبيعات {money(salesTotal)} · مشتريات {money(purchasesTotal)}</span><span>{sales.length} مبيعات · {purchases.length} مشتريات</span></div>
      <div className="report-card"><WalletCards size={22} /><strong>حركة المالية</strong><span>المقبوضات والمصروفات والمسحوبات</span><span>{transactions.length} حركة مسجلة</span></div>
    </div>
    <div className="dashboard-grid">
      <section className="panel"><div className="panel-heading"><div><h3>ملخص المبيعات</h3><p>أحدث الفواتير</p></div><ShoppingCart size={20} /></div><InvoiceTable type="sale" rows={sales.slice(0, 5)} /></section>
      <section className="panel"><div className="panel-heading"><div><h3>ملخص المشتريات</h3><p>أحدث التوريدات</p></div><ShoppingBag size={20} /></div><InvoiceTable type="purchase" rows={purchases.slice(0, 5)} /></section>
    </div>
    <section className="panel"><div className="panel-heading"><div><h3>تقرير المخزون</h3><p>الرصيد الحالي وحدود إعادة الطلب</p></div><Package size={20} /></div><div className="table-wrap"><table><thead><tr><th>الصنف</th><th>الرصيد</th><th>متوسط التكلفة</th><th>قيمة تقريبية</th><th>الحالة</th></tr></thead><tbody>{products.map((product) => <tr key={product.id}><td className="strong-cell">{product.name}</td><td>{quantity(product.stockQtyScaled)}</td><td>{money(product.avgCostMinor)}</td><td>{money(Math.round(product.stockQtyScaled * product.avgCostMinor / 1000))}</td><td>{product.stockQtyScaled <= product.minStockQtyScaled ? <span className="status-badge status-warning">منخفض</span> : <span className="status-badge status-complete">متاح</span>}</td></tr>)}</tbody></table></div></section>
    {statement && <section className="panel report-print" id="print-area"><div className="panel-heading"><div><h3>كشف حساب {statement.party.name}</h3><p>الرصيد المستحق: {money(statement.balanceMinor)}</p></div><div className="button-row"><button className="ghost-button" onClick={() => window.print()}><FileText size={16} /> A4</button><button className="ghost-button" onClick={() => printThermalStatement(statement)}><Receipt size={16} /> 80mm</button></div></div><div className="table-wrap"><table><thead><tr><th>الفاتورة</th><th>التاريخ</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th></tr></thead><tbody>{statement.invoices.map((invoice) => <tr key={invoice.id}><td>#{invoice.invoiceNumber}</td><td>{dateLabel(invoice.date)}</td><td>{money(invoice.totalMinor)}</td><td className="positive-text">{money(invoice.paidMinor)}</td><td className="negative-text">{money(invoice.remainingMinor)}</td></tr>)}</tbody></table></div></section>}
  </>;
}

function SettingsPage({ refreshToken, onChanged }: { refreshToken: number; onChanged: () => void }) {
  const [settings, setSettings] = useState<Record<string, string>>({ businessName: "", backupDirectory: "", pinHash: "" });
  const [pinCode, setPinCode] = useState("");
  useEffect(() => { window.marbleApi.settings.get().then(setSettings).catch((error) => toast.error(errorMessage(error))); }, [refreshToken]);
  const saveName = async () => { try { await window.marbleApi.settings.set("businessName", settings.businessName || "إدارة الرخام"); toast.success("تم حفظ بيانات النشاط"); onChanged(); } catch (error) { toast.error(errorMessage(error)); } };
  const savePin = async () => {
    try {
      if (!pinCode) {
        await window.marbleApi.settings.set("pinHash", "");
        setSettings({ ...settings, pinHash: "" });
        toast.success("تم إلغاء PIN");
      } else if (!/^\d{4,8}$/.test(pinCode)) {
        toast.error("الـ PIN يجب أن يكون من 4 إلى 8 أرقام");
        return;
      } else {
        await window.marbleApi.settings.set("pinHash", await hashPin(pinCode));
        setSettings({ ...settings, pinHash: "configured" });
        setPinCode("");
        toast.success("تم تفعيل PIN، وسيظهر عند فتح البرنامج مرة أخرى");
      }
    } catch (error) { toast.error(errorMessage(error)); }
  };
  const chooseDirectory = async () => { try { const directory = await window.marbleApi.backup.chooseDirectory(); if (directory) { setSettings({ ...settings, backupDirectory: directory }); toast.success("تم اختيار مجلد النسخ"); } } catch (error) { toast.error(errorMessage(error)); } };
  const createBackup = async () => { try { const file = await window.marbleApi.backup.create(settings.backupDirectory); toast.success(`تم إنشاء النسخة: ${file}`); } catch (error) { toast.error(errorMessage(error)); } };
  const restore = async () => { try { await window.marbleApi.backup.restore(); toast.success("تم استرجاع البيانات، سيتم تحديث البرنامج"); window.location.reload(); } catch (error) { toast.error(errorMessage(error)); } };
  return <><PageIntro title="الإعدادات والنسخ" description="بيانات النشاط وحماية ملف البيانات المحلي." /><div className="settings-grid"><section className="panel"><div className="panel-heading"><div><h3>بيانات النشاط</h3><p>تظهر في الواجهة والتقارير</p></div><SlidersHorizontal size={20} /></div><div className="form-stack"><Field label="اسم النشاط"><input value={settings.businessName || ""} onChange={(event) => setSettings({ ...settings, businessName: event.target.value })} /></Field><button className="primary-button" onClick={saveName}>حفظ البيانات</button></div></section><section className="panel"><div className="panel-heading"><div><h3>حماية البرنامج</h3><p>{settings.pinHash ? "PIN مفعل على هذا الجهاز" : "اختياري — اترك الحقل فارغًا لإلغاء PIN"}</p></div><LockKeyhole size={20} /></div><div className="form-stack"><Field label="PIN من 4 إلى 8 أرقام"><input inputMode="numeric" type="password" maxLength={8} value={pinCode} onChange={(event) => setPinCode(event.target.value.replace(/\D/g, ""))} placeholder={settings.pinHash ? "أدخل PIN جديدًا أو اتركه فارغًا للإلغاء" : "مثال: 1234"} /></Field><button className="outline-button" onClick={savePin}>{settings.pinHash ? "تحديث / إلغاء PIN" : "تفعيل PIN"}</button></div></section><section className="panel"><div className="panel-heading"><div><h3>النسخ الاحتياطي</h3><p>يتم إنشاء نسخة عند الخروج والاحتفاظ بآخر 3 نسخ</p></div><RefreshCw size={20} /></div><div className="backup-box"><span className="muted">مجلد الحفظ</span><code>{settings.backupDirectory || "مجلد بيانات البرنامج الافتراضي"}</code><button className="outline-button" onClick={chooseDirectory}>اختيار المجلد</button><button className="primary-button" onClick={createBackup}>إنشاء نسخة الآن</button><button className="danger-button" onClick={restore}>استرجاع نسخة</button></div></section></div></>;
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) { return <label className="field"><span>{label}{required && <em> *</em>}</span>{children}</label>; }

export default App;
