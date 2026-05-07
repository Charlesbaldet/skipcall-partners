// Pennylane v2 API client. Wraps the four endpoints we actually need
// (auth probe, supplier upsert, supplier-invoice import, mark-paid)
// behind a class so the calling code in routes/commissions.js stays
// boring. Every method that mutates throws on non-2xx so the caller
// can decide whether to log-and-swallow (we do — Pennylane is a
// secondary system, never blocks the commission flow).
//
// Spec endpoints come from https://pennylane.readme.io/docs/supplier-
// invoicing — but the API has been known to drift between v1/v2 and
// between French / international companies, so the response shape
// guards (data.suppliers || data.company_suppliers || []) are
// deliberate.

const BASE_URL = 'https://app.pennylane.com/api/external/v2';

class PennylaneService {
  constructor(apiToken) {
    if (!apiToken) throw new Error('Pennylane: API token requis');
    this.apiToken = apiToken;
    this.headers = {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
  }

  // ─── Auth probe ───────────────────────────────────────────────────
  // Hit /me to validate the token without doing anything destructive.
  // Used at connect-time and on /api/pennylane/status.
  async verifyConnection() {
    const res = await fetch(`${BASE_URL}/me`, { headers: this.headers });
    if (!res.ok) throw new Error(`Pennylane auth failed: ${res.status}`);
    return res.json();
  }

  // ─── Supplier upsert ──────────────────────────────────────────────
  // Look the partner up by name first; only create when nothing
  // matches. The caller persists the returned id on partners so we
  // skip this round-trip on subsequent commissions for the same
  // partner. Best-effort on the search — if the filter shape changes
  // server-side, fall through to create and let the dedupe surface
  // as a name collision (Pennylane normally allows that).
  async findOrCreateSupplier(partner) {
    const name = partner.company_name || partner.name
      || [partner.first_name, partner.last_name].filter(Boolean).join(' ').trim()
      || 'Partenaire RefBoost';

    try {
      const filter = JSON.stringify([{ field: 'name', operator: 'eq', value: name }]);
      const searchRes = await fetch(
        `${BASE_URL}/company_suppliers?filter=${encodeURIComponent(filter)}`,
        { headers: this.headers }
      );
      if (searchRes.ok) {
        const data = await searchRes.json();
        const suppliers = data.suppliers || data.company_suppliers || data.data || [];
        if (suppliers.length > 0) return suppliers[0];
      }
    } catch { /* fall through to create */ }

    const body = {
      name,
      emails: partner.email ? [partner.email] : [],
    };
    if (partner.address) {
      body.billing_address = {
        address: partner.address,
        postal_code: partner.postal_code || '',
        city: partner.city || '',
        country: partner.tax_country || 'FR',
      };
    }
    if (partner.tax_id) body.vat_number = partner.tax_id;

    const createRes = await fetch(`${BASE_URL}/company_suppliers`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    });
    if (!createRes.ok) {
      const err = await createRes.text();
      throw new Error(`Pennylane create supplier ${createRes.status}: ${err}`);
    }
    const created = await createRes.json();
    // Some API revisions wrap the supplier under `supplier` —
    // unwrap so callers always get a flat row.
    return created.supplier || created.company_supplier || created;
  }

  // ─── Supplier invoice import ──────────────────────────────────────
  // Pennylane wants string-formatted amounts ("45.00"), not floats —
  // they reject floats with a 422. The vat_rate has to be a code
  // they recognize (FR_200 / FR_100 / FR_055 / exempt / any) so we
  // map the snapshotted tax_rate_applied through _mapVatCode below.
  async createSupplierInvoice(commission, partner, supplier) {
    const amountHT  = parseFloat(commission.amount_ht  || commission.amount || 0);
    const amountTax = parseFloat(commission.amount_tax || 0);
    const amountTTC = parseFloat(commission.amount_ttc || amountHT);
    const taxRate   = parseFloat(commission.tax_rate_applied || 0);
    const vatCode = this._mapVatCode(taxRate);

    const today = new Date();
    const deadline = this._addDays(today, 30);

    const invoiceNumber = commission.payment_reference
      || `REFBOOST-${String(commission.id || '').slice(0, 8).toUpperCase()}`;

    const body = {
      supplier_id: supplier.id,
      date:     today.toISOString().slice(0, 10),
      deadline: deadline.toISOString().slice(0, 10),
      currency_amount_before_tax: amountHT.toFixed(2),
      currency_tax:               amountTax.toFixed(2),
      currency_amount:            amountTTC.toFixed(2),
      invoice_number: invoiceNumber,
      invoice_lines: [
        {
          currency_amount: amountTTC.toFixed(2),
          currency_tax:    amountTax.toFixed(2),
          vat_rate: vatCode,
          description: `Commission apporteur d'affaires - ${partner.company_name || partner.name || ''}`.trim(),
        },
      ],
    };

    const res = await fetch(`${BASE_URL}/supplier_invoices/import`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Pennylane create invoice ${res.status}: ${err}`);
    }
    const data = await res.json();
    return data.invoice || data.supplier_invoice || data;
  }

  // ─── Mark invoice paid ────────────────────────────────────────────
  // Called after Qonto reports the SEPA transfer settled. Best-
  // effort: returns null on failure rather than throwing, since by
  // the time we get here the money has already moved and the only
  // consequence of a failed mark-paid is that the admin sees the
  // invoice as "open" in Pennylane until they reconcile manually.
  async markInvoiceAsPaid(invoiceId, paymentDateISO) {
    try {
      const res = await fetch(`${BASE_URL}/supplier_invoices/${invoiceId}`, {
        method: 'PUT',
        headers: this.headers,
        body: JSON.stringify({
          paid: true,
          payment_date: paymentDateISO || new Date().toISOString().slice(0, 10),
        }),
      });
      if (!res.ok) {
        console.error(`[pennylane] mark-paid ${invoiceId} failed: ${res.status}`);
        return null;
      }
      return res.json();
    } catch (err) {
      console.error('[pennylane] mark-paid error:', err.message);
      return null;
    }
  }

  // ─── VAT code mapping ─────────────────────────────────────────────
  // RefBoost stores the rate as a decimal percent (20, 10, 5.5, 0).
  // Pennylane needs a string code for the standard French rates and
  // accepts 'exempt' for 0 / null and 'any' as a catch-all for non-
  // French rates (DE 19, CH 8.1, etc.).
  _mapVatCode(rate) {
    if (!rate || rate === 0) return 'exempt';
    if (rate === 20)  return 'FR_200';
    if (rate === 10)  return 'FR_100';
    if (rate === 5.5) return 'FR_055';
    return 'any';
  }

  _addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }
}

module.exports = PennylaneService;
