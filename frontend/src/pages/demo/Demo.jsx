import { Suspense } from "react";
import Loading from "../../components/Loading";
import { BrandSymbol } from "../../components/brand/BrandLogo";
import { formatDate, formatMoney } from "../../utils/format";
import ArrowIcon from "../../components/ArrowIcon";
import { useState } from 'react';
import { Link, NavLink, Outlet, useOutletContext } from 'react-router-dom';
import SampleBarbers from '../home/SampleBarbers';
import { sampleBarbers, sampleCustomers, sampleBookings, sampleServices, sampleReviews } from '../home/sampleData';
import './Demo.css';

const statusLabels = { confirmed: 'Tasdiqlangan', pending: 'Kutilmoqda', completed: 'Yakunlangan' };
const initials = (name) => name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('');
function relatedBookings(account, role) {
  return sampleBookings.filter((booking) => booking[role === 'customer' ? 'customerId' : 'barberId'] === account.id);
}
function BookingRows({ bookings, role }) {
  return <div className="dm-bookings">{bookings.length ? bookings.map((booking) => {
    const barber = sampleBarbers.find(({ id }) => id === booking.barberId);
    const customer = sampleCustomers.find(({ id }) => id === booking.customerId);
    const service = sampleServices.find(({ id }) => id === booking.serviceId);
    const person = role === 'customer' ? barber : customer;
    const date = new Date();
    date.setDate(date.getDate() + booking.dayOffset);
    return <article className="dm-booking" key={booking.id}><span className="dm-avatar" aria-hidden="true">{initials(person.name)}</span><div><h3>{person.name}</h3><p>{service.name} · {service.duration} daqiqa</p><p>{formatDate(date)} · {booking.time}</p></div><div className="dm-booking-end"><span className={`dm-status dm-status-${booking.status}`}>{statusLabels[booking.status]}</span><strong>{formatMoney(service.minPrice)}</strong></div></article>;
  }) : <p className="dm-empty">Bu namuna hisobda hozircha bron yo‘q.</p>}</div>;
}

