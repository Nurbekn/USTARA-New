const express = require("express");
const {
  allowLocalhostOnly,
  getDatabaseDiagnostics,
} = require("../controllers/diagnosticsController");

const router = express.Router();

router.get("/database", allowLocalhostOnly, getDatabaseDiagnostics);

module.exports = router;
