import { useLocation } from "react-router-dom";
import { readSiteLocale } from "../../../utils/siteLocale.js";
import { barberOpsText } from "../barberOpsLocaleV146.js";
import {useEffect,useState} from 'react';
import {request} from '../../../api/client.js';
import {getSession} from '../../auth/utils/session.js';
import {toISODate} from '../data/store.js';
import {calendarDates,validateCalendarHours} from '../data/calendarExceptions.js';

export default function CalendarExceptionsEditor({enabled}){
  const lang = readSiteLocale(useLocation().search);
  const tr = barberOpsText(lang);
  const [items,setItems]=useState([]),[status,setStatus]=useState('loading');
  const [error,setError]=useState(''),[message,setMessage]=useState('');
  const [mode,setMode]=useState('closed'),[day,setDay]=useState(()=>toISODate());
  const [vacationEnd,setVacationEnd]=useState(()=>toISODate());
  const [start,setStart]=useState('09:00'),[end,setEnd]=useState('18:00');
  const [breakEnabled,setBreakEnabled]=useState(false);
  const [breakStart,setBreakStart]=useState('13:00'),[breakEnd,setBreakEnd]=useState('14:00');
  async function reload(signal){
    const session=getSession();if(session?.role!=='barber'||!session.token)throw Error('Sartarosh sessiyasi kerak.');
    const result=await request('GET','/api/barbers/calendar-exceptions',{token:session.token,signal});
    if(!Array.isArray(result))throw Error(tr("Kalendar ma’lumotlari noto‘g‘ri."));
    setItems(result);
  }
  useEffect(()=>{
    if(!enabled)return;
    const controller=new AbortController();setStatus('loading');
    reload(controller.signal).then(()=>{if(!controller.signal.aborted)setStatus('ready');})
      .catch(e=>{if(!controller.signal.aborted){setStatus('error');setError(e.message||tr("Kalendar yuklanmadi."));}});
    return ()=>controller.abort();
  },[enabled]);
  async function save(event){
    event.preventDefault();setError('');setMessage('');
    try{
      const dates=calendarDates(day,mode==='vacation'?vacationEnd:day);
      const hours=mode==='hours'?validateCalendarHours({start,end,breakEnabled,breakStart,breakEnd}):{is_closed:true};
      const session=getSession();if(!session?.token)throw Error('Qayta kiring.');
      setStatus('saving');
      await request('PUT','/api/barbers/calendar-exceptions',{
        token:session.token,body:{dates:dates.map(date=>({date,...hours}))},
      });
      await reload();setMessage(tr("{count} kun saqlandi.",{count:dates.length}));
    }catch(e){setError(e.message||tr("Kalendar saqlanmadi."));}
    finally{setStatus('ready');}
  }
  async function remove(date){
    setError('');setMessage('');setStatus('saving');
    try{
      const session=getSession();if(!session?.token)throw Error('Qayta kiring.');
      await request('DELETE',`/api/barbers/calendar-exceptions/${date}`,{token:session.token});
      await reload();setMessage(tr("{date} uchun istisno olib tashlandi.",{date}));
    }catch(e){setError(e.message||tr("O‘chirib bo‘lmadi."));}
    finally{setStatus('ready');}
  }
  return <section className="bx-card" aria-label={tr("Ta’til va tanaffuslar")}>
    <h2>{tr("Ta’til, maxsus ish kuni va tanaffus")}</h2>
    <p className="bx-muted">{tr("Bir martalik sana sozlamalari haftalik jadvaldan ustun turadi. Mavjud tasdiqlangan bronga zid o‘zgarish saqlanmaydi. Hech qanday bron avtomatik bekor qilinmaydi.")}</p>
    {status==='loading'?<p role="status">{tr("Kalendar yuklanmoqda…")}</p>:<form onSubmit={save} style={{display:'grid',gap:10,marginTop:12}}>
      <label htmlFor="calendar-mode">{tr("Kun turi")}</label>
      <select id="calendar-mode" value={mode} disabled={status!=='ready'} onChange={e=>setMode(e.target.value)}>
        <option value="closed">{tr("Bir kun dam olish")}</option>
        <option value="vacation">{tr("Ta’til (ketma-ket kunlar)")}</option>
        <option value="hours">{tr("Maxsus ish vaqti / tanaffus")}</option>
      </select>
      <label htmlFor="calendar-date">{mode==='vacation'?tr("Ta’til boshlanishi"):tr("Sana")}</label>
      <input id="calendar-date" type="date" value={day} min={toISODate()} required disabled={status!=='ready'} onChange={e=>setDay(e.target.value)}/>
      {mode==='vacation'&&<><label htmlFor="calendar-end">{tr("Ta’til tugashi (90 kungacha)")}</label>
        <input id="calendar-end" type="date" value={vacationEnd} min={day} required disabled={status!=='ready'} onChange={e=>setVacationEnd(e.target.value)}/></>}
      {mode==='hours'&&<>
        <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
          <label>{tr("Ish boshlanishi")} <input type="time" step="300" value={start} disabled={status!=='ready'} onChange={e=>setStart(e.target.value)}/></label>
          <label>{tr("Ish tugashi")} <input type="time" step="300" value={end} disabled={status!=='ready'} onChange={e=>setEnd(e.target.value)}/></label>
        </div>
        <label><input type="checkbox" checked={breakEnabled} disabled={status!=='ready'} onChange={e=>setBreakEnabled(e.target.checked)}/> {tr("Tanaffus qo‘shish")}</label>
        {breakEnabled&&<div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
          <label>{tr("Tanaffus boshi")} <input type="time" step="300" value={breakStart} disabled={status!=='ready'} onChange={e=>setBreakStart(e.target.value)}/></label>
          <label>{tr("Tanaffus oxiri")} <input type="time" step="300" value={breakEnd} disabled={status!=='ready'} onChange={e=>setBreakEnd(e.target.value)}/></label>
        </div>}
      </>}
      <button type="submit" className="bx-btn bx-btn-primary" disabled={status!=='ready'}>{status==='saving'?tr("Saqlanmoqda…"):tr("Kalendarni saqlash")}</button>
    </form>}
    {!!error&&<p role="alert" className="bx-error">{error}</p>}
    {!!message&&<p role="status">{message}</p>}
    {items.length>0&&<div style={{marginTop:18}}><h3>{tr("Maxsus kunlar")}</h3>
      <ul style={{listStyle:'none',padding:0,display:'grid',gap:10}}>
        {items.slice(0,80).map(x=><li key={x.date} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,flexWrap:'wrap'}}>
          <span><strong>{x.date}</strong> — {x.is_closed?tr("Dam olish / ta’til"):`${String(x.start_time).slice(0,5)}–${String(x.end_time).slice(0,5)}`}
            {!x.is_closed&&x.break_start?` · ${tr("Tanaffus")} ${String(x.break_start).slice(0,5)}–${String(x.break_end).slice(0,5)}`:''}</span>
          <button type="button" className="bx-btn" disabled={status!=='ready'} onClick={()=>void remove(x.date)}>{tr("Olib tashlash")}</button>
        </li>)}
      </ul>
      {items.length>80&&<p className="bx-muted">{tr("Yana {count} ta maxsus kun mavjud.",{count:items.length-80})}</p>}
    </div>}
  </section>;
}
