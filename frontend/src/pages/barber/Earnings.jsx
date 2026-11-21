import { useLocation } from "react-router-dom";
import { readSiteLocale } from "../../utils/siteLocale.js";
import { barberInsightsText } from "./barberInsightsLocaleV147.js";
import { useEffect, useState } from 'react';
import PageHeader from './components/PageHeader';
import { request } from '../../api/client';
import { getSession } from '../auth/utils/session';
import { formatMoney } from './data/format';
import { earningsSeries } from './data/earnings';
export default function Earnings() {
  const lang=readSiteLocale(useLocation().search);
  const tr=barberInsightsText(lang);
  const [state, setState] = useState({ status: 'loading', rows: [] });
  const [days, setDays] = useState(7);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    request('GET', '/api/barbers/earnings', { token: getSession()?.token, signal: controller.signal }).then(data => {
      if (!Array.isArray(data?.rows) || data.estimateOnly !== true || data.paymentVerified !== false) throw Error(tr('Hisobot noto‘g‘ri qaytdi.'));
      if (!controller.signal.aborted) setState({ status: 'ready', rows: data.rows, now: data.serverNow, basis: data.basis });
    }).catch(e => { if (!controller.signal.aborted) setState({ status: 'error', rows: [], error: e.message }); });
    return () => controller.abort();
  }, [attempt]);
  const series = earningsSeries(state.rows, days, state.now ? new Date(state.now) : new Date());
  const total = series.reduce((n, day) => n + day.amount, 0), count = series.reduce((n, day) => n + day.count, 0);
  const max = Math.max(...series.map(day => day.amount), 1);
  const services = Object.entries(state.rows.filter(row => row.day >= series[0].date).reduce((all, row) => ({ ...all, [row.service]: (all[row.service] || 0) + Number(row.amount) }), {})).sort((a,b) => b[1] - a[1]);
  return <div className="bx-page bx-earnings"><PageHeader back title={tr("Daromad")} subtitle={tr("Yakunlangan xizmatlar hisoboti")}/>
    {state.status === 'loading' ? <p role="status">{tr("Hisobot yuklanmoqda…")}</p> : state.status === 'error' ? <div role="alert" className="bx-error"><p>{state.error}</p><button className="bx-btn" onClick={() => setAttempt(n => n + 1)}>{tr("Qayta urinish")}</button></div> : <>
      <div className="bx-earn-period" role="group" aria-label={tr("Hisobot davri")}>{[7,30].map(value => <button key={value} type="button" className="bx-chip" aria-pressed={days === value} onClick={() => setDays(value)}>{tr('Oxirgi {count} kun',{count:value})}</button>)}</div>
      <section className="bx-card bx-earn-total"><span>{tr("Hisoblangan daromad")} {tr('(taxminiy)')}</span><strong>{formatMoney(total)}</strong><p className="bx-muted">{tr('Bu faqat xizmat narxlari asosidagi taxmin. To‘lov qabul qilingani tasdiqlanmagan.')}</p><p className="bx-muted">{state.basis === 'booking_snapshot' ? tr('Bron vaqtida saqlangan narx bo‘yicha') : state.basis === 'mixed_snapshot_and_current_price' ? tr('Eski bronlar joriy xizmat narxida hisoblangan') : tr('Joriy xizmat narxi bo‘yicha')}</p><div><span>{tr('{count} ta yakunlangan bron',{count})}</span><span>{tr('O‘rtacha: {price}',{price:formatMoney(count ? total / count : 0)})}</span></div></section>
      <section className="bx-card"><h2>{tr("Kunlik daromad")}</h2><div className="bx-income-bars" role="img" aria-label={tr('{count} kunlik daromad: {price}',{count:days,price:formatMoney(total)})}>
        {series.map((day, index) => <div className="bx-income-day" key={day.date} title={`${day.date}: ${formatMoney(day.amount)}`}><span className="bx-income-track"><i style={{ height: `${Math.max(2, day.amount / max * 100)}%`, opacity: day.amount ? 1 : .18 }}/></span><small>{days === 7 || index % 5 === 0 || index === series.length - 1 ? Number(day.date.slice(-2)) : "\u00a0"}</small></div>)}
      </div>{total === 0 && <p className="bx-muted">{tr("Hali yakunlangan pullik xizmat yo‘q. Daromadingiz shu yerda ko‘rinadi.")}</p>}</section>
      <section className="bx-card"><h2>{tr("Xizmatlar bo‘yicha")}</h2><div className="bx-income-breakdown"><div className="bx-income-ring" style={{ '--share': `${total ? (services[0]?.[1] || 0) / total * 100 : 0}%` }}><div><strong>{count}</strong><small>{tr("bron")}</small></div></div><div className="bx-income-legend">{services.length ? services.map(([name,amount]) => <div key={name}><span>{name}</span><strong>{formatMoney(amount)}</strong></div>) : <div><span>{tr("Yakunlangan xizmatlar")}</span><strong>{formatMoney(0)}</strong></div>}</div></div></section>
    </>}
  </div>;
}
