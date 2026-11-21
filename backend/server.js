const express = require("express");
const cors = require("cors");
const { createOriginPolicy } = require("./middleware/originPolicy");
require("dotenv").config();

if(!process.env.JWT_SECRET){
  console.error("JWT_SECRET .env faylida topilmadi");
  process.exit(1)
}

const pool = require("./db");

const app = express();
// Forwarding headers cannot identify login clients. Reverse-proxy deployments
// need reviewed edge rate limits / explicit trusted-proxy configuration.
app.set("trust proxy", false);
const PORT = process.env.PORT || 5000;
const customersRouter = require("./routes/customers");
const barbersRouter = require("./routes/barbers");
const servicesRouter = require("./routes/services");
const bookingsRouter = require("./routes/bookings");
const adminRouter=require("./routes/admin");
const diagnosticsRouter = require("./routes/diagnostics");
const authRouter = require("./routes/auth");
const socialRouter = require("./routes/social");
const socialController = require("./controllers/socialController");
const authMiddleware = require("./middleware/authMiddleware");
const { notFound, errorHandler } = require("./middleware/errorHandler");
const originPolicy = createOriginPolicy();
app.use((req, res, next) => {
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Referrer-Policy", "no-referrer");
  res.set("X-Frame-Options", "DENY");
  next();
});
app.use(originPolicy.guard, cors(originPolicy.corsOptions));
app.post("/api/media", express.raw({ type: "application/octet-stream", limit: "100mb" }), authMiddleware, socialController.mediaUpload);
app.get("/api/media/:id", socialController.mediaRead);
app.use("/api/barbers", (req, res, next) => {
  if (req.method === "PUT" && /^\/\d+$/.test(req.path)) {
    return express.json({ limit: "1mb" })(req, res, next);
  }
  return next();
});
app.use("/api/customers", (req, res, next) => {
  if (req.method === "PUT" && /^\/\d+$/.test(req.path)) {
    return express.json({ limit: "1mb" })(req, res, next);
  }
  return next();
});
app.use(express.json());

// Server ishlayotganini tekshirish
app.get("/", (req, res) => {
  return res.json({
    message: "Ustara backend ishlayapti!",
  });
});

// Backend va PostgreSQL ulanishini tekshirish
app.get("/api/health", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW() AS vaqt");

    return res.json({
      message: "Backend va PostgreSQL muvaffaqiyatli ulandi!",
      databaseTime: result.rows[0].vaqt,
    });
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      message: "PostgreSQL bilan ulanishda xatolik yuz berdi",
    });
  }
});
// Launch readiness is stricter than /api/health: required business tables must exist.
app.get('/api/ready', require('./controllers/releaseReadiness').createReleaseReadiness({ pool }));
// v135: bot-readable OG page. A public deployment should serve /share/barbers/:id
// from this backend and link to the actual React app via PUBLIC_PROFILE_APP_BASE_URL.
app.use("/share-assets", express.static(require("node:path").join(__dirname, "public", "share-assets"), {
  maxAge: "1d", index: false, dotfiles: "deny", fallthrough: false,
}));
app.get("/share/barbers/:id", require("./controllers/publicProfilePreview"));
app.use("/api/barbers", barbersRouter);
app.use("/api/shops", require("./routes/shops"));
app.use("/api/customers", customersRouter);
app.use("/api/services", servicesRouter);
app.use("/api/bookings", bookingsRouter);
app.use("/api/privacy", require("./routes/privacy"));
app.use("/api/queue", require("./routes/queue"));
app.use("/api/admin",adminRouter);
app.get("/api/promotions", require("./controllers/adminPromotions").publicList);
app.use("/api/auth", authRouter);
app.use("/api/social", socialRouter);
app.use("/api/chat", require("./routes/chat"));
app.use("/api/ai", require("./ai/router").router);
app.use("/api/diagnostics", diagnosticsRouter);
app.use(notFound);
app.use(errorHandler);
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server http://localhost:${PORT} da ishlayapti`);
  });
}

module.exports = app;
