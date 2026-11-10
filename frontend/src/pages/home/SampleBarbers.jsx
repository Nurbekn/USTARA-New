import ArrowIcon from "../../components/ArrowIcon";
import { Link } from 'react-router-dom';
import { sampleBarbers } from './sampleData';
import './SampleBarbers.css';

export default function SampleBarbers() {
  return (
    <section className="hm-samples container ui-section" aria-labelledby="hm-samples-title">
      <header className="hm-samples-heading">
        <div><p className="ui-eyebrow">USTALAR · NAMUNA</p><h2 id="hm-samples-title">Ishlari bilan tanishing.</h2></div>
        <Link to="/demo/explore" className="hm-samples-link">Barcha ustalar <ArrowIcon /></Link>
      </header>
      <div className="hm-samples-grid">
        {sampleBarbers.map((barber) => (
          <Link key={barber.id} to={`/demo/explore?type=barbers&profile=${barber.id}`} className="hm-sample-card">
            <div className="hm-sample-work" style={{ backgroundImage: `url(${barber.workPhoto})`, backgroundPosition: `${barber.position} center` }} role="img" aria-label="Soch turmagi uchun yaratilgan namuna" />
            <div className="hm-sample-info"><div><h3>{barber.name}</h3><p>{barber.area} · {barber.salonName}</p></div><p className="hm-sample-rating" aria-label={`Namuna reytingi: ${barber.rating}`}>★ {barber.rating.toFixed(1)}</p><p className="hm-sample-price">{barber.startingPrice.toLocaleString('uz-UZ')} so‘mdan <span className="ui-arrow-inline">Profilni ko‘rish <ArrowIcon /></span></p></div>
          </Link>
        ))}
      </div>
      <p className="hm-samples-note">Namuna ma’lumotlar. Ismlar, narxlar va reytinglar to‘qima; tasvirlar uslubni ko‘rsatish uchun yaratilgan.</p>
    </section>
  );
}
