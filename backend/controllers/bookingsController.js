const pool = require("../db");

//Barcha bookinglarni olish
async function getBooking(req, res) {
  try {
    let query;
    let params;

    if (req.user.role === "customer") {
      query = `
        SELECT
          bookings.id,
          customers.name AS customer_name,
          barbers.name AS barber_name,
          services.name AS service_name,
          bookings.booking_time,
          bookings.status,
          bookings.created_at
        FROM bookings
        JOIN customers ON bookings.customer_id = customers.id
        JOIN barbers ON bookings.barber_id = barbers.id
        JOIN services ON bookings.service_id = services.id
        WHERE bookings.customer_id = $1
        ORDER BY bookings.id DESC
      `;
      params = [req.user.id];
    } else if (req.user.role === "barber") {
      query = `
        SELECT
          bookings.id,
          customers.name AS customer_name,
          barbers.name AS barber_name,
          services.name AS service_name,
          bookings.booking_time,
          bookings.status,
          bookings.created_at
        FROM bookings
        JOIN customers ON bookings.customer_id = customers.id
        JOIN barbers ON bookings.barber_id = barbers.id
        JOIN services ON bookings.service_id = services.id
        WHERE bookings.barber_id = $1
        ORDER BY bookings.id DESC
      `;
      params = [req.user.id];
    } else {
      return res.status(403).json({
        message: "Bu amal uchun ruxsat yo'q",
      });
    }
    const result = await pool.query(query, params);
    return res.json(result.rows);
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
}
// Bitta bookingni ID orqali olish
async function getBookingById(req, res) {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        message: "ID kiritishda xatolik",
      });
    }
    let result;
    if (req.user.role === "admin") {
      result = await pool.query(
        `SELECT
        bookings.id,
        customers.name AS customer_name,
        barbers.name AS barber_name,
        services.name AS service_name,
        bookings.booking_time,
        bookings.status,
        bookings.created_at
      FROM bookings
      JOIN customers ON bookings.customer_id=customers.id
      JOIN barbers ON bookings.barber_id=barbers.id
      JOIN services ON bookings.service_id=services.id
      WHERE bookings.id=$1
      `,
        [id],
      );
    } else if (req.user.role === "customer") {
      result = await pool.query(
        `SELECT
        bookings.id,
        customers.name AS customer_name,
        barbers.name AS barber_name,
        services.name AS service_name,
        bookings.booking_time,
        bookings.status,
        bookings.created_at
        FROM bookings
        JOIN customers ON bookings.customer_id=customers.id
        JOIN barbers ON bookings.barber_id=barbers.id
        JOIN services ON bookings.service_id=services.id
        WHERE bookings.id=$1
        AND bookings.customer_id=$2
        `,
        [id, req.user.id],
      );
    } else if (req.user.role === "barber") {
      result = await pool.query(
        `SELECT
      bookings.id,
      customers.name AS customer_name,
      barbers.name AS barber_name,
      services.name AS service_name,
      bookings.booking_time,
      bookings.status,
      bookings.created_at
    FROM bookings
    JOIN customers ON bookings.customer_id = customers.id
    JOIN barbers ON bookings.barber_id = barbers.id
    JOIN services ON bookings.service_id = services.id
    WHERE bookings.id = $1
      AND bookings.barber_id = $2`,
        [id, req.user.id],
      );
    } else {
      return res.status(403).json({
        message: "Bu amal uchun ruxsat yo'q",
      });
    }
    if (result.rowCount === 0) {
      return res.status(404).json({
        message: "Booking topilmadi",
      });
    }
    return res.json(result.rows[0]);
  } catch (error) {
    console.error(error.message);
    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
}
//Bo'sh slots
async function getAvailableSlots(req, res) {
  try {
    const barberId = Number(req.query.barber_id);
    const serviceId = Number(req.query.service_id);
    const { date } = req.query;

    if (
      !Number.isInteger(barberId) ||
      barberId <= 0 ||
      !Number.isInteger(serviceId) ||
      serviceId <= 0 ||
      !date ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date)
    ) {
      return res.status(400).json({
        message: "barber_id,service_id yoki date noto'gri",
      });
    }
    const barberResult = await pool.query(
      "SELECT verification_status FROM barbers WHERE id=$1",
      [barberId],
    );
    if (barberResult.rowCount == 0) {
      return res.status(404).json({
        message: "Barber topilmadi",
      });
    }
    if (barberResult.rows[0].verification_status !== "approved") {
      return res.status(403).json({
        message: "Bu barber hozircha xizmat ko'rsata olmaydi",
      });
    }
    const serviceResult = await pool.query(
      `SELECT duration_minutes
      FROM services
      WHERE id=$1 AND barber_id=$2`,
      [serviceId, barberId],
    );
    if (serviceResult.rowCount === 0) {
      return res.status(404).json({
        message: "Xizmat topilmadi",
      });
    }
    const duration = Number(serviceResult.rows[0].duration_minutes);

    // ish jadval olish shu kunni
    const workingHoursResult = await pool.query(
      `SELECT start_time,end_time
      FROM barber_working_hours
      WHERE barber_id=$1
       AND day_of_week=EXTRACT(
       DOW FROM $2::date
       )::int
      `,
      [barberId, date],
    );
    if (workingHoursResult.rowCount === 0) {
      return res.json({
        date,
        duration,
        working: false,
        slots: [],
        busy: [],
      });
    }
    //Shu kundagi bekor qilinmagan bronlarni olish
    const { start_time, end_time } = workingHoursResult.rows[0];
    //Ish vaqtini daqiqalarga aylantirish
    function toMinutes(time) {
      const [hours, minutes] = time.split(":").map(Number);
      return hours * 60 + minutes;
    }
    const workStart = toMinutes(start_time);
    const workEnd = toMinutes(end_time);
    //Band bronlarni daqiqalarga aylantirish
    const busyResult = await pool.query(
      `SELECT
  EXTRACT(HOUR FROM (bookings.booking_time AT TIME ZONE 'Asia/Tashkent'))::int * 60
  + EXTRACT(MINUTE FROM (bookings.booking_time AT TIME ZONE 'Asia/Tashkent'))::int AS start_minutes,

  EXTRACT(HOUR FROM (
    (bookings.booking_time + services.duration_minutes * INTERVAL '1 minute')
    AT TIME ZONE 'Asia/Tashkent'
  ))::int * 60
  + EXTRACT(MINUTE FROM (
    (bookings.booking_time + services.duration_minutes * INTERVAL '1 minute')
    AT TIME ZONE 'Asia/Tashkent'
  ))::int AS end_minutes

FROM bookings
JOIN services ON services.id = bookings.service_id
WHERE bookings.barber_id = $1
  AND bookings.status <> 'cancelled'
  AND (bookings.booking_time AT TIME ZONE 'Asia/Tashkent')::date = $2::date
ORDER BY bookings.booking_time`,
      [barberId, date],
    );
    const busy = busyResult.rows.map((booking) => ({
      start: Number(booking.start_minutes),
      end: Number(booking.end_minutes),
    }));
    const slots = [];
    for (let start = workStart; start + duration <= workEnd; start += 5) {
      const end = start + duration;
      const isBusy = busy.some((booking) => {
        return start < booking.end && end > booking.start;
      });
      if (!isBusy) {
        slots.push({
          start,
          end,
        });
      }
    }
    function toTimeString(minutes) {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;

      return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
    }
    const formattedSlots = slots.map((slot) => ({
      start: toTimeString(slot.start),
      end: toTimeString(slot.end),
    }));
    const recommendedSlots = slots.filter((slot) => {
      const nextStart = slot.end;
      const nextEnd = nextStart + duration;

      const fitsWorkHours = nextEnd <= workEnd;

      const conflictsWithBooking = busy.some((booking) => {
        return nextStart < booking.end && nextEnd > booking.start;
      });

      return fitsWorkHours && !conflictsWithBooking;
    });
    return res.json({
      date,
      duration,
      working: true,
      slots: formattedSlots,
      recommendedSlots: recommendedSlots.map((slot) => ({
        start: toTimeString(slot.start),
        end: toTimeString(slot.end),
      })),
      busy: busy.map((booking) => ({
        start: toTimeString(booking.start),
        end: toTimeString(booking.end),
      })),
    });
  } catch (error) {
    console.error("getAvailableSlots xatosi:", error.message);

    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
}
// Yangi booking yaratish
async function createBooking(req, res) {
  let client;
  let transactionStarted = false;
  try {
    // 1. Faqat mijoz bron yaratishi mumkin
    if (req.user.role !== "customer") {
      return res.status(403).json({
        message: "Faqat mijozlar bron yaratishi mumkin",
      });
    }
    // 2. Ma'lumotlarni olish
    const { barber_id, service_id, booking_time } = req.body;
    const customer_id = req.user.id;
    // 3. ID larni tekshirish
    if (!Number.isInteger(customer_id) || customer_id <= 0) {
      return res.status(400).json({
        message: "Customer ID noto'g'ri",
      });
    }
    if (!Number.isInteger(barber_id) || barber_id <= 0) {
      return res.status(400).json({
        message: "Barber ID noto'g'ri",
      });
    }
    if (!Number.isInteger(service_id) || service_id <= 0) {
      return res.status(400).json({
        message: "Service ID noto'g'ri",
      });
    }
    // 4. Booking vaqtini tekshirish
    if (
      typeof booking_time !== "string" ||
      !booking_time.trim() ||
      Number.isNaN(Date.parse(booking_time))
    ) {
      return res.status(400).json({
        message: "Booking vaqti noto'g'ri",
      });
    }
    const newStart = Date.parse(booking_time);
    if (newStart <= Date.now()) {
      return res.status(400).json({
        message: "Bron vaqti o'tib ketgan",
      });
    }
    // 5. Transaction boshlash
    client = await pool.connect();
    await client.query("BEGIN");
    transactionStarted = true;
    // 6. Shu barber uchun bronlarni navbat bilan tekshirish
    await client.query("SELECT pg_advisory_xact_lock($1)", [barber_id]);
    // Sartarosh tasdiqlanganini check qilish
    const barberCheck = await client.query(
      `SELECT verification_status
      FROM barbers
      WHERE id=$1
      `,
      [barber_id],
    );
    if (barberCheck.rowCount === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(404).json({
        message: "Sartarosh topilmadi",
      });
    }
    if (barberCheck.rows[0].verification_status !== "approved") {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(403).json({
        message: "Bu sartarosh hali tasdiqlanmagan",
      });
    }
    // 7. Xizmat ushbu barberga tegishli ekanini tekshirish
    const serviceCheck = await client.query(
      `SELECT id, duration_minutes
       FROM services
       WHERE id = $1 AND barber_id = $2`,
      [service_id, barber_id],
    );
    if (serviceCheck.rowCount === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(404).json({
        message: "Bu xizmat ushbu barberga tegishli emas",
      });
    }
    const duration = Number(serviceCheck.rows[0].duration_minutes);
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error("Xizmat davomiyligi noto'g'ri");
    }
    const newEnd = newStart + duration * 60 * 1000;
    // Barberning ish jadvalini tekshirish
    const workingHourCheck = await client.query(
      `SELECT
      (
      local_booking>=local_booking::date+start_time
      AND
      local_booking+($3*INTERVAL '1 minute')<=local_booking::date+end_time
      ) AS fits
       FROM barber_working_hours
       CROSS JOIN(
       SELECT $2::timestamptz AT TIME ZONE 'Asia/Tashkent'
        AS local_booking
       ) AS booking
        WHERE barber_id=$1
         AND day_of_week=EXTRACT(DOW FROM local_booking)::int
      `,
      [barber_id, booking_time, duration],
    );
    if (workingHourCheck.rowCount === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(400).json({
        message: "Barber bu kuni ishlamaydi",
      });
    }
    if (!workingHourCheck.rows[0].fits) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(400).json({
        message: "Bron barberning ish vaqtidan tashqarida",
      });
    }
    // 8. Barberning mavjud bronlarini tekshirish
    const bookingTimeCheck = await client.query(
      `SELECT
         bookings.id,
         bookings.booking_time,
         bookings.booking_time
           + (services.duration_minutes * INTERVAL '1 minute')
           AS booking_end
       FROM bookings
       JOIN services ON services.id = bookings.service_id
       WHERE bookings.barber_id = $1
         AND bookings.status <> $2`,
      [barber_id, "cancelled"],
    );
    // 9. Vaqtlar bir-biriga to'g'ri keladimi?
    const conflict = bookingTimeCheck.rows.some((booking) => {
      const existingStart = new Date(booking.booking_time).getTime();
      const existingEnd = new Date(booking.booking_end).getTime();
      return newStart < existingEnd && newEnd > existingStart;
    });
    if (conflict) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(409).json({
        message: "Bu vaqt band",
      });
    }
    // 10. Yangi bronni saqlash
    const result = await client.query(
      `INSERT INTO bookings
         (customer_id, barber_id, service_id, booking_time)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [customer_id, barber_id, service_id, booking_time],
    );
    // 11. Transactionni tasdiqlash
    await client.query("COMMIT");
    transactionStarted = false;
    return res.status(201).json({
      message: "Booking yaratildi",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("createBooking xatosi:", error.message);
    // Xatoda transactionni bekor qilishga urinish
    if (client && transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("ROLLBACK xatosi:", rollbackError.message);
      } finally {
        transactionStarted = false;
      }
    }
    if (error.code === "23503") {
      return res.status(400).json({
        message: "Mijoz, sartarosh yoki xizmat topilmadi",
      });
    }
    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  } finally {
    if (client) {
      client.release();
    }
  }
}
// Booking statusini yangilash

async function refreshStatus(req, res) {
  let client;
  let transactionStarted = false;

  try {
    client = await pool.connect();

    const id = Number(req.params.id);
    const { status } = req.body;
    const role = req.user.role;
    const userId = req.user.id;

    // 1. Oddiy tekshiruvlar — transactiondan oldin
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        message: "ID kiritishda xatolik",
      });
    }

    if (!["customer", "barber"].includes(role)) {
      return res.status(403).json({
        message: "Bu amal uchun ruxsat yo'q",
      });
    }

    if (role === "customer" && status !== "cancelled") {
      return res.status(403).json({
        message: "Mijoz faqat bookingni bekor qilishi mumkin",
      });
    }

    // 2. Transactionni boshlash
    await client.query("BEGIN");
    transactionStarted = true;

    // 3. Bookingni egasiga tegishli ekanini tekshirish
    const bookingQuery =
      role === "customer"
        ? `SELECT
             bookings.id,
             bookings.status,
             bookings.booking_time,
             services.duration_minutes
           FROM bookings
           JOIN services ON bookings.service_id = services.id
           WHERE bookings.id = $1
             AND bookings.customer_id = $2
           FOR UPDATE OF bookings`
        : `SELECT
             bookings.id,
             bookings.status,
             bookings.booking_time,
             services.duration_minutes
           FROM bookings
           JOIN services ON bookings.service_id = services.id
           WHERE bookings.id = $1
             AND bookings.barber_id = $2
           FOR UPDATE OF bookings`;

    const booking = await client.query(bookingQuery, [id, userId]);

    if (booking.rowCount === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(404).json({
        message: "Booking topilmadi",
      });
    }

    const currentBooking = booking.rows[0];
    const currentStatus = currentBooking.status;
    const bookingTime = new Date(currentBooking.booking_time);
    const duration = Number(currentBooking.duration_minutes);

    if (
      !Number.isFinite(bookingTime.getTime()) ||
      !Number.isFinite(duration) ||
      duration <= 0
    ) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(500).json({
        message: "Booking vaqti yoki xizmat davomiyligi bazada noto'g'ri",
      });
    }

    const bookingEndTime = new Date(
      bookingTime.getTime() + duration * 60 * 1000,
    );

    // 4. Ruxsat etilgan status o'tishlari
    const allowedTransitions = {
      pending: ["confirmed", "cancelled"],
      confirmed: ["completed", "cancelled"],
      completed: [],
      cancelled: [],
    };

    if (!allowedTransitions[currentStatus]?.includes(status)) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(400).json({
        message: "Bu statusga o'tish mumkin emas",
      });
    }

    // 5. Bookingni faqat barber yakunlay oladi
    if (status === "completed") {
      if (role !== "barber") {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return res.status(403).json({
          message: "Faqat barber bookingni yakunlashi mumkin",
        });
      }

      if (bookingEndTime.getTime() > Date.now()) {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return res.status(400).json({
          message: "Xizmat tugash vaqti hali kelmagan",
        });
      }
    }

    // 6. Statusni yangilash
    const updateQuery =
      role === "customer"
        ? `UPDATE bookings
           SET status = $1
           WHERE id = $2
             AND customer_id = $3
             AND status = $4
           RETURNING *`
        : `UPDATE bookings
           SET status = $1
           WHERE id = $2
             AND barber_id = $3
             AND status = $4
           RETURNING *`;

    const result = await client.query(updateQuery, [
      status,
      id,
      userId,
      currentStatus,
    ]);

    if (result.rowCount === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(409).json({
        message: "Booking holati o'zgargan. Qayta urinib ko'ring",
      });
    }

    // 7. Muvaffaqiyatli bo'lsa, saqlash
    await client.query("COMMIT");
    transactionStarted = false;

    return res.json({
      message: "Booking holati yangilandi",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("refreshStatus xatosi:", error.message);

    if (transactionStarted && client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Rollback xatosi:", rollbackError.message);
      }
    }

    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  } finally {
    if (client) {
      client.release();
    }
  }
}

// Bookingni o'chirish
async function deleteBooking(req, res) {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        message: "ID kiritishda xatolik",
      });
    }

    if (!["customer", "barber"].includes(req.user.role)) {
      return res.status(403).json({
        message: "Bu amal uchun ruxsat yo'q",
      });
    }

    let result;

    if (req.user.role === "customer") {
      result = await pool.query(
        `UPDATE bookings SET status='cancelled'
         WHERE id = $1 AND customer_id = $2 AND status IN ('pending','confirmed')
         RETURNING *`,
        [id, req.user.id],
      );
    } else {
      result = await pool.query(
        `UPDATE bookings
        SET status='cancelled'
        WHERE id=$1
          AND barber_id=$2
          AND status IN('pending','confirmed')
          RETURNING *`,
        [id, req.user.id],
      );
    }

    if (result.rowCount === 0) {
      return res.status(404).json({
        message: "Booking topilmadi",
      });
    }

    return res.json({
      message: "Booking bekor qilindi",
    });
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      message: "Serverda xatolik yuz berdi",
    });
  }
}
module.exports = {
  deleteBooking,
  refreshStatus,
  createBooking,
  getBookingById,
  getBooking,
  getAvailableSlots,
};
