import { type Invoice } from "../domain/invoice.types";

export interface EditInvoiceResponse {
    success: boolean;
    data: Invoice;
}