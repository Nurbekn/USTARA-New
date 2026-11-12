import PageLoading from "../../components/Loading";
import ArrowIcon from "../../components/ArrowIcon";
import { useEffect, useState } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import Icon from "../../components/Icon";
import ResultCard from "./explore/ResultCard";
import {
  EMPTY_CATALOG,
  FILTER_KEYS,
  REGIONS,
  TYPES,
  loadExploreCatalog,
  normalizeCatalog,
  selectResults,
  validPoint,
} from "./explore/catalog";
import "./Explore.css";
import { loadSampleCatalog } from "../home/sampleData";

export default function Explore({ loadCatalog = loadExploreCatalog, basePath = "/user/explore" }) {
  const { profile } = useOutletContext();
  const [params, setParams] = useSearchParams();
  const sampleMode = params.get("demo") === "1";
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [request, setRequest] = useState({
    status: "loading",
    catalog: EMPTY_CATALOG,
  });
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    Promise.resolve()
      .then(() => (sampleMode ? loadSampleCatalog : loadCatalog)({ signal: controller.signal }))
      .then(normalizeCatalog)
      .then((catalog) => {
        if (active) setRequest({ status: "ready", catalog });
      })
      .catch(() => {
        if (active) setRequest({ status: "error", catalog: EMPTY_CATALOG });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [loadCatalog, attempt, sampleMode]);

  const type = ["barbers", "salons"].includes(params.get("type"))
    ? params.get("type")
    : "barbers";
  const { catalog, status } = request;
  const query = params.get("q") || "";
  const hasLocation = validPoint(profile.location);
  const activeFilters = FILTER_KEYS.filter((key) => params.get(key));
  const results = selectResults(catalog, type, params, profile.location);
  const selectedService = catalog.services.find(
    (s) => String(s.id) === params.get("service"),
  );
  const detailId = params.get("profile");
  const detail = catalog[type].find((item) => String(item.id) === detailId);
  const min = params.get("min"),
    max = params.get("max");
  const badRange = min && max && Number(min) > Number(max);
  const hasConstraints = !!query.trim() || activeFilters.length > 0;

  function changed(patch) {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([key, value]) => {
      if (value == null || value === "") next.delete(key);
      else next.set(key, value);
    });
    return next;
  }
  function update(patch) {
    setParams(changed(patch), { replace: true });
  }
  function makeUrl(patch) {
    const value = changed(patch).toString();
    return `${basePath}${value ? `?${value}` : ""}`;
  }
  function reset() {
    const next = new URLSearchParams();
    next.set("type", type);
    if (sampleMode) next.set("demo", "1");
    setParams(next, { replace: true });
  }
  function retry() {
    setRequest({ status: "loading", catalog: EMPTY_CATALOG });
    setAttempt((value) => value + 1);
  }
  function filterLabel(key) {
    const value = params.get(key);
    if (key === "region" || key === "category") return value;
    if (key === "min") return `${value} so‘mdan`;
    if (key === "max") return `${value} so‘mgacha`;
    if (key === "rating") return `${value}+ reyting`;
    if (key === "distance") return `${value} km gacha`;
    if (key === "available") return "Bo‘sh vaqti bor";
    return selectedService?.name || "Tanlangan xizmat";
  }

  return (
    <section
      className="ex-page"
      aria-label="Explore"
      aria-busy={status === "loading"}
    >
      {detailId ? (
        <>
          <Link className="ex-back" to={makeUrl({ profile: null })}>
            <ArrowIcon direction="left" /> Natijalarga qaytish
          </Link>
          {status === "loading" ? (
            <Loading />
          ) : status === "error" ? (
            <ErrorState onRetry={retry} />
          ) : detail ? (
            <div className="ex-detail">
              <ResultCard
                item={detail}
                type={type}
                catalog={catalog}
                makeUrl={makeUrl}
                detail
              />
            </div>
          ) : (
            <div className="ex-state">
              <Icon name="search" size={32} />
              <h2>Profil topilmadi</h2>
              <p>Bu profil hali mavjud emas yoki ma’lumotlari yuklanmagan.</p>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="ex-search">
            <Icon name="search" />
            <input
              type="search"
              aria-label="Usta yoki salonni qidiring"
              placeholder="Usta yoki salonni qidiring"
              value={query}
              onChange={(e) => update({ q: e.target.value })}
            />
            {query && (
              <button
                type="button"
                aria-label="Qidiruvni tozalash"
                onClick={() => update({ q: null })}
              >
                <Icon name="close" size={19} />
              </button>
            )}
          </div>
          <div className="ex-toolbar">
            <div
              className="ex-tabs"
              role="group"
              aria-label="Qidiruv kategoriyasi"
            >
              {Object.entries(TYPES).filter(([key]) => key !== "services").map(([key, label]) => (
                <button
                  type="button"
                  key={key}
                  aria-pressed={type === key}
                  onClick={() =>
                    update({
                      type: key,
                      profile: null,
                      category: null,
                      service:
                        params.get("service"),
                    })
                  }
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="ex-filter-toggle"
              aria-expanded={filtersOpen}
              aria-controls="ex-filters"
              onClick={() => setFiltersOpen(!filtersOpen)}
            >
              <span aria-hidden="true">☷</span> Filtrlar
              {activeFilters.length > 0 && (
                <span className="ex-filter-count">{activeFilters.length}</span>
              )}
            </button>
          </div>
          {filtersOpen && (
            <div id="ex-filters" className="ex-filters">
              <div className="ex-filters-title">
                <h2>Qidiruvni aniqlashtiring</h2>
                <button
                  type="button"
                  className="ex-text-button"
                  onClick={() => {
                    const next = new URLSearchParams(params);
                    FILTER_KEYS.forEach((key) => next.delete(key));
                    setParams(next, { replace: true });
                  }}
                >
                  Filtrlarni tozalash
                </button>
              </div>
              <div className="ex-filter-grid">
                <label>
                  Viloyat
                  <select
                    value={params.get("region") || ""}
                    onChange={(e) => update({ region: e.target.value })}
                  >
                    <option value="">Barcha viloyatlar</option>
                    {REGIONS.map((region) => (
                      <option key={region}>{region}</option>
                    ))}
                  </select>
                </label>
                <fieldset className="ex-price-filter">
                  <legend>Narx oralig‘i, so‘m</legend>
                  <div>
                    <input
                      type="number"
                      min="0"
                      step="1000"
                      aria-label="Minimal narx"
                      placeholder="Dan"
                      value={min || ""}
                      aria-invalid={!!badRange}
                      onChange={(e) => update({ min: e.target.value })}
                    />
                    <span>—</span>
                    <input
                      type="number"
                      min="0"
                      step="1000"
                      aria-label="Maksimal narx"
                      placeholder="Gacha"
                      value={max || ""}
                      aria-invalid={!!badRange}
                      onChange={(e) => update({ max: e.target.value })}
                    />
                  </div>
                </fieldset>
                <label>
                  Reyting
                  <select
                    value={params.get("rating") || ""}
                    onChange={(e) => update({ rating: e.target.value })}
                  >
                    <option value="">Barcha reytinglar</option>
                    <option value="4">4.0 va yuqori</option>
                    <option value="4.5">4.5 va yuqori</option>
                    <option value="4.8">4.8 va yuqori</option>
                  </select>
                </label>
                <label>
                  Masofa
                  <select
                    disabled={!hasLocation}
                    value={params.get("distance") || ""}
                    onChange={(e) => update({ distance: e.target.value })}
                  >
                    <option value="">Istalgan masofa</option>
                    <option value="1">1 km gacha</option>
                    <option value="3">3 km gacha</option>
                    <option value="5">5 km gacha</option>
                    <option value="10">10 km gacha</option>
                  </select>
                </label>
                <label className="ex-service-filter">
                  Xizmat <small>(ixtiyoriy)</small>
                  <select
                    value={params.get("service") || ""}
                    onChange={(event) => update({ service: event.target.value, category: null })}
                  >
                    <option value="">Barcha xizmatlar</option>
                    {catalog.services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
                  </select>
                </label>
                <label className="ex-checkbox">
                  <input
                    type="checkbox"
                    checked={params.get("available") === "1"}
                    onChange={(e) =>
                      update({ available: e.target.checked ? "1" : null })
                    }
                  />
                  <span>Bo‘sh vaqti mavjud</span>
                </label>
              </div>
              {!hasLocation && (
                <p className="ex-filter-hint">
                  Masofa bo‘yicha qidirish uchun{" "}
                  <Link to={basePath === "/user/explore" ? "/user/profile" : "/demo/profile"}>profilingizda manzil tanlang</Link>.
                </p>
              )}
            </div>
          )}
          {activeFilters.length > 0 && (
            <div className="ex-chips" aria-label="Tanlangan filtrlar">
              {activeFilters.map((key) => (
                <button
                  type="button"
                  key={key}
                  aria-label={`${filterLabel(key)} filtrini olib tashlash`}
                  onClick={() => update({ [key]: null })}
                >
                  {filterLabel(key)}
                  <Icon name="close" size={14} />
                </button>
              ))}
            </div>
          )}
          {badRange && (
            <p className="ex-error" role="alert">
              Minimal narx maksimal narxdan katta bo‘lmasin.
            </p>
          )}
          <div className="ex-results-heading">
            <h2>{TYPES[type]}</h2>
            <span role="status" aria-live="polite">
              {status === "loading"
                ? "Yuklanmoqda…"
                : status === "error"
                  ? "Yuklab bo‘lmadi"
                  : `${badRange ? 0 : results.length} ta natija`}
            </span>
          </div>
          {status === "loading" ? (
            <Loading />
          ) : status === "error" ? (
            <ErrorState onRetry={retry} />
          ) : results.length > 0 && !badRange ? (
            <div className="ex-results">
              {results.map((item) => (
                <ResultCard
                  key={item.id}
                  item={item}
                  type={type}
                  catalog={catalog}
                  makeUrl={makeUrl}
                />
              ))}
            </div>
          ) : (
            <div className="ex-state">
              <span className="ex-state-icon">
                <Icon name="search" size={30} />
              </span>
              <h2>
                {hasConstraints
                  ? "Mos natijalar topilmadi"
                  : "Hozircha ma’lumotlar yo‘q"}
              </h2>
              <p>
                {hasConstraints
                  ? "Boshqa nom bilan qidiring yoki filtrlarni kamaytiring."
                  : `${TYPES[type]} haqidagi ma’lumotlar qo‘shilgach, shu yerda ko‘rinadi.`}
              </p>
              {hasConstraints && (
                <button type="button" className="ex-action" onClick={reset}>
                  Qidiruv va filtrlarni tozalash
                </button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
function Loading() {
  return <PageLoading label="Ustalar yuklanmoqda…" />;
}
function ErrorState({ onRetry }) {
  return (
    <div className="ex-state" role="alert">
      <span className="ex-state-icon ex-state-warning">!</span>
      <h2>Ma’lumotlarni yuklab bo‘lmadi</h2>
      <p>Qayta urinib ko‘ring. Muammo davom etsa, biroz kuting.</p>
      <button type="button" className="ex-action" onClick={onRetry}>
        Qayta urinish
      </button>
    </div>
  );
}
