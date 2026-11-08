const jwt = require("jsonwebtoken");

// JWT tokenni tekshirish
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      message: "Token yuborilmagan",
    });
  }
  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (
      !Number.isInteger(decoded.id) ||
      decoded.id <= 0 ||
      !["customer", "barber", "admin"].includes(decoded.role)
    ) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    req.user = decoded;

    next();
  } catch (error) {
    return res.status(401).json({
      message: "Token noto'g'ri yoki muddati tugagan",
    });
  }
}
module.exports = authMiddleware;
