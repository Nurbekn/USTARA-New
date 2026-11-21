import {useEffect,useState} from 'react';
import {Link,useLocation} from 'react-router-dom';
import {request} from '../../api/client.js';
import {getSession} from '../auth/utils/session.js';
import {readSiteLocale,siteLocalePath} from '../../utils/siteLocale.js';
import {formFromShopV172,shopTextV172} from './shopLocaleV172.js';
import './shopV172.css';
import ShopGalleryV173 from './ShopGalleryV173.jsx';
export default function ShopEditV172(){
 const location=useLocation();const lang=readSiteLocale(location.search);const ui=shopTextV172(lang);
 const [result,setResult]=useState({status:'loading',shop:null,error:''});
 const [form,setForm]=useState(formFromShopV172(null));
 const [attempt,setAttempt]=useState(0);
 const [saving,setSaving]=useState(false);
 const [message,setMessage]=useState('');
 const [unknown,setUnknown]=useState(false);
 useEffect(()=>{
  const ac=new AbortController();
  setResult({status:'loading',shop:null,error:''});
  request('GET','/api/shops/mine',{token:getSession()?.token,signal:ac.signal}).then(data=>{
   if(!ac.signal.aborted){setResult({status:'ready',shop:data.shop,error:''});setForm(formFromShopV172(data.shop));setUnknown(false);setMessage('');}
  }).catch(error=>{if(!ac.signal.aborted)setResult({status:'error',shop:null,error:error.message});});
  return ()=>ac.abort();
 },[attempt]);
 const set=(key,value)=>setForm(f=>({...f,[key]:value}));
 async function save(e){
  e.preventDefault();if(result.status!=='ready'||saving||unknown)return;
  setSaving(true);setMessage('');
  try{
   const data=await request('PUT','/api/shops/mine',{token:getSession()?.token,body:form});
   setResult({status:'ready',shop:data.shop,error:''});setForm(formFromShopV172(data.shop));setMessage(ui.saved);
  }catch(error){
   if(error.code==='network_error'||error.code==='request_timeout'||error.status===0||error.status>=500){setUnknown(true);setMessage(ui.offline);}
   else if(error.status===409){setUnknown(true);setMessage(error.message);}
   else setMessage(error.message);
  }finally{setSaving(false);}
 }
 return <section className="shop-v172" aria-busy={result.status==='loading'}>
  <Link to={siteLocalePath('/barber/profile',lang)}>{ui.back}</Link><h1>{ui.edit}</h1>
  {result.status==='loading'?<p role="status">{ui.loading}</p>:result.status==='error'?<div role="alert"><p>{result.error}</p><button type="button" onClick={()=>setAttempt(x=>x+1)}>{ui.retry}</button></div>:
  <form className="shop-v172-form" onSubmit={save}>
   <p className="shop-v172-note">{ui.notice}</p>
   <label>{ui.name}<input required minLength={2} maxLength={120} value={form.name} onChange={e=>set('name',e.target.value)}/></label>
   <label>{ui.address}<input required minLength={5} maxLength={240} value={form.address} onChange={e=>set('address',e.target.value)}/></label>
   <label>{ui.description}<textarea maxLength={1200} rows={4} value={form.description} onChange={e=>set('description',e.target.value)}/></label>
   <label className="shop-v172-check"><input type="checkbox" checked={form.published} onChange={e=>set('published',e.target.checked)}/>{ui.publish}</label>
   <div className="shop-v172-actions"><button type="submit" disabled={saving||unknown}>{saving?ui.saving:ui.save}</button>
   {(unknown||result.shop)&&<button type="button" disabled={saving} onClick={()=>setAttempt(x=>x+1)}>{ui.retry}</button>}</div>
   {message&&<p role="status">{message}</p>}
   {result.shop?.published&&<Link to={siteLocalePath(`/shops/${result.shop.id}`,lang)}>{ui.link}</Link>}
  </form>}
  {result.status==='ready' && result.shop?.id && <ShopGalleryV173 lang={lang} onSaved={()=>setAttempt(x=>x+1)}/>}
 </section>;
}
