import { useLocation } from "react-router-dom";
import { readSiteLocale } from "../../utils/siteLocale.js";
import { barberOpsText } from "./barberOpsLocaleV146.js";
import { useRef, useState } from "react";
import PageHeader from "./components/PageHeader";
import Sheet from "../../components/Sheet";
import { useToast } from "./components/Toast";
import { refreshBarberData, useBarber } from "./data/store";
import { request } from "../../api/client.js";
import { getSession } from "../auth/utils/session.js";
import { formatDuration, formatMoney } from "./data/format";
import { validateServiceDraft, stepServicePrice } from "./data/serviceForm.js";


const EMPTY = { id: null, name: "", price: "", duration: 5, active: true };

export default function Services() {
  const lang = readSiteLocale(useLocation().search);
  const tr = barberOpsText(lang);
  const { profile, errors = {} } = useBarber();
  const { toast, show } = useToast();
  const [form, setForm] = useState(null); // null = sheet closed
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const services = Array.isArray(profile?.services) ? profile.services : [];
  const displayDuration = (minutes) => formatDuration(minutes).replaceAll("soat", tr("soat")).replaceAll("daq", tr("daq"));

  const save = async () => {
    if (lock.current || !form) return;
    const validation = validateServiceDraft(form);
    if (!validation.ok) return show(validation.message);
    const session = getSession();
    if (session?.role !== "barber" || !session.token || session.profileId !== profile.id) {
      return show(tr("Akkaunt sessiyasi o‘zgargan. Qayta kiring."));
    }
    lock.current = true;
    setBusy(true);
    try {
      const body = {
        name: validation.name,
        price: validation.price,
        duration_minutes: validation.duration,
        ...(form.id && form.active !== services.find(item => item.id === form.id)?.active
          ? { is_active: form.active } : {}),
      };
      await request(form.id ? "PUT" : "POST", form.id ? `/api/services/${form.id}` : "/api/services", { token: session.token, body });
      if (getSession()?.token !== session.token) return;
      if (!(await refreshBarberData())) throw new Error(tr("Xizmat saqlandi, ammo serverdan yangilangan ro‘yxat olinmadi."));
      if (getSession()?.token !== session.token) return;
      setForm(null);
      show(form.id ? tr("Xizmat yangilandi") : tr("Xizmat qo‘shildi"));
    } catch (error) {
      if (getSession()?.token === session.token) show(error.message || tr("Xizmat saqlanmadi."));
    } finally { lock.current = false; setBusy(false); }
  };

  const remove = async (id) => {
    if (lock.current || !Number.isSafeInteger(id) || id <= 0) return;
    const session = getSession();
    if (session?.role !== "barber" || !session.token || session.profileId !== profile.id) {
      return show(tr("Akkaunt sessiyasi o‘zgargan. Qayta kiring."));
    }
    lock.current = true;
    setBusy(true);
    try {
      let archived = false;
      try {
        await request("DELETE", `/api/services/${id}`, { token: session.token });
      } catch (error) {
        // A booked service must remain for history; hide it from new bookings instead.
        // Never interpret unrelated 409 responses as safe to archive.
        if (error.status !== 409 || error.code !== "service_has_bookings") throw error;
        await request("PATCH", `/api/services/${id}/status`, {
          token: session.token, body: { is_active: false },
        });
        archived = true;
      }
      if (getSession()?.token !== session.token) return;
      if (!(await refreshBarberData())) throw new Error(tr("Xizmat o‘chirildi, ammo serverdan yangilangan ro‘yxat olinmadi."));
      if (getSession()?.token !== session.token) return;
      setDeleting(null);
      show(archived ? tr("Xizmat yangi bronlardan yashirildi, eski bronlar saqlandi") : tr("Xizmat o‘chirildi"));
    } catch (error) {
      if (getSession()?.token === session.token) show(error.message || tr("Xizmat o‘chirilmadi."));
    } finally { lock.current = false; setBusy(false); }
  };

  const set = (patch) => setForm({ ...form, ...patch });

  return (
    <div className="bx-page">
      <PageHeader
        back
        title={tr("Xizmatlar")}
        subtitle={tr("Narx va davomiylik")}
        action={
          <button
            type="button"
            className="bx-btn bx-btn-sm bx-btn-primary"
            disabled={busy} onClick={() => setForm(EMPTY)}
          >
            {tr("+ Qo'shish")}
          </button>
        }
      />

      {errors.services && <p className="bx-error" role="alert">{errors.services}</p>}
      {services.length === 0 && !errors.services && (
        <div className="bx-empty">
          <strong>{tr("Hali xizmat yo'q")}</strong>
          <p>{tr("Soch olish, soqol olish kabi xizmatlar va narxlarni qo'shing.")}</p>
          <button
            type="button"
            className="bx-btn bx-btn-primary"
            disabled={busy} onClick={() => setForm(EMPTY)}
          >
            {tr("Birinchi xizmatni qo'shish")}
          </button>
        </div>
      )}

      <div className="bx-list">
        {services.map((s) => (
          <article key={s.id} className="bx-card bx-service">
            <div>
              <strong>{s.name}</strong>
              <p className="bx-muted">{displayDuration(s.duration)} · <span className={s.active ? 'bx-service-active' : ''}>{s.active ? tr("Faol") : tr("Yashirilgan")}</span></p>
            </div>
            <div className="bx-service-side">
              <b>{formatMoney(s.price)}</b>
              {deleting === s.id ? (
                <div className="bx-inline-actions">
                  <button
                    type="button"
                    className="bx-btn bx-btn-sm bx-btn-danger"
                    disabled={busy} onClick={() => remove(s.id)}
                  >
                    {tr("O'chirish")}
                  </button>
                  <button
                    type="button"
                    className="bx-btn bx-btn-sm bx-btn-ghost"
                    disabled={busy} onClick={() => setDeleting(null)}
                  >
                    {tr("Yo'q")}
                  </button>
                </div>
              ) : (
                <div className="bx-inline-actions">
                  <button
                    type="button"
                    className="bx-btn bx-btn-sm bx-btn-ghost"
                    disabled={busy} onClick={() => setForm(s)}
                  >
                    {tr("Tahrirlash")}
                  </button>
                  <button
                    type="button"
                    className="bx-btn bx-btn-sm bx-btn-ghost"
                    disabled={busy} onClick={() => setDeleting(s.id)}
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          </article>
        ))}
      </div>

      <p className="bx-note">
        {tr("Davomiylik: 5 daqiqadan 1 soatgacha, 5 daqiqalik qadamda.")}
      </p>

      <Sheet
        open={!!form}
        title={form?.id ? tr("Xizmatni tahrirlash") : tr("Yangi xizmat")}
        onClose={() => { if (!busy) setForm(null); }}
      >
        {form && (
          <div className="bx-form">
            <label className="bx-field">
              {tr("Nomi")}
              <input
                className="bx-input"
                value={form.name}
                maxLength={50}
                disabled={busy}
                placeholder={tr("Masalan: Soch olish")}
                onChange={(e) => set({ name: e.target.value })}
              />
            </label>
            <div className="bx-field">
              {tr("Narxi")}
              <div className="bx-stepper">
                <button
                  type="button"
                  onClick={() =>
                    set({ price: stepServicePrice(form.price, -5000) })
                  }
                  disabled={busy}
                  aria-label={tr("Kamaytirish")}
                >
                  −
                </button>
                <input
                  className="bx-input"
                  inputMode="numeric"
                  maxLength={8}
                  disabled={busy}
                  value={form.price}
                  onChange={(e) =>
                    set({ price: e.target.value.replace(/\D/g, "").slice(0, 8) })
                  }
                  aria-label={tr("Narx (so'm)")}
                />
                <button
                  type="button"
                  onClick={() => set({ price: stepServicePrice(form.price, 5000) })}
                  disabled={busy}
                  aria-label={tr("Oshirish")}
                >
                  +
                </button>
              </div>
              <small className="bx-muted">{form.price ? formatMoney(form.price) : tr("Narxni kiriting")}</small>
            </div>

            <div className="bx-field">
              {tr("Davomiyligi")}
              <div className="bx-stepper">
                <button type="button" aria-label={tr("5 daqiqa kamaytirish")} disabled={busy || form.duration <= 5} onClick={() => set({ duration: Math.max(5, form.duration - 5) })}>−</button>
                <output aria-live="polite" style={{ textAlign: "center", alignSelf: "center" }}>{displayDuration(form.duration)}</output>
                <button type="button" aria-label={tr("5 daqiqa qo‘shish")} disabled={busy || form.duration >= 60} onClick={() => set({ duration: Math.min(60, form.duration + 5) })}>+</button>
              </div>
            </div>

            {form.id && <label className="bx-field"><span><input type="checkbox" checked={form.active} disabled={busy} onChange={event => set({ active: event.target.checked })}/> {tr("Xizmat faol")}</span></label>}
            <button
              type="button"
              className="bx-btn bx-btn-primary bx-btn-block"
              disabled={busy}
              onClick={save}
            >
              {busy ? tr("Saqlanmoqda…") : tr("Saqlash")}
            </button>
          </div>
        )}
      </Sheet>
      {toast}
    </div>
  );
}
