import {useState} from 'react';
import {BADGE_TYPES,badgeAdminCopyV162,checkedAdminBadgePageV162} from './adminBadgeModelV162.js';
export default function AdminBadgePanelV162({data,lang,busy,onChange,onPage}){
 const [badgeType,setBadgeType]=useState('identity_checked');
 const copy=badgeAdminCopyV162(lang);
 if(!checkedAdminBadgePageV162(data))return <p role="alert">Badge ma’lumotlari yaroqsiz. Yangilang.</p>;
 return <section className="admin-tg" aria-label={copy.title}>
  <h2>{copy.title}</h2><p>{copy.description}</p>
  <label>{copy.title}: <select value={badgeType} onChange={e=>setBadgeType(e.target.value)}>
   {BADGE_TYPES.map((type,i)=><option value={type} key={type}>{copy.labels[i]}</option>)}
  </select></label>
  <div className="admin-table-wrap"><table><thead><tr><th>Sartarosh</th><th>Badge</th><th>Amal</th></tr></thead><tbody>
   {data.barbers.map(b=>{
    const current=b.badges.find(x=>x.type===badgeType);const active=current?.state==='active';
    return <tr key={b.id}><td>{b.first_name} {b.last_name} (#{b.id})</td>
      <td>{active?copy.active:current?copy.revoked:'—'}</td>
      <td><button type="button" disabled={busy} onClick={()=>onChange(b.id,badgeType,active?'revoke':'grant',current?.revision||0,copy.reason)}>
        {active?copy.revoke:copy.grant}</button></td></tr>;
   })}
  </tbody></table></div>
  <p>{copy.page}: {data.page} <button type="button" disabled={busy||data.page===1} onClick={()=>onPage(data.page-1)}>{copy.previous}</button>{' '}
   <button type="button" disabled={busy||!data.hasNext||data.page===100} onClick={()=>onPage(data.page+1)}>{copy.next}</button></p>
 </section>;
}
