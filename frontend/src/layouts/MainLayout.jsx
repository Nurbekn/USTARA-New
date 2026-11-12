import { Suspense } from "react";
import Loading from "../components/Loading";
import { Outlet } from "react-router-dom";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";

function MainLayout() {
  return (
    <>
      <Navbar />
      <main>
        <Suspense fallback={<Loading />}><Outlet /></Suspense>
      </main>
      <Footer />
    </>
  );
}
export default MainLayout
