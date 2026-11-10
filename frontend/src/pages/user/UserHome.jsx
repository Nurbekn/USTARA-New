import { useState } from "react";
import NearbyBarbers from "./NearbyBarbers";
import HomeIcon from "./HomeIcon";

const categories = [
  { label: "Soch olish", icon: "scissors" },
  { label: "Soqol olish", icon: "beard" },
  { label: "Soch turmagi", icon: "comb" },
  { label: "Bo‘yash", icon: "color" },
];
const regions = [
  "Toshkent",
  "Toshkent shahri",
  "Andijon",
  "Buxoro",
  "Farg‘ona",
  "Jizzax",
  "Namangan",
  "Navoiy",
  "Qashqadaryo",
  "Samarqand",
  "Sirdaryo",
  "Surxondaryo",
  "Xorazm",
  "Qoraqalpog‘iston Respublikasi",
];

export default function UserHome() {
  const [search, setSearch] = useState("");
  const [region, setRegion] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [collection, setCollection] = useState("barbers");

  function handleSearch(event) {
    event.preventDefault();
    setNotice("");
    if (!search.trim()) {
      setError("Barber, salon yoki xizmat nomini kiriting.");
      return;
    }
    if (!region) {
      setError("Viloyatingizni tanlang.");
      return;
    }
    setError("");
    setNotice("Qidiruv xizmati tez orada mavjud bo‘ladi.");
  }

  return (
    <div className="uh-home">
      <section className="uh-discover" aria-labelledby="uh-title">
        <div className="uh-intro">
          <h1 id="uh-title">O‘zingizga mos barber toping</h1>
          <p>Yaxshi uslub yaxshi ustadan boshlanadi.</p>
        </div>
        <form className="uh-search" onSubmit={handleSearch}>
          <div className="uh-query">
            <HomeIcon name="search" />
            <input
              className="uh-search-input"
              type="search"
              aria-label="Barber, salon yoki xizmat qidirish"
              aria-describedby={error ? "uh-search-error" : undefined}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setError("");
                setNotice("");
              }}
              placeholder="Barber, salon yoki xizmat"
            />
            {search && (
              <button
                className="uh-clear"
                type="button"
                aria-label="Qidiruvni tozalash"
                onClick={() => {
                  setSearch("");
                  setError("");
                  setNotice("");
                }}
              >
                <HomeIcon name="close" size={18} />
              </button>
            )}
          </div>
          <div className="uh-search-bottom">
            <label className="uh-region">
              <HomeIcon name="pin" size={20} />
              <select
                aria-label="Viloyat"
                value={region}
                onChange={(event) => {
                  setRegion(event.target.value);
                  setError("");
                  setNotice("");
                }}
              >
                <option value="">Viloyatni tanlang</option>
                {regions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="uh-search-submit">
              Qidirish
              <HomeIcon name="arrow" size={18} />
            </button>
          </div>
          {error && (
            <p className="uh-error" id="uh-search-error" role="alert">
              {error}
            </p>
          )}
          <p className="uh-search-notice" role="status">
            {notice}
          </p>
        </form>
        <div className="uh-categories" aria-labelledby="uh-services-title">
          <div className="uh-section-heading">
            <h2 id="uh-services-title">Xizmat turi</h2>
            <span>Ixtiyoriy</span>
          </div>
          <div className="uh-category-list">
            {categories.map(({ label, icon }) => (
              <button
                type="button"
                key={label}
                aria-pressed={selectedCategory === label}
                className={`uh-category-btn ${selectedCategory === label ? "uh-category-btn-active" : ""}`}
                onClick={() =>
                  setSelectedCategory(selectedCategory === label ? "" : label)
                }
              >
                <span className="uh-category-icon">
                  <HomeIcon name={icon} size={27} />
                </span>
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <NearbyBarbers />

      <section className="uh-collections" aria-labelledby="uh-for-you-title">
        <h2 id="uh-for-you-title">Siz uchun</h2>
        <div
          className="uh-collection-filters"
          role="group"
          aria-label="Tavsiyalar turi"
        >
          <button
            type="button"
            aria-pressed={collection === "barbers"}
            onClick={() => setCollection("barbers")}
          >
            Barberlar
          </button>
          <button
            type="button"
            aria-pressed={collection === "styles"}
            onClick={() => setCollection("styles")}
          >
            Soch turmaklari
          </button>
        </div>
        <div className="uh-empty" key={collection}>
          <span className="uh-empty-icon">
            <HomeIcon
              name={collection === "barbers" ? "star" : "comb"}
              size={26}
            />
          </span>
          <h3>
            {collection === "barbers"
              ? "Hozircha tavsiyalar yo‘q"
              : "Soch turmaklari hali qo‘shilmagan"}
          </h3>
          <p>
            {collection === "barbers"
              ? "Tavsiya etilgan barberlar shu yerda ko‘rinadi."
              : "Yangi uslublar shu yerda ko‘rinadi."}
          </p>
        </div>
      </section>
    </div>
  );
}
