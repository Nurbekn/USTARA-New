import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { HELP_LANGUAGES } from './helpTranslations.js';
import { siteLocalePath } from '../../utils/siteLocale.js';
import {
  findHelpTopics, getHelpCategories, getHelpUi, localizedHelpHomeUrl,
  localizedHelpTopicUrl, readHelpFilters, readHelpLocale,
} from './helpModel.js';
import './HelpCenter.css';

export default function HelpCenter() {
  const [params, setParams] = useSearchParams();
  const [showIntro, setShowIntro] = useState(false);
  const lang = readHelpLocale(params);
  const filters = { ...readHelpFilters(params), lang };
  const ui = getHelpUi(lang);
  const categories = getHelpCategories(lang);
  const topics = findHelpTopics(filters);

  function update(patch) {
    const merged = { ...filters, ...patch };
    const next = new URLSearchParams();
    if (merged.category && merged.category !== 'all') next.set('category', merged.category);
    if (merged.topic) next.set('topic', merged.topic);
    if (merged.q) next.set('q', merged.q.slice(0, 100));
    if (merged.lang === 'ru' || merged.lang === 'en') next.set('lang', merged.lang);
    setParams(next, { replace: true });
  }

  return <div className="hc-page" lang={lang}>
    <div className="hc-language"><label htmlFor="hc-language">{ui.language}</label>
      <select id="hc-language" value={lang} onChange={event => update({ lang: event.target.value, q: '' })}>
        {HELP_LANGUAGES.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
    </div>
    <header className="hc-header"><p className="hc-eyebrow">{ui.eyebrow}</p><h1>{ui.title}</h1><p>{ui.introText}</p></header>
    <section className="hc-intro" aria-label={ui.introRegion}>
      <button type="button" aria-expanded={showIntro} aria-controls="hc-steps" onClick={() => setShowIntro(value => !value)}>{showIntro ? ui.introClose : ui.introOpen}</button>
      {showIntro && <ol id="hc-steps">{ui.introSteps.map((step, index) => <li key={index}>
        {step.text || <>{step.before}<Link to={siteLocalePath(index === 0 ? '/explore' : '/user/bookings', lang)}>{step.link}</Link>{step.after}</>}
      </li>)}</ol>}
    </section>
    <div className="hc-search"><label htmlFor="hc-query">{ui.searchLabel}</label>
      <input id="hc-query" type="search" maxLength={100} placeholder={ui.searchPlaceholder} value={filters.q} onChange={event => update({ q: event.target.value, topic: null })}/>
      {(filters.q || filters.topic) && <button type="button" onClick={() => update({ q: '', topic: null })}>{ui.clear}</button>}
    </div>
    <nav aria-label={ui.categoryNav} className="hc-categories">{categories.map(category => <button type="button" key={category.id} aria-pressed={filters.category === category.id} onClick={() => update({ category: category.id, topic: null })}>{category.label}</button>)}</nav>
    {filters.topic && <p className="hc-back"><Link to={localizedHelpHomeUrl(lang)}>{ui.back}</Link></p>}
    <section className="hc-results" aria-label={ui.results} aria-live="polite">
      <p className="hc-count">{topics.length} {ui.countSuffix}</p>
      {topics.length ? <div className="hc-list">{topics.map(topic => <article className="hc-card" id={`topic-${topic.id}`} key={topic.id}>
        <h2><Link to={localizedHelpTopicUrl(topic.id, lang)}>{topic.title}</Link></h2>
        <p>{topic.answer}</p>
        <div className="hc-links">{topic.links.map(item => <Link key={item.path} to={siteLocalePath(item.path, lang)}>{item.label}{item.auth ? ui.authNote : ''}</Link>)}</div>
      </article>)}</div> : <div className="hc-empty" role="status"><strong>{ui.emptyTitle}</strong><p>{ui.emptyBody}</p><button type="button" onClick={() => update({ q: '', topic: null, category: 'all' })}>{ui.allQuestions}</button></div>}
    </section>
    <p className="hc-footer">{ui.footer}</p>
  </div>;
}
