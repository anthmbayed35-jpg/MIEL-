"use client";

import { useEffect, useRef, useState } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any -- the Google Maps JavaScript API is loaded at runtime and has no bundled types here */

export type Pin = { lat: number; lon: number };

const LEBANON = { north: 34.75, south: 33.0, west: 35.05, east: 36.7 };
const inLebanon = (lat: number, lon: number) => lat >= LEBANON.south && lat <= LEBANON.north && lon >= LEBANON.west && lon <= LEBANON.east;
const CENTER = { lat: 33.8938, lng: 35.5018 };

let loader: Promise<any> | null = null;
/** Loads the Google Maps JavaScript API once, only when the customer opens the pin step. */
function loadMaps(key: string): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  const w = window as any;
  if (w.google?.maps?.importLibrary) return Promise.resolve(w.google);
  loader ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&language=en&region=LB`;
    s.async = true;
    s.onload = () => resolve((window as any).google);
    s.onerror = () => {
      loader = null;
      reject(new Error("Google Maps could not be loaded"));
    };
    document.head.appendChild(s);
  });
  return loader;
}

/**
 * Optional "Pin your location" step. Rendered ONLY when the server has GOOGLE_MAPS_API_KEY (the checkout page passes the key down);
 * without a key nothing of this exists. Search (Places Autocomplete, Lebanon only) or tap/drag the map. Never required.
 */
export function PinPicker({ apiKey, pin, onChange }: { apiKey: string; pin: Pin | null; onChange: (p: Pin | null) => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const searchBox = useRef<HTMLDivElement>(null);
  const mapBox = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const marker = useRef<any>(null);
  const latest = useRef(onChange);
  useEffect(() => {
    latest.current = onChange; // always call the newest handler from map events
  });

  useEffect(() => {
    if (!open) return;
    let dead = false;
    (async () => {
      try {
        const google = await loadMaps(apiKey);
        const { Map } = await google.maps.importLibrary("maps");
        const places = await google.maps.importLibrary("places");
        if (dead || !mapBox.current) return;
        const start = pin ? { lat: pin.lat, lng: pin.lon } : CENTER;
        map.current = new Map(mapBox.current, {
          center: start,
          zoom: pin ? 16 : 8,
          restriction: { latLngBounds: LEBANON, strictBounds: false },
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
          gestureHandling: "greedy",
        });
        const place = (lat: number, lon: number, zoom = 16) => {
          if (!inLebanon(lat, lon)) {
            setError("Please choose a place in Lebanon.");
            return;
          }
          setError("");
          const pos = { lat, lng: lon };
          if (!marker.current) {
            marker.current = new google.maps.Marker({ map: map.current, position: pos, draggable: true });
            marker.current.addListener("dragend", () => {
              const p = marker.current.getPosition();
              place(p.lat(), p.lng(), map.current.getZoom());
            });
          } else marker.current.setPosition(pos);
          map.current.panTo(pos);
          if (zoom) map.current.setZoom(zoom);
          latest.current({ lat, lon });
        };
        if (pin) place(pin.lat, pin.lon);
        map.current.addListener("click", (e: any) => place(e.latLng.lat(), e.latLng.lng(), map.current.getZoom()));

        // search box: the current Places element, else the classic widget
        if (searchBox.current && !searchBox.current.firstChild) {
          if (places.PlaceAutocompleteElement) {
            const el = new places.PlaceAutocompleteElement({ includedRegionCodes: ["lb"] });
            el.style.width = "100%";
            el.addEventListener("gmp-select", async (ev: any) => {
              const p = ev.placePrediction.toPlace();
              await p.fetchFields({ fields: ["location"] });
              if (p.location) place(p.location.lat(), p.location.lng());
            });
            searchBox.current.appendChild(el);
          } else if (places.Autocomplete) {
            const inp = document.createElement("input");
            inp.type = "search";
            inp.placeholder = "Search your street or building";
            inp.className = "w-full min-h-14 rounded-[14px] bg-white/5 border border-white/15 px-4 text-[18px] text-fg";
            searchBox.current.appendChild(inp);
            const ac = new places.Autocomplete(inp, { componentRestrictions: { country: "lb" }, fields: ["geometry"] });
            ac.addListener("place_changed", () => {
              const g = ac.getPlace()?.geometry?.location;
              if (g) place(g.lat(), g.lng());
            });
          }
        }
        setReady(true);
      } catch {
        if (!dead) setError("The map could not be loaded. You can skip this step: your address above is enough.");
      }
    })();
    return () => {
      dead = true;
    };
    // the map is created once per opening; the saved pin only seeds it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, apiKey]);

  return (
    <section className="glass space-y-4 p-5 md:p-8" aria-labelledby="h-pin">
      <h2 id="h-pin" className="display text-[22px]">Pin your location <span className="mono !text-body">(optional)</span></h2>
      <p className="text-[17px] text-body">Help the courier find you. You can skip this: your address above is enough.</p>
      {pin && (
        <p role="status" className="rounded-2xl border border-acid/40 bg-acid/10 px-4 py-3 text-[17px] text-fg" data-testid="pin-saved">
          Pin saved ({pin.lat.toFixed(5)}, {pin.lon.toFixed(5)}).
        </p>
      )}
      {!open ? (
        <button type="button" className="btn-ghost" onClick={() => setOpen(true)}>
          {pin ? "CHANGE PIN" : "PIN MY LOCATION"}
        </button>
      ) : (
        <div className="space-y-3">
          <div ref={searchBox} className="min-h-14" />
          <div ref={mapBox} className="h-[320px] w-full overflow-hidden rounded-[14px] bg-white/5" role="application" aria-label="Map: tap to drop your pin" />
          {!ready && !error && <p className="text-[16px] text-body">Loading the map…</p>}
          <p className="text-[15px] text-body">Search above, or tap the map. Drag the pin to adjust it.</p>
        </div>
      )}
      {error && (
        <p role="alert" className="text-[16px] text-[#FF8AA0]">
          {error}
        </p>
      )}
      {pin && (
        <button type="button" className="link text-[16px]" onClick={() => { onChange(null); marker.current?.setMap?.(null); marker.current = null; }}>
          Remove pin
        </button>
      )}
    </section>
  );
}
