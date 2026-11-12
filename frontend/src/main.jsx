import React, { Suspense } from "react";
import Loading from "./components/Loading";
import AppErrorBoundary from "./components/AppErrorBoundary";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App.jsx";
import "./mobile.css";
import BrowserViewport from "./components/BrowserViewport";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <BrowserViewport />
      <AppErrorBoundary>
        <Suspense fallback={<Loading screen />}>
          <App />
        </Suspense>
      </AppErrorBoundary>
    </BrowserRouter>
  </React.StrictMode>,
);
