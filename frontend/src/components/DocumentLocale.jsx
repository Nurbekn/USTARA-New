import {useEffect} from 'react';
import {useLocation} from 'react-router-dom';
import {getDocumentPresentation} from '../utils/documentLocale.js';

// Pure presentation: no API calls, cookies, storage, tokens or user-provided titles.
export default function DocumentLocale() {
  const location = useLocation();
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const {lang, title, description} = getDocumentPresentation(location.pathname, location.search);
    document.documentElement.lang = lang;
    document.title = title;
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute('content', description);
  }, [location.pathname, location.search]);
  return null;
}
