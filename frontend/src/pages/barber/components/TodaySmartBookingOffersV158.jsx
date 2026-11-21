import {useCallback,useEffect,useRef,useState} from 'react';
import {request} from '../../../api/client.js';
import {getSession,subscribeSession} from '../../auth/utils/session.js';
import {barberInsightsText} from '../barberInsightsLocaleV147.js';
import {parseTodaySmartBookingOffers,todayOfferClock,todayOfferDisplayStatus} from '../data/todaySmartBookingOffersV158.js';

const statusNames = Object.freeze({
  open:'Navbatdagi odam qidirilmoqda',offered:'Taklif yuborildi',
  accepted:'Mijoz bronni tasdiqlayapti',cancelled:'Bekor qilindi',
  closed:'Yopildi',confirmed:'Tasdiqlangan',
});

// Never combine a response with a later browser session: logout/account switch
// aborts the in-flight GET and invalidates its sequence before rendering.
export default function TodaySmartBookingOffersV158({lang='uz'}) {
  const tr=barberInsightsText(lang);
  const [view,setView]=useState({status:'loading',rows:[],error:''});
  const generation=useRef(0);
  const inFlight=useRef(null);
  const load=useCallback(async ({quiet=false}={}) => {
    const seq=++generation.current;
    inFlight.current?.abort();
    const session=getSession();
    if (session?.role!=='barber' || !session.token) {
      setView({status:'blocked',rows:[],error:''});return;
    }
    const controller=new AbortController();
    inFlight.current=controller;
    if (!quiet) setView({status:'loading',rows:[],error:''});
    try {
      const payload=await request('GET','/api/queue/offers/mine',{
        token:session.token,signal:controller.signal,
      });
      const rows=parseTodaySmartBookingOffers(payload);
      if (!rows) throw new Error('Takliflar javobi noto‘g‘ri.');
      if (generation.current===seq && getSession()?.token===session.token && !controller.signal.aborted)
        setView({status:'ready',rows,error:''});
    } catch(error) {
      if (generation.current===seq && getSession()?.token===session.token && !controller.signal.aborted)
        setView({status:'error',rows:[],error:error?.message || 'Takliflar yuklanmadi.'});
    }
  },[]);
  useEffect(() => {
    const unsubscribe=subscribeSession(()=>{void load();});
    const timer=setInterval(()=>{
      if (document.visibilityState==='visible') void load({quiet:true});
    },30000);
    return () => {
      unsubscribe();clearInterval(timer);generation.current+=1;inFlight.current?.abort();
    };
  },[load]);
  return <section className="bx-card" aria-label={tr('Bugungi bo‘shagan vaqt takliflari')} style={{display:'grid',gap:10}}>
    <div style={{display:'flex',gap:10,justifyContent:'space-between',alignItems:'center',flexWrap:'wrap'}}>
      <h2>{tr('Bugungi bo‘shagan vaqt takliflari')}</h2>
      <button type="button" className="bx-btn" onClick={()=>void load()}>{tr('Yangilash')}</button>
    </div>
    <p className="bx-muted">{tr('Qabul qilingan taklif hali bron emas. Bron faqat mijoz tasdiqlagach paydo bo‘ladi.')}</p>
    {view.status==='loading'&&<p role="status">{tr('Takliflar yuklanmoqda…')}</p>}
    {view.status==='blocked'&&<p role="status">{tr('Sartarosh sessiyasi kerak.')}</p>}
    {view.status==='error'&&<p role="alert" className="bx-error">{tr('Takliflarni yuklab bo‘lmadi.')} {view.error}</p>}
    {view.status==='ready'&& (view.rows.length===0
      ? <p className="bx-muted">{tr('Hozircha taklif yo‘q.')}</p>
      : <ul style={{display:'grid',gap:8}}>{view.rows.map(item => <li key={item.id}>
        <strong>{todayOfferClock(item.start_at,lang)}</strong> · {item.duration_minutes} {tr('daqiqa')} · {tr(statusNames[todayOfferDisplayStatus(item)])}
        {item.display_label && <> · {item.display_label}</>}
        {item.booking_id && <> · {tr('Bron #{id} tasdiqlandi',{id:item.booking_id})}</>}
        {item.state==='offered' && item.expires_at && <> · {tr('tugaydi ')}{todayOfferClock(item.expires_at,lang)}</>}
      </li>)}</ul>)}
  </section>;
}
