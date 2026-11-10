import { Link, useOutletContext } from "react-router-dom";
import { isValidLocation } from "../../components/locationSearch";
import HomeIcon from "./HomeIcon";

export default function NearbyBarbers() {
  const { profile } = useOutletContext();
  const hasLocation = isValidLocation(profile.location);
  return (
    <section
      className="uh-nearby"
      id="nearby"
      aria-labelledby="uh-nearby-title"
    >
      <div className="uh-nearby-icon">
        <HomeIcon name="pin" size={26} />
      </div>
      <div className="uh-nearby-copy">
        <h2 id="uh-nearby-title">Yaqiningizdagi barberlar</h2>
        <p>
          {hasLocation ? (
            <strong className="uh-saved-address">
              {profile.address || "Xaritada tanlangan joylashuv"}
            </strong>
          ) : (
            "Manzilingizni belgilang va yaqin atrofdagi ustalarni toping."
          )}
        </p>
        {hasLocation && (
          <p className="uh-nearby-status">
            Barberlar ro‘yxati tez orada shu yerda ko‘rinadi.
          </p>
        )}
      </div>
      <Link className="uh-location-link" to="/user/profile">
        {hasLocation ? "Manzilni o‘zgartirish" : "Manzil tanlash"}
        <HomeIcon name="arrow" size={18} />
      </Link>
    </section>
  );
}
