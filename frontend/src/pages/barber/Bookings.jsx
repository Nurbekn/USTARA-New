import { useLocation } from "react-router-dom";
import { readSiteLocale } from "../../utils/siteLocale.js";
import { barberInsightsText, barberInsightsDate } from "./barberInsightsLocaleV147.js";
import { useState } from "react";
import BookingCard from "./components/BookingCard";
import TodaySmartBookingOffersV158 from "./components/TodaySmartBookingOffersV158.jsx";
import BookingDayTimelineV160 from "./components/BookingDayTimelineV160.jsx";
import PhoneBookingInvitesV185 from "./components/PhoneBookingInvitesV185.jsx";
import BookingInboxFiltersV176 from "./components/BookingInboxFiltersV176.jsx";
import {filterBookingInboxV176,INBOX_SEARCH_LIMIT_V176} from "./data/bookingInboxV176.js";
import {bookingInboxLocaleV176} from "./bookingInboxLocaleV176.js";
import {refreshBarberData} from "./data/store";
import PageHeader from "./components/PageHeader";
import { STATUS, useBarber } from "./data/store";
import { dateLabel } from "./data/format";

const PAGE_SIZE = 30;
const HISTORY = [STATUS.COMPLETED, STATUS.CANCELLED, STATUS.REJECTED];

// Groups an already sorted list by date: [["2026-10-31", [..]], ...]
function groupByDate(list) {
  const groups = [];
  for (const booking of list) {
    const last = groups[groups.length - 1];
    if (last && last[0] === booking.date) last[1].push(booking);
    else groups.push([booking.date, [booking]]);
  }
  return groups;
}

export default function Bookings() {
  const lang=readSiteLocale(useLocation().search);
  const tr=barberInsightsText(lang);
  const { bookings, status, error, profile } = useBarber();
  const [tab, setTab] = useState(null); // null = pick a smart default
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [query, setQuery] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const filters = bookingInboxLocaleV176(lang);

  const byTime = (a, b) => (a.date + a.time).localeCompare(b.date + b.time);
  const lists = {
    pending: bookings.filter((b) => b.status === STATUS.PENDING).sort(byTime),
    confirmed: bookings
      .filter((b) => b.status === STATUS.CONFIRMED)
      .sort(byTime),
    history: bookings
      .filter((b) => HISTORY.includes(b.status))
      .sort((a, b) => byTime(b, a)),
  };

  // Open on "Kutilmoqda" if there is something to answer
  const active = tab ?? (lists.pending.length ? "pending" : "confirmed");
  const list = filterBookingInboxV176(lists[active],{query,date:selectedDate});
  const shown = active === "history" ? list.slice(0, visible) : list;

  const tabs = [
    { id: "pending", label: tr("Kutilmoqda") },
    { id: "confirmed", label: tr("Tasdiqlangan") },
    { id: "history", label: tr("Tarix") },
  ];

  return (
    <div className="bx-page">
      <PageHeader title={tr("Bronlar")} subtitle={tr("Mijozlar so'rovlari va tarix")} />

      {status === "loading" && <p role="status">{tr("Bronlar serverdan yuklanmoqda…")}</p>}
      {status === "error" && <p className="bx-error" role="alert">{error || tr("Bronlarni yuklab bo‘lmadi.")}</p>}

      <PhoneBookingInvitesV185 lang={lang} services={profile.services} barberId={profile.id} />
      <TodaySmartBookingOffersV158 lang={lang} />
      <BookingDayTimelineV160 bookings={bookings} status={status} lang={lang} />

      <BookingInboxFiltersV176 lang={lang} query={query} date={selectedDate} count={list.length}
        disabled={status !== "ready"}
        onQuery={(value) => {setQuery(value.slice(0,INBOX_SEARCH_LIMIT_V176));setVisible(PAGE_SIZE);}}
        onDate={(value) => {setSelectedDate(value);setVisible(PAGE_SIZE);}}
        onReset={() => {setQuery("");setSelectedDate("");setVisible(PAGE_SIZE);}}
        onRefresh={() => {void refreshBarberData();}} />

      <div className="bx-seg" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active === t.id}
            className={active === t.id ? "is-active" : ""}
            onClick={() => {
              setTab(t.id);
              setVisible(PAGE_SIZE);
            }}
          >
            {t.label}
            {t.id !== "history" && lists[t.id].length > 0 && (
              <em>{lists[t.id].length}</em>
            )}
          </button>
        ))}
      </div>

      {status === "ready" && shown.length === 0 ? (
        <div className="bx-empty">
          <strong>{query || selectedDate ? filters.noMatch : tr("Bu yerda hozircha hech narsa yo'q")}</strong>
          {!query && !selectedDate && <p>{tr("Yangi bronlar paydo bo'lganda Telegram orqali ham xabar olasiz.")}</p>}
        </div>
      ) : status === "ready" ? (
        groupByDate(shown).map(([date, items]) => (
          <section key={date}>
            <h3 className="bx-day">{barberInsightsDate(date,lang) ?? dateLabel(date)}</h3>
            <div className="bx-list">
              {items.map((b) => (
                <BookingCard key={b.id} booking={b} />
              ))}
            </div>
          </section>
        ))
      ) : null}

      {active === "history" && list.length > visible && (
        <button
          type="button"
          className="bx-btn bx-btn-ghost bx-btn-block"
          onClick={() => setVisible(visible + PAGE_SIZE)}
        >
          {tr("Ko'proq ko'rsatish ({count})",{count:list.length-visible})}
        </button>
      )}
    </div>
  );
}
