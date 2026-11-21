import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { readSiteLocale } from "../../../utils/siteLocale.js";
import { accountBarberUi } from "../../../components/accountLocaleV145.js";
import { getSession } from "../../auth/utils/session";
import { request as apiRequest } from "../../../api/client.js";
async function request(action, signal) {
  const session = getSession();
  if (session?.role !== "barber" || !session.token) throw new Error("Qayta tizimga kiring.");
  const path = action === "unlink" ? "" : `/${action}`;
  try {
    const data = await apiRequest(action === "status" ? "GET" : action === "unlink" ? "DELETE" : "POST",
      `/api/barbers/telegram${path}`, { token: session.token, signal });
    if (data === null) throw new Error("Serverdan javob olinmadi.");
    return data;
  } catch (error) {
    let message;
    if (error.status === 401) message = "Qayta tizimga kiring.";
    else if (["network_error", "request_timeout"].includes(error.code)) message = "Serverga ulanib bo‘lmadi. Qayta urinib ko‘ring.";
    else if (error.code === "invalid_response"
      || (error.code === "http_error" && error.message === "Serverdan JSON javob olinmadi.")) message = "Serverdan javob olinmadi.";
    if (!message) throw error;
    throw Object.assign(new Error(message, { cause: error }), {
      status: error.status, code: error.code, metadata: error.metadata, backendMessage: error.message,
    });
  }
}
export default function TelegramLinkCard() {
  const lang = readSiteLocale(useLocation().search);
  const ui = accountBarberUi(lang).telegram;
  const [status, setStatus] = useState(null);
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const action = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    request("status", controller.signal).then(setStatus).catch(() => { if (!controller.signal.aborted) setError(ui.statusError); });
    return () => { controller.abort(); action.current?.abort(); };
  }, []);
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setPending(null), Math.max(0, Date.parse(pending.expiresAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [pending]);
  async function run(kind) {
    if (action.current) return;
    const controller = new AbortController(); action.current = controller;
    setBusy(true); setError("");
    try {
      const data = await request(kind, controller.signal);
      if (kind === "start") {
        if (!/^[0-9a-f]{64}$/.test(data.token) || !Number.isFinite(Date.parse(data.expiresAt))) throw new Error(ui.linkError);
        setPending({ token: data.token, expiresAt: data.expiresAt });
        setStatus((previous) => ({ ...previous, botUrl: data.botUrl }));
      } else {
        setStatus((previous) => ({ ...previous, ...data }));
        if (kind === "unlink" || data.linked) setPending(null);
      }
    } catch (error) {
      if (!controller.signal.aborted) setError(error instanceof TypeError ? ui.networkError : error.message);
    } finally { action.current = null; if (!controller.signal.aborted) setBusy(false); }
  }
  const botUrl = /^https:\/\/t\.me\/[A-Za-z][A-Za-z0-9_]{4,31}$/.test(status?.botUrl || "") ? status.botUrl : null;
  return <section className="bx-card bx-form" aria-busy={busy}>
    <h3>{ui.title}</h3>
    <p className="bx-muted" role="status">{status ? status.linked ? ui.linked : ui.unlinked : ui.loading}</p>
    {botUrl && <a className="bx-btn bx-btn-ghost" href={botUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{ui.open}</a>}
    {status?.linked ? <button type="button" className="bx-btn bx-btn-danger" disabled={busy} onClick={() => run("unlink")}>{ui.unlink}</button>
      : <button type="button" className="bx-btn bx-btn-primary" disabled={busy || !status} onClick={() => run("start")}>{pending ? ui.newCode : ui.link}</button>}
    {pending && <>
      <p>{ui.instruction}</p>
      <code style={{ overflowWrap: "anywhere" }}>/start {pending.token}</code>
    </>}
    <button type="button" className="bx-btn bx-btn-ghost" disabled={busy} onClick={() => run("status")}>{ui.refresh}</button>
    {error && <p className="bx-error" role="alert">{error}</p>}
  </section>;
}
