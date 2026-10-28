import { useEffect, useRef, useState } from 'react';
import { Undo2, Check, X } from 'lucide-react';
import { measurePath } from '../lib/maps.js';

// Satellite map with click-to-draw polygons (areas) and polylines (fences/gutters).
// Google's Drawing Library is deprecated, so drawing is implemented with plain
// map clicks plus editable Polygon/Polyline overlays (drag vertices to adjust).
//
// Props:
//  google, center {lat,lng}, areas [{id, kind, path, color}], selectedId
//  drawing: null | { kind: 'polygon'|'polyline', color }
//  onDrawComplete(path, measure), onDrawCancel(), onPathChange(id, path, measure), onSelect(id)
export default function MeasureMap({ google, center, areas, selectedId, drawing, onDrawComplete, onDrawCancel, onPathChange, onSelect, readOnly = false, className = '' }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const shapesRef = useRef(new Map()); // id -> overlay
  const draftRef = useRef(null);
  const [draft, setDraft] = useState([]);
  const cbRef = useRef({});
  cbRef.current = { onDrawComplete, onDrawCancel, onPathChange, onSelect };

  // Create the map once.
  useEffect(() => {
    if (!google || !elRef.current || mapRef.current) return;
    mapRef.current = new google.maps.Map(elRef.current, {
      center: center || { lat: 39.5, lng: -98.35 },
      zoom: center ? 20 : 4,
      mapTypeId: 'satellite',
      tilt: 0,
      disableDoubleClickZoom: true,
      gestureHandling: 'greedy',
      streetViewControl: false,
      mapTypeControl: false,
      rotateControl: false,
      fullscreenControl: true,
      clickableIcons: false,
    });
  }, [google]); // eslint-disable-line react-hooks/exhaustive-deps

  // Recenter + marker when the address changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !center) return;
    map.setCenter(center);
    map.setZoom(20);
    if (!markerRef.current) markerRef.current = new google.maps.Marker({ map, clickable: false });
    markerRef.current.setPosition(center);
  }, [google, center?.lat, center?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync overlays with the areas list.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const shapes = shapesRef.current;
    const ids = new Set(areas.filter((a) => a.path?.length).map((a) => a.id));

    for (const [id, shape] of shapes) {
      if (!ids.has(id)) {
        google.maps.event.clearInstanceListeners(shape);
        google.maps.event.clearInstanceListeners(shape.getPath());
        shape.setMap(null);
        shapes.delete(id);
      }
    }

    for (const a of areas) {
      if (!a.path?.length) continue;
      let shape = shapes.get(a.id);
      if (!shape) {
        const Ctor = a.kind === 'polygon' ? google.maps.Polygon : google.maps.Polyline;
        shape = new Ctor({ map, path: a.path });
        const path = shape.getPath();
        const emit = () => {
          const pts = path.getArray().map((p) => ({ lat: p.lat(), lng: p.lng() }));
          cbRef.current.onPathChange?.(a.id, pts, measurePath(google, pts, a.kind));
        };
        ['set_at', 'insert_at', 'remove_at'].forEach((ev) => path.addListener(ev, emit));
        shape.addListener('click', () => cbRef.current.onSelect?.(a.id));
        // Right-click / long-press a vertex to delete it.
        shape.addListener('contextmenu', (e) => {
          if (e.vertex == null) return;
          const min = a.kind === 'polygon' ? 3 : 2;
          if (path.getLength() > min) path.removeAt(e.vertex);
        });
        shapes.set(a.id, shape);
      }
      const selected = a.id === selectedId;
      shape.setOptions({
        strokeColor: a.color,
        strokeWeight: a.kind === 'polyline' ? (selected ? 6 : 4) : selected ? 3 : 2,
        strokeOpacity: 1,
        fillColor: a.color,
        fillOpacity: selected ? 0.45 : 0.3,
        editable: selected && !readOnly && !drawing,
        clickable: !drawing,
        zIndex: selected ? 2 : 1,
      });
    }
  }, [google, areas, selectedId, drawing, readOnly]);

  // Fit to existing shapes in read-only mode.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readOnly) return;
    const pts = areas.flatMap((a) => a.path || []);
    if (!pts.length) return;
    const b = new google.maps.LatLngBounds();
    pts.forEach((p) => b.extend(p));
    map.fitBounds(b, 40);
  }, [google, readOnly, areas]);

  // Drawing mode: clicks add vertices to a draft polyline.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;
    setDraft([]);
    if (!drawing) {
      draftRef.current?.setMap(null);
      draftRef.current = null;
      map.setOptions({ draggableCursor: null });
      return undefined;
    }
    map.setOptions({ draggableCursor: 'crosshair' });
    draftRef.current = new google.maps.Polyline({ map, path: [], strokeColor: drawing.color, strokeWeight: 3, clickable: false, icons: [{ icon: { path: google.maps.SymbolPath.CIRCLE, scale: 4, fillColor: '#fff', fillOpacity: 1, strokeColor: drawing.color }, repeat: '0' }] });
    const add = map.addListener('click', (e) => {
      draftRef.current.getPath().push(e.latLng);
      setDraft(draftRef.current.getPath().getArray().map((p) => ({ lat: p.lat(), lng: p.lng() })));
    });
    const dbl = map.addListener('dblclick', () => finishRef.current());
    return () => {
      google.maps.event.removeListener(add);
      google.maps.event.removeListener(dbl);
      draftRef.current?.setMap(null);
      draftRef.current = null;
    };
  }, [google, drawing]);

  const minPoints = drawing?.kind === 'polygon' ? 3 : 2;
  const finish = () => {
    if (!drawing) return;
    const pts = draftRef.current ? draftRef.current.getPath().getArray().map((p) => ({ lat: p.lat(), lng: p.lng() })) : [];
    if (pts.length < minPoints) return;
    cbRef.current.onDrawComplete?.(pts, measurePath(google, pts, drawing.kind));
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;

  const undo = () => {
    const path = draftRef.current?.getPath();
    if (!path?.getLength()) return;
    path.pop();
    setDraft(path.getArray().map((p) => ({ lat: p.lat(), lng: p.lng() })));
  };

  const live = drawing && draft.length >= 2 ? measurePath(google, draft, drawing.kind === 'polygon' && draft.length >= 3 ? 'polygon' : 'polyline') : null;

  return (
    <div className={`relative overflow-hidden rounded-xl bg-slate-200 ${className}`}>
      <div ref={elRef} className="absolute inset-0" />
      {drawing && (
        <div className="absolute inset-x-2 top-2 z-10 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/95 p-2 text-sm shadow">
          <span className="px-1 text-slate-700">
            {draft.length < minPoints
              ? `Tap the map to add points (${draft.length}/${minPoints}+)`
              : live && (drawing.kind === 'polygon' ? `${Math.round(live.area).toLocaleString()} sq ft` : `${Math.round(live.length).toLocaleString()} ft`)}
          </span>
          <span className="flex gap-1">
            <button type="button" className="btn-secondary btn-sm" onClick={undo} disabled={!draft.length}>
              <Undo2 className="h-3.5 w-3.5" /> Undo
            </button>
            <button type="button" className="btn-secondary btn-sm" onClick={() => cbRef.current.onDrawCancel?.()}>
              <X className="h-3.5 w-3.5" /> Cancel
            </button>
            <button type="button" className="btn-primary btn-sm" onClick={finish} disabled={draft.length < minPoints}>
              <Check className="h-3.5 w-3.5" /> Finish
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
