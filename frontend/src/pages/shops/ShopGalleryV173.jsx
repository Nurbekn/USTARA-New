import {useEffect,useState} from 'react';
import {request,resolveMediaUrl} from '../../api/client.js';
import {getSession} from '../auth/utils/session.js';
import {shopGalleryTextV173,selectionV173,moveGalleryPostV173} from './shopGalleryLocaleV173.js';

// Gallery only selects existing image posts. No third-party URLs and no automatic retries on ambiguous writes.
export default function ShopGalleryV173({lang='uz',onSaved}){
 const ui=shopGalleryTextV173(lang);
 const [state,setState]=useState({status:'loading',data:null,error:''});
 const [selected,setSelected]=useState([]);
 const [reload,setReload]=useState(0);
 const [saving,setSaving]=useState(false);
 const [unknown,setUnknown]=useState(false);
 const [message,setMessage]=useState('');
 useEffect(()=>{
  const ac=new AbortController();setState({status:'loading',data:null,error:''});
  request('GET','/api/shops/mine/gallery',{token:getSession()?.token,signal:ac.signal})
   .then(data=>{if(!ac.signal.aborted){setState({status:'ready',data,error:''});setSelected(data.selected.map(i=>i.postId));setUnknown(false);setMessage('');}})
   .catch(e=>{if(!ac.signal.aborted)setState({status:'error',data:null,error:e.message});});
  return ()=>ac.abort();
 },[reload]);
 async function save(){
  if(state.status!=='ready'||saving||unknown)return;
  setSaving(true);setMessage('');
  try{
   await request('PUT','/api/shops/mine/gallery',{token:getSession()?.token,
    body:{postIds:selected,expectedRevision:state.data.revision}});
   setMessage(ui.saved);onSaved?.();
  }catch(e){
   if(e.code==='network_error'||e.code==='request_timeout'||e.status===0||e.status>=500||e.status===409){
    setUnknown(true);setMessage(ui.unknown);
   }else setMessage(e.message);
  }finally{setSaving(false);}
 }
 return <section className="shop-v173-gallery" aria-labelledby="shop-v173-title">
  <h2 id="shop-v173-title">{ui.title}</h2><p className="shop-v172-note">{ui.note}</p>
  {state.status==='loading'?<p role="status">{ui.loading}</p>:
   state.status==='error'?<div role="alert"><p>{state.error}</p><button type="button" onClick={()=>setReload(n=>n+1)}>{ui.refresh}</button></div>:
   <>
    <p aria-live="polite">{ui.selected}: {selected.length}/8</p>
    {state.data.available.length===0?<p>{ui.empty}</p>:<div className="shop-v173-gallery-grid">
     {state.data.available.map(item=><div className="shop-v173-gallery-card" key={item.postId}>
      <img src={resolveMediaUrl(item.mediaUrl)} alt={item.caption||ui.imageAlt} loading="lazy" decoding="async"/>
      <label><input type="checkbox" checked={selected.includes(item.postId)} disabled={saving||unknown||(!selected.includes(item.postId)&&selected.length>=8)}
       onChange={event=>setSelected(prev=>selectionV173(prev,item.postId,event.target.checked))}/><span>{item.caption||ui.imageAlt}</span></label>
      {selected.includes(item.postId)&&<div className="shop-v173-gallery-move">
       <button type="button" disabled={saving||unknown||selected[0]===item.postId} onClick={()=>setSelected(prev=>moveGalleryPostV173(prev,item.postId,-1))} aria-label={ui.up}>↑</button>
       <button type="button" disabled={saving||unknown||selected[selected.length-1]===item.postId} onClick={()=>setSelected(prev=>moveGalleryPostV173(prev,item.postId,1))} aria-label={ui.down}>↓</button>
      </div>}
     </div>)}
    </div>}
    <div className="shop-v172-actions"><button type="button" disabled={saving||unknown} onClick={save}>{saving?ui.saving:ui.save}</button>
     <button type="button" disabled={saving} onClick={()=>setReload(n=>n+1)}>{ui.refresh}</button></div>
    {message&&<p role="status">{message}</p>}
   </>}
 </section>;
}
