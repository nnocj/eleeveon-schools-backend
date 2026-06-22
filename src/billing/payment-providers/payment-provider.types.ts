export type PaymentChannel =
  | "momo"
  | "card"
  | "bank"
  | "cash"
  | "manual";

export type PaymentProviderName =
  | "paystack"
  | "manual";

export type MomoNetwork =
  | "mtn"
  | "telecel"
  | "airteltigo";

export type PaymentStatus =
  | "pending"
  | "requires_customer_action"
  | "paid"
  | "failed"
  | "cancelled";

export type StartPaymentInput = {
  accountId: string;

  amount: number;

  currency: string;

  channel: PaymentChannel;

  provider: PaymentProviderName;

  invoiceId?: string;

  subscriptionId?: string;

  paymentId?: string;

  payerName?: string;

  payerPhone?: string;

  payerEmail?: string;

  momoNetwork?: MomoNetwork;

  callbackUrl?: string;

  metadata?: Record<string, any>;

  note?: string;
};

export type StartPaymentResult = {
  success: boolean;

  status: PaymentStatus;

  message: string;

  provider: PaymentProviderName;

  providerReference?: string;

  authorizationUrl?: string;

  accessCode?: string;

  raw?: any;
};

export type VerifyPaymentResult = {
  success: boolean;

  status: PaymentStatus;

  providerReference?: string;

  receiptNumber?: string;

  paidAt?: string | Date;

  raw?: any;

  message?: string;
};

export interface PaymentProvider {
  initializePayment(
    payload: StartPaymentInput
  ): Promise<StartPaymentResult>;

  verifyPayment(
    reference: string
  ): Promise<VerifyPaymentResult>;
}