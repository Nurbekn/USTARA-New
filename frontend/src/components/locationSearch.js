export function isValidLocation(value) {
  return !!value && Number.isFinite(value.lat) && Number.isFinite(value.lng)
    && Math.abs(value.lat) <= 90 && Math.abs(value.lng) <= 180;
}

export function locationResults(data) {
  if (!Array.isArray(data)) return [];
  const seen = new Set();
  return data.flatMap((item) => {
    if (item.lat == null || item.lon == null || item.lat === "" || item.lon === "") return [];
    const location = { lat: Number(item.lat), lng: Number(item.lon) };
    const label = item.display_name?.trim();
    if (!isValidLocation(location) || !label || ["country", "state"].includes(item.addresstype)
      || (item.address?.country_code && item.address.country_code !== "uz")) return [];
    const key = `${location.lat},${location.lng}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ ...location, label, id: item.place_id ?? key }];
  });
}
