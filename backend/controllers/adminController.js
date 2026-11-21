const pool = require("../db");
const { createAdminLogin } = require("../services/loginAuthentication");

const adminLogin = createAdminLogin(pool);
module.exports = { adminLogin };
