const pool = require("../db");

function id(value) {
  const parsed = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function account(req, res, role) {
  if (req.user?.role !== role || !id(req.user?.accountId) || !id(req.user?.profileId)) {
    res.status(403).json({ message: `Bu amal uchun ${role} hisobi kerak.` });
    return null;
  }
  return { userId: req.user.accountId, profileId: req.user.profileId };
}

function reviewView(row) {
  return {
    id: Number(row.id), bookingId: Number(row.booking_id),
    barberId: Number(row.barber_id), customerId: Number(row.customer_id),
    customer: [row.first_name, row.last_name].filter(Boolean).join(" ") || "Mijoz",
    rating: Number(row.rating), text: row.text, reply: row.reply || "",
    date: row.created_at,
  };
}

function publicReviewView(row) {
  const review = reviewView(row);
  return { id: review.id, customer: review.customer, rating: review.rating, text: review.text, reply: review.reply, date: review.date };
}

async function create(req, res) {
  const customer = account(req, res, "customer");
  if (!customer) return;
  const bookingId = id(req.params.id);
  const rating = req.body?.rating;
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!bookingId || !Number.isInteger(rating) || rating < 1 || rating > 5 || text.length > 1000) {
    return res.status(400).json({ message: "Reyting 1 dan 5 gacha, izoh esa 1000 belgigacha bo‘lishi kerak." });
  }
  try {
    const result = await pool.query(
      `INSERT INTO barber_reviews(booking_id,customer_id,barber_id,rating,text)
       SELECT b.id,b.customer_id,b.barber_id,$3,$4
       FROM bookings b
       WHERE b.id=$1 AND b.customer_id=$2 AND b.status='completed'
       RETURNING id,booking_id,customer_id,barber_id,rating,text,reply,created_at`,
      [bookingId, customer.profileId, rating, text],
    );
    if (!result.rowCount) {
      const found = await pool.query("SELECT status FROM bookings WHERE id=$1 AND customer_id=$2", [bookingId, customer.profileId]);
      if (!found.rowCount) return res.status(404).json({ message: "Yakunlangan bron topilmadi." });
      return res.status(409).json({ message: "Faqat yakunlangan bronni baholash mumkin." });
    }
    return res.status(201).json({ review: reviewView(result.rows[0]) });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ message: "Bu bron uchun sharh avval yuborilgan." });
    console.error("review_create_failed", error.code || "internal_error");
    return res.status(500).json({ message: "Sharhni saqlab bo‘lmadi." });
  }
}

async function getMyReviews(req, res) {
  const barber = account(req, res, "barber");
  if (!barber) return;
  try {
    const result = await pool.query(
      `SELECT r.id,r.booking_id,r.customer_id,r.barber_id,r.rating,r.text,r.reply,r.created_at,
              c.first_name,c.last_name
       FROM barber_reviews r JOIN customers c ON c.id=r.customer_id
       WHERE r.barber_id=$1 ORDER BY r.created_at DESC,r.id DESC LIMIT 200`, [barber.profileId],
    );
    const reviews = result.rows.map(reviewView);
    const count = reviews.length;
    const distribution = Object.fromEntries([1,2,3,4,5].map((value) => [value, reviews.filter((r) => r.rating === value).length]));
    return res.json({ reviews, summary: { count, average: count ? reviews.reduce((sum, r) => sum + r.rating, 0) / count : 0, distribution } });
  } catch (error) {
    console.error("barber_reviews_read_failed", error.code || "internal_error");
    return res.status(500).json({ message: "Sharhlarni yuklab bo‘lmadi." });
  }
}

async function getPublicReviews(req, res) {
  // Only approved barbers' published reviews are returned; no account is needed
  // to read them. Creating a review and replying remain authenticated.
  const barberId = id(req.params.id);
  if (!barberId) return res.status(400).json({ message: "Barber ID noto‘g‘ri." });
  try {
    const barber = await pool.query("SELECT id FROM barbers WHERE id=$1 AND verification_status='approved'", [barberId]);
    if (!barber.rowCount) return res.status(404).json({ message: "Tasdiqlangan barber topilmadi." });
    const result = await pool.query(
      `SELECT r.id,r.booking_id,r.customer_id,r.barber_id,r.rating,r.text,r.reply,r.created_at,
              c.first_name,c.last_name
       FROM barber_reviews r JOIN customers c ON c.id=r.customer_id
       WHERE r.barber_id=$1 ORDER BY r.created_at DESC,r.id DESC LIMIT 100`, [barberId],
    );
    const reviews = result.rows.map(publicReviewView);
    const count = reviews.length;
    return res.json({ reviews, summary: { count, average: count ? reviews.reduce((sum, r) => sum + r.rating, 0) / count : 0 } });
  } catch (error) {
    console.error("public_reviews_read_failed", error.code || "internal_error");
    return res.status(500).json({ message: "Sharhlarni yuklab bo‘lmadi." });
  }
}

async function reply(req, res) {
  const barber = account(req, res, "barber");
  if (!barber) return;
  const reviewId = id(req.params.id);
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : null;
  if (!reviewId || text === null || text.length < 1 || text.length > 1000) {
    return res.status(400).json({ message: "Javob 1 dan 1000 belgigacha bo‘lishi kerak." });
  }
  try {
    const result = await pool.query(
      `UPDATE barber_reviews r SET reply=$1,updated_at=NOW()
       FROM barbers b WHERE r.id=$2 AND r.barber_id=b.id AND b.id=$3 AND b.user_id=$4
       RETURNING r.id,r.booking_id,r.customer_id,r.barber_id,r.rating,r.text,r.reply,r.created_at`,
      [text, reviewId, barber.profileId, barber.userId],
    );
    if (!result.rowCount) return res.status(404).json({ message: "Sharh topilmadi." });
    return res.json({ review: reviewView(result.rows[0]) });
  } catch (error) {
    console.error("review_reply_failed", error.code || "internal_error");
    return res.status(500).json({ message: "Sharhga javobni saqlab bo‘lmadi." });
  }
}

module.exports = { create, getMyReviews, getPublicReviews, reply };
