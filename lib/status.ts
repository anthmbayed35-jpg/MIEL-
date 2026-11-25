export const ORDER_STATUSES = ["draft", "new", "confirmed", "packed", "out_for_delivery", "delivered", "cancelled", "refused", "returned"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const STATUS_LABEL: Record<OrderStatus, string> = {
  draft: "Draft",
  new: "New",
  confirmed: "Confirmed",
  packed: "Packed",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refused: "Refused",
  returned: "Returned",
};

/** Normal forward flow shown as one-tap buttons on the order page. */
export const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  draft: "new",
  new: "confirmed",
  confirmed: "packed",
  packed: "out_for_delivery",
  out_for_delivery: "delivered",
};

export const PAYMENT_LABEL = { pending: "Pending", collected: "Collected", refunded: "Refunded" } as const;
