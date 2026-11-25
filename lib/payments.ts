import "server-only";

/**
 * Payment methods. Today only cash on delivery is active. Adding another (card, wallet, bank transfer) means adding an entry here
 * and its provider call in `settle`; the order already carries `payment_method`, checkout renders whatever is active, and the
 * server refuses any method that is not active. No provider is integrated.
 */
export type PaymentMethodId = "cod";
export type PaymentMethod = {
  id: PaymentMethodId;
  label: string;
  description: string;
  /** true: the customer pays the courier, so the order carries an amount to collect (cod_amount_due) */
  collectOnDelivery: boolean;
};

const METHODS: Record<PaymentMethodId, PaymentMethod> = {
  cod: { id: "cod", label: "Cash on delivery", description: "Pay in cash when your order arrives. We confirm delivery details on WhatsApp.", collectOnDelivery: true },
};

/** The methods a customer can choose right now. `codEnabled` comes from Settings > Store (the existing switch). */
export function activePaymentMethods(codEnabled = true): PaymentMethod[] {
  return [METHODS.cod].filter((m) => (m.id === "cod" ? codEnabled : true));
}

export function paymentMethod(id: string, codEnabled = true): PaymentMethod | null {
  return activePaymentMethods(codEnabled).find((m) => m.id === id) ?? null;
}
