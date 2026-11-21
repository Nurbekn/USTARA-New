import React, { Suspense } from "react";
import Loading from "./components/Loading";
import AppErrorBoundary from "./components/AppErrorBoundary";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App.jsx";
import "./mobile.css";
import BrowserViewport from "./components/BrowserViewport";
import DocumentLocale from "./components/DocumentLocale";
import ConnectionNoticeV163 from "./components/ConnectionNoticeV163";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <DocumentLocale />
      <BrowserViewport />
      <ConnectionNoticeV163 />
      <AppErrorBoundary>
        <Suspense fallback={<Loading screen />}>
          <App />
        </Suspense>
      </AppErrorBoundary>
    </BrowserRouter>
  </React.StrictMode>,
);
