import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { api } from '../lib/api.js';
import { Spinner } from './ui.jsx';

// Address input. Uses Google's PlaceAutocompleteElement (Places API New) when Maps is loaded,
// falls back to the legacy Autocomplete widget, and finally to server-side geocoding.
export default function AddressSearch({ google, value, onSelect, placeholder = 'Start typing your address…' }) {
  const hostRef = useRef(null);
  const inputRef = useRef(null);
  const [mode, setMode] = useState('plain');
  const [text, setText] = useState(value?.formatted || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setText(value?.formatted || '');
  }, [value?.formatted]);

  useEffect(() => {
    if (!google) return undefined;
    let el;
    let cancelled = false;
    (async () => {
      try {
        const places = await google.maps.importLibrary('places');
        if (cancelled) return;
        if (places.PlaceAutocompleteElement && hostRef.current) {
          el = new places.PlaceAutocompleteElement({ includedRegionCodes: ['us', 'ca'] });
          el.setAttribute('placeholder', placeholder);
          const handle = async (place) => {
            await place.fetchFields({ fields: ['formattedAddress', 'location', 'id'] });
            onSelect({ formatted: place.formattedAddress, lat: place.location.lat(), lng: place.location.lng(), placeId: place.id });
          };
          el.addEventListener('gmp-select', (e) => e.placePrediction && handle(e.placePrediction.toPlace()));
          el.addEventListener('gmp-placeselect', (e) => e.place && handle(e.place)); // older beta event
          hostRef.current.replaceChildren(el);
          setMode('element');
          return;
        }
        if (places.Autocomplete && inputRef.current) {
          const ac = new places.Autocomplete(inputRef.current, { fields: ['formatted_address', 'geometry', 'place_id'], types: ['address'] });
          ac.addListener('place_changed', () => {
            const p = ac.getPlace();
            if (!p.geometry) return;
            setText(p.formatted_address);
            onSelect({ formatted: p.formatted_address, lat: p.geometry.location.lat(), lng: p.geometry.location.lng(), placeId: p.place_id });
          });
          setMode('legacy');
        }
      } catch {
        setMode('plain');
      }
    })();
    return () => {
      cancelled = true;
      el?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [google]);

  const geocode = async (e) => {
    e?.preventDefault();
    if (text.trim().length < 5) return;
    setBusy(true);
    setError('');
    try {
      const { result } = await api.get(`/public/measure/geocode?address=${encodeURIComponent(text)}`);
      if (result) onSelect(result);
      else onSelect({ formatted: text.trim(), lat: null, lng: null });
    } catch {
      onSelect({ formatted: text.trim(), lat: null, lng: null });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div ref={hostRef} className={mode === 'element' ? '' : 'hidden'} />
      {mode !== 'element' && (
        <form onSubmit={geocode} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input ref={inputRef} className="input pl-9" value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} autoComplete="street-address" />
          </div>
          {mode === 'plain' && (
            <button className="btn-primary" disabled={busy}>
              {busy ? <Spinner className="h-4 w-4 text-white" /> : 'Use address'}
            </button>
          )}
        </form>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
