import { lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import MainLayout from "./layouts/MainLayout";

const AdminPanel = lazy(() => import("./pages/AdminPanel"));
const RequireSession = lazy(() => import("./pages/auth/components/RequireSession"));
const BarberLayout = lazy(() => import("./layouts/BarberLayout"));
const UserLayout = lazy(() => import("./layouts/UserLayout"));

const LogoShowcase = lazy(() => import("./pages/logos/LogoShowcase"));
const Home = lazy(() => import("./pages/home/Home"));
const SampleBarbers = lazy(() => import("./pages/home/SampleBarbers"));
const RegistrationForm = lazy(() => import("./pages/auth/components/RegistrationForm"));
const ForgotPassword = lazy(() => import("./pages/auth/ForgotPassword"));
const AccountRecovery = lazy(() => import("./pages/auth/AccountRecovery"));
const Login = lazy(() => import("./pages/auth/Login"));
const Otp = lazy(() => import("./pages/auth/Otp"));
const CompleteProfile = lazy(() => import("./pages/auth/CompleteProfile"));
const BarberProfileEdit = lazy(() => import("./pages/barber/BarberProfileEdit"));
const ApprovalPending = lazy(() => import("./pages/barber/ApprovalPending"));
const Dashboard = lazy(() => import("./pages/barber/Dashboard"));
const Bookings = lazy(() => import("./pages/barber/Bookings"));
const Queue = lazy(() => import("./pages/barber/Queue"));
const QueueCheckIn = lazy(() => import("./pages/queue/QueueCheckIn"));
const ManualQueue = lazy(() => import("./pages/queue/ManualQueue"));
const Schedule = lazy(() => import("./pages/barber/Schedule"));
const Portfolio = lazy(() => import("./pages/barber/Portfolio"));
const Earnings = lazy(() => import("./pages/barber/Earnings"));
const Reviews = lazy(() => import("./pages/barber/Reviews"));
const Services = lazy(() => import("./pages/barber/Services"));
const Profile = lazy(() => import("./pages/barber/Profile"));
const UserHome = lazy(() => import("./pages/user/UserHome"));
const Explore = lazy(() => import("./pages/user/Explore"));
const UserBookings = lazy(() => import("./pages/user/Bookings"));
const Social = lazy(() => import("./pages/user/Social"));
const ChatV161 = lazy(() => import("./pages/chat/ChatV161"));
const UserProfile = lazy(() => import("./pages/user/Profile"));
const BarberPublicProfile = lazy(() => import("./pages/user/barber/BarberPublicProfile"));
const HelpCenter = lazy(() => import("./pages/help/HelpCenter"));
const ShopPublicV172 = lazy(() => import("./pages/shops/ShopPublicV172"));
const ShopEditV172 = lazy(() => import("./pages/shops/ShopEditV172"));

function App() {
  return (
    <Routes>
      <Route path="/admin" element={<AdminPanel />} />
      <Route path="/logos" element={<LogoShowcase />} />
      <Route element={<MainLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/barbers" element={<SampleBarbers />} />
        <Route path="/explore" element={<Explore basePath="/explore" />} />
        <Route path="/help" element={<HelpCenter />} />
        <Route path="/barbers/:id" element={<BarberPublicProfile />} />
        <Route path="/shops/:id" element={<ShopPublicV172 />} />
        <Route path="/queue/check-in/:token" element={<QueueCheckIn />} />
      </Route>

      <Route path="/signup" element={<RegistrationForm role="customer" />} />
      <Route path="/signup/sartarosh" element={<RegistrationForm role="barber" />} />
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/account-recovery" element={<AccountRecovery />} />
      <Route path="/otp" element={<Otp />} />
      <Route path="/complete-profile" element={<CompleteProfile />} />
      <Route element={<RequireSession role="customer" />}>
        <Route path="/user" element={<UserLayout />}>
          <Route index element={<UserHome />} />
          <Route path="explore" element={<Explore />} />
          <Route path="barbers/:id" element={<BarberPublicProfile />} />
          <Route path="bookings" element={<UserBookings />} />
          <Route path="queue" element={<ManualQueue />} />
          <Route path="social" element={<Social />} />
          <Route path="chat" element={<ChatV161 />} />
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
          <Route path="queue" element={<Queue />} />
          <Route path="schedule" element={<Schedule />} />
          <Route path="portfolio" element={<Portfolio />} />
          <Route path="earnings" element={<Earnings />} />
          <Route path="reviews" element={<Reviews />} />
          <Route path="chat" element={<ChatV161 />} />
          <Route path="services" element={<Services />} />
          <Route path="profile" element={<Profile />} />
          <Route path="shop" element={<ShopEditV172 />} />
          <Route path="*" element={<Navigate to="/barber" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}

export default App;
