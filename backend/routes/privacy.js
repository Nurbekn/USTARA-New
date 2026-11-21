'use strict';
const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const pool = require('../db');
const { createExportHandler } = require('../controllers/privacyExportV183');
router.get('/export', auth, createExportHandler({connect:()=>pool.connect()}));
module.exports = router;