export function DemoLayout() {
  const [accountId, setAccountId] = useState(sampleCustomers[0].id);
  const role = accountId.startsWith('demo-customer') ? 'customer' : 'barber';
  const account = [...sampleCustomers, ...sampleBarbers].find(({ id }) => id === accountId);
  const profile = { ...account, phone: '', avatarPhoto: '' };
  return <div className="dm-app"><a className="dm-skip" href="#dm-content">Kontentga o‘tish</a><div className="dm-banner"><span><strong>Namuna rejimi</strong> · Barcha hisoblar, bronlar va sharhlar to‘qima.</span><Link to="/">Saytga qaytish <ArrowIcon /></Link></div><div className="dm-shell"><aside className="dm-sidebar"><Link to="/demo" className="dm-logo" aria-label="Ustara — namuna bosh sahifasi"><BrandSymbol size={40} /></Link><nav aria-label="Namuna navigatsiyasi"><NavLink to="/demo" end>Bosh sahifa</NavLink><NavLink to="/demo/explore">Ustalarni qidirish</NavLink><NavLink to="/demo/bookings">{role === 'customer' ? 'Bronlarim' : 'Mijozlar va bronlar'}</NavLink><NavLink to="/demo/profile">Profil</NavLink></nav><p>Faqat vizual namuna.<br />Haqiqiy bron yaratilmaydi.</p></aside><div className="dm-body"><header className="dm-toolbar"><label htmlFor="dm-account">Namuna hisobni tanlang<select id="dm-account" value={accountId} onChange={(event) => setAccountId(event.target.value)}><optgroup label="Mijozlar">{sampleCustomers.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</optgroup><optgroup label="Sartaroshlar">{sampleBarbers.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</optgroup></select></label><span className="dm-role">{role === 'customer' ? 'Mijoz ko‘rinishi' : 'Usta ko‘rinishi'}</span></header><main id="dm-content" tabIndex={-1}><Suspense fallback={<Loading />}><Outlet context={{ account, profile, role }} /></Suspense></main></div></div></div>;
}

export function DemoHome() {
  const { account, role } = useOutletContext();
  const bookings = relatedBookings(account, role);
  const upcoming = bookings.filter(({ status }) => status !== 'completed');
  return <><header className="dm-heading"><p className="ui-eyebrow">{role === 'customer' ? 'SIZNING VAQTINGIZ' : 'ISH KUNINGIZ'}</p><h1>Salom, {account.firstName || account.name.split(' ')[0]}.</h1><p>{role === 'customer' ? 'Yaxshi usta topish shu yerdan boshlanadi.' : 'Mijozlar va yaqin bronlaringiz bir joyda.'}</p></header>{role === 'customer' && <Link className="dm-search" to="/demo/explore">Usta yoki xizmat qidirish <ArrowIcon /></Link>}<section className="dm-section"><div className="dm-section-heading"><h2>{role === 'customer' ? 'Eng yaqin broningiz' : 'Yaqin bronlar'}</h2><Link to="/demo/bookings">Barchasi <ArrowIcon /></Link></div><BookingRows bookings={upcoming} role={role} /></section>{role === 'customer' ? <SampleBarbers /> : <><section className="dm-section"><h2>Mijozlaringiz</h2><div className="dm-people">{sampleCustomers.filter((customer) => bookings.some(({ customerId }) => customerId === customer.id)).map((customer) => <article className="dm-person" key={customer.id}><span className="dm-avatar" aria-hidden="true">{initials(customer.name)}</span><div><h3>{customer.name}</h3><p>{customer.address}</p></div></article>)}</div></section><section className="dm-section"><h2>Mijozlar fikri</h2><div className="dm-reviews">{sampleReviews.filter(({ barberId }) => barberId === account.id).map((review) => <article className="dm-review" key={review.id}><p aria-label={`${review.rating} yulduz`}>{'★'.repeat(review.rating)}</p><blockquote>{review.text}</blockquote><span>{sampleCustomers.find(({ id }) => id === review.customerId).name}</span></article>)}{!sampleReviews.some(({ barberId }) => barberId === account.id) && <p className="dm-empty">Bu namuna ustaga hali sharh yozilmagan.</p>}</div></section></>}</>;
}

export function DemoBookings() {
  const { account, role } = useOutletContext();
  const [tab, setTab] = useState('confirmed');
  return <><header className="dm-heading"><p className="ui-eyebrow">NAMUNA BRONLAR</p><h1>{role === 'customer' ? 'Bronlarim' : 'Mijozlar va bronlar'}</h1></header><div className="dm-tabs" role="group" aria-label="Bron holati">{Object.entries(statusLabels).map(([key, label]) => <button key={key} type="button" aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</button>)}</div><BookingRows bookings={relatedBookings(account, role).filter(({ status }) => status === tab)} role={role} /></>;
}

export function DemoProfile() {
  const { account, role } = useOutletContext();
  return <><header className="dm-heading"><p className="ui-eyebrow">NAMUNA PROFIL</p><h1>Profil</h1></header><div className="dm-profile"><span className="dm-avatar dm-avatar-large" aria-hidden="true">{initials(account.name)}</span><h2>{account.name}</h2><p>{role === 'customer' ? 'Mijoz' : 'Sartarosh'} · Namuna hisob</p><dl><div><dt>Hudud</dt><dd>{account.address}</dd></div>{role === 'barber' && <div><dt>Salon</dt><dd>{account.salonName}</dd></div>}<div><dt>Telefon</dt><dd>Namunada ko‘rsatilmaydi</dd></div><div><dt>Profil rasmi</dt><dd>Rasm o‘rniga ism bosh harflari</dd></div></dl><p className="dm-empty">Bu profil faqat ko‘rish uchun. Ma’lumotlar serverga saqlanmaydi.</p></div></>;
}
