import { formatNumber } from "../../../utils/format";
import { Link, useLocation } from "react-router-dom";
import { customerCoreUi } from "../coreLocale.js";
import { siteLocalePath } from "../../../utils/siteLocale.js";
import { Avatar } from "../../../components/Avatar";
import Icon from "../../../components/Icon";
import { knownNumber, nameOf, providersFor, servicesFor, listingPrice, bookingProfileQuery, distanceKm, validPoint } from "./catalog";

function Price({ min, max, ui }) {
  return (
    <span className="ex-price">
      {knownNumber(min)
        ? `${formatNumber(min)}${knownNumber(max) && max !== min ? ` – ${formatNumber(max)}` : ""} ${ui.cardCurrency}${max == null ? ` ${ui.cardFrom}` : ""}`
        : ui.cardPriceNone}
    </span>
  );
}
function Rating({ item, ui }) {
  return (
    <span className="ex-rating">
      <Icon name="star" size={16} />
      {knownNumber(item.rating) ? item.rating.toFixed(1) : ui.cardRatingNone}
      <span>
        {knownNumber(item.reviewCount) ? `(${item.reviewCount} ${ui.cardReviews})` : ""}
      </span>
    </span>
  );
}
export default function ResultCard({
  item,
  type,
  catalog,
  makeUrl,
  detail = false,
  userLocation = null,
  lang = "uz",
  compareSelected = false,
  compareFull = false,
  onToggleCompare = null,
}) {
  const location = useLocation();
  const ui = customerCoreUi(lang).explore;
  const profileUrl = siteLocalePath(`${location.pathname.startsWith("/user/") ? "/user" : ""}/barbers/${encodeURIComponent(item.id)}`, lang);
  const service = type === "services";
  const services = service ? [] : servicesFor(item, type, catalog);
  const providers = service ? providersFor(item, catalog) : null;
  const selectedServiceId = new URLSearchParams(location.search).get("service");
  const price = listingPrice(item, type, catalog, selectedServiceId);
  const selectedService = services.find(s => String(s.id) === selectedServiceId);
  const bookingQuery = bookingProfileQuery(selectedServiceId, services);
  return (
    <article className={`ex-result ex-result-${type}`}>
      {type === "salons" &&
        (item.image ? (
          <img
            className="ex-salon-image"
            src={item.image}
            alt={nameOf(item, type)}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="ex-salon-image ex-image-placeholder">
            <Icon name="pin" size={32} />
            <span>{ui.cardSalonNoImage}</span>
          </div>
        ))}
      <div className="ex-result-body">
        <div className="ex-result-heading">
          {type === "barbers" && (
            <Avatar
              photo={item.avatarPhoto}
              id={item.avatar}
              name={nameOf(item, type)}
              size={56}
            />
          )}
          {service && (
            <span className="ex-service-icon">
              <Icon name="scissors" />
            </span>
          )}
          <div>
            <h3>{nameOf(item, type)}</h3>
            {type === "barbers" && item.salonName && <p>{item.salonName}</p>}
            {service && <p>{item.category || ui.cardCategoryNone}</p>}
          </div>
        </div>
        {!service && (
          <>
            <Rating item={item} ui={ui} />
            <p className="ex-address">
              <Icon name="pin" size={17} />
              {item.address || ui.cardAddress}
            </p>
            {validPoint(userLocation) && validPoint(item.location) && (
              <p className="ex-address" aria-label={ui.cardDistanceLabel}>
                {distanceKm(userLocation, item.location).toFixed(1)} km ({ui.cardDistance})
              </p>
            )}
          </>
        )}
        {service ? (
          <p className="ex-description">
            {item.description || ui.cardDescriptionNone}
          </p>
        ) : (
          <div className="ex-service-tags">
            {services.length ? (
              services.slice(0, detail ? services.length : 3).map((s) => (
                <Link
                  key={s.id}
                  to={makeUrl({
                    profile: null,
                    q: null,
                    service: s.id,
                  })}
                >
                  {s.name}
                </Link>
              ))
            ) : (
              <span>{ui.cardServicesNone}</span>
            )}
            {!detail && services.length > 3 && (
              <span>+{services.length - 3}</span>
            )}
          </div>
        )}
        {type === "salons" && (
          <p className="ex-hours">
            {ui.cardHours} {item.openingHours || ui.cardNone}
          </p>
        )}
        <div className="ex-result-footer">
          {type !== "salons" && (
            <Price
              ui={ui}
              min={price.min}
              max={selectedService ? price.max : service ? price.max : null}
            />
          )}
          {!service && !detail && (
            <div className="ex-result-actions">
              <Link className="ex-action" to={type === "barbers" ? profileUrl : makeUrl({ profile: item.id })}
                state={type === "barbers" ? { from: location.pathname + location.search } : undefined}>
                {ui.cardProfile}
                <Icon name="arrow" size={17} />
              </Link>
              {type === "barbers" && typeof onToggleCompare === "function" && (
                <button type="button" className="ex-action ex-compare-pick" aria-pressed={compareSelected}
                  aria-label={`${nameOf(item, type)}: ${compareSelected ? ui.compareRemove : ui.cardCompare}`}
                  disabled={!compareSelected && compareFull} onClick={() => onToggleCompare(item.id)}>
                  {compareSelected ? ui.cardCompared : ui.cardCompare}
                </button>
              )}
              {type === "barbers" && services.length > 0 && (
                <Link className="ex-action ex-action-primary" to={siteLocalePath(`${profileUrl.split("?")[0]}?${bookingQuery}`, lang)} state={{ from: location.pathname + location.search }}>
                  {ui.cardBook}
                  <Icon name="arrow" size={17} />
                </Link>
              )}
            </div>
          )}
        </div>
        {detail && type === "barbers" && (
          <Link className="ex-action" to={profileUrl} state={{ from: location.pathname + location.search }}>
            {ui.cardProfile} <Icon name="arrow" size={17} />
          </Link>
        )}
        {service && (
          <div className="ex-provider-links">
            <Link
              className="ex-action"
              to={makeUrl({
                type: "barbers",
                service: item.id,
                profile: null,
                q: null,
                category: null,
              })}
            >
              {ui.barbers} ({providers.barbers.length})
              <Icon name="arrow" size={17} />
            </Link>
            <Link
              className="ex-action"
              to={makeUrl({
                type: "salons",
                service: item.id,
                profile: null,
                q: null,
                category: null,
              })}
            >
              Salonlar ({providers.salons.length})
              <Icon name="arrow" size={17} />
            </Link>
          </div>
        )}
      </div>
    </article>
  );
}
