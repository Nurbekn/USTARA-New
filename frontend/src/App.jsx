import { Routes, Route, Navigate } from "react-router-dom";
import MainLayout from "./layouts/MainLayout";
import Home from "./pages/home/Home";
import SampleBarbers from "./pages/home/SampleBarbers";
import { loadSampleCatalog } from "./pages/home/sampleData";
import { DemoLayout, DemoHome, DemoBookings, DemoProfile } from "./pages/demo/Demo";
import RegistrationForm from "./pages/auth/components/RegistrationForm";
import Login from "./pages/auth/Login";
import Otp from "./pages/auth/Otp";
import CompleteProfile from "./pages/auth/CompleteProfile";
import RequireSession from "./pages/auth/components/RequireSession";
import BarberProfileEdit from "./pages/barber/BarberProfileEdit";
import ApprovalPending from "./pages/barber/ApprovalPending";
import BarberLayout from "./layouts/BarberLayout";
import Dashboard from "./pages/barber/Dashboard";
import Bookings from "./pages/barber/Bookings";
import Schedule from "./pages/barber/Schedule";
import Portfolio from "./pages/barber/Portfolio";
import Earnings from "./pages/barber/Earnings";
import Reviews from "./pages/barber/Reviews";
import Services from "./pages/barber/Services";
import Profile from "./pages/barber/Profile";
import UserLayout from "./layouts/UserLayout";
import UserHome from "./pages/user/UserHome";
import Explore from "./pages/user/Explore";
import UserBookings from "./pages/user/Bookings";
import Social from "./pages/user/Social";
import UserProfile from "./pages/user/Profile";
import BarberPublicProfile from "./pages/user/barber/BarberPublicProfile";

function App() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<Home />} />
        <Route
          path="/barbers"
          element={<SampleBarbers />}
        />
      </Route>

      <Route path="/demo" element={<DemoLayout />}>
        <Route index element={<DemoHome />} />
        <Route path="explore" element={<Explore loadCatalog={loadSampleCatalog} basePath="/demo/explore" />} />
        <Route path="barbers/:id" element={<BarberPublicProfile />} />
        <Route path="bookings" element={<DemoBookings />} />
        <Route path="reservations" element={<UserBookings />} />
        <Route path="profile" element={<DemoProfile />} />
      </Route>

      <Route path="/signup" element={<RegistrationForm role="customer" />} />
      <Route path="/signup/usta" element={<RegistrationForm role="barber" />} />
      <Route path="/login" element={<Login />} />
      <Route path="/otp" element={<Otp />} />
      <Route path="/complete-profile" element={<CompleteProfile />} />
      <Route element={<RequireSession role="customer" />}>
        <Route path="/user" element={<UserLayout />}>
          <Route index element={<UserHome />} />
          <Route path="explore" element={<Explore />} />
          <Route path="barbers/:id" element={<BarberPublicProfile />} />
          <Route path="bookings" element={<UserBookings />} />
          <Route path="social" element={<Social />} />
          <Route path="profile" element={<UserProfile />} />
          <Route path="*" element={<Navigate to="/user" replace />} />
        </Route>
      </Route>
      <Route element={<RequireSession role="barber" />}>
        {/* Barber onboarding (first-time setup) */}
        <Route path="/barber/setup" element={<BarberProfileEdit />} />
        <Route path="/barber/pending" element={<ApprovalPending />} />

        {/* Barber panel: shared layout with bottom navigation */}
        <Route path="/barber" element={<BarberLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="bookings" element={<Bookings />} />
          <Route path="schedule" element={<Schedule />} />
          <Route path="portfolio" element={<Portfolio />} />
          <Route path="earnings" element={<Earnings />} />
          <Route path="reviews" element={<Reviews />} />
          <Route path="services" element={<Services />} />
          <Route path="profile" element={<Profile />} />
          <Route path="*" element={<Navigate to="/barber" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}

export default App;
