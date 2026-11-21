import { Link, useLocation } from "react-router-dom";
import { formatNumber } from "../../../utils/format";
import { customerCoreUi } from "../coreLocale.js";
import { siteLocalePath } from "../../../utils/siteLocale.js";

function priceText(row, ui) {
  if (row.priceMin == null) return ui.cardPriceNone;
  if (row.priceMax != null && row.priceMax > row.priceMin)
    return `${formatNumber(row.priceMin)} – ${formatNumber(row.priceMax)} ${ui.cardCurrency}`;
  if (row.priceMax === row.priceMin) return `${formatNumber(row.priceMin)} ${ui.cardCurrency}`;
  return `${formatNumber(row.priceMin)} ${ui.cardCurrency} ${ui.cardFrom}`;
}

export default function ComparisonPanel({ rows, onRemove, onClear, lang = "uz" }) {
  const location = useLocation();
  const ui = customerCoreUi(lang).explore;
  if (!rows.length) return null;
  const returnState = { from: location.pathname + location.search };
  return <section className="ex-compare" aria-labelledby="ex-compare-title">
    <div className="ex-compare-header">
      <div>
        <h2 id="ex-compare-title">{ui.compareTitle}</h2>
        <p role="status" aria-live="polite">{rows.length}/3 {ui.compareSelected}. {rows.length < 2 ? ui.comparePrompt : ui.compareBasis}</p>
      </div>
      <button type="button" className="ex-text-button" onClick={onClear}>{ui.compareClear}</button>
    </div>
    {rows.length >= 2 && <p className="ex-compare-note">{ui.compareNote}</p>}
    <div className="ex-compare-grid">
      {rows.map(row => <article className="ex-compare-card" key={row.id}>
        <div className="ex-compare-card-head">
          <h3>{row.name}</h3>
          <button type="button" className="ex-compare-remove" aria-label={`${row.name}: ${ui.compareRemove}`} onClick={() => onRemove(row.id)}>{ui.compareRemove}</button>
        </div>
        <dl>
          <div><dt>{ui.cardAddressLabel}</dt><dd>{row.address || ui.cardAddress}</dd></div>
          <div><dt>{ui.cardServicesLabel}</dt><dd>{row.serviceCount}</dd></div>
          <div><dt>{ui.cardPriceLabel}</dt><dd>{priceText(row, ui)}</dd></div>
          <div><dt>{ui.cardRatingLabel}</dt><dd>{row.rating == null ? ui.cardRatingNone : `${row.rating.toFixed(1)} / 5${row.ratingCount == null ? "" : ` (${row.ratingCount} ${ui.cardReviews})`}`}</dd></div>
          <div><dt>{ui.cardDistanceLabel}</dt><dd>{row.distanceKm == null ? ui.cardNoData : `${row.distanceKm.toFixed(1)} km ({ui.cardDistance})`}</dd></div>
        </dl>
        <div className="ex-compare-actions">
          <Link className="ex-action" to={siteLocalePath(row.profileUrl, lang)} state={returnState}>{ui.cardProfile}</Link>
          {row.bookingUrl ? <Link className="ex-action ex-action-primary" to={siteLocalePath(row.bookingUrl, lang)} state={returnState}>{ui.cardBook}</Link>
            : <span className="ex-compare-no-booking">{ui.cardNoBooking}</span>}
        </div>
      </article>)}
    </div>
  </section>;
}
