import { type JwtPayload } from "jsonwebtoken";
import { type InvoiceWithClient } from "./index.js";

/**
 * Public invoice token payload interface
 */
export interface PublicInvoiceTokenPayload extends JwtPayload {
  invoiceId: number;
  type: string;
}

/**
 * Public invoice display interface
 */
export interface PublicInvoiceDisplay extends InvoiceWithClient {
  companySettings?: Record<string, unknown> | null;
  currencySettings?: Record<string, unknown> | null;
  invoiceTemplate?: string;
}