export type PartyKind = "customer" | "supplier";
export type InvoiceType = "sale" | "purchase";
export type PaymentMethod = "cash" | "bank" | "card" | "transfer" | "cheque" | "other";
export type SaleLineKind = "stock" | "extra";

export interface PartyInput {
  name: string;
  phone?: string;
  address?: string;
  notes?: string;
  kind?: PartyKind;
}

export interface PartyRecord extends PartyInput {
  id: string;
  kind: PartyKind;
  createdAt: string;
}

export interface ProductInput {
  name: string;
  unitId: string;
  purchasePriceMinor?: number;
  salePriceMinor?: number;
  minStockQtyScaled?: number;
  sku?: string;
  category?: string;
}

export interface ProductRecord extends ProductInput {
  id: string;
  purchasePriceMinor: number;
  salePriceMinor: number;
  minStockQtyScaled: number;
  stockQtyScaled: number;
  avgCostMinor: number;
}

export interface PurchaseLineInput {
  productId: string;
  qtyScaled?: number;
  width?: number;
  height?: number;
  unitPriceMinor: number;
}

export interface SaleStockLineInput {
  kind: "stock";
  productId: string;
  qtyScaled?: number;
  width?: number;
  height?: number;
  unitPriceMinor: number;
  discountMinor?: number;
}

export interface SaleExtraLineInput {
  kind: "extra";
  name: string;
  qtyScaled?: number;
  unitPriceMinor: number;
  discountMinor?: number;
}

export type SaleLineInput = SaleStockLineInput | SaleExtraLineInput;

export interface PurchaseInput {
  supplierId: string;
  accountId: string;
  items: PurchaseLineInput[];
  paidMinor?: number;
  method?: PaymentMethod;
  date?: string;
  notes?: string;
}

export interface InstallationInput {
  scheduledAt: string;
  status?: "scheduled" | "confirmed" | "completed" | "cancelled";
  notes?: string;
}

export interface SaleInput {
  customerId: string;
  accountId: string;
  items: SaleLineInput[];
  paidMinor?: number;
  method?: PaymentMethod;
  date?: string;
  notes?: string;
  installation?: InstallationInput;
}

export interface InvoiceResult {
  id: string;
  invoiceNumber: number;
  totalMinor: number;
  paidMinor: number;
}

export interface InvoiceItemDetail {
  id: string;
  kind: SaleLineKind;
  productId: string | null;
  name: string;
  width: number | null;
  height: number | null;
  qtyScaled: number;
  unitSymbol: string;
  unitPriceMinor: number;
  discountMinor: number;
  totalMinor: number;
}

export interface InvoicePaymentDetail {
  id: string;
  amountMinor: number;
  method: PaymentMethod;
  date: string;
  accountName: string;
  notes: string;
}

export interface InvoiceDetail {
  invoiceType: InvoiceType;
  id: string;
  invoiceNumber: number;
  partyId: string;
  partyName: string;
  partyPhone: string;
  partyAddress: string;
  date: string;
  totalMinor: number;
  paidMinor: number;
  remainingMinor: number;
  status: string;
  notes: string;
  items: InvoiceItemDetail[];
  payments: InvoicePaymentDetail[];
}

export interface PaymentInput {
  invoiceType: InvoiceType;
  invoiceId: string;
  accountId: string;
  amountMinor: number;
  method: PaymentMethod;
  date?: string;
  notes?: string;
}

export interface ExpenseInput {
  accountId: string;
  category: string;
  amountMinor: number;
  date?: string;
  notes?: string;
}

export interface WithdrawalInput {
  accountId: string;
  amountMinor: number;
  date?: string;
  notes?: string;
}

export interface SetupIds {
  cubicMeterUnitId: string;
  squareMeterUnitId: string;
  pieceUnitId: string;
  genericUnitId: string;
  warehouseId: string;
  cashAccountId: string;
  bankAccountId: string;
}
