import {useEffect,useState} from 'react';
import {Link,useLocation,useParams} from 'react-router-dom';
import {request,resolveMediaUrl} from '../../api/client.js';
import {readSiteLocale,siteLocalePath} from '../../utils/siteLocale.js';
import {shopTextV172} from './shopLocaleV172.js';
import {shopGalleryTextV173} from './shopGalleryLocaleV173.js';
import './shopV172.css';
export default function ShopPublicV172(){
 const {id}=useParams();const location=useLocation();const lang=readSiteLocale(location.search);const ui=shopTextV172(lang);
 const galleryUi=shopGalleryTextV173(lang);
 const [data,setData]=useState({id:null,status:'loading',shop:null});const [attempt,setAttempt]=useState(0);
 useEffect(()=>{const ac=new AbortController();request('GET',`/api/shops/${encodeURIComponent(id)}`,{signal:ac.signal})
  .then(shop=>{if(!ac.signal.aborted)setData({id,status:'ready',shop});})
  .catch(error=>{if(!ac.signal.aborted)setData({id,status:error.status===404?'not_found':'error',shop:null});});
  return ()=>ac.abort();},[id,attempt]);
 const current=data.id===id?data:{status:'loading'};
 return <section className="shop-v172"><Link to={siteLocalePath('/explore',lang)}>{ui.back}</Link>
 {current.status==='loading'?<p role="status">{ui.loading}</p>:current.status!=='ready'?<div role="alert"><h1>{ui.missing}</h1><button type="button" onClick={()=>setAttempt(x=>x+1)}>{ui.retry}</button></div>:
 <article><h1>{current.shop.name}</h1><p className="shop-v172-note">{ui.notVerified}</p><h2>{ui.address}</h2><address>{current.shop.address}</address><p>{current.shop.description}</p>
 {current.shop.gallery?.length>0 && <section aria-label={galleryUi.title}><h2>{galleryUi.title}</h2><div className="shop-v173-gallery-grid">
  {current.shop.gallery.map(item=><figure className="shop-v173-gallery-card" key={item.postId}><img loading="lazy" decoding="async" src={resolveMediaUrl(item.mediaUrl)} alt={item.caption||galleryUi.imageAlt}/><figcaption>{item.caption && <span>{item.caption}</span>}{item.authorName && <small className="shop-v179-author">{galleryUi.author}: <Link to={siteLocalePath(`/barbers/${current.shop.ownerBarberId}`,lang)}>{item.authorName}</Link></small>}</figcaption></figure>)}
  </div></section>}
 <p>{ui.notice}</p><Link className="shop-v172-cta" to={siteLocalePath(`/barbers/${current.shop.ownerBarberId}`,lang)}>{ui.owner}</Link></article>}
 </section>;
}
