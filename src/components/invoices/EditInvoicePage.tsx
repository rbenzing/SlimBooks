import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Trash2, Plus, X, Send, Printer } from 'lucide-react';
import { authenticatedFetch } from '@/utils/api';
import { ClientSelector } from './ClientSelector';
import { CompanyHeader } from './CompanyHeader';
import { useFormNavigation } from '@/hooks/useFormNavigation';
import { validateInvoiceForSave, validateInvoiceForSend } from '@/utils/data';
import { getInvoiceStatusPermissions } from '@/utils/business/invoice.util';
import { invoiceService } from '@/services/invoices.svc';
import { pdfService } from '@/services/pdf.svc';
import { getEmailConfigurationStatus } from '@/utils/emailConfig.util';
import { type EmailConfigStatus } from '@/types';
import { toast } from 'sonner';
import { type InvoiceItem, type Invoice, type InvoiceStatus } from '@/types';
import { type Client } from '@/types';
import { type TaxRate, type ShippingRate } from '@/types';
import { formatCurrencySync, formatClientAddressSingleLine, toDateInputValue } from '@/utils/formatting';
import { type EditInvoiceResponse } from '@/types/dtos/invoices.types';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function recalculateLineItemTotals(items: InvoiceItem[]): InvoiceItem[] {
  return items.map((item) => ({
    ...item,
    total: (parseFloat(String(item.quantity)) || 0) * (parseFloat(String(item.unit_price)) || 0),
  }));
}

function areLineItemsEqual(a: InvoiceItem[], b: InvoiceItem[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((item, i) => {
    const other = b[i];
    return (
      item.id === other.id &&
      item.description === other.description &&
      Number(item.quantity) === Number(other.quantity) &&
      Number(item.unit_price) === Number(other.unit_price) &&
      Number(item.total) === Number(other.total)
    );
  });
}

/** A stored line item, before it has been normalised into an InvoiceItem. */
interface RawLineItem {
  id?: number;
  description?: string;
  desc?: string;
  quantity?: number | string;
  qty?: number | string;
  unit_price?: number | string;
  price?: number | string;
  rate?: number | string;
  unitPrice?: number | string;
  amount?: number | string;
  total?: number | string;
  lineTotal?: number | string;
}

function parseLineItems(raw: unknown): InvoiceItem[] {
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];

    return (parsed as RawLineItem[])
      .map((item, index) => {
        const quantity = parseFloat(String(item.quantity ?? item.qty ?? 1));
        const unit_price = parseFloat(String(item.unit_price ?? item.price ?? item.rate ?? item.unitPrice ?? 0));
        const amount = parseFloat(String(item.amount ?? item.total ?? item.lineTotal ?? 0));
        const calculated = quantity * unit_price;
        const finalTotal = amount > 0 ? amount : calculated;

        return {
          id: item.id ?? index + 1,
          description: item.description ?? item.desc ?? '',
          quantity: isNaN(quantity) ? 1 : quantity,
          unit_price: isNaN(unit_price) ? 0 : unit_price,
          total: isNaN(finalTotal) ? 0 : finalTotal,
        } as InvoiceItem;
      })
      .filter(
        (item) =>
          item.description.trim() !== '' || item.unit_price > 0 || item.total > 0
      );
  } catch {
    return [];
  }
}

const blankLineItem = (): InvoiceItem => ({
  id: 1,
  description: '',
  quantity: 1,
  unit_price: 0,
  total: 0,
});

/**
 * Invoices created before the `line_items` column existed carry only a
 * description and an amount. Without this the editor showed a single blank row
 * — a $0.00 total on a non-zero invoice — and saving persisted that 0 over the
 * real amount.
 */
