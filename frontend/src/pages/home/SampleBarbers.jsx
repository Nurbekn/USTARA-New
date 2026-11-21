import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { request } from "../../api/client.js";
import { profileName } from "../../utils/profileName.js";
import ArrowIcon from "../../components/ArrowIcon";
import "./SampleBarbers.css";

export default function SampleBarbers() {
  const [state, setState] = useState({ status: "loading", barbers: [], error: "" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    request("GET", "/api/barbers", { signal: controller.signal })
      .then((barbers) => {
        if (!Array.isArray(barbers)) throw new Error("Sartaroshlar ro‘yxati olinmadi.");
        setState({ status: "ready", barbers, error: "" });
      })
      .catch((error) => {
        if (!controller.signal.aborted) setState({ status: "error", barbers: [], error: error.message });
      });
    return () => controller.abort();
  }, [attempt]);

  return (
    <section className="hm-samples container ui-section" aria-labelledby="hm-samples-title" aria-busy={state.status === "loading"}>
      <header className="hm-samples-heading">
        <div><p className="ui-eyebrow">USTALAR</p><h2 id="hm-samples-title">Sartaroshlar bilan tanishing.</h2></div>
        <Link to="/barbers" className="hm-samples-link">Barcha sartaroshlar <ArrowIcon /></Link>
      </header>
      {state.status === "loading" ? <p role="status">Sartaroshlar yuklanmoqda…</p>
        : state.status === "error" ? <div role="alert"><p>{state.error || "Sartaroshlarni yuklab bo‘lmadi."}</p><button type="button" onClick={() => setAttempt((value) => value + 1)}>Qayta urinish</button></div>
          : state.barbers.length === 0 ? <p className="hm-samples-note">Hozircha tasdiqlangan sartarosh yo‘q.</p>
            : <div className="hm-samples-grid">{state.barbers.map((barber) => (
              <Link key={barber.id} to={`/barbers/${barber.id}`} className="hm-sample-card">
                <div className="hm-sample-work" role="img" aria-label="Sartarosh profili" />
                <div className="hm-sample-info"><h3>{profileName(barber) || "Ism ko‘rsatilmagan"}</h3><p>{barber.specialty || "Mutaxassislik ko‘rsatilmagan"}</p><span className="ui-arrow-inline">Profilni ko‘rish <ArrowIcon /></span></div>
              </Link>
            ))}</div>}
    </section>
  );
}
