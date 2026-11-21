import { profileName } from "../../../utils/profileName.js";
import { customerCoreLocale, customerCoreUi } from "../coreLocale.js";
import { siteLocalePath } from "../../../utils/siteLocale.js";
import { request as publicRequest } from "../../../api/client.js";
import { formatDate, formatMoney } from "../../../utils/format";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Sheet from "../../../components/Sheet";
import ArrowIcon from "../../../components/ArrowIcon";
import Icon from "../../../components/Icon";
import { bookingDates, bookingTimestamp, tashkentDate } from "../bookings/bookingDates.js";
import "./InlineBooking.css";
import { getSession } from "../../auth/utils/session";
import { watchAvailableSlots } from "./availableSlots.js";
import { availabilityWeekDates, watchAvailabilityWeek, nextVerifiedAvailableDay } from "./weeklyAvailability.js";
import { createBookingSubmitter, checkBookingRecovery } from "./createBooking.js";
import { bookingReceiptView } from "./bookingReceipt.js";
import { bookingNeedsRecovery, bookingRecoveryMessage } from "./bookingRecoveryFeedback.js";
import { captureBookingConfirmation, isBookingConfirmationCurrent } from "./bookingConfirmation.js";
import { statusInfo } from "../bookings/model";
import { readBookingDraft, saveBookingDraft, clearBookingDraft, clearBookingDraftForBarber, restoreBookingDraft } from "./bookingDraft.js";
import { persistBookingSelectionV181, bookingDraftStatusCopyV181 } from "./bookingDraftStatusV181.js";
import PhoneBookingInviteNoticeV185 from "./PhoneBookingInviteNoticeV185.jsx";

const WEEKDAYS = ["Ya", "Du", "Se", "Chor", "Pay", "Ju", "Sha"];

