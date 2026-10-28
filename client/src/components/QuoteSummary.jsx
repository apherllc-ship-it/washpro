import { Clock } from 'lucide-react';
import { money, num, UNIT_SHORT } from '../lib/format.js';

const hours = (m) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`);

// Itemized quote. Works with both a live preview and a saved quote.
export default function QuoteSummary({ quote, compact }) {
  if (!quote) return null;
  return (
    <div className="text-sm">
      <ul className="divide-y divide-slate-100">
        {quote.items.map((i, idx) => (
          <li key={i.id || idx} className="py-3">
            <div className="flex justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-slate-900">
                  {i.serviceName}
                  {i.label && <span className="font-normal text-slate-500"> · {i.label}</span>}
                </p>
                <p className="text-xs text-slate-500">
                  {i.unit === 'FLAT' ? 'Flat rate' : `${num(i.quantity)} ${UNIT_SHORT[i.unit]} × ${money(i.unitPrice)}`}
                  {i.materialName && ` · ${i.materialName}${i.multiplier !== 1 ? ` (×${i.multiplier})` : ''}`}
                </p>
                {i.minimumApplied && <p className="text-xs text-amber-700">Minimum charge applied</p>}
              </div>
              <span className="shrink-0 font-medium">{money(i.baseAmount)}</span>
            </div>
            {(i.addOns || []).map((a) => (
              <div key={a.id || a.name} className="mt-1 flex justify-between pl-3 text-xs text-slate-600">
                <span>+ {a.name}</span>
                <span>{money(a.amount)}</span>
              </div>
            ))}
          </li>
        ))}
      </ul>
      <dl className="space-y-1.5 border-t border-slate-200 pt-3">
        <Row label="Subtotal" value={money(quote.subtotal)} />
        <Row label={`Travel fee${quote.distanceMiles ? ` (${num(quote.distanceMiles, 1)} mi)` : ''}`} value={quote.travelFee ? money(quote.travelFee) : 'Free'} />
        {quote.tax > 0 && <Row label="Tax" value={money(quote.tax)} />}
        <div className="flex items-center justify-between border-t border-slate-200 pt-2 text-base font-semibold">
          <dt>Total</dt>
          <dd>{money(quote.total)}</dd>
        </div>
        {quote.deposit > 0 && <Row label="Deposit due at booking" value={money(quote.deposit)} />}
      </dl>
      {!compact && quote.durationMinutes && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
          <Clock className="h-3.5 w-3.5" /> Estimated on-site time: {hours(quote.durationMinutes)}
        </p>
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between text-slate-600">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
