import { Link } from 'react-router-dom';
import { Ruler, Calculator, CalendarCheck, MapPin, ShieldCheck, Sparkles, Home as HomeIcon, Droplets } from 'lucide-react';
import { useApi } from '../lib/hooks.js';
import { money, UNIT, CATEGORY } from '../lib/format.js';
import { useApp } from '../context/AppContext.jsx';

const steps = [
  { icon: MapPin, title: 'Find your property', text: 'Type your address and see it on a satellite map.' },
  { icon: Ruler, title: 'Outline what to clean', text: 'Draw your driveway, roof, siding or fence – we measure it for you.' },
  { icon: Calculator, title: 'Get an instant price', text: 'See an itemized quote right away. No phone tag.' },
  { icon: CalendarCheck, title: 'Book & track', text: 'Pick a time, then follow your job live from your phone.' },
];

export default function Home() {
  const { data } = useApi('/public/services');
  const { config } = useApp();
  const groups = ['POWER_WASH', 'SOFT_WASH'].map((c) => ({ c, items: data?.services?.filter((s) => s.category === c) || [] }));

  return (
    <div>
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-800 via-brand-700 to-sky-500 text-white">
        <Droplets className="absolute -right-10 -top-10 h-72 w-72 text-white/10" />
        <div className="relative mx-auto max-w-6xl px-4 py-16 sm:py-24">
          <span className="chip bg-white/15 text-white">
            <Sparkles className="h-3.5 w-3.5" /> Power washing & soft washing
          </span>
          <h1 className="mt-4 max-w-2xl text-4xl font-bold leading-tight text-white sm:text-5xl">A cleaner home, priced in under two minutes.</h1>
          <p className="mt-4 max-w-xl text-lg text-sky-100">
            Measure your surfaces on a satellite map, get an instant itemized quote, and book a time that works for you.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/quote" className="btn bg-white px-6 py-3 text-base text-brand-800 hover:bg-sky-50">
              <Calculator className="h-5 w-5" /> Get my instant quote
            </Link>
            {config?.businessPhone && (
              <a href={`tel:${config.businessPhone}`} className="btn border border-white/40 px-6 py-3 text-base text-white hover:bg-white/10">
                Call {config.businessPhone}
              </a>
            )}
          </div>
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-sky-100">
            <span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4" /> Licensed & insured</span>
            <span className="flex items-center gap-1.5"><HomeIcon className="h-4 w-4" /> Safe soft wash for roofs & siding</span>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-2xl">How it works</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <div key={s.title} className="card p-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                <s.icon className="h-5 w-5" />
              </span>
              <p className="mt-3 text-xs font-semibold uppercase text-slate-400">Step {i + 1}</p>
              <h3 className="mt-1">{s.title}</h3>
              <p className="mt-1 text-sm text-slate-600">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <h2 className="text-2xl">Services & starting prices</h2>
          <div className="mt-6 grid gap-8 lg:grid-cols-2">
            {groups.map((g) => (
              <div key={g.c}>
                <h3 className="mb-3 text-lg text-brand-800">{CATEGORY[g.c]}</h3>
                <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {g.items.map((s) => (
                    <div key={s.id} className="flex items-start justify-between gap-4 p-4">
                      <div>
                        <p className="font-medium">{s.name}</p>
                        <p className="mt-0.5 text-sm text-slate-500">{s.description}</p>
                      </div>
                      <div className="shrink-0 text-right text-sm">
                        <p className="font-semibold">
                          {money(s.pricePerUnit)}
                          <span className="font-normal text-slate-500">/{UNIT[s.unit]}</span>
                        </p>
                        <p className="text-xs text-slate-500">min {money(s.minimumCharge)}</p>
                      </div>
                    </div>
                  ))}
                  {!g.items.length && <p className="p-4 text-sm text-slate-500">Loading…</p>}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-10 text-center">
            <Link to="/quote" className="btn-primary px-6 py-3 text-base">
              Start my quote
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 py-8 text-center text-sm text-slate-500">
        © {new Date().getFullYear()} {config?.businessName}
        {config?.businessEmail && <> · {config.businessEmail}</>}
      </footer>
    </div>
  );
}
