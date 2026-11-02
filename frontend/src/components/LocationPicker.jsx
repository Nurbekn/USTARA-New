import { useEffect, useState } from "react";
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
  className: "barber-marker-wrapper",
  html: '<div class="barber-map-marker">Ish joyi</div>',
  iconSize: [80, 35],
  iconAnchor: [40, 35],
});

function MapCenter({ value }) {
  const map = useMap();

  useEffect(() => {
    if (value) {
      map.setView([value.lat, value.lng], Math.max(map.getZoom(), 15));
    }
  }, [value, map]);

  return null;
}

function MapClick({ onChange }) {
  useMapEvents({
    click(event) {
      onChange({
        lat: event.latlng.lat,
        lng: event.latlng.lng,
      });
    },
  });

  return null;
}

export default function LocationPicker({ value, onChange }) {
  const [mapError, setMapError] = useState("");
  const [address, setAddress] = useState("");

  useEffect(() => {
    if (!value) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAddress("");
      return;
    }

    setAddress("");

    const controller = new AbortController();

    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${value.lat}&lon=${value.lng}&accept-language=uz`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          throw new Error("Manzilni aniqlab bo'lmadi");
        }

        const data = await response.json();
        const a = data.address || {};

        const street = [a.road, a.house_number].filter(Boolean).join(" ");

        const area = a.suburb || a.neighbourhood || a.city_district || a.city;

        setAddress(
          [street, area].filter(Boolean).join(", ") || data.display_name || "",
        );
      } catch (error) {
        if (error.name !== "AbortError") {
          setAddress("");
        }
      }
    }, 600);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value]);

  const detectGps = () => {
    if (!navigator.geolocation) {
      setMapError("Brauzeringiz GPS ni qo'llab-quvvatlamaydi");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setMapError("");

        onChange({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      () => {
        setMapError("Joylashuvni aniqlab bo'lmadi");
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
      },
    );
  };

  return (
    <div className="location-picker">
      <button type="button" className="add-btn" onClick={detectGps}>
        GPS orqali aniqlash
      </button>

      {mapError && <p className="error">{mapError}</p>}

      <MapContainer
        center={value ? [value.lat, value.lng] : TASHKENT}
        zoom={13}
        className="map"
        scrollWheelZoom
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

                onChange({
                  lat: position.lat,
                  lng: position.lng,
                });
              },
            }}
          />
        )}
      </MapContainer>

      <p className={`location-hint ${value ? "is-set" : ""}`}>
        {value ? "Joylashuvingiz belgilandi" : "Xaritada ish joyingizni bosing"}
      </p>

      {value && (
        <>
          <p className="location-address">
            {address || "Manzil aniqlanmoqda..."}
          </p>

          <p className="location-coordinates">
            {value.lat.toFixed(6)}, {value.lng.toFixed(6)}
          </p>
        </>
      )}
    </div>
  );
}
