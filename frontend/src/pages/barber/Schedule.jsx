import { useState } from "react";
import PageHeader from "./components/PageHeader";
import { useToast } from "./components/Toast";
import { updateProfile, useBarber } from "./data/store";
import WorkingHours from "./components/WorkingHours";

export default function Schedule() {
  const { profile } = useBarber();
  const { toast, show } = useToast();
  const [draft, setDraft] = useState(profile.hours);

  const dirty = JSON.stringify(draft) !== JSON.stringify(profile.hours);
  const invalid = draft.some((h) => !h.isOff && h.start >= h.end);

  const save = () => {
    if (invalid) return show("Tugash vaqti boshlanishdan keyin bo'lishi kerak");
    if (!updateProfile({ hours: draft })) return show("Jadval saqlanmadi. Qayta urinib ko‘ring.");
    show("Jadval saqlandi");
  };

  return (
    <div className="bx-page">
      <PageHeader title="Jadval" subtitle="Ish vaqtingizni belgilang" />

      <div className="bx-card bx-row">
        <div>
          <strong>Bron qabul qilish</strong>
          <p className="bx-muted">
            {profile.isAvailable ? "Mijozlar sizga bron qila oladi" : "Hozir yangi bronlar yopiq"}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={profile.isAvailable}
          aria-label="Bron qabul qilish"
          className={`bx-switch ${profile.isAvailable ? "is-on" : ""}`}
          onClick={() => updateProfile({ isAvailable: !profile.isAvailable })}
        />
      </div>

      <WorkingHours value={draft} onChange={setDraft} />

      <div className="bx-savebar">
        <button
          type="button"
          className="bx-btn bx-btn-primary bx-btn-block"
          disabled={!dirty}
          onClick={save}
        >
          {dirty ? "Saqlash" : "Saqlangan"}
        </button>
      </div>
      {toast}
    </div>
  );
}
