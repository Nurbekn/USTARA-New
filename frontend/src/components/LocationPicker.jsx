import { useEffect, useId, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { isValidLocation, locationResults } from "./locationSearch";

const TASHKENT = [41.2995, 69.2401];

const markerIcon = L.divIcon({
  className: "bp-marker-wrap",
  html: '<div class="bp-marker">Ish joyi</div>',
  iconSize: [84, 44],
  iconAnchor: [42, 44],
});

// Xarita ko'rinishini to'g'rilaydi va nuqta ekrandan chiqib ketsa, uni markazga oladi.
function MapCenter({ value }) {
  const map = useMap();

  // Konteyner o'lchami keyin o'zgarsa ham xarita to'liq chizilishi uchun.
  useEffect(() => {
    const timer = setTimeout(() => map.invalidateSize(), 250);
    return () => clearTimeout(timer);
  }, [map]);

  useEffect(() => {
    if (!isValidLocation(value)) return;

    const target = [value.lat, value.lng];
    map.setView(target, Math.max(map.getZoom(), 16), { animate: false });
  }, [value, map]);

  return null;
}

function MapInteraction({ editable }) {
  const map = useMap();
  useEffect(() => {
    for (const name of ["dragging", "touchZoom", "doubleClickZoom", "scrollWheelZoom", "keyboard", "boxZoom", "tapHold"]) {
      map[name]?.[editable ? "enable" : "disable"]();
    }
  }, [map, editable]);
  return null;
}

function MapClick({ onChange, editable }) {
  useMapEvents({
    click(event) {
      if (editable) onChange({ lat: event.latlng.lat, lng: event.latlng.lng });
    },
  });

  return null;
}

export default function LocationPicker({
  value,
  onChange,
  address = "",
  onAddressChange,
  error,
  editable = true,
  id,
}) {
  const inputId = useId();
  const [message, setMessage] = useState("");
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [results, setResults] = useState(null);
  const request = useRef(null);
  const version = useRef(0);
  const active = useRef(editable);
  const valid = isValidLocation(value);

  useEffect(() => {
    active.current = editable;
    if (!editable) {
      version.current += 1;
      request.current?.abort();
    }
  }, [editable]);
  useEffect(() => () => {
    version.current += 1;
    request.current?.abort();
  }, []);

  const begin = () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const token = ++version.current;
    setSearching(false);
    setResolving(false);
    setLocating(false);
    return { controller, token };
  };
  const current = (token) => active.current && token === version.current;

  const editAddress = (text) => {
    begin();
    setResults(null);
    setMessage("");
    onAddressChange?.(text);
    // A new address cannot inherit the previous address's coordinates.
    onChange(null);
  };

  const searchAddress = async () => {
    if (!editable || searching) return;
    const query = address.trim();
    if (query.length < 3) {
      setMessage("Shahar, ko'cha va uy raqamini to'liqroq kiriting.");
      return;
    }
    const { controller, token } = begin();
    setSearching(true);
    setResults(null);
    setMessage("");
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const params = new URLSearchParams({ format: "jsonv2", q: query, countrycodes: "uz", addressdetails: "1", limit: "5", "accept-language": "uz" });
      const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { signal: controller.signal });
      if (!response.ok) throw new Error();
      const matches = locationResults(await response.json());
      if (!current(token)) return;
      setResults(matches);
      if (!matches.length) setMessage("Manzil topilmadi. Yozilishini tekshiring yoki xaritadan aniq joyni tanlang.");
    } catch {
      if (current(token)) setMessage("Manzilni tekshirib bo'lmadi. Internetni tekshirib, qayta qidiring yoki xaritadan tanlang.");
    } finally {
      clearTimeout(timeout);
      if (current(token)) setSearching(false);
    }
  };

  const chooseResult = (item) => {
    begin();
    onAddressChange?.(item.label);
    onChange({ lat: item.lat, lng: item.lng });
    setResults(null);
    setMessage("");
  };

  const resolvePoint = async (point) => {
    if (!active.current || !isValidLocation(point)) return;
    const { controller, token } = begin();
    setResults(null);
    setMessage("");
    // A map selection is itself valid, even when reverse geocoding is offline.
    onAddressChange?.("");
    onChange(point);
    setResolving(true);
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const params = new URLSearchParams({ format: "jsonv2", lat: point.lat, lon: point.lng, "accept-language": "uz" });
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`, { signal: controller.signal });
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (!current(token)) return;
      if (data.display_name) onAddressChange?.(data.display_name);
      else throw new Error();
    } catch {
      if (current(token)) setMessage("Nuqta belgilandi, lekin manzil nomi aniqlanmadi. Xaritadagi joyni tekshiring yoki manzilni qayta qidiring.");
    } finally {
      clearTimeout(timeout);
      if (current(token)) setResolving(false);
    }
  };

  const detectLocation = () => {
    if (!navigator.geolocation) return setMessage("Brauzeringiz GPS ni qo'llab-quvvatlamaydi.");
    const { token } = begin();
    setLocating(true);
    setMessage("");
    navigator.geolocation.getCurrentPosition((position) => {
      if (current(token)) resolvePoint({ lat: position.coords.latitude, lng: position.coords.longitude });
    }, () => {
      if (!current(token)) return;
      setLocating(false);
      setMessage("Joylashuv aniqlanmadi. GPS ruxsatini tekshiring yoki xaritadan tanlang.");
    }, { enableHighAccuracy: true, timeout: 10000 });
  };

  const problem = error || message;

  return (
    <div className="bp-picker">
      <div className={`bp-location-summary ${valid ? "is-set" : "is-missing"}`}>
        <span className="bp-location-pin" aria-hidden="true">{valid ? "⌖" : "!"}</span>
        <div>
          <strong>{valid ? "Tanlangan joylashuv" : "Joylashuv tanlanmagan"}</strong>
          <p>{valid ? (address || "Xaritada tanlangan nuqta") : "Manzilni qidiring va natijadan tanlang yoki xaritada belgilang."}</p>
        </div>
      </div>
      {editable && onAddressChange && <div className="bp-address-editor">
        <label htmlFor={inputId}>Manzilni qidiring</label>
        <div className="bp-search">
          <input id={inputId} type="search" className="bp-input" placeholder="Masalan: Toshkent, Amir Temur ko'chasi, 15" value={address}
            onChange={(event) => editAddress(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); searchAddress(); } }}
            aria-describedby={`${inputId}-hint`} aria-invalid={!!problem && !valid} />
          <button type="button" className="bp-btn bp-btn-primary" onClick={searchAddress} disabled={searching || address.trim().length < 3}>
            {searching ? "Qidirilmoqda…" : "Qidirish"}
          </button>
        </div>
        <p id={`${inputId}-hint`} className="bp-note">Topilgan manzilni tanlang, so'ng markerning aniq joyini tekshiring.</p>
        {results?.length > 0 && <ul className="bp-location-results" aria-label="Topilgan manzillar">
          {results.map((item) => <li key={item.id}><button type="button" onClick={() => chooseResult(item)}><strong>{item.label.split(",")[0]}</strong><span>{item.label}</span><b>Shu joyni tanlash →</b></button></li>)}
        </ul>}
      </div>}

      <div id={id} className={`bp-map-box ${editable ? "is-editable" : "is-locked"}`}>
        <div className="bp-map-surface" inert={!editable}>
        <MapContainer
          center={valid ? [value.lat, value.lng] : TASHKENT}
          zoom={valid ? 16 : 12}
          className="bp-map"
          scrollWheelZoom={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <MapCenter value={valid ? value : null} />
          <MapInteraction editable={editable} />
          <MapClick onChange={resolvePoint} editable={editable} />

          {valid && (
            <Marker
              position={[value.lat, value.lng]}
              icon={markerIcon}
              draggable={editable}
              eventHandlers={{
                dragend(event) {
                  const position = event.target.getLatLng();
                  if (editable) resolvePoint({ lat: position.lat, lng: position.lng });
                },
              }}
            />
          )}
        </MapContainer>
        </div>
      </div>

      {editable && <button
          type="button"
          className="bp-btn bp-gps"
          onClick={detectLocation}
          disabled={locating}
        >
          {locating ? "Aniqlanmoqda..." : "Mening joylashuvim"}
        </button>}

      {resolving && editable && <p className="bp-note" role="status">Nuqta belgilandi. Manzil aniqlanmoqda…</p>}
      {problem ? (
        <p className="bp-note is-error" role="alert">
          {problem}
        </p>
      ) : (
        <p className={`bp-note ${valid ? "is-ok" : ""}`}>
          {!editable
            ? "Xarita qulflangan. Joyni almashtirish uchun «Joylashuvni o‘zgartirish»ni bosing."
            : valid
            ? "Joylashuv belgilandi. Nuqtani sudrab aniqlashtirishingiz mumkin."
            : "Xaritaga bosing, manzilni qidiring yoki GPS dan foydalaning."}
        </p>
      )}
    </div>
  );
}
