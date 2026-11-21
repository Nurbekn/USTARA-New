import { useLocation } from "react-router-dom";
import { readSiteLocale } from "../../../utils/siteLocale.js";
import { barberOpsText, barberOpsWeekdays } from "../barberOpsLocaleV146.js";
import {useEffect,useState} from 'react';
import {request} from '../../../api/client.js';
import {getSession} from '../../auth/utils/session.js';
import {toISODate} from '../data/store.js';
import {weekDays,validateBreakRanges,intervalsForWeek,intervalsForDate} from '../data/breakRules.js';

const empty={weekly:[],dated:[]};
function BreakRows({value,onChange,disabled,tr}){
  return <div style={{display:'grid',gap:9}}>
    {value.map((range,index)=><div key={index} style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
      <label>{tr("Boshlanishi")} <input type="time" step="300" value={range.start} disabled={disabled}
        onChange={e=>onChange(value.map((x,i)=>i===index?{...x,start:e.target.value}:x))}/></label>
      <label>{tr("Tugashi")} <input type="time" step="300" value={range.end} disabled={disabled}
        onChange={e=>onChange(value.map((x,i)=>i===index?{...x,end:e.target.value}:x))}/></label>
      <button type="button" className="bx-btn" disabled={disabled}
        onClick={()=>onChange(value.filter((_,i)=>i!==index))}>{tr("Olib tashlash")}</button>
    </div>)}
    <button type="button" className="bx-btn" disabled={disabled||value.length>=8}
      onClick={()=>onChange([...value,{start:'13:00',end:'14:00'}])}>{tr("+ Tanaffus qo‘shish")}</button>
  </div>;
}
export default function RecurringBreaksEditor({enabled}){
  const lang = readSiteLocale(useLocation().search);
  const tr = barberOpsText(lang);
  const displayDays = barberOpsWeekdays(lang);
  const [data,setData]=useState(empty),[status,setStatus]=useState('loading');
  const [error,setError]=useState(''),[notice,setNotice]=useState('');
  const [weekday,setWeekday]=useState(1),[date,setDate]=useState(()=>toISODate());
  const [weeklyDraft,setWeeklyDraft]=useState([]),[dateDraft,setDateDraft]=useState([]);
  async function reload(signal,week=weekday,localDate=date){
    const token=getSession()?.token;
    if(!token)throw Error('Sartarosh sessiyasi kerak.');
    const result=await request('GET','/api/barbers/break-rules',{token,signal});
    if(!result||!Array.isArray(result.weekly)||!Array.isArray(result.dated))throw Error(tr("Noto‘g‘ri javob."));
    setData(result);setWeeklyDraft(intervalsForWeek(result.weekly,week));
    setDateDraft(intervalsForDate(result.dated,localDate));
  }
  useEffect(()=>{
    if(!enabled)return;
    const controller=new AbortController();setStatus('loading');
    reload(controller.signal,1,toISODate()).then(()=>{if(!controller.signal.aborted)setStatus('ready');})
      .catch(e=>{if(!controller.signal.aborted){setStatus('error');setError(e.message||'Yuklanmadi.');}});
    return ()=>controller.abort();
  },[enabled]);
  async function save(event,kind){
    event.preventDefault();setError('');setNotice('');
    try{
      const breaks=validateBreakRanges(kind==='weekly'?weeklyDraft:dateDraft);
      const token=getSession()?.token;
      if(!token)throw Error('Qayta kiring.');
      setStatus('saving');
      await request('PUT',`/api/barbers/break-rules/${kind}`,{
        token,body:kind==='weekly'?{day_of_week:weekday,breaks}:{date,breaks},
      });
      await reload(undefined,weekday,date);
      setNotice(tr("Tanaffuslar saqlandi. Tasdiqlangan bronlar o‘zgarmadi."));
    }catch(e){setError(e.message||tr("Tanaffuslar saqlanmadi."));}
    finally{setStatus('ready');}
  }
  const disabled=status!=='ready';
  return <section className="bx-card" aria-label={tr("Takrorlanuvchi tanaffuslar")}>
    <h2>{tr("Takrorlanuvchi va qo‘shimcha tanaffuslar")}</h2>
    <p className="bx-muted">{tr("Har bir hafta kuni yoki aniq sana uchun 8 tagacha tanaffus. Bir kunda bir nechta tanaffus bo‘lishi mumkin. Mavjud bronlarga zid o‘zgarish rad etiladi. Bo‘sh qoldirib saqlash shu kunga tegishli tanaffuslarni o‘chiradi.")}</p>
    {status==='loading'?<p role="status">{tr("Tanaffuslar yuklanmoqda…")}</p>:<>
      <form onSubmit={e=>void save(e,'weekly')} style={{display:'grid',gap:10,marginTop:12}}>
        <h3>{tr("Har hafta takrorlanadi")}</h3>
        <label>{tr("Hafta kuni")} <select value={weekday} disabled={disabled} onChange={e=>{
          const d=Number(e.target.value);setWeekday(d);setWeeklyDraft(intervalsForWeek(data.weekly,d));
        }}>{weekDays.map((name,i)=><option key={i} value={i}>{displayDays[i]}</option>)}</select></label>
        <BreakRows value={weeklyDraft} onChange={setWeeklyDraft} disabled={disabled} tr={tr}/>
        <button type="submit" className="bx-btn bx-btn-primary" disabled={disabled}>{tr("Haftalik tanaffuslarni saqlash")}</button>
      </form>
      <form onSubmit={e=>void save(e,'dated')} style={{display:'grid',gap:10,marginTop:20}}>
        <h3>{tr("Ma’lum sana uchun qo‘shimcha tanaffuslar")}</h3>
        <label>{tr("Sana")} <input type="date" min={toISODate()} value={date} disabled={disabled} onChange={e=>{
          setDate(e.target.value);setDateDraft(intervalsForDate(data.dated,e.target.value));
        }}/></label>
        <BreakRows value={dateDraft} onChange={setDateDraft} disabled={disabled} tr={tr}/>
        <button type="submit" className="bx-btn bx-btn-primary" disabled={disabled}>{tr("Sanali tanaffuslarni saqlash")}</button>
      </form>
      {data.weekly.length>0&&<p className="bx-muted" style={{marginTop:12}}>{tr("Haftalik saqlangan tanaffuslar:")} {data.weekly.map(x=>`${displayDays[x.day_of_week]} ${x.start}–${x.end}`).join(' · ')}</p>}
    </>}
    {!!error&&<p role="alert" className="bx-error">{error}</p>}
    {!!notice&&<p role="status">{notice}</p>}
  </section>;
}
