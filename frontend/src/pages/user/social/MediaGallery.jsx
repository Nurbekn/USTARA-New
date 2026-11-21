import { useState } from 'react';
import { resolveMediaUrl } from '../../../api/client.js';
import Icon from '../../../components/Icon';
import { socialQueueText } from './socialQueueLocaleV149.js';
import './MediaGallery.css';

export default function MediaGallery({ media = [], name = 'Post', onOpen, initialIndex = 0, lang = 'uz' }) {
  const tr = socialQueueText(lang);
  const [index, setIndex] = useState(initialIndex);
  const [failed, setFailed] = useState({});
  return <div className="so-gallery">
    <div className="so-gallery-track" aria-label={tr("Post rasmlari")} ref={node => { if (node && initialIndex && node.dataset.initialized !== 'yes') { node.scrollLeft = node.clientWidth * initialIndex; node.dataset.initialized = 'yes'; } }} onScroll={event => { const node = event.currentTarget; setIndex(Math.round(node.scrollLeft / node.clientWidth)); }}>
      {media.length ? media.map((item, i) => <figure key={`${item.url}-${i}`}>
        {failed[i] ? <div className="so-gallery-placeholder" role="img" aria-label={tr("Media mavjud emas")}><Icon name="camera" size={36}/><span>{tr("Media mavjud emas")}</span></div>
          : item.type === 'video' ? <video src={resolveMediaUrl(item.url)} controls playsInline preload={i === index ? "metadata" : "none"} onError={() => setFailed(value => ({ ...value, [i]: true }))}/>
            : <button type="button" className="so-gallery-open" disabled={!onOpen} aria-label={`${name} — ${i + 1} ${tr("Post rasmlari")}`} onClick={() => onOpen?.(i)}><img src={resolveMediaUrl(item.url)} alt={item.alt || `${name} — ${i + 1}-rasm`} loading="lazy" decoding="async" fetchPriority={i === index ? "auto" : "low"} onError={() => setFailed(value => ({ ...value, [i]: true }))}/></button>}
      </figure>) : <div className="so-gallery-placeholder">{tr("Media qo‘shilmagan")}</div>}
    </div>
    {media.length > 1 && <div className="so-gallery-dots" aria-label={`${index + 1} / ${media.length}`}>{media.map((_, i) => <span key={i} className={i === index ? 'is-current' : ''}/>)}</div>}
  </div>;
}
