import PageLoading from "../../components/Loading";
import ArrowIcon from "../../components/ArrowIcon";
import { lazy, Suspense, useEffect, useState } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import Icon from "../../components/Icon";
import ResultCard from "./explore/ResultCard";
import ComparisonPanel from "./explore/ComparisonPanel";
import { comparisonRows, toggleComparedBarber, visibleCompareIds } from "./explore/compareModel.js";
const BarbersMap = lazy(() => import("./BarbersMap"));
import {
  EMPTY_CATALOG,
  FILTER_KEYS,
  TYPES,
  loadExploreCatalog,
  normalizeCatalog,
  selectResults,
  validPoint,
  validExploreFilters,
  publishedDistrictSuggestions,
} from "./explore/catalog";
import "./Explore.css";
import { getSession } from "../auth/utils/session";
import { customerCoreLocale, customerCoreUi } from "./coreLocale.js";
import { siteLocalePath } from "../../utils/siteLocale.js";

export default function Explore({ loadCatalog = loadExploreCatalog, basePath = "/user/explore" }) {
  const { profile = { location: null } } = useOutletContext() || {};
  const [params, setParams] = useSearchParams();
  const lang = customerCoreLocale(params);
  const ui = customerCoreUi(lang).explore;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [compareIds, setCompareIds] = useState([]);
  const [request, setRequest] = useState({
    status: "loading",
    catalog: EMPTY_CATALOG,
  });
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    Promise.resolve()
      .then(() => loadCatalog({ signal: controller.signal, token: getSession()?.token }))
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
  }, [loadCatalog, attempt]);

  const mapShown = params.get("map") === "1";
  const type = ["barbers"].includes(params.get("type"))
    ? params.get("type")
    : "barbers";
  const { catalog, status } = request;
  const publishedDistricts = status === "ready" ? publishedDistrictSuggestions(catalog) : [];
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
  const needsLocation = params.get("sort") === "distance_asc" || !!params.get("distance");
  const badFilters = !validExploreFilters(params) || (needsLocation && !hasLocation);
  const hasConstraints = !!query.trim() || activeFilters.length > 0;
  const safeCompared = status === "ready" && !badFilters ? visibleCompareIds(compareIds, results) : [];
  const compared = status === "ready" && !badFilters
    ? comparisonRows(safeCompared, results, catalog, params.get("service"), profile.location) : [];
  const compareFull = safeCompared.length >= 3;
  function toggleCompare(id) {
    if (status !== "ready" || badFilters) return;
    setCompareIds(current => toggleComparedBarber(current, id, results));
  }

  function changed(patch) {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([key, value]) => {
      if (value == null || value === "") next.delete(key);
      else next.set(key, value);
    });
    return next;
  }
  function update(patch) {
    // A different search/service context must never retain stale comparison cards.
    if (Object.keys(patch).some(key => key !== "map")) setCompareIds([]);
    setParams(changed(patch), { replace: true });
  }
  function makeUrl(patch) {
    const value = changed(patch).toString();
    return `${basePath}${value ? `?${value}` : ""}`;
  }
  function reset() {
    setCompareIds([]);
    const next = new URLSearchParams();
    next.set("type", type);
    if (lang !== "uz") next.set("lang", lang);
    if (mapShown) next.set("map", "1");
    setParams(next, { replace: true });
  }
  function retry() {
    setCompareIds([]);
    setRequest({ status: "loading", catalog: EMPTY_CATALOG });
    setAttempt((value) => value + 1);
  }
  function filterLabel(key) {
    const value = params.get(key);
    if (key === "region" || key === "category") return value;
    if (key === "area") return `${ui.area}: ${value}`;
    if (key === "min") return `${value} UZS ${ui.from.toLowerCase()}`;
    if (key === "max") return `${value} UZS ${ui.to.toLowerCase()}`;
    if (key === "rating") return `${value}+ reyting`;
    if (key === "distance") return `${value} km ${ui.upTo}`;
    if (key === "available") return "Bo‘sh vaqti bor";
    return selectedService?.name || ui.service;
  }

  return (
    <section
      className="ex-page"
      aria-label={ui.pageLabel}
      aria-busy={status === "loading"}
    >
      {detailId ? (
        <>
          <Link className="ex-back" to={makeUrl({ profile: null })}>
            <ArrowIcon direction="left" /> {ui.back}
          </Link>
          {status === "loading" ? (
            <Loading label={ui.loading} />
          ) : status === "error" ? (
            <ErrorState onRetry={retry} ui={ui} />
          ) : detail ? (
            <div className="ex-detail">
              <ResultCard
                item={detail}
                type={type}
                catalog={catalog}
                makeUrl={makeUrl}
                userLocation={profile.location}
                detail
              />
            </div>
          ) : (
            <div className="ex-state">
              <Icon name="search" size={32} />
              <h2>{ui.notFound}</h2>
              <p>{ui.notFoundBody}</p>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="ex-search">
            <Icon name="search" />
            <input
              type="search"
              aria-label={ui.search}
              placeholder={ui.searchPlaceholder}
              value={query}
              maxLength={160}
              onChange={(e) => update({ q: e.target.value })}
            />
            {query && (
              <button
                type="button"
                aria-label={ui.clearQuery}
                onClick={() => update({ q: null })}
              >
                <Icon name="close" size={19} />
              </button>
            )}
          </div>
          <p className="ex-search-help">{ui.helpPrefix} <Link to={siteLocalePath("/help?topic=search", lang)}>{ui.helpLink}</Link></p>
          <div className="ex-toolbar">
            <label className="ex-sort-label">
              {ui.sort}
              <select aria-label={ui.sortLabel} value={["price_asc", "price_desc", "name", "distance_asc"].includes(params.get("sort")) ? params.get("sort") : "relevance"}
                onChange={(event) => update({ sort: event.target.value === "relevance" ? null : event.target.value })}>
                <option value="relevance">{ui.relevance}</option>
                <option value="price_asc">{ui.priceAsc}</option>
                <option value="price_desc">{ui.priceDesc}</option>
                <option value="name">{ui.nameSort}</option>
                <option value="distance_asc" disabled={!hasLocation}>{ui.distanceSort}</option>
              </select>
            </label>
            <div className="ex-view-switch" role="group" aria-label={ui.view}>
              <button type="button" aria-pressed={!mapShown} onClick={() => update({ map: null })}>{ui.list}</button>
              <button type="button" aria-pressed={mapShown} onClick={() => update({ map: '1' })}>{ui.map}</button>
            </div>
            <button
              type="button"
              className="ex-filter-toggle"
              aria-expanded={filtersOpen}
              aria-controls="ex-filters"
              onClick={() => setFiltersOpen(!filtersOpen)}
            >
              <span aria-hidden="true">☷</span> {ui.filters}
              {activeFilters.length > 0 && (
                <span className="ex-filter-count">{activeFilters.length}</span>
              )}
            </button>
          </div>
          {filtersOpen && (
            <div id="ex-filters" className="ex-filters">
              <div className="ex-filters-title">
                <h2>{ui.refine}</h2>
                <button
                  type="button"
                  className="ex-text-button"
                  onClick={() => {
                    const next = new URLSearchParams(params);
                    FILTER_KEYS.forEach((key) => next.delete(key));
                    setCompareIds([]);
                    setParams(next, { replace: true });
                  }}
                >
                  {ui.clearFilters}
                </button>
              </div>
              <div className="ex-filter-grid">
                <label className="ex-area-filter">
                  {ui.area}
                  <input
                    type="search"
                    aria-label={ui.areaLabel}
                    placeholder={ui.areaPlaceholder}
                    value={params.get("area") || ""}
                    maxLength={160}
                    list="ex-public-districts-v178"
                    onChange={(e) => update({ area: e.target.value })}
                  />
                  <datalist id="ex-public-districts-v178">{publishedDistricts.map(district => <option key={district} value={district}/>)}</datalist>
                  <small>{ui.areaHint}</small>
                </label>
                <fieldset className="ex-price-filter">
                  <legend>{ui.priceRange}</legend>
                  <div>
                    <input
                      type="number"
                      min="0"
                      step="1000"
                      aria-label={ui.minPrice}
                      placeholder={ui.from}
                      value={min || ""}
                      aria-invalid={!!badFilters}
                      onChange={(e) => update({ min: e.target.value })}
                    />
                    <span>—</span>
                    <input
                      type="number"
                      min="0"
                      step="1000"
                      aria-label={ui.maxPrice}
                      placeholder={ui.to}
                      value={max || ""}
                      aria-invalid={!!badFilters}
                      onChange={(e) => update({ max: e.target.value })}
                    />
                  </div>
                </fieldset>
                <label>
                  {ui.distance}
                  <select
                    disabled={!hasLocation}
                    value={params.get("distance") || ""}
                    onChange={(e) => update({ distance: e.target.value })}
                  >
                    <option value="">{ui.anyDistance}</option>
                    <option value="1">1 km {ui.upTo}</option>
                    <option value="3">3 km {ui.upTo}</option>
                    <option value="5">5 km {ui.upTo}</option>
                    <option value="10">10 km {ui.upTo}</option>
                  </select>
                </label>
                <label className="ex-service-filter">
                  {ui.service} <small>{ui.optional}</small>
                  <select
                    value={params.get("service") || ""}
                    onChange={(event) => update({ service: event.target.value, category: null })}
                  >
                    <option value="">{ui.allServices}</option>
                    {catalog.services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
                  </select>
                </label>

              </div>
              {!hasLocation && (
                <p className="ex-filter-hint">
                  {ui.distance} bo‘yicha qidirish uchun{" "}
                  <Link to={siteLocalePath("/user/profile", lang)}>{ui.locationLink}</Link>.
                </p>
              )}
            </div>
          )}
          {activeFilters.length > 0 && (
            <div className="ex-chips" aria-label={ui.selectedFilters}>
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
          {badFilters && (
            <p className="ex-error" role="alert">
              {needsLocation && !hasLocation
                ? ui.badLocation
                : ui.badFilters}
            </p>
          )}
          {status === "ready" && !badFilters && !mapShown && results.length > 1 &&
            <p className="ex-compare-help">{ui.compareHint}</p>}
          {compared.length > 0 && <ComparisonPanel rows={compared} lang={lang}
            onRemove={id => setCompareIds(current => current.filter(value => value !== id))}
            onClear={() => setCompareIds([])}/>}
          <div className="ex-results-heading">

            <span role="status" aria-live="polite">
              {status === "loading"
                ? ui.loading
                : status === "error"
                  ? ui.loadError
                  : `${badFilters ? 0 : results.length} ${ui.results}`}
            </span>
          </div>
          {status === "loading" ? (
            <Loading label={ui.loading} />
          ) : status === "error" ? (
            <ErrorState onRetry={retry} ui={ui} />
          ) : results.length > 0 && !badFilters ? (
            mapShown ? <Suspense fallback={<p role="status">{ui.mapLoading}</p>}><BarbersMap barbers={results} userLocation={profile.location} selectedServiceId={params.get("service")} onShowList={() => update({ map: null })}/></Suspense> : <div className="ex-results">
              {results.map((item) => (
                <ResultCard
                  key={item.id}
                  item={item}
                  type={type}
                  catalog={catalog}
                  makeUrl={makeUrl}
                  userLocation={profile.location}
                  lang={lang}
                  compareSelected={safeCompared.includes(item.id)}
                  compareFull={compareFull}
                  onToggleCompare={toggleCompare}
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
                  ? ui.noMatches
                  : ui.noData}
              </h2>
              <p>
                {hasConstraints
                  ? ui.tryOther
                  : ui.emptyCatalog}
              </p>
              {hasConstraints && (
                <button type="button" className="ex-action" onClick={reset}>
                  {ui.reset}
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
  return <PageLoading label="Sartaroshlar yuklanmoqda…" />;
}
function ErrorState({ onRetry, ui }) {
  return (
    <div className="ex-state" role="alert">
      <span className="ex-state-icon ex-state-warning">!</span>
      <h2>{ui.errorTitle}</h2>
      <p>{ui.errorBody}</p>
      <button type="button" className="ex-action" onClick={onRetry}>
        {ui.retry}
      </button>
    </div>
  );
}
