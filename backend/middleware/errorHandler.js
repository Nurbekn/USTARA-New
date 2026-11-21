function notFound(req, res) {
  return res.status(404).json({
    message: "Endpoint topilmadi",
    code: "not_found",
  });
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err?.type === "entity.parse.failed" && err.status === 400) {
    return res.status(400).json({
      message: "JSON formati noto'g'ri",
      code: "invalid_json",
    });
  }

  return res.status(500).json({
    message: "Serverda xatolik yuz berdi",
    code: "internal_error",
  });
}

module.exports = { notFound, errorHandler };
