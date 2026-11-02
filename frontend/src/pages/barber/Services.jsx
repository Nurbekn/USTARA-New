import { useState } from "react";
import PageHeader from "./components/PageHeader";
import Sheet from "./components/Sheet";
import { useToast } from "./components/Toast";
import { updateProfile, useBarber } from "./data/store";
import { formatDuration, formatMoney } from "./data/format";

const SUGGESTIONS = ["Soch olish", "Soqol olish", "Soch + soqol", "Bolalar soch olish", "Yuz parvarishi"];
const DURATIONS = [15, 30, 45, 60, 75, 90];
const EMPTY = { id: null, name: "", price: 50000, duration: 45 };

export default function Services() {
  const { profile } = useBarber();
  const { toast, show } = useToast();
  const [form, setForm] = useState(null); // null = sheet closed
  const [deleting, setDeleting] = useState(null);
  const services = profile.services;

  const save = () => {
    const name = form.name.trim();
    if (name.length < 2) return show("Xizmat nomini kiriting");
    if (form.price < 1000) return show("Narx kamida 1 000 so'm");

    const item = { ...form, name };
    const next = form.id
      ? services.map((s) => (s.id === form.id ? item : s))
      : [...services, { ...item, id: Date.now() }];

    updateProfile({ services: next });
    setForm(null);
    show(form.id ? "Xizmat yangilandi" : "Xizmat qo'shildi");
  };

  const remove = (id) => {
    if (services.length === 1) return show("Kamida bitta xizmat qolishi kerak");
    updateProfile({ services: services.filter((s) => s.id !== id) });
    setDeleting(null);
    show("Xizmat o'chirildi");
  };

  const set = (patch) => setForm({ ...form, ...patch });

  return (
    <div className="bx-page">
      <PageHeader
        back
        title="Xizmatlar"
        subtitle="Narx va davomiylik"
        action={
          <button type="button" className="bx-btn bx-btn-sm bx-btn-primary" onClick={() => setForm(EMPTY)}>
            + Qo'shish
          </button>
        }
      />

      {services.length === 0 && (
        <div className="bx-empty">
          <strong>Hali xizmat yo'q</strong>
          <p>Soch olish, soqol olish kabi xizmatlar va narxlarni qo'shing.</p>
          <button type="button" className="bx-btn bx-btn-primary" onClick={() => setForm(EMPTY)}>
            Birinchi xizmatni qo'shish
          </button>
        </div>
      )}

      <div className="bx-list">
        {services.map((s) => (
          <article key={s.id} className="bx-card bx-service">
            <div>
              <strong>{s.name}</strong>
              <p className="bx-muted">{formatDuration(s.duration)}</p>
            </div>
            <div className="bx-service-side">
              <b>{formatMoney(s.price)}</b>
              {deleting === s.id ? (
                <div className="bx-inline-actions">
                  <button type="button" className="bx-btn bx-btn-sm bx-btn-danger" onClick={() => remove(s.id)}>
                    O'chirish
                  </button>
                  <button type="button" className="bx-btn bx-btn-sm bx-btn-ghost" onClick={() => setDeleting(null)}>
                    Yo'q
                  </button>
                </div>
              ) : (
                <div className="bx-inline-actions">
                  <button type="button" className="bx-btn bx-btn-sm bx-btn-ghost" onClick={() => setForm(s)}>
                    Tahrirlash
                  </button>
                  <button type="button" className="bx-btn bx-btn-sm bx-btn-ghost" onClick={() => setDeleting(s.id)}>
                    ✕
                  </button>
                </div>
              )}
            </div>
          </article>
        ))}
      </div>

      <p className="bx-note">
        Narxni o'zgartirsangiz, eski bronlar va daromad hisoboti o'zgarmaydi.
      </p>

      <Sheet open={!!form} title={form?.id ? "Xizmatni tahrirlash" : "Yangi xizmat"} onClose={() => setForm(null)}>
        {form && (
          <div className="bx-form">
            <label className="bx-field">
              Nomi
              <input
                className="bx-input"
                value={form.name}
                maxLength={40}
                placeholder="Masalan: Soch olish"
                onChange={(e) => set({ name: e.target.value })}
              />
            </label>
            <div className="bx-chips">
              {SUGGESTIONS.map((name) => (
                <button key={name} type="button" className="bx-chip" onClick={() => set({ name })}>
                  {name}
                </button>
              ))}
            </div>

            <div className="bx-field">
              Narxi
              <div className="bx-stepper">
                <button type="button" onClick={() => set({ price: Math.max(1000, form.price - 5000) })} aria-label="Kamaytirish">
                  −
                </button>
                <input
                  className="bx-input"
                  inputMode="numeric"
                  value={form.price}
                  onChange={(e) => set({ price: Number(e.target.value.replace(/\D/g, "")) })}
                  aria-label="Narx (so'm)"
                />
                <button type="button" onClick={() => set({ price: form.price + 5000 })} aria-label="Oshirish">
                  +
                </button>
              </div>
              <small className="bx-muted">{formatMoney(form.price)}</small>
            </div>

            <div className="bx-field">
              Davomiyligi
              <div className="bx-chips">
                {DURATIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={`bx-chip ${form.duration === d ? "is-active" : ""}`}
                    onClick={() => set({ duration: d })}
                  >
                    {formatDuration(d)}
                  </button>
                ))}
              </div>
            </div>

            <button type="button" className="bx-btn bx-btn-primary bx-btn-block" onClick={save}>
              Saqlash
            </button>
          </div>
        )}
      </Sheet>
      {toast}
    </div>
  );
}
