import {useEffect,useState} from 'react';
import {Link,useLocation} from 'react-router-dom';
import {request} from '../../api/client.js';
import {readSiteLocale,siteLocalePath} from '../../utils/siteLocale.js';
import {shopPublicIdV172,shopTextV172} from './shopLocaleV172.js';
export default function PublishedShopLinkV172({barberId}){
 const location=useLocation();const lang=readSiteLocale(location.search);const ui=shopTextV172(lang);
 const [shop,setShop]=useState(null);
 useEffect(()=>{setShop(null);if(!shopPublicIdV172(barberId))return;
  const ac=new AbortController();request('GET',`/api/shops/by-barber/${barberId}`,{signal:ac.signal})
   .then(value=>{if(!ac.signal.aborted&&value?.ownerBarberId===barberId)setShop(value);}).catch(()=>{});
  return ()=>ac.abort();},[barberId]);
 return shop?<p><Link to={siteLocalePath(`/shops/${shop.id}`,lang)}>{ui.link}: {shop.name}</Link></p>:null;
}
