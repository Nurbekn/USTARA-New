import { useEffect, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

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
    if (!value) return;

    const target = [value.lat, value.lng];
    const visible = map.getBounds().pad(-0.2).contains(target);

    if (!visible || map.getZoom() < 15) {
      map.setView(target, Math.max(map.getZoom(), 15), { animate: true });
    }
  }, [value, map]);

  return null;
}

function MapClick({ onChange }) {
  useMapEvents({
    click(event) {
      onChange({ lat: event.latlng.lat, lng: event.latlng.lng });
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
}) {
  const [message, setMessage] = useState("");
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);

  // Manzil qidiruvdan kelgan koordinata uchun teskari qidiruvni o'tkazib yuboradi,
  // aks holda foydalanuvchi yozgan manzil o'zgarib ketadi.
  const skipReverse = useRef(false);

  // Manzil -> koordinata
  const searchAddress = async () => {
    const query = address.trim();

    if (!query) {
      setMessage("Avval manzilni yozing.");
      return;
    }

    setSearching(true);
    setMessage("");

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(
          query + ", Uzbekistan",
        )}&limit=1&accept-language=uz`,
      );

      if (!response.ok) throw new Error("search failed");

      const data = await response.json();

      if (data.length === 0) {
        setMessage("Bu manzil topilmadi. Xaritadan o'zingiz belgilang.");
        return;
      }

      const next = { lat: Number(data[0].lat), lng: Number(data[0].lon) };

      if (!value || value.lat !== next.lat || value.lng !== next.lng) {
        skipReverse.current = true;
      }

      onChange(next);
    } catch {
      setMessage("Qidirishda xatolik. Internetni tekshiring.");
    } finally {
      setSearching(false);
    }
  };

  // GPS orqali aniqlash
  const detectLocation = () => {
    if (!navigator.geolocation) {
      setMessage("Brauzeringiz GPS ni qo'llab-quvvatlamaydi.");
      return;
    }

    setLocating(true);
    setMessage("");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        onChange({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      () => {
        setLocating(false);
        setMessage("Joylashuvni aniqlab bo'lmadi. GPS ruxsatini tekshiring.");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  // Koordinata -> manzil
  useEffect(() => {
    if (!value) return;

    if (skipReverse.current) {
      skipReverse.current = false;
      return;
    }

    const controller = new AbortController();

    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${value.lat}&lon=${value.lng}&accept-language=uz`,
          { signal: controller.signal },
        );

        if (!response.ok) throw new Error("reverse failed");

        const data = await response.json();
        const a = data.address || {};

        const street = [a.road, a.house_number].filter(Boolean).join(" ");
        const area = a.suburb || a.neighbourhood || a.city_district;
        const city = a.city || a.town || a.village;

        const result = [street, area, city]
          .filter(Boolean)
          .filter((item, index, array) => array.indexOf(item) === index)
          .join(", ");

        onAddressChange?.(result || data.display_name || "");
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error("Reverse geocoding:", err);
        }
      }
    }, 700);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value, onAddressChange]);

  const problem = error || message;

  return (
    <div className="bp-picker">
      <div className="bp-search">
        <input
          type="text"
          className="bp-input"
          placeholder="Manzilni yozing: Chilonzor, 9-kvartal"
          value={address}
          onChange={(event) => onAddressChange?.(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              searchAddress();
            }
          }}
          aria-label="Manzil"
        />

        <button
          type="button"
          className="bp-btn bp-btn-primary"
          onClick={searchAddress}
          disabled={searching}
        >
          {searching ? "Qidirilmoqda..." : "Qidirish"}
        </button>
      </div>

      <div className="bp-map-box">
        <MapContainer
          center={value ? [value.lat, value.lng] : TASHKENT}
          zoom={value ? 15 : 12}
          className="bp-map"
          scrollWheelZoom={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <MapCenter value={value} />
          <MapClick onChange={onChange} />

          {value && (
            <Marker
              position={[value.lat, value.lng]}
              icon={markerIcon}
              draggable
              eventHandlers={{
                dragend(event) {
                  const position = event.target.getLatLng();
                  onChange({ lat: position.lat, lng: position.lng });
                },
              }}
            />
          )}
        </MapContainer>

        <button
          type="button"
          className="bp-btn bp-gps"
          onClick={detectLocation}
          disabled={locating}
        >
          {locating ? "Aniqlanmoqda..." : "Mening joylashuvim"}
        </button>
      </div>

      {problem ? (
        <p className="bp-note is-error" role="alert">
          {problem}
        </p>
      ) : (
        <p className={`bp-note ${value ? "is-ok" : ""}`}>
          {value
            ? "Joylashuv belgilandi. Nuqtani sudrab aniqlashtirishingiz mumkin."
            : "Xaritaga bosing, manzilni qidiring yoki GPS dan foydalaning."}
        </p>
      )}
    </div>
  );
}
