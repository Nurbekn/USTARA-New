import { Link } from 'react-router-dom';
import { Avatar } from '../../barber/data/avatars';
import HomeIcon from '../HomeIcon';
import { knownNumber, nameOf, providersFor, servicesFor } from './catalog';

const money = (n) => new Intl.NumberFormat('uz-UZ').format(n);
function Price({ min, max }) {
  return <span className="ex-price">{knownNumber(min) ? `${money(min)}${knownNumber(max) && max !== min ? ` – ${money(max)}` : ''} so‘m${max == null ? ' dan' : ''}` : 'Narx ko‘rsatilmagan'}</span>;
}
function Rating({ item }) {
  return <span className="ex-rating"><HomeIcon name="star" size={16} />{knownNumber(item.rating) ? item.rating.toFixed(1) : 'Reyting yo‘q'}<span>{knownNumber(item.reviewCount) ? `(${item.reviewCount} sharh)` : ''}</span></span>;
}
export default function ResultCard({ item, type, catalog, makeUrl, detail = false }) {
  const service = type === 'services';
  const services = service ? [] : servicesFor(item, type, catalog);
  const providers = service ? providersFor(item, catalog) : null;
  const prices = services.map((s) => s.minPrice).filter(knownNumber);
  const min = knownNumber(item.startingPrice) ? item.startingPrice : prices.length ? Math.min(...prices) : null;
  return <article className={`ex-result ex-result-${type}`}>
    {type === 'salons' && (item.image ? <img className="ex-salon-image" src={item.image} alt={nameOf(item)} loading="lazy" /> : <div className="ex-salon-image ex-image-placeholder"><HomeIcon name="pin" size={32} /><span>Salon rasmi qo‘shilmagan</span></div>)}
    <div className="ex-result-body">
      <div className="ex-result-heading">
        {type === 'barbers' && <Avatar photo={item.avatarPhoto} id={item.avatar} name={nameOf(item)} size={56} />}
        {service && <span className="ex-service-icon"><HomeIcon name="scissors" /></span>}
        <div><h3>{nameOf(item)}</h3>{type === 'barbers' && item.salonName && <p>{item.salonName}</p>}{service && <p>{item.category || 'Kategoriya ko‘rsatilmagan'}</p>}</div>
      </div>
      {!service && <><Rating item={item} /><p className="ex-address"><HomeIcon name="pin" size={17} />{item.address || 'Manzil ko‘rsatilmagan'}</p></>}
      {service ? <p className="ex-description">{item.description || 'Tavsif hali qo‘shilmagan.'}</p> : <div className="ex-service-tags">{services.length ? services.slice(0, detail ? services.length : 3).map((s) => <Link key={s.id} to={makeUrl({ type: 'services', profile: null, q: s.name, service: null })}>{s.name}</Link>) : <span>Xizmatlar hali qo‘shilmagan</span>}{!detail && services.length > 3 && <span>+{services.length - 3}</span>}</div>}
      {type === 'salons' && <p className="ex-hours">Ish vaqti: {item.openingHours || 'Ko‘rsatilmagan'}</p>}
      <div className="ex-result-footer">
        {type !== 'salons' && <Price min={service ? item.minPrice : min} max={service ? item.maxPrice : null} />}
        {!service && !detail && <Link className="ex-action" to={makeUrl({ profile: item.id })}>{type === 'barbers' ? 'Profilni ko‘rish' : 'Salonni ko‘rish'}<HomeIcon name="arrow" size={17} /></Link>}
      </div>
      {service && <div className="ex-provider-links"><Link className="ex-action" to={makeUrl({ type: 'barbers', service: item.id, profile: null, q: null, category: null })}>Barberlar ({providers.barbers.length})<HomeIcon name="arrow" size={17} /></Link><Link className="ex-action" to={makeUrl({ type: 'salons', service: item.id, profile: null, q: null, category: null })}>Salonlar ({providers.salons.length})<HomeIcon name="arrow" size={17} /></Link></div>}
    </div>
  </article>;
}
