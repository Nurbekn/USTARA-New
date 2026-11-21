import { customerActivityText } from './customerActivityLocaleV148.js';
import { readSiteLocale, siteLocalePath, siteLocaleSwitchUrl } from '../../utils/siteLocale.js';
import { Link, useLocation } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { useEffect, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './BarbersMap.css';
import { mappedBarbers, mapProfileHref, mapBookingHref } from './explore/mapLinks.js';

const barberIcon = L.divIcon({ className: 'ustara-barber-map-pin', html: '<span aria-hidden="true">✂</span>', iconSize: [38, 38], iconAnchor: [19, 38] });
const userIcon = L.divIcon({ className: 'ustara-user-map-pin', html: '<span aria-hidden="true">●</span>', iconSize: [24, 24], iconAnchor: [12, 12] });
const good = p => p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;
function FitPins({ points }) {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => { map.invalidateSize({ animate: false, pan: false }); if (points.length) map.fitBounds(L.latLngBounds(points.map(p => [p.lat, p.lng])).pad(.3), { maxZoom: 13, animate: false }); }, 150);
    return () => clearTimeout(timer);
  }, [map, points]);
  return null;
}
export default function BarbersMap({ barbers, userLocation, selectedServiceId = null, onShowList }) {
  const location = useLocation();
  const lang = readSiteLocale(location.search);
  const tr = customerActivityText(lang);
  const [tilesError, setTilesError] = useState(false);
  const mapped = mappedBarbers(barbers);
  const profilePrefix = location.pathname.startsWith('/user/') ? '/user' : '';
  const returnState = { from: siteLocaleSwitchUrl(location, lang) };
  const points = mapped.map(b => b.location).concat(good(userLocation) ? [userLocation] : []);
  const center = good(userLocation) ? [userLocation.lat, userLocation.lng] : points.length ? [points[0].lat, points[0].lng] : [41.2995, 69.2401];
  if (!mapped.length) return <div className="ex-map-empty" role="status"><p>{tr("Ushbu natijalarda xarita koordinatasi kiritilgan sartarosh yo‘q. Barcha profillarni ro‘yxat ko‘rinishida ko‘ring.")}</p>{onShowList && <button type="button" onClick={onShowList}>{tr("Ro‘yxatga o‘tish")}</button>}</div>;
  return <div className="ex-map-section">
    <div className="ex-map-header"><strong>{tr("Sartaroshlar xaritada")}</strong><span>{mapped.length} / {barbers.length} {lang === "ru" ? "координат" : lang === "en" ? "located" : "ta kiritilgan koordinata"}</span></div>
    <MapContainer center={center} zoom={11} zoomAnimation={false} fadeAnimation={false} markerZoomAnimation={false} scrollWheelZoom={false} className="ex-barbers-map" aria-label={tr("Sartaroshlar xaritasi")}>
      <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" eventHandlers={{ tileerror: () => setTilesError(true) }} />
      <FitPins points={points} />
      {good(userLocation) && <Marker position={[userLocation.lat,userLocation.lng]} icon={userIcon}><Popup>{tr("Sizning manzilingiz")}</Popup></Marker>}
      {mapped.map(b => <Marker key={b.id} position={[b.location.lat,b.location.lng]} icon={barberIcon} title={[b.first_name,b.last_name].filter(Boolean).join(' ') || tr("Sartarosh")}>
        <Popup>
          <div className="ex-map-popup">
            <strong>{[b.first_name,b.last_name].filter(Boolean).join(' ') || tr("Sartarosh")}</strong>
            <p>{b.address || tr("Manzil ko‘rsatilmagan")}</p>
            <Link to={siteLocalePath(mapProfileHref(b, profilePrefix), lang)} state={returnState}>{tr("Profilni ko‘rish")}</Link>
            {mapBookingHref(b, selectedServiceId, profilePrefix) && <Link to={siteLocalePath(mapBookingHref(b, selectedServiceId, profilePrefix), lang)} state={returnState}>{tr("Bron qilish")}</Link>}
          </div>
        </Popup>
      </Marker>)}
    </MapContainer>
    {tilesError && <div className="ex-map-empty" role="alert"><p>{tr("Xarita qatlamini yuklab bo‘lmadi. Tarmoqni tekshiring.")}</p>{onShowList && <button type="button" onClick={onShowList}>{tr("Ro‘yxatga o‘tish")}</button>}</div>}
    {barbers.length > mapped.length && <p className="ex-map-empty" role="status">{barbers.length - mapped.length} {lang === "ru" ? "профилей без координат не показаны на карте, но остаются в списке." : lang === "en" ? "profiles without coordinates are absent from the map but remain in the list." : "ta profil koordinatasi yo‘qligi uchun xaritada ko‘rsatilmagan. Ular ro‘yxatda qoladi."}</p>}
  </div>;
}
