import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { request } from '../../api/client';
import { getSession, subscribeSession } from '../auth/utils/session';
import { readSiteLocale, siteLocalePath } from '../../utils/siteLocale.js';
import { chatQuickRepliesV161,chatUiV161,parseChatQueryV161,validateChatMessagesV161 } from './chatModelV161.js';
import './chatV161.css';

const idOf = x => Number.isSafeInteger(x?.id) && x.id > 0;
export default function ChatV161() {
  const location=useLocation();
  const lang=readSiteLocale(location.search), ui=chatUiV161(lang);
  const session=getSession();
  const role=session?.role;
  const identity=`${session?.role}:${session?.accountId}:${session?.token}`;
  const query=parseChatQueryV161(location.search);
  const [threads,setThreads]=useState([]), [threadId,setThreadId]=useState(query.threadId);
  const [messages,setMessages]=useState([]), [text,setText]=useState('');
  const [postId,setPostId]=useState(query.postId), [status,setStatus]=useState('loading');
  const [error,setError]=useState(''), [busy,setBusy]=useState(false), [reload,setReload]=useState(0);
  const sendLock=useRef(false);
  const [,setSessionEpoch]=useState(0);
  useEffect(()=>subscribeSession(()=>setSessionEpoch(value=>value+1)),[]);
  // Prevent a previous account's messages from remaining visible on a session switch.
  useEffect(()=>{
    setThreads([]);setMessages([]);setThreadId(query.threadId);setPostId(query.postId);
    setError('');setStatus('loading');
    if (!session?.token || !['customer','barber'].includes(role)) {setStatus('error');return;}
    const controller=new AbortController();
    const token=session.token;
    const check=()=>{const current=getSession();return !controller.signal.aborted && current?.token===token && current?.accountId===session.accountId && current?.role===role;};
    (async()=>{
      try {
        const inbox=await request('GET','/api/chat/threads',{token,signal:controller.signal});
        if(!Array.isArray(inbox)||!inbox.every(idOf))throw new Error('Chatlar ro‘yxati noto‘g‘ri.');
        let selected=query.threadId;
        let visibleInbox=inbox;
        if (role==='customer' && query.barberId) {
          const started=await request('POST','/api/chat/threads',{token,signal:controller.signal,body:{barberId:query.barberId}});
          if(!Number.isSafeInteger(started?.threadId))throw new Error(ui.noApproval);
          selected=started.threadId;
          // The first inbox was fetched before the conversation existed.
          const updated=await request('GET','/api/chat/threads',{token,signal:controller.signal});
          if(!Array.isArray(updated)||!updated.every(idOf))throw new Error('Chatlar ro‘yxati noto‘g‘ri.');
          visibleInbox=updated;
        }
        if (!check()) return;
        setThreads(visibleInbox);setThreadId(selected || null);setStatus('ready');
      } catch(e) {if(check()){setStatus('error');setError(e.message);}}
    })();
    return ()=>controller.abort();
  // Query is captured at mount; normal thread changes happen without URL changes.
  },[identity,query.threadId,query.barberId,query.postId,reload]);
  useEffect(()=>{
    if(!session?.token||status!=='ready')return;
    const token=session.token;
    let controller=null,disposed=false;
    const refresh=async()=>{
      if(disposed || document.visibilityState==='hidden')return;
      const active=getSession();if(active?.token!==token)return;
      controller?.abort();controller=new AbortController();
      try {
        const inbox=await request('GET','/api/chat/threads',{token,signal:controller.signal});
        if(!disposed && getSession()?.token===token && Array.isArray(inbox) && inbox.every(idOf))setThreads(inbox);
      } catch { /* Keep last valid inbox; manual retry remains available. */ }
    };
    const interval=setInterval(()=>{void refresh();},15000);
    return ()=>{disposed=true;clearInterval(interval);controller?.abort();};
  },[identity,status]);
  useEffect(()=>{
    setMessages([]);
    if(!session?.token||status!=='ready'||!threadId)return;
    const token=session.token;
    let disposed=false,controller=null;
    const refresh=async()=>{
      if(disposed || document.visibilityState==='hidden')return;
      if(getSession()?.token!==token)return;
      controller?.abort();controller=new AbortController();
      try {
        const value=await request('GET',`/api/chat/threads/${threadId}/messages`,{token,signal:controller.signal});
        const items=validateChatMessagesV161(value);
        if(!disposed && getSession()?.token===token){setMessages(items);setError('');}
      } catch(e) {if(!disposed && getSession()?.token===token && e.code!=='request_aborted')setError(e.message);}
    };
    void refresh();const interval=setInterval(()=>{void refresh();},6000);
    return ()=>{disposed=true;clearInterval(interval);controller?.abort();};
  },[identity,threadId,status,reload]);
  async function send(event){
    event.preventDefault();
    const body=text.trim();if(sendLock.current||(!body&&!postId)||!threadId||!session?.token)return;
    sendLock.current=true;setBusy(true);setError('');
    try{
      if(getSession()?.token!==session.token)throw new Error('Sessiya o‘zgardi.');
      const result=await request('POST',`/api/chat/threads/${threadId}/messages`,{token:session.token,body:{body,sharedPostId:postId}});
      if(!result?.message||!Number.isSafeInteger(result.message.id))throw new Error('Xabar tasdiqlanmadi.');
      if(getSession()?.token===session.token){setMessages(items=>[...items.filter(m=>m.id!==result.message.id),result.message].slice(-100));setText('');setPostId(null);}
    }catch(e){setError(e.message);}finally{sendLock.current=false;setBusy(false);}
  }
  const title=ui.title;
  return <div className="chat-v161">
    <h1>{title}</h1>
    <p className="chat-v161-note" role="note">{ui.note}</p>
    {status==='loading' && <p role="status">{ui.loading}</p>}
    {error && <div role="alert" className="chat-v161-error">{error} <button type="button" onClick={()=>setReload(x=>x+1)}>{ui.retry}</button></div>}
    {status==='ready' && <div className="chat-v161-columns">
      <nav aria-label={title} className="chat-v161-list">
        {!threads.length && <p>{ui.empty}</p>}
        {threads.map(thread=><button key={thread.id} type="button" className={thread.id===threadId?'is-selected':''} aria-current={thread.id===threadId?'page':undefined} onClick={()=>{setThreadId(thread.id);setPostId(null);setError('');}}>{thread.peerName}</button>)}
        {threadId && !threads.some(t=>t.id===threadId) && <span>{ui.new}</span>}
      </nav>
      <section className="chat-v161-room" aria-label={title}>
        {!threadId ? <p>{ui.select}</p> : <>
          <ol className="chat-v161-messages" aria-live="polite" aria-relevant="additions text">
            {messages.map(m=><li key={m.id} className={m.senderUserId===session.accountId?'mine':''}>
              <span className="chat-v161-source">{m.source==='ai'?ui.sourceAi:ui.sourceHuman}</span>
              {m.body && <p>{m.body}</p>}
              {m.sharedPostId && <Link to={siteLocalePath(role==='customer'?`/user/social?post=${m.sharedPostId}`:'/barber/portfolio',lang)}>{ui.shared} #{m.sharedPostId}</Link>}
              <time dateTime={m.createdAt}>{new Date(m.createdAt).toLocaleTimeString(lang==='ru'?'ru-RU':lang==='en'?'en-GB':'uz-UZ',{hour:'2-digit',minute:'2-digit'})}</time>
            </li>)}
          </ol>
          {messages.length>=100 && <small>{ui.history}</small>}
          {role==='barber' && <div className="chat-v161-quick" aria-label={ui.new}>
            {chatQuickRepliesV161(lang,role).map(reply=><button type="button" key={reply} onClick={()=>setText(reply)}>{reply}</button>)}
          </div>}
          <form onSubmit={send} className="chat-v161-compose">
            {postId && <div>{ui.shared} #{postId} <button type="button" onClick={()=>setPostId(null)}>{ui.cancelShare}</button></div>}
            <label htmlFor="chat-v161-text">{ui.placeholder}</label>
            <textarea id="chat-v161-text" maxLength={1000} rows={2} value={text} onChange={e=>setText(e.target.value)} placeholder={ui.placeholder}/>
            <button type="submit" disabled={busy || (!text.trim()&&!postId)}>{busy?'…':ui.send}</button>
          </form>
        </>}
      </section>
    </div>}
  </div>;
}
