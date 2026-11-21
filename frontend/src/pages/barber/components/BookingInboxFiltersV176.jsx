import {bookingInboxLocaleV176} from '../bookingInboxLocaleV176.js';
import {INBOX_SEARCH_LIMIT_V176} from '../data/bookingInboxV176.js';
import {validTimelineDay} from '../data/bookingTimelineV160.js';
import './booking-inbox-v176.css';

// Presentation only. The existing BookingCard owns ALL booking mutations.
export default function BookingInboxFiltersV176({lang,query,date,count,onQuery,onDate,onReset,onRefresh,disabled}) {
 const t=bookingInboxLocaleV176(lang);
 return <section className="bx-card bx-inbox-v176" aria-label={t.title}>
  <div className="bx-inbox-v176-heading"><h2>{t.title}</h2>
   <button type="button" className="bx-btn bx-btn-ghost" disabled={disabled} onClick={onRefresh}>{t.refresh}</button></div>
  <div className="bx-inbox-v176-fields">
   <label>{t.search}<input type="search" maxLength={INBOX_SEARCH_LIMIT_V176} value={query}
     disabled={disabled} placeholder={t.search} onChange={e=>onQuery(e.target.value.slice(0,INBOX_SEARCH_LIMIT_V176))}/></label>
   <label>{t.date}<input type="date" min="2000-01-01" max="2100-12-31"
     disabled={disabled} value={date} onChange={e=>onDate(e.target.value===''||validTimelineDay(e.target.value)?e.target.value:date)}/></label>
   <button type="button" className="bx-btn bx-btn-ghost" disabled={disabled || (!query && !date)} onClick={onReset}>{t.reset}</button>
  </div>
  <p className="bx-muted" aria-live="polite">{t.count.replace('{count}',String(count))}</p>
  <p className="bx-muted bx-inbox-v176-scope">{t.scope}</p>
 </section>;
}
