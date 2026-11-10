import { useBarber } from "../../barber/data/store";
import { hasProfileName, profileForSession } from "../profileCompletion";
import { useSyncExternalStore } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { dashboardPath, getSession, getSessionSnapshot, subscribeSession } from "../utils/session";

export default function RequireSession({ role }) {
  useSyncExternalStore(subscribeSession, getSessionSnapshot, () => null);
  const session = getSession();
  const { profile: barberProfile } = useBarber();
  const location = useLocation();
  if (!session) return <Navigate to="/login" replace />;
  if (session.role !== role) return <Navigate to={dashboardPath(session)} replace />;
  if (!hasProfileName(profileForSession(session, barberProfile))) return <Navigate to="/complete-profile" replace />;
  if (role === 'barber' && !session.setupDone && location.pathname !== '/barber/setup') {
    return <Navigate to="/barber/setup" replace />;
  }
  return <Outlet key={`${session.role}:${session.phone}`} />;
}
