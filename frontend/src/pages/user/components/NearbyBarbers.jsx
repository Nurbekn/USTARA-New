import { Link, useOutletContext } from "react-router-dom";
import { isValidLocation } from "../../../components/locationSearch";
import UserIcon from "./UserIcon";

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
        <UserIcon name="pin" size={26} />
      </div>
      <div className="uh-nearby-copy">
        <h2 id="uh-nearby-title">Yaqiningizdagi sartaroshlar</h2>
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
            <Link to="/user/profile">Manzilni o‘zgartirish</Link>
          </p>
        )}
      </div>
      <Link className="uh-location-link" to={hasLocation ? "/user/explore?type=barbers&distance=5" : "/user/profile"}>
        {hasLocation ? "Yaqin sartaroshlarni ko‘rish" : "Manzil tanlash"}
        <UserIcon name="arrow" size={18} />
      </Link>
    </section>
  );
}
