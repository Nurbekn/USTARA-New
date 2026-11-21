import { useLocation } from "react-router-dom";
import { readSiteLocale } from "../../utils/siteLocale.js";
import { barberOpsText } from "./barberOpsLocaleV146.js";
import { useState } from "react";
import PageHeader from "./components/PageHeader";
import { useToast } from "./components/Toast";
import { saveWorkingHours, setBookingAcceptance, useBarber } from "./data/store";
import WorkingHours from "./components/WorkingHours";
import CancellationPolicyEditor from "./components/CancellationPolicyEditor";
import CalendarExceptionsEditor from "./components/CalendarExceptionsEditor";
import RecurringBreaksEditor from "./components/RecurringBreaksEditor";

export default function Schedule() {
  const lang = readSiteLocale(useLocation().search);
  const tr = barberOpsText(lang);
  const { profile, status, error, errors = {} } = useBarber();
  const { toast, show } = useToast();
  const [draftState, setDraftState] = useState(() => ({ hours: profile.hours, source: profile.hours }));
  if (status === "ready" && draftState.source !== profile.hours) {
    setDraftState({ hours: profile.hours, source: profile.hours });
  }
  const draft = draftState.hours;
  const setDraft = (hours) => setDraftState({ hours, source: draftState.source });

  const dirty = JSON.stringify(draft) !== JSON.stringify(profile.hours);
  const invalid = draft.some((h) => !h.isOff && h.start >= h.end);

  const [saving, setSaving] = useState(false);
  const [savingAcceptance, setSavingAcceptance] = useState(false);
  const changeAcceptance = async (acceptingBookings) => {
    setSavingAcceptance(true);
    try {
      await setBookingAcceptance(acceptingBookings);
      show(acceptingBookings ? tr("Yangi bronlar qabul qilinadi") : tr("Yangi bron qabul qilish o‘chirildi"));
    } catch (cause) {
      show(cause.message || tr("Bron qabul qilish holati saqlanmadi."));
    } finally { setSavingAcceptance(false); }
  };
  const save = async () => {
    if (invalid) return show(tr("Tugash vaqti boshlanishdan keyin bo'lishi kerak"));
    setSaving(true);
    try {
      await saveWorkingHours(draft);
      show(tr("Jadval serverga saqlandi"));
    } catch (error) { show(error.message || tr("Jadval saqlanmadi.")); }
    finally { setSaving(false); }
  };

  return (
    <div className="bx-page">
      <PageHeader title={tr("Jadval")} subtitle={tr("Ish vaqtingizni belgilang")} />

      <div className="bx-card bx-row">
        <div>
          <strong>{tr("Bron qabul qilish")}</strong>
          <p className="bx-muted">
            {status === "loading" ? tr("Holat serverdan yuklanmoqda…") : status === "error" ? error :
              profile.acceptingBookings ? tr("Mijozlar yangi bron yuborishi mumkin.") : tr("Yangi bronlar vaqtincha yopiq.")}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={profile.acceptingBookings === true}
          aria-label={tr("Bron qabul qilish")}
          className={`bx-switch ${profile.acceptingBookings ? "is-on" : ""}`}
          disabled={status !== "ready" || savingAcceptance || typeof profile.acceptingBookings !== "boolean"}
          onClick={() => void changeAcceptance(!profile.acceptingBookings)}
        />
        {savingAcceptance && <span role="status">{tr("Saqlanmoqda…")}</span>}
      </div>

      {status === "loading" ? <p role="status">{tr("Saqlangan jadval yuklanmoqda…")}</p> : errors.hours ? <p role="alert" className="bx-error">{errors.hours}</p> : <WorkingHours value={draft} onChange={setDraft} />}

      <CalendarExceptionsEditor enabled={status === 'ready'} />
      <RecurringBreaksEditor enabled={status === 'ready'} />
      <CancellationPolicyEditor enabled={status === 'ready'} />

      <div className="bx-savebar">
        <button
          type="button"
          className="bx-btn bx-btn-primary bx-btn-block"
          disabled={status !== "ready" || !!errors.hours || !dirty || saving}
          onClick={save}
        >
          {saving ? tr("Saqlanmoqda…") : dirty ? tr("Serverga saqlash") : tr("Saqlangan")}
        </button>
      </div>
      {toast}
    </div>
  );
}
