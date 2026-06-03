// Student fee helpers — money is handled as decimal *strings* end-to-end
// (the backend serialises shopspring/decimal as quoted strings like "1500.00").
// We never parseFloat a rupee value; all arithmetic runs in integer paise so
// totals stay exact. Display goes through `money()` (Indian digit grouping).
import { apiFetch } from '@/lib/api';

// ── decimal-string arithmetic (integer paise, no float) ────────────────────

// "1500.00" / "1500" / "-50.5" → integer paise (150000 / 150000 / -5050).
export function paiseOf(s) {
  if (s == null) return 0;
  const str = String(s).trim();
  if (str === '') return 0;
  const neg = str.startsWith('-');
  const body = neg ? str.slice(1) : str;
  const [intPart = '0', fracRaw = ''] = body.split('.');
  const frac = (fracRaw + '00').slice(0, 2);
  const paise = Number(intPart || '0') * 100 + Number(frac || '0');
  return neg ? -paise : paise;
}

// integer paise → canonical decimal string with 2 places ("1500.00").
export function decFromPaise(p) {
  const neg = p < 0;
  const a = Math.abs(p);
  const rupees = Math.floor(a / 100);
  const paise = a % 100;
  return (neg ? '-' : '') + rupees + '.' + String(paise).padStart(2, '0');
}

export const subDec = (a, b) => decFromPaise(paiseOf(a) - paiseOf(b));
export const sumDec = (list) => decFromPaise(list.reduce((t, x) => t + paiseOf(x), 0));

// Indian-style digit grouping on a decimal string → "₹1,50,000.00".
export function money(s) {
  const dec = decFromPaise(paiseOf(s));
  const neg = dec.startsWith('-');
  const body = neg ? dec.slice(1) : dec;
  const [intStr, frac] = body.split('.');
  let grouped = intStr;
  if (intStr.length > 3) {
    const last3 = intStr.slice(-3);
    const rest = intStr.slice(0, -3);
    grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
  }
  return (neg ? '-' : '') + '₹' + grouped + '.' + frac;
}

// ── labels ─────────────────────────────────────────────────────────────────

const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

export const monthName = (m) => MONTHS[m] || '';

export const feeTypeLabel = (t) =>
  t ? t.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : 'Fee';

// "March · Tuition" (month is optional / 0 for one-off fees like admission).
export const feeLabel = (f) => {
  const type = feeTypeLabel(f.fee_type);
  const mn = monthName(f.month);
  return mn ? `${mn} · ${type}` : type;
};

// ── balances ─────────────────────────────────────────────────────────────────
// /api/me/fees returns net_amount, but leaves amount_paid/balance at "0"
// (they're computed-only fields the list handler doesn't fill). We derive the
// real paid/balance honestly: paid & unpaid are exact from status + net_amount;
// only 'partial' fees need their payment history fetched and summed.

async function partialPaid(feeId) {
  try {
    const payments = await apiFetch(`/api/me/fees/${feeId}/payments`);
    const completed = (Array.isArray(payments) ? payments : [])
      .filter((p) => p.status === 'completed')
      .map((p) => p.amount);
    return sumDec(completed);
  } catch {
    return null; // signal "unknown" so we don't fabricate a number
  }
}

// Loads /api/me/fees and attaches exact `paid` and `balance` decimal strings to
// each fee. Returns { fees, totalNet, totalPaid, totalBalance } — totals as
// decimal strings. `balance`/`paid` are null on a fee whose partial payment
// history failed to load (rendered as "—" rather than a made-up figure).
export async function loadFeesWithBalances() {
  const raw = await apiFetch('/api/me/fees');
  const fees = Array.isArray(raw) ? raw : [];

  const enriched = await Promise.all(fees.map(async (f) => {
    const net = f.net_amount ?? subDec(f.amount, f.discount || '0');
    let paid, balance;
    if (f.status === 'paid') {
      paid = net;
      balance = '0.00';
    } else if (f.status === 'partial') {
      const p = await partialPaid(f.id);
      paid = p;
      balance = p == null ? null : subDec(net, p);
    } else { // unpaid (or any non-paid status with no payments)
      paid = '0.00';
      balance = net;
    }
    return { ...f, net, paid, balance };
  }));

  const totalNet = sumDec(enriched.map((f) => f.net));
  const totalPaid = sumDec(enriched.map((f) => f.paid).filter(Boolean));
  const totalBalance = sumDec(enriched.map((f) => f.balance).filter(Boolean));

  return { fees: enriched, totalNet, totalPaid, totalBalance };
}