function reconstructLineItems(record: Invoice): InvoiceItem[] {
  const amount = Number(record.amount) || 0;
  const description = record.description?.trim() ?? '';

  if (!description && amount === 0) {
    return [blankLineItem()];
  }

  return [
    {
      id: 1,
      description: description || record.invoice_number || '',
      quantity: 1,
      unit_price: amount,
      total: amount,
    },
  ];
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export const EditInvoicePage = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  // Core data
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [invoiceData, setInvoiceData] = useState<{
    invoice_number: string;
    due_date: string;
    status: InvoiceStatus;
  }>({
    invoice_number: '',
    due_date: '',
    status: 'draft',
  });
  const [lineItems, setLineItems] = useState<InvoiceItem[]>([
    { id: 1, description: '', quantity: 1, unit_price: 0, total: 0 },
  ]);
  const [thankYouMessage, setThankYouMessage] = useState('Thank you for your business!');
  const [selectedTaxRate, setSelectedTaxRate] = useState<TaxRate | null>(null);
  const [selectedShippingRate, setSelectedShippingRate] = useState<ShippingRate | null>(null);

  // Supporting data
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [shippingRates, setShippingRates] = useState<ShippingRate[]>([]);
  const [emailConfig, setEmailConfig] = useState<EmailConfigStatus | null>(null);
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);

  // UI state
  const [isDirty, setIsDirty] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Snapshot for reliable dirty checking
  const [originalSnapshot, setOriginalSnapshot] = useState<{
    invoiceData: typeof invoiceData;
    clientId: number | null;
    lineItems: InvoiceItem[];
    thankYouMessage: string;
    taxRateId: string | null;
    shippingRateId: string | null;
  } | null>(null);

  const { confirmNavigation, NavigationGuard } = useFormNavigation({
    isDirty,
    isEnabled: true,
    entityType: 'invoice',
  });

  // ─────────────────────────────────────────────────────────
  // Load data
  // ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!id) return;

    const load = async () => {
      try {
        // Invoice
        const invRes = await authenticatedFetch(`/api/invoices/${id}`);
        const invJson = (await invRes.json()) as EditInvoiceResponse;
        const record = invJson?.data;

        if (!record) {
          setLoading(false);
          return;
        }

        setInvoice(record);

        const nextInvoiceData = {
          invoice_number: record.invoice_number || '',
          due_date: toDateInputValue(record.due_date),
          status: (record.status as InvoiceStatus) || 'draft',
        };
        setInvoiceData(nextInvoiceData);

        const parsedItems = recalculateLineItemTotals(
          parseLineItems(record.line_items || record.items)
        );
        // Legacy invoices store no line items — rebuild one from the record so
        // the totals match the invoice instead of collapsing to zero.
        const finalItems =
          parsedItems.length > 0 ? parsedItems : reconstructLineItems(record);
        setLineItems(finalItems);

        const notes = record.notes || 'Thank you for your business!';
        setThankYouMessage(notes);

        // Clients
        const clientsRes = await authenticatedFetch('/api/clients');
        const clientsJson = await clientsRes.json();
        const allClients: Client[] = clientsJson.data ?? [];
        setClients(allClients);

        const client = allClients.find((c) => c.id === record.client_id) ?? null;
        setSelectedClient(client);

        // Settings (tax / shipping / email)
        await loadSettings(record);

        // Snapshot after everything is settled
        setOriginalSnapshot({
          invoiceData: nextInvoiceData,
          clientId: record.client_id ?? null,
          lineItems: finalItems,
          thankYouMessage: notes,
          taxRateId: record.tax_rate_id ?? null,
          shippingRateId: record.shipping_rate_id ?? null,
        });
      } catch (err) {
        console.error('Error loading invoice data:', err);
        toast.error('Failed to load invoice');
      } finally {
        setLoading(false);
      }
    };

    const loadSettings = async (record: Invoice) => {
      try {
        const { sqliteService } = await import('@/services/sqlite.svc');
        if (!sqliteService.isReady()) return;

        const savedTaxRates = (await sqliteService.getSetting('tax_rates')) as TaxRate[] | null;
        if (savedTaxRates) {
          setTaxRates(savedTaxRates);
          if (record.tax_rate_id) {
            setSelectedTaxRate(savedTaxRates.find((r) => r.id === record.tax_rate_id) ?? null);
          } else if (record.tax_amount && record.tax_amount > 0) {
            setSelectedTaxRate(savedTaxRates.find((r) => r.isDefault) ?? null);
          } else {
            setSelectedTaxRate(null);
          }
        }

        const savedShippingRates = (await sqliteService.getSetting('shipping_rates')) as ShippingRate[] | null;
        if (savedShippingRates) {
          setShippingRates(savedShippingRates);
          if (record.shipping_rate_id) {
            setSelectedShippingRate(
              savedShippingRates.find((r) => r.id === record.shipping_rate_id) ?? null
            );
          } else if (record.shipping_amount && record.shipping_amount > 0) {
            setSelectedShippingRate(savedShippingRates.find((r) => r.isDefault) ?? null);
          } else {
            setSelectedShippingRate(null);
          }
        }

        const emailStatus = await getEmailConfigurationStatus();
        setEmailConfig(emailStatus);
      } catch (err) {
        console.error('Error loading settings:', err);
      }
    };

    load();
  }, [id]);

  // ─────────────────────────────────────────────────────────
  // Dirty tracking (snapshot-based)
  // ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!originalSnapshot) {
      setIsDirty(false);
      return;
    }

    const changed =
      invoiceData.invoice_number !== originalSnapshot.invoiceData.invoice_number ||
      invoiceData.due_date !== originalSnapshot.invoiceData.due_date ||
      invoiceData.status !== originalSnapshot.invoiceData.status ||
      selectedClient?.id !== originalSnapshot.clientId ||
      thankYouMessage !== originalSnapshot.thankYouMessage ||
      (selectedTaxRate?.id ?? null) !== originalSnapshot.taxRateId ||
      (selectedShippingRate?.id ?? null) !== originalSnapshot.shippingRateId ||
      !areLineItemsEqual(lineItems, originalSnapshot.lineItems);

    setIsDirty(changed);
  }, [
    invoiceData,
    selectedClient,
    lineItems,
    thankYouMessage,
    selectedTaxRate,
    selectedShippingRate,
    originalSnapshot,
  ]);

  // ─────────────────────────────────────────────────────────
  // Line item helpers
  // ─────────────────────────────────────────────────────────

  const updateLineItem = useCallback(
    (itemId: number, field: keyof InvoiceItem, value: string | number) => {
      setLineItems((items) =>
        items.map((item) => {
          if (item.id !== itemId) return item;
          const updated = { ...item, [field]: value };
          if (field === 'quantity' || field === 'unit_price') {
            updated.total =
              (parseFloat(String(updated.quantity)) || 0) *
              (parseFloat(String(updated.unit_price)) || 0);
          }
          return updated;
        })
      );
    },
    []
  );

  const addLineItem = () => {
    const newId = Math.max(0, ...lineItems.map((i) => i.id)) + 1;
    setLineItems([
      ...lineItems,
      { id: newId, description: '', quantity: 1, unit_price: 0, total: 0 },
    ]);
  };

  const removeLineItem = (itemId: number) => {
    if (lineItems.length <= 1) return;
    setLineItems(lineItems.filter((item) => item.id !== itemId));
  };

  // ─────────────────────────────────────────────────────────
  // Validation & permissions
  // ─────────────────────────────────────────────────────────

  const isValidForSave = () =>
    validateInvoiceForSave(invoiceData, selectedClient, lineItems).isValid;

  const isValidForSend = () =>
    validateInvoiceForSend(invoiceData, selectedClient, lineItems).canSend;

  const getStatusPermissions = () => {
    if (!invoice) return { canEdit: true, canSave: true, canSend: true, canDelete: true, showDeleteOnly: false };
    return getInvoiceStatusPermissions(invoice.status, invoice.due_date);
  };

  // ─────────────────────────────────────────────────────────
  // Actions
  // ─────────────────────────────────────────────────────────

  const buildPayload = (statusOverride?: InvoiceStatus) => {
    if (!selectedClient || !invoice) return null;

    const data = { ...invoiceData };
    if (!data.due_date?.trim()) {
      data.due_date = new Date().toISOString().split('T')[0];
      setInvoiceData(data);
    }

    const subtotal = lineItems.reduce((sum, item) => sum + (item.total || 0), 0);
    const taxAmount = selectedTaxRate ? (subtotal * selectedTaxRate.rate) / 100 : 0;
    const shippingAmount = selectedShippingRate ? selectedShippingRate.amount : 0;
    const total = subtotal + taxAmount + shippingAmount;

    return {
      invoice_number: data.invoice_number,
      client_id: selectedClient.id,
      design_template_id: invoice.design_template_id,
      recurring_template_id: invoice.recurring_template_id,
      amount: subtotal,
      total_amount: total,
      status: statusOverride ?? data.status,
      due_date: data.due_date,
      description: lineItems.map((i) => i.description).join(', '),
      stripe_invoice_id: invoice.stripe_invoice_id,
      type: invoice.type,
      client_name: selectedClient.name,
      client_email: selectedClient.email,
      client_phone: selectedClient.phone,
      client_address: formatClientAddressSingleLine(selectedClient),
      line_items: JSON.stringify(lineItems),
      tax_amount: taxAmount,
      tax_rate_id: selectedTaxRate?.id ?? null,
      shipping_amount: shippingAmount,
      shipping_rate_id: selectedShippingRate?.id ?? null,
      notes: thankYouMessage,
    };
  };

  const handleSave = async () => {
    if (!isValidForSave() || isSaving) return;
    if (!selectedClient) {
      toast.error('Please select a client');
      return;
    }

    setIsSaving(true);
    try {
      const payload = buildPayload();
      if (!payload) return;

      await authenticatedFetch(`/api/invoices/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ invoiceData: payload }),
      });

      setIsDirty(false);
      toast.success('Invoice updated successfully');

      const target =
        invoice?.design_template_id || invoice?.recurring_template_id
          ? '/invoices#templates'
          : '/invoices';
      navigate(target);
    } catch (err) {
      console.error('Error updating invoice:', err);
      toast.error('Error updating invoice');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendInvoice = async () => {
    if (isSending || !isValidForSend()) return;
    if (!selectedClient) {
      toast.error('Please select a client');
      return;
    }

    setIsSending(true);
    try {
      const payload = buildPayload('sent');
      if (!payload) return;

      await authenticatedFetch(`/api/invoices/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ invoiceData: payload }),
      });

      await invoiceService.updateEmailStatus(parseInt(id!), 'sending');

      const emailResult = await invoiceService.sendInvoiceEmail({
        id: parseInt(id!),
        invoice_number: payload.invoice_number,
        client_name: selectedClient.name,
        client_email: selectedClient.email,
        amount: payload.total_amount,
        due_date: payload.due_date,
        status: 'sent',
        notes: thankYouMessage,
      });

      if (emailResult.success) {
        await invoiceService.markInvoiceAsSent(parseInt(id!));
        toast.success('Invoice sent successfully');
      } else {
        await invoiceService.updateEmailStatus(parseInt(id!), 'failed', emailResult.message);
        toast.error(`Failed to send invoice: ${emailResult.message}`);
      }

      setIsDirty(false);

      const target =
        invoice?.design_template_id || invoice?.recurring_template_id
          ? '/invoices#templates'
          : '/invoices';
      navigate(target);
    } catch (err) {
      console.error('Error sending invoice:', err);
      toast.error('Error sending invoice');
    } finally {
      setIsSending(false);
    }
  };

  const handlePrintInvoice = async () => {
    if (!invoice?.id) return;
    try {
      await pdfService.downloadInvoicePDF(invoice.id, invoice.invoice_number);
    } catch (err) {
      console.error('Error generating PDF:', err);
      toast.error('Failed to generate PDF. Please try again.');
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this invoice?')) return;
    try {
      await authenticatedFetch(`/api/invoices/${id}`, { method: 'DELETE' });
      const target =
        invoice?.design_template_id || invoice?.recurring_template_id
          ? '/invoices#templates'
          : '/invoices';
      navigate(target);
    } catch (err) {
      console.error('Error deleting invoice:', err);
      toast.error('Error deleting invoice');
    }
  };

  const handleLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => setCompanyLogo(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  // ─────────────────────────────────────────────────────────
  // Render guards
  // ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-foreground mb-2">Invoice not found</h2>
          <button onClick={() => navigate('/invoices')} className="text-primary hover:underline">
            Return to invoices
          </button>
        </div>
      </div>
    );
  }

  // Derived totals
  const subtotal = lineItems.reduce((sum, item) => sum + (item.total || 0), 0);
  const taxAmount = selectedTaxRate ? (subtotal * selectedTaxRate.rate) / 100 : 0;
  const shippingAmount = selectedShippingRate ? selectedShippingRate.amount : 0;
  const total = subtotal + taxAmount + shippingAmount;

  const permissions = getStatusPermissions();
  const hasClientEmail = !!(selectedClient?.email && selectedClient.email.trim());
  const canSendEmails = emailConfig?.canSendEmails ?? false;
  const isAlreadySent = invoice.status === 'sent';
  const shouldShowSend =
    permissions.canSend && hasClientEmail && canSendEmails && !isAlreadySent;

  // ─────────────────────────────────────────────────────────
  // UI
  // ─────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => {
              const target =
                invoice.design_template_id || invoice.recurring_template_id
                  ? '/invoices#templates'
                  : '/invoices';
              confirmNavigation(target);
            }}
            className="flex items-center text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {invoice.design_template_id || invoice.recurring_template_id
              ? 'Back to Templates'
              : 'Back to Invoices'}
          </button>

          <div className="flex space-x-3">
            {permissions.canDelete && (
              <button
                onClick={handleDelete}
                className="flex items-center px-4 py-2 text-destructive border border-destructive rounded-lg hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </button>
            )}

            {permissions.canSave && (
              <button
                onClick={handleSave}
                disabled={!isValidForSave() || isSaving}
                className="px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/90 disabled:bg-muted disabled:cursor-not-allowed transition-colors"
              >
                {isSaving ? 'Saving...' : 'Save Invoice'}
              </button>
            )}

            {shouldShowSend ? (
              <button
                onClick={handleSendInvoice}
                disabled={isSending || !isValidForSend()}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:bg-muted disabled:cursor-not-allowed transition-colors flex items-center"
              >
                <Send className="h-4 w-4 mr-2" />
                {isSending ? 'Sending...' : 'Send Invoice'}
              </button>
            ) : (
              <div className="relative group">
                <button
                  onClick={handlePrintInvoice}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors flex items-center"
                >
                  <Printer className="h-4 w-4 mr-2" />
                  Print Invoice
                </button>
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none">
                  {!hasClientEmail
                    ? 'Client email is required to send invoices'
                    : !canSendEmails
                    ? 'Email settings need to be configured in Settings'
                    : isAlreadySent
                    ? 'Invoice has already been sent'
                    : 'Print invoice'}
                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Invoice card */}
        <div className="bg-card rounded-lg shadow-lg p-8 border">
          {/* Company + meta */}
          <div className="flex justify-between items-start mb-8">
            <CompanyHeader companyLogo={companyLogo} onLogoUpload={handleLogoUpload} />
            <div className="text-right">
              <h2 className="text-3xl font-bold text-card-foreground mb-2">INVOICE</h2>
              <div className="space-y-1">
                <div>
                  <label className="text-sm text-muted-foreground">Invoice # *</label>
                  <input
                    type="text"
                    value={invoiceData.invoice_number}
                    onChange={(e) =>
                      setInvoiceData({ ...invoiceData, invoice_number: e.target.value })
                    }
                    className="block w-full border-0 border-b-2 border-border dark:border-gray-500 focus:border-primary focus:ring-0 text-right bg-transparent text-card-foreground"
                    placeholder="INV-001"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Due Date *</label>
                  <input
                    type="date"
                    value={invoiceData.due_date}
                    onChange={(e) =>
                      setInvoiceData({ ...invoiceData, due_date: e.target.value })
                    }
                    className="block w-full border-0 border-b-2 border-border dark:border-gray-500 focus:border-primary focus:ring-0 text-right bg-transparent text-card-foreground [color-scheme:light] dark:[color-scheme:dark]"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Status</label>
                  <select
                    value={invoiceData.status}
                    onChange={(e) =>
                      setInvoiceData({
                        ...invoiceData,
                        status: e.target.value as InvoiceStatus,
                      })
                    }
                    className="block w-full border-0 border-b-2 border-border dark:border-gray-500 focus:border-primary focus:ring-0 text-right bg-transparent text-card-foreground"
                  >
                    <option value="draft">Draft</option>
                    <option value="sent">Sent</option>
                    <option value="paid">Paid</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Client */}
          <div className="mb-8">
            <ClientSelector
              clients={clients}
              selectedClient={selectedClient}
              onClientSelect={setSelectedClient}
            />
          </div>

          {/* Line items */}
          <div className="mb-8">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-border dark:border-gray-500">
                  <th className="text-left py-3 font-semibold text-card-foreground">Description *</th>
                  <th className="text-center py-3 font-semibold w-20 text-card-foreground">Qty</th>
                  <th className="text-right py-3 font-semibold w-24 text-card-foreground">Rate</th>
                  <th className="text-right py-3 font-semibold w-24 text-card-foreground">Amount</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item) => (
                  <tr key={item.id} className="border-b border-border dark:border-gray-600">
                    <td className="py-3">
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => updateLineItem(item.id, 'description', e.target.value)}
                        className="w-full border-0 border-b border-gray-300 dark:border-gray-500 focus:border-primary focus:ring-0 bg-transparent text-card-foreground"
                        placeholder="Item description"
                        required
                      />
                    </td>
                    <td className="py-3 text-center">
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={(e) =>
                          updateLineItem(item.id, 'quantity', parseFloat(e.target.value) || 0)
                        }
                        className="w-16 text-center border-0 border-b border-gray-300 dark:border-gray-500 focus:border-primary focus:ring-0 bg-transparent text-card-foreground"
                        min="0"
                        step="1"
                      />
                    </td>
                    <td className="py-3 text-right">
                      <input
                        type="number"
                        value={item.unit_price}
                        onChange={(e) =>
                          updateLineItem(item.id, 'unit_price', parseFloat(e.target.value) || 0)
                        }
                        className="w-20 text-right border-0 border-b border-gray-300 dark:border-gray-500 focus:border-primary focus:ring-0 bg-transparent text-card-foreground"
                        min="0"
                        step="0.01"
                      />
                    </td>
                    <td className="py-3 text-right text-card-foreground">
                      {formatCurrencySync(item.total || 0)}
                    </td>
                    <td className="py-3">
                      {lineItems.length > 1 && (
                        <button
                          onClick={() => removeLineItem(item.id)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              onClick={addLineItem}
              className="mt-3 flex items-center text-primary hover:text-primary/80"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Line Item
            </button>
          </div>

          {/* Totals */}
          <div className="flex justify-end mb-8">
            <div className="w-80">
              <div className="flex justify-between items-center py-2">
                <span className="text-card-foreground">Subtotal:</span>
                <span className="text-card-foreground">{formatCurrencySync(subtotal)}</span>
              </div>

              <div className="flex justify-between items-center py-2">
                <div>
                  <label className="block text-sm font-medium text-card-foreground mb-1">
                    Tax Rate
                  </label>
                  <select
                    value={selectedTaxRate?.id || ''}
                    onChange={(e) => {
                      const rate = taxRates.find((r) => r.id === e.target.value) ?? null;
                      setSelectedTaxRate(rate);
                    }}
                    className="w-48 px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-background text-card-foreground"
                  >
                    <option value="">No Tax</option>
                    {taxRates.map((rate) => (
                      <option key={rate.id} value={rate.id}>
                        {rate.name} ({rate.rate}%)
                      </option>
                    ))}
                  </select>
                </div>
                <span className="text-card-foreground">{formatCurrencySync(taxAmount)}</span>
              </div>

              <div className="flex justify-between items-center py-2">
                <div>
                  <label className="block text-sm font-medium text-card-foreground mb-1">
                    Shipping
                  </label>
                  <select
                    value={selectedShippingRate?.id || ''}
                    onChange={(e) => {
                      const rate = shippingRates.find((r) => r.id === e.target.value) ?? null;
                      setSelectedShippingRate(rate);
                    }}
                    className="w-48 px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-background text-card-foreground"
                  >
                    <option value="">No Shipping</option>
                    {shippingRates.map((rate) => (
                      <option key={rate.id} value={rate.id}>
                        {rate.name} (${rate.amount})
                      </option>
                    ))}
                  </select>
                </div>
                <span className="text-card-foreground">{formatCurrencySync(shippingAmount)}</span>
              </div>

              <div className="border-t-2 border-border dark:border-gray-500 pt-2 mt-2">
                <div className="flex justify-between items-center font-bold text-lg">
                  <span className="text-card-foreground">Invoice Total:</span>
                  <span className="text-card-foreground">{formatCurrencySync(total)}</span>
                </div>
                {invoiceData.status === 'paid' && (
                  <div className="flex justify-between items-center font-bold text-lg mt-2 text-green-600">
                    <span>Amount Due:</span>
                    <span>{formatCurrencySync(0)}</span>
                  </div>
                )}
                {(invoiceData.status === 'sent' || invoiceData.status === 'overdue') && (
                  <div className="flex justify-between items-center font-bold text-lg mt-2 text-orange-600">
                    <span>Amount Due:</span>
                    <span>{formatCurrencySync(total)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="border-t-2 border-border dark:border-gray-500 pt-6">
            <label className="block text-sm font-medium text-card-foreground mb-2">Note</label>
            <textarea
              value={thankYouMessage}
              onChange={(e) => setThankYouMessage(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-background text-card-foreground"
              placeholder="Add a personal message to your client..."
            />
          </div>
        </div>
      </div>

      <NavigationGuard />
    </div>
  );
};