function InlineBooking({ barber, details, bookingsPath }) {
  const [params] = useSearchParams();
  const lang = customerCoreLocale(params);
  const ui = customerCoreUi(lang).booking;
  const navigate = useNavigate();
  const dates = bookingDates();
  const savedDraft = readBookingDraft();
  const draft = restoreBookingDraft(savedDraft, barber.id, details.services.map(item => item.id), dates);
  const staleDraft = savedDraft?.barberId === barber.id && !draft;
  useEffect(() => {
    if (staleDraft) clearBookingDraftForBarber(barber.id);
  }, [barber.id, staleDraft]);
  const previousServices = params.get('services')?.split(',').map(Number) || [];
  const canRebook = previousServices.length > 0 && previousServices.length <= 20 && new Set(previousServices).size === previousServices.length && previousServices.every(id => Number.isSafeInteger(id) && details.services.some(item => item.id === id));
  const phoneInvite=params.get('phone_invite');
  const [serviceIds, setServiceIds] = useState(() => {
    if (canRebook) return previousServices;
    return draft && draft.serviceIds.every(id => details.services.some(service => service.id === id)) ? draft.serviceIds : [];
  });
  const [hour, setHour] = useState(() => !canRebook && draft?.time ? draft.time.slice(0, 2) : '');
  const serviceKey = serviceIds.join(',');
  const [date, setDate] = useState(() => !canRebook && draft?.date ? draft.date : bookingDates()[0]);
  const [time, setTime] = useState(() => !canRebook ? draft?.time || '' : '');
  const [weekIndex, setWeekIndex] = useState(() => Math.floor(Math.max(0, dates.indexOf(!canRebook && draft?.date ? draft.date : dates[0])) / 7));
  const [weekAttempt, setWeekAttempt] = useState(0);
  const [weekRetry, setWeekRetry] = useState(null);
  const [weekRequest, setWeekRequest] = useState(null);
  const [draftSaveState, setDraftSaveState] = useState({ kind: 'none' });
  const draftCopy = bookingDraftStatusCopyV181(lang);
  useEffect(() => {
    if (serviceIds.length) setDraftSaveState(persistBookingSelectionV181({ barberId: barber.id, serviceIds, date, time }));
    else { clearBookingDraftForBarber(barber.id); setDraftSaveState({ kind: 'none' }); }
  }, [barber.id, serviceKey, date, time]);
  useEffect(() => {
    if (draftSaveState.kind !== 'saved') return undefined;
    const remaining = draftSaveState.expiresAt - Date.now();
    if (remaining <= 0) { setDraftSaveState({ kind: 'expired' }); return undefined; }
    const timer = setTimeout(() => setDraftSaveState(old =>
      old.kind === 'saved' && old.expiresAt === draftSaveState.expiresAt
        ? { kind: 'expired' } : old), remaining + 1);
    return () => clearTimeout(timer);
  }, [draftSaveState]);
  function retryDraftSave() {
    setDraftSaveState(persistBookingSelectionV181({ barberId: barber.id, serviceIds, date, time }));
  }
  const [policyAttempt, setPolicyAttempt] = useState(0);
  const [policyState, setPolicyState] = useState({ status: 'loading' });
  useEffect(() => {
    const controller = new AbortController();
    setPolicyState({ status: 'loading' });
    publicRequest('GET', `/api/barbers/${barber.id}/cancellation-policy`, { signal: controller.signal })
      .then(policy => {
        if (controller.signal.aborted) return;
        if (!policy || !(policy.cutoff_minutes === null || (Number.isSafeInteger(policy.cutoff_minutes) && policy.cutoff_minutes >= 0 && policy.cutoff_minutes <= 10080))
          || (policy.text != null && (typeof policy.text !== "string" || policy.text.length > 280)))
          throw new Error('Qoidalar noto‘g‘ri qaytdi.');
        setPolicyState({ status: 'ready', policy });
      }).catch(error => { if (!controller.signal.aborted) setPolicyState({ status: 'error', message: error.message }); });
    return () => controller.abort();
  }, [barber.id, policyAttempt]);
  const [attempt, setAttempt] = useState(0);
  const [request, setRequest] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [busy, setBusy] = useState(false);
  const [submissionError, setSubmissionError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [submitBooking] = useState(createBookingSubmitter);
  const [recoveryChecked, setRecoveryChecked] = useState(false);
  const [recoveryNote, setRecoveryNote] = useState('');
  const saving = useRef(false);
  const submitController = useRef(null);
  useEffect(() => () => submitController.current?.abort(), []);
  const services = details.services.filter(item => serviceIds.includes(item.id));
  const service = services.length ? { name: services.map(item => item.name).join(' + '), price: services.reduce((sum, item) => sum + Number(item.price), 0), duration_minutes: services.reduce((sum, item) => sum + item.duration_minutes, 0) } : null;
  const weekDates = availabilityWeekDates(dates, weekIndex);
  // Include actual dates so a day-boundary rerender cannot display yesterday's week.
  const weekContextKey = `${barber.id}:${serviceKey}:${weekIndex}:${weekDates.join(',')}`;
  const weekKey = `${weekContextKey}:${weekAttempt}`;
  useEffect(() => {
    if (!serviceKey || weekDates.length !== 7) return;
    return watchAvailabilityWeek({ barberId: barber.id, serviceIds: serviceKey.split(',').map(Number), dates: weekDates,
      token: getSession()?.token, initialDays: weekRetry?.key === weekContextKey ? weekRetry.days : null },
      state => setWeekRequest({ ...state, key: weekKey }));
  }, [barber.id, serviceKey, weekIndex, weekAttempt, weekKey, weekContextKey, weekRetry]);
  const week = weekRequest?.key === weekKey ? weekRequest : null;
  const weekEntries = week?.days || weekDates.map(day => ({ date: day, status: 'loading' }));
  const nextFreeDay = week?.complete ? nextVerifiedAvailableDay(week.days) : null;
  const key = `${barber.id}:${serviceKey}:${date}:${attempt}`;
  useEffect(() => {
    if (!serviceKey) return;
    return watchAvailableSlots({ barberId: barber.id, serviceIds: serviceKey.split(',').map(Number), date, token: getSession()?.token },
      (state) => setRequest({ ...state, key }));
  }, [barber.id, serviceKey, date, key]);
  const current = request?.key === key ? request : { status: 'loading' };
  const slots = current.status === 'ready' ? current.data.slots : [];
  const selected = slots.find((slot) => slot.time === time && slot.available);
  const serverQuote = current.status === 'ready' ? current.data.total_price : null;
  const totalPrice = serverQuote != null ? Number(serverQuote) : service?.price;
  const duration = current.status === 'ready' ? current.data.duration : service?.duration_minutes;
  const confirmationInput = {
    barberId: barber.id, serviceIds, date, selected, quote: serverQuote,
    duration, serviceName: service?.name, policy: policyState.status === 'ready' ? policyState.policy : null,
    quoteReceivedAt: current.status === 'ready' ? current.receivedAt : null,
  };
  const confirmationValid = isBookingConfirmationCurrent(confirmation, confirmationInput);
  function openConfirmation() {
    const snapshot = captureBookingConfirmation(confirmationInput);
    if (!snapshot) {
      setSubmissionError({ status: 409, message: 'Bo‘sh vaqt, narx yoki qoida yangilanishi kerak. Ma’lumotlarni yangilab qayta tanlang.' });
      return;
    }
    setSubmissionError(null);
    setConfirmation(snapshot);
    setConfirmOpen(true);
  }
  function refreshSlots() {
    setTime(''); setHour(''); setConfirmation(null); setConfirmOpen(false);
    setSubmissionError(null); setAttempt((value) => value + 1);
  }
  function refreshWeekAndSelectedDay() {
    setWeekRetry(null); setWeekAttempt(value => value + 1);
    refreshSlots(); // A refreshed week is NOT proof the old per-day quote is current.
  }
  function retryFailedWeekDays() {
    if (!week?.complete || !week.days.some(day => day.status === 'error')) return;
    setWeekRetry({key: weekContextKey, days: week.days});
    setWeekAttempt(value => value + 1);
  }
  function switchWeek(index) {
    if (index === weekIndex) return;
    setWeekRetry(null); setWeekIndex(index);
    setDate(dates[index * 7]); setHour(''); setTime('');
    setConfirmOpen(false); setConfirmation(null); setSubmissionError(null);
  }
  function selectDay(day) {
    setDate(day); setHour(''); setTime(''); setConfirmation(null); setConfirmOpen(false);
    setSubmissionError(null);
  }
  async function checkRecovery() {
    const attempt = submitBooking.pending();
    const session = getSession();
    if (saving.current || !attempt) return;
    if (session?.role !== 'customer') {
      setRecoveryNote('Broningizni tekshirish uchun mijoz akkauntiga kiring.');
      return;
    }
    if (attempt.accountId === undefined || attempt.accountId !== session.accountId) {
      setRecoveryChecked(true);
      setRecoveryNote('Eski so‘rov boshqa yoki noma’lum akkauntga tegishli. Yangi bron oldidan «Bronlarim»ni tekshiring.');
      return;
    }
    saving.current = true;
    const controller = new AbortController();
    submitController.current = controller;
    setBusy(true); setRecoveryNote(''); setRecoveryChecked(false);
    try {
      const result = await checkBookingRecovery({requestId:attempt.requestId,token:session.token,signal:controller.signal,customerProfileId:session.profileId,expectedSelection:attempt.signature});
      if (controller.signal.aborted) return;
      // Credentials may change while the GET is in flight (e.g. sign out).
      // A response from the old session must never be shown as new-account success.
      const latestSession = getSession();
      if (latestSession?.role !== 'customer' || latestSession.accountId !== session.accountId
        || latestSession.profileId !== session.profileId || latestSession.token !== session.token
        || submitBooking.pending()?.requestId !== attempt.requestId) {
        setRecoveryNote('Sessiya o‘zgardi. Yangi akkauntda bronlarni qayta tekshiring.');
        return;
      }
      if (result.found) {
        if (submitBooking.clearPending()) {
          clearBookingDraft();
          setSuccess({message:'Avval yuborilgan bron topildi',data:result.data});
          setConfirmOpen(false); setSubmissionError(null);
        }
      } else {
        // A negative lookup is NOT proof the original POST cannot still commit.
        setRecoveryChecked(true);
        setRecoveryNote('Bu so‘rov hozircha topilmadi. Avval «Bronlarim»ni tekshiring. Xohlasangiz, ayni tanlovni eski so‘rov ID bilan qayta tasdiqlang.');
      }
    } catch (error) {
      if (!controller.signal.aborted) setRecoveryNote(error.message || 'Bron holatini tekshirib bo‘lmadi.');
    } finally {
      saving.current = false;
      if (!controller.signal.aborted) setBusy(false);
      if (submitController.current === controller) submitController.current = null;
    }
  }
  function abandonRecovery() {
    // Explicit opt-in only, after a lookup; an in-flight POST might still commit.
    if (saving.current || !recoveryChecked || !submitBooking.clearPending()) return;
    setRecoveryChecked(false);
    setRecoveryNote('Eski so‘rov ID bekor qilindi. Eski bron yaratilgan bo‘lishi mumkin — yangi bron oldidan «Bronlarim»ni tekshiring.');
    setSubmissionError(null);
  }
  async function confirm() {
    if (saving.current) return;
    if (!isBookingConfirmationCurrent(confirmation, confirmationInput) || !confirmation) {
      setSubmissionError({ status: 409, message: 'Tasdiqlash oynasidagi ma’lumot o‘zgardi yoki eskirdi. Bo‘sh vaqtlarni yangilang.' });
      return;
    }
    if (confirmation.price == null) {
      setSubmissionError({ status: 503, message: 'Narx serverda tasdiqlanmadi. Vaqtlarni yangilang.' });
      return;
    }
    const session = getSession();
    if (session?.role !== 'customer') {
      if (!saveBookingDraft({ barberId: confirmation.barberId, serviceIds: [...confirmation.serviceIds], date: confirmation.date, time: confirmation.time })) {
        setSubmissionError({ status: 0, message: 'Tanlovni saqlab bo‘lmadi. Brauzer xotirasi ruxsatlarini tekshiring.' });
        return;
      }
      setConfirmOpen(false);
      navigate('/login', { state: { bookingDraft: true } });
      return;
    }
    saving.current = true;
    const controller = new AbortController();
    submitController.current = controller;
    setBusy(true); setSubmissionError(null);
    try {
      const result = await submitBooking({ barberId: confirmation.barberId, serviceIds: [...confirmation.serviceIds], date: confirmation.date, time: confirmation.time,
        token: session.token, accountId: session.accountId, customerProfileId: session.profileId, signal: controller.signal, expectedTotalPrice: confirmation.price,
        expectedDurationMinutes: confirmation.duration,
        expectedCancellationPolicy: { cutoff_minutes: confirmation.policyCutoff, text: confirmation.policyText } });
      if (!controller.signal.aborted) {
        const latest = getSession();
        if (latest?.role !== 'customer' || latest.accountId !== session.accountId || latest.token !== session.token) {
          setConfirmOpen(false);
          setSubmissionError({ status: 409, message: 'Akkaunt o‘zgardi. Avvalgi akkauntdagi «Bronlarim»ni tekshiring.' });
          return;
        }
        clearBookingDraft(); setSuccess(result); setConfirmOpen(false);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        const latest = getSession();
        if (latest?.role !== 'customer' || latest.accountId !== session.accountId || latest.token !== session.token) {
          setConfirmOpen(false);
          setSubmissionError({ status: 409, message: 'Sessiya o‘zgardi. Yangi akkauntda bronlarni tekshiring.' });
          return;
        }
        const bookingsPaused = error.status === 409 && error.code === 'bookings_paused';
        const priceChanged = error.status === 409 && error.code === 'price_changed';
        const policyChanged = error.status === 409 && error.code === 'cancellation_policy_changed';
        const durationChanged = error.status === 409 && error.code === 'duration_changed';
        const recoveryRequired = bookingNeedsRecovery(error);
        setSubmissionError({ status: error.status, code: error.code, message: error.code === 'booking_confirmation_unverified'
          ? 'Serverning bron javobi mos kelmadi. Bron yaratilgan bo‘lishi mumkin. Qayta yuborishdan oldin «Bronlarim»ni tekshiring.'
          : error.status === 0
          ? 'Internet uzildi. Bron yaratilgan bo‘lishi mumkin. Avval «Bronlarim»ni tekshiring yoki ayni vaqtni qayta tasdiqlang.'
          : recoveryRequired
          ? (error.code === 'booking_result_unknown'
            ? bookingRecoveryMessage(error)
            : error.code === 'booking_in_progress'
            ? 'Oldingi bron so‘rovi davom etmoqda. Ikkinchi bron yuborilmadi.'
            : error.code === 'booking_recovery_owner_unknown'
            ? 'Eski bron so‘rovining akkaunti noma’lum. Avval «Bronlarim»ni tekshiring.'
            : 'Oldingi bron so‘rovining natijasi noma’lum. Yangi vaqt tanlashdan avval pastdagi tiklash bo‘limidan tekshiring.')
          : bookingsPaused
          ? 'Sartarosh hozircha yangi bronlarni qabul qilmayapti.'
          : priceChanged
          ? 'Xizmat narxi o‘zgardi. Yangilangan narxni ko‘rib, qayta tasdiqlang.'
          : policyChanged
          ? 'Bekor qilish qoidasi o‘zgardi. Qoidalarni yangilab qayta tasdiqlang.'
          : durationChanged
          ? 'Xizmat davomiyligi o‘zgardi. Bo‘sh vaqtlarni yangilab, qayta tasdiqlang.'
          : error.code === 'service_unavailable'
          ? 'Tanlangan xizmat hozir mavjud emas. Xizmatlarni qayta tanlang.'
          : error.status === 409
            ? 'Bu vaqt endi band. Bo‘sh vaqtlar yangilanmoqda. Boshqa vaqtni tanlang.'
            : error.message || 'Buyurtma saqlanmadi. Qayta urinib ko‘ring.' });
        if (policyChanged) setPolicyAttempt(value => value + 1);
        if (error.status === 409 && !recoveryRequired) {
          setTime(''); setConfirmOpen(false); setAttempt((value) => value + 1);
        }
      }
    } finally {
      saving.current = false;
      if (!controller.signal.aborted) setBusy(false);
      if (submitController.current === controller) submitController.current = null;
    }
  }
  if (success) {
    const receipt = bookingReceiptView(success.data);
    const clock = (value) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tashkent', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(value);
    return <div className="ib-success" role="status">
      {receipt.active && <span className="ib-success-mark"><Icon name="check" size={28} /></span>}
      <h2>{receipt.title}</h2>
      <p>Bron #{receipt.id} · {statusInfo(success.data.status).label}</p>
      {!receipt.active && <p>Bu avvalgi bronning hozirgi holati. Yangi bron avtomatik yaratilmagan.</p>}
      <p>{profileName(barber)} · {receipt.serviceNames || service?.name}</p>
      <p>{formatDate(receipt.start)} · {clock(receipt.start)}–{clock(receipt.end)}</p>
      <p>{receipt.duration} daqiqa</p>
      {receipt.amount != null ? <p>Kelishilgan narx: {formatMoney(receipt.amount)}</p>
        : <p>Narx server javobida mavjud emas. Tafsilotlarni «Bronlarim»dan tekshiring.</p>}
      <Link className="ib-primary" to={siteLocalePath(`${bookingsPath}?booking=${receipt.id}`, lang)}>Bron tafsilotlari <ArrowIcon /></Link>
    </div>;
  }
  return <div className="ib-booking">
    <header className="ib-heading"><h2><Icon name="socialScissors" size={20} />{ui.services}</h2></header>
    {phoneInvite && <PhoneBookingInviteNoticeV185 token={phoneInvite} barberId={barber.id}
      serviceIds={details.services.map(service=>service.id)} lang={lang}
      onSelection={(picked)=>{
        setServiceIds([picked.serviceId]);setDate(picked.date);setTime(picked.time);
        setHour(picked.time.slice(0,2));setWeekIndex(Math.floor(Math.max(0,bookingDates().indexOf(picked.date))/7));
        setConfirmation(null);setConfirmOpen(false);setSubmissionError(null);
      }}/>}
    {draft && <p className="ib-note" role="status">{ui.draftRestored}</p>}
    {draftSaveState.kind !== 'none' && <div className="ib-note" role={draftSaveState.kind === 'failed' ? 'alert' : 'status'}>
      <p>{draftCopy[draftSaveState.kind]}</p>
      {(draftSaveState.kind === 'failed' || draftSaveState.kind === 'expired') &&
        <button type="button" className="ib-text" onClick={retryDraftSave}>{draftCopy.retry}</button>}
    </div>}
    {submitBooking.pending() && <div className="ib-note" role="status">
      <strong>{ui.unknownRequest}</strong>
      <p>Yana bron yaratishdan oldin natijasini tekshiring. Bu tekshiruv yangi bron yaratmaydi.</p>
      <button type="button" className="ib-text" disabled={busy} onClick={checkRecovery}>{ui.checkRequest}</button>
      <Link to={siteLocalePath(bookingsPath, lang)}>{ui.myBookings}</Link>
      {recoveryNote && <p role="status">{recoveryNote}</p>}
      {recoveryChecked && <button type="button" className="ib-text" disabled={busy} onClick={abandonRecovery}>Tekshirdim, yangi so‘rov boshlayman (ikki bron xavfi mavjud)</button>}
    </div>}
    {!submitBooking.pending() && recoveryNote && <p className="ib-note" role="status">{recoveryNote}</p>}
    {policyState.status === 'loading' ? <p className="ib-note" role="status">{ui.policyLoading}</p>
      : policyState.status === 'error' ? <div className="ib-note" role="alert"><p>Bekor qilish qoidalarini yuklab bo‘lmadi. {policyState.message}</p><button type="button" onClick={() => setPolicyAttempt(value => value + 1)}>{ui.retry}</button></div>
      : <p className="ib-note">Bekor qilish: {policyState.policy.cutoff_minutes === null ? 'muddati cheklanmagan' : `tashrifdan ${policyState.policy.cutoff_minutes} daqiqa oldin`}. {policyState.policy.text || ''} Onlayn to‘lov olinmaydi.</p>}
    {!getSession() && <p className="ib-note">{ui.guestNote}</p>}
    {params.has('services') && !canRebook && !serviceIds.length && <p className="ib-note" role="status">Oldingi bronning ayrim xizmatlari mavjud emas. Xizmatlarni qayta tanlang.</p>}
    <div className="ib-services" role="group" aria-label={ui.servicesGroup}>{details.services.map((item) => <button type="button" key={item.id} className="ib-service" aria-pressed={serviceIds.includes(item.id)} disabled={busy || (!serviceIds.includes(item.id) && serviceIds.length >= 20)}
      onClick={() => { setServiceIds(ids => ids.includes(item.id) ? ids.filter(id => id !== item.id) : [...ids, item.id]); setHour(''); setTime(''); setSubmissionError(null); }}>
      <span className="ib-check" aria-hidden="true">{serviceIds.includes(item.id) && <Icon name="check" size={16} />}</span>
      <span className="ib-service-name"><strong>{item.name}</strong><small><Icon name="clock" size={13} />{item.duration_minutes} {ui.minutes}</small></span>
      <strong className="ib-price">{formatMoney(item.price)}</strong>
    </button>)}</div>
    {serviceIds.length >= 20 && <p className="ib-note" role="status">{ui.selectLimit}</p>}
    {!details.services.length && <p className="ib-note">{ui.emptyServices}</p>}
    {service && <>
      <p className="ib-total">{services.length} {ui.servicesGroup} · {duration} {ui.minutes} <strong>{formatMoney(totalPrice)}</strong></p>
      <section className="ib-week-explorer" aria-labelledby="ib-week-title" aria-busy={!week?.complete}>
        <div className="ib-section-label"><h3 id="ib-week-title"><Icon name="socialCalendar" size={18}/>{ui.weekTitle}</h3><span>{ui.serverChecked}</span></div>
        <div className="ib-week-switch" role="group" aria-label={ui.selectWeek}>
          {[0, 1].map(index => <button key={index} type="button" aria-pressed={weekIndex === index} disabled={busy}
            onClick={() => switchWeek(index)}>{index === 0 ? ui.week1 : ui.week2}</button>)}
          <button type="button" className="ib-week-refresh" disabled={busy} onClick={refreshWeekAndSelectedDay}>{ui.refreshWeek}</button>
        </div>
        {nextFreeDay && <button type="button" className="ib-week-next" disabled={busy}
          onClick={() => selectDay(nextFreeDay)}>{ui.freeDay} {formatDate(nextFreeDay)} — {ui.viewDay}</button>}
        <div className="ib-week-days" role="group" aria-label={ui.checkedDays}>
          {weekEntries.map(day => <button type="button" key={day.date} aria-pressed={date === day.date} disabled={busy}
            className={`ib-week-day is-${day.status}`}
            onClick={() => selectDay(day.date)}>
            <strong>{formatDate(day.date)}</strong>
            <span>{day.status === 'loading' ? ui.checking
              : day.status === 'error' ? ui.checkFailed
              : day.status === 'closed' ? ui.dayOff
              : day.status === 'paused' ? ui.paused
              : day.status === 'empty' ? ui.noTimes
              : `${day.count} ${ui.freeTimes} · ${ui.from} ${day.first}`}</span>
          </button>)}
        </div>
        <p className="ib-week-disclaimer">{ui.weekDisclaimer}</p>
        {week?.complete && week.days.some(day => day.status === 'error') &&
          <div className="ib-note" role="status"><p>{ui.someFailed}</p>
            <button type="button" className="ib-text" disabled={busy} onClick={retryFailedWeekDays}>{ui.retryFailed}</button>
          </div>}
      </section>
      <section className="ib-date-section" aria-labelledby="ib-date-title"><div className="ib-section-label"><h3 id="ib-date-title"><Icon name="socialCalendar" size={18} />{ui.day}</h3><span>{ui.tashkentTime}</span></div>
        <div className="ib-dates" role="group" aria-label={ui.next14}>{dates.map((day) => <button type="button" key={day} aria-pressed={date === day} disabled={busy}
          aria-label={formatDate(day)} onClick={() => { setWeekRetry(null); setWeekIndex(Math.floor(Math.max(0, dates.indexOf(day)) / 7)); selectDay(day); }}>
          <span>{day === tashkentDate() ? ui.today : WEEKDAYS[new Date(bookingTimestamp(day, '12:00')).getUTCDay()]}</span><strong>{day.slice(8)}</strong><small>{day.slice(5, 7)}-oy</small>
        </button>)}</div>
      </section>
      <section className="ib-times-section" aria-labelledby="ib-time-title" aria-busy={current.status === 'loading'}>
        <div className="ib-section-label"><h3 id="ib-time-title"><Icon name="clock" size={18} />{ui.times}</h3><span>{duration} {ui.minutes}</span></div>
        {current.status === 'loading' ? <p className="ib-note" role="status">{ui.timesLoading}</p>
          : current.status === 'error' ? <div role="alert"><p className="ib-error">{current.error.message || 'Bo‘sh vaqtlarni yuklab bo‘lmadi.'}</p>
            <button type="button" className="ib-text" disabled={busy} onClick={refreshSlots}>{ui.retry}</button></div>
            : slots.length ? <>
              <div className="ib-hours" role="group" aria-label={ui.timeRange}>{[...new Set(slots.map(slot => slot.time.slice(0, 2)))].map(value => <button type="button" key={value} aria-pressed={hour === value} className={slots.some(slot => slot.time.startsWith(value + ':') && slot.available) ? '' : 'is-busy'} disabled={busy} onClick={() => { setHour(value); setTime(''); }}>{value}:00–{String(Number(value) + 1).padStart(2, '0')}:00</button>)}</div>
              {hour && <div className="ib-slots" role="group" aria-label={ui.dayTimes}>{slots.filter(slot => slot.time.startsWith(hour + ':')).map((slot) => <button type="button" key={slot.time}
              aria-pressed={time === slot.time} disabled={busy || !slot.available} title={`${slot.time}–${slot.endTime}${slot.available ? '' : ' · Band'}`} onClick={() => { setTime(slot.time); setSubmissionError(null); }}>{slot.time}</button>)}</div>}
              </>
              : <p className="ib-no-slots" role="status">{current.data.accepting_bookings === false
                ? 'Sartarosh hozircha yangi bronlarni qabul qilmayapti.'
                : current.data.working
                  ? 'Bu kunda tanlangan xizmat uchun bo‘sh vaqt yo‘q. Boshqa kunni tanlang.'
                  : 'Bu kunda sartarosh ishlamaydi. Boshqa kunni tanlang.'}</p>}
      </section>
      {selected && <p className="ib-selection">{ui.selected} {formatDate(date)} · {selected.time}–{selected.endTime}</p>}
      {submissionError && !(current.status === 'ready' && current.data.accepting_bookings === false)
        && <div role="alert"><p className="ib-error">{submissionError.message}</p>
        {submissionError.status === 409 && <button type="button" className="ib-text" disabled={busy} onClick={refreshSlots}>{ui.refreshTimes}</button>}
      </div>}
      <button type="button" className="ib-primary" disabled={busy || !selected || policyState.status !== 'ready'} onClick={openConfirmation}>{ui.proceed} <ArrowIcon /></button>
    </>}
    <Sheet open={confirmOpen} title={ui.confirmTitle} onClose={() => { if (!saving.current) { setConfirmOpen(false); setConfirmation(null); } }}>
      <div className="ib-confirm"><h3>{profileName(barber)}</h3><p>{confirmation?.serviceName}</p>
        <dl><div><dt>{ui.date}</dt><dd>{confirmation?.date && formatDate(confirmation.date)}</dd></div><div><dt>{ui.time}</dt><dd>{confirmation?.time}–{confirmation?.endTime}</dd></div>
          <div><dt>{ui.duration}</dt><dd>{confirmation?.duration} daqiqa</dd></div><div><dt>{ui.totalPrice}</dt><dd>{confirmation && formatMoney(confirmation.price)}</dd></div>
          <div><dt>{ui.cancellation}</dt><dd>{confirmation ? (confirmation.policyCutoff === null ? ui.noLimit : `${confirmation.policyCutoff} daqiqa oldin`) : ui.loading}</dd></div></dl>
        {!confirmationValid && <div role="alert"><p className="ib-error">{ui.confirmHint}</p>
          <button type="button" className="ib-text" disabled={busy} onClick={() => { setConfirmOpen(false); setConfirmation(null); refreshSlots(); }}>{ui.refreshTimes}</button></div>}
        {submissionError && <p className="ib-error" role="alert">{submissionError.message}</p>}
        <button type="button" className="ib-primary" disabled={busy || !confirmationValid} onClick={confirm}>{busy ? ui.saving : getSession()?.role === 'customer' ? ui.confirm : ui.loginContinue}</button>
      </div>
    </Sheet>
  </div>;
}

export default InlineBooking;
