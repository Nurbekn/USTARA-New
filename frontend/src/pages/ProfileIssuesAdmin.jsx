import {Link} from 'react-router-dom';
import {PROFILE_REPORT_STATUSES,PROFILE_REPORT_MAX_PAGE} from './profileIssueQueueModel.js';
import {getAdminUi} from './adminLanguage.js';
export default function ProfileIssuesAdmin({records, busy, onReview, statusFilter='pending', page=1, hasNext=false, onFilterChange=()=>{}, onPageChange=()=>{}, lang='uz'}) {
  const ui=getAdminUi(lang).profile;
  return <section aria-label={ui.title} className="admin-profile-reports">
    <p>{ui.description}</p>
    <div className="admin-profile-report-controls">
      <label>{ui.filter}
        <select value={statusFilter} disabled={busy} onChange={event=>onFilterChange(event.target.value)}>
          {PROFILE_REPORT_STATUSES.map(([status,label])=><option key={status} value={status}>{ui.status[status]}</option>)}
        </select>
      </label>
      <span>{ui.pageHelp} {ui.page}: {page}</span>
      <div className="admin-actions">
        <button type="button" className="secondary" disabled={busy || page===1} onClick={()=>onPageChange(page-1)}>{ui.previous}</button>
        <button type="button" className="secondary" disabled={busy || !hasNext || page>=PROFILE_REPORT_MAX_PAGE} onClick={()=>onPageChange(page+1)}>{ui.next}</button>
      </div>
    </div>
    {!records.length ? <p>{ui.empty}</p> : <div className="admin-table-wrap"><table>
      <thead><tr>{ui.headers.map(key=><th key={key}>{key}</th>)}</tr></thead>
      <tbody>{records.map(item=><tr key={item.id}>
        <td><Link to={`/barbers/${item.barber_id}`}>{[item.barber_first,item.barber_last].filter(Boolean).join(' ') || `#${item.barber_id}`}</Link></td>
        <td>{ui.reasons[item.reason] || '—'}</td>
        <td style={{whiteSpace:'pre-wrap', overflowWrap:'anywhere'}}>{item.details}</td>
        <td>{ui.status[item.status] || '—'}</td>
        <td>{item.status==='pending' ? <div className="admin-actions">
          <button type="button" disabled={busy} onClick={()=>onReview(item.id,'resolved')}>{ui.resolve}</button>
          <button type="button" disabled={busy} className="secondary" onClick={()=>onReview(item.id,'dismissed')}>{ui.dismiss}</button>
        </div> : '—'}</td>
      </tr>)}</tbody>
    </table></div>}
  </section>;
}
