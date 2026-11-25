"use client";

import { useRefCode } from "@/lib/use-ref-code";

/** Runs on every storefront page so a personal link opened on any page is remembered for checkout. Renders nothing. */
export function RefCapture() {
  useRefCode();
  return null;
}
