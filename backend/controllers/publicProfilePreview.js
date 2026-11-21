"use strict";
const { createPublicPreviewHandler } = require("../services/publicProfilePreview");
const { createBarberProfileService } = require("../services/barberProfile");
const pool = require("../db");
const service = createBarberProfileService(pool);
// Use exact deployment origins; never derive from untrusted Host / X-Forwarded-Host.
module.exports = createPublicPreviewHandler({
  findPublic: id => service.getPublic(id),
  previewOrigin: process.env.PUBLIC_PROFILE_PREVIEW_ORIGIN,
  appUrlBase: process.env.PUBLIC_PROFILE_APP_BASE_URL,
  allowDevelopmentHttp: process.env.NODE_ENV !== "production",
});
