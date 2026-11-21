import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { readSiteLocale } from "../../utils/siteLocale.js";
import { v144InnerUi } from "../auth/innerLocaleV144.js";
import LocationPicker from "../../components/LocationPicker";
import { isValidLocation } from "../../components/locationSearch";
import { AuthLayout } from "../auth/components/AuthParts";
import "../auth/auth-ui.css";
import "./barber.css";
import { defaultSetupHours, loadBarberSetup, saveBarberSetup, validateSetupDraft } from "./data/setup";
import WorkingHours from "./components/WorkingHours";

export default function BarberProfileEdit() {
  const route = useLocation();
  const lang = readSiteLocale(route.search);
  const ui = v144InnerUi(lang).setup;
  const navigate = useNavigate();
  const [draft, setDraft] = useState(() => ({ location: null, address: "", hours: defaultSetupHours() }));
  const [errors, setErrors] = useState({});
  const [loadState, setLoadState] = useState("loading");
  const [attempt, setAttempt] = useState(0);
  const saveController = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    loadBarberSetup(controller.signal).then(data => {
      if (!controller.signal.aborted) { setDraft(data); setLoadState("ready"); }
    }).catch(error => {
      if (!controller.signal.aborted) { setErrors({ submit: error.message }); setLoadState("error"); }
    });
    return () => controller.abort();
  }, [attempt]);
  useEffect(() => () => saveController.current?.abort(), []);
  const { location, address, hours } = draft;
  const setLocation = (value) => setDraft((current) => ({ ...current, location: value }));
  const setAddress = (value) => setDraft((current) => ({ ...current, address: value }));
  const setHours = (value) => setDraft((current) => ({ ...current, hours: value }));

  const workingCount = hours.filter((h) => !h.isOff).length;

  const [saving, setSaving] = useState(false);
  const handleSubmit = async (event) => {
    event.preventDefault();
    if (saveController.current || loadState !== "ready") return;

    const next = validateSetupDraft({ address, location, hours });

    setErrors(next);

    if (Object.keys(next).length > 0) {
      requestAnimationFrame(() =>
        document
          .querySelector(".bp-page [role='alert']")
          ?.scrollIntoView({ behavior: "smooth", block: "center" }),
      );
      return;
    }

    const controller = new AbortController();
    saveController.current = controller;
    setSaving(true);
    try {
      const target = await saveBarberSetup({ address, location, hours }, controller.signal);
      if (!controller.signal.aborted) navigate(target, { replace: true });
    } catch (error) {
      if (!controller.signal.aborted) setErrors({ submit: error.message || ui.saveError });
    } finally {
      if (!controller.signal.aborted) setSaving(false);
      if (saveController.current === controller) saveController.current = null;
    }
  };

  return (
    <AuthLayout wide className="bp-setup">
      <form onSubmit={handleSubmit} className="bp-page" noValidate>
        <header className="bp-head">
          <h1>{ui.title}</h1>
          <p>
            {ui.intro}
          </p>
        </header>

        {loadState === "loading" && <p role="status">{ui.loading}</p>}
        <fieldset disabled={saving || loadState !== "ready"} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: "grid", gap: 16 }}>
        <section className="bp-card" aria-label={ui.workplace}>
          <div className="bp-card-head">
            <h2>
              <span className="bp-step">1</span> {ui.workplace}
            </h2>
            <span
              className={`bp-badge ${isValidLocation(location) ? "is-ok" : "is-warning"}`}
            >
              {isValidLocation(location) ? ui.selected : ui.needsSelection}
            </span>
          </div>

          <LocationPicker
            showEmptySummary={false}
            value={location}
            onChange={(value) => {
              setLocation(value);
              setErrors((previous) => ({ ...previous, location: "" }));
            }}
            address={address}
            onAddressChange={(value) => { setAddress(value); setErrors((previous) => ({ ...previous, address: "", location: "" })); }}
            error={errors.location}
          />
          {errors.address && <p className="bp-note is-error" role="alert">{errors.address}</p>}
          <p className="bp-note">{ui.locationHint}</p>
        </section>

        <section className="bp-card">
          <div className="bp-card-head">
            <h2>
              <span className="bp-step">2</span> {ui.hours}
            </h2>
            <span
              className={`bp-badge ${workingCount === 0 ? "is-warning" : ""}`}
            >
              {workingCount === 0
                ? ui.selectDay
                : `${workingCount} ${ui.workingDays}`}
            </span>
          </div>

          <WorkingHours
            value={hours}
            onChange={(value) => {
              setHours(value);
              setErrors((previous) => ({ ...previous, hours: "" }));
            }}
          />

          {errors.hours && (
            <p className="bp-note is-error" role="alert">
              {errors.hours}
            </p>
          )}
        </section>

        </fieldset>
        <div className="bp-savebar">
          {errors.submit && (
            <p className="bp-note is-error" role="alert">
              {errors.submit}
            </p>
          )}

          {loadState === "error" && <button type="button" className="bp-btn" onClick={() => { setLoadState("loading"); setErrors({}); setAttempt(value => value + 1); }}>{ui.reload}</button>}
          <button type="submit" className="bp-btn bp-btn-primary bp-save" disabled={saving || loadState !== "ready"}>
            {saving ? ui.saving : ui.save}
          </button>
        </div>
      </form>
    </AuthLayout>
  );
}
