import {useEffect,useState} from 'react';
import {request} from '../../../api/client';
import {badgeLabelsV162,publicBadgesV162} from './badgeModelV162.js';
export default function BarberPublicBadgesV162({barberId,lang='uz'}){
 const [state,setState]=useState({barberId:null,items:[]});
 useEffect(()=>{
  const controller=new AbortController();
  setState({barberId,items:[]});
  request('GET',`/api/barbers/${barberId}/badges`,{signal:controller.signal})
   .then(data=>{if(!controller.signal.aborted)setState({barberId,items:publicBadgesV162(data,barberId)});})
   .catch(()=>{if(!controller.signal.aborted)setState({barberId,items:[]});});
  return ()=>controller.abort();
 },[barberId]);
 if(state.barberId!==barberId||state.items.length===0)return null;
 const labels=badgeLabelsV162(lang);
 return <ul className="bpv-evidence-badges" aria-label={({uz:'Admin tekshiruv belgilari',ru:'Проверки администратора',en:'Admin checks'})[lang]||'Admin tekshiruv belgilari'}>
  {state.items.map(type=><li key={type} title={labels[type]}>✓ {labels[type]}</li>)}
 </ul>;
}
