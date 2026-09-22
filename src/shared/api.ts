import type {
  ExpenseInput,
  InstallationInput,
  PartyInput,
  PaymentInput,
  ProductInput,
  PurchaseInput,
  SaleInput,
  InvoiceDetail,
  InvoiceType,
  WithdrawalInput,
} from "../domain/types";

export interface MarbleApi {
  dashboard: {
    summary: () => Promise<{
      salesTotalMinor: number;
      purchasesTotalMinor: number;
      receivablesMinor: number;
      payablesMinor: number;
      cashBalanceMinor: number;
      bankBalanceMinor: number;
    }>;
  };
  parties: {
    list: (kind?: "customer" | "supplier") => Promise<unknown[]>;
    create: (input: PartyInput) => Promise<unknown>;
    statement: (id: string) => Promise<unknown>;
  };
  products: {
    list: () => Promise<unknown[]>;
    units: () => Promise<unknown[]>;
    create: (input: ProductInput) => Promise<unknown>;
  };
  purchases: {
    list: () => Promise<unknown[]>;
    create: (input: PurchaseInput) => Promise<unknown>;
  };
  invoices: {
    details: (invoiceType: InvoiceType, invoiceId: string) => Promise<InvoiceDetail>;
  };
  sales: {
    list: () => Promise<unknown[]>;
    create: (input: SaleInput) => Promise<unknown>;
    cancel: (id: string) => Promise<void>;
  };
  payments: {
    create: (input: PaymentInput) => Promise<void>;
  };
  finance: {
    accounts: () => Promise<unknown[]>;
    transactions: () => Promise<unknown[]>;
    expense: (input: ExpenseInput) => Promise<void>;
    withdrawal: (input: WithdrawalInput) => Promise<void>;
  };
  appointments: {
    list: () => Promise<unknown[]>;
    updateStatus: (id: string, status: string) => Promise<void>;
  };
  settings: {
    get: () => Promise<Record<string, string>>;
    set: (key: string, value: string) => Promise<void>;
  };
  activation: {
    status: () => Promise<boolean>;
    activate: (code: string) => Promise<boolean>;
  };
  backup: {
    chooseDirectory: () => Promise<string | null>;
    create: (directory?: string) => Promise<string>;
    restore: () => Promise<string>;
  };
  app: {
    getDataPath: () => Promise<string>;
  };
}

declare global {
  interface Window {
    marbleApi: MarbleApi;
  }
}

export type { ExpenseInput, InstallationInput, PartyInput, PaymentInput, ProductInput, PurchaseInput, SaleInput, WithdrawalInput };
