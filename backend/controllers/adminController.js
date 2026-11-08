const jwt = require("jsonwebtoken");

async function adminLogin(req, res) {
  const { login, password } = req.body;

  if (!login || !password) {
    return res.status(400).json({
      message: "Login va parol kiritilishi shart",
    });
  }

  if (
    login !== process.env.ADMIN_LOGIN ||
    password !== process.env.ADMIN_PASSWORD
  ) {
    return res.status(401).json({
      message: "Login yoki parol noto'g'ri",
    });
  }

  try {
    const token = jwt.sign({ role: "admin", id: 1 }, process.env.JWT_SECRET, {
      expiresIn: "2h",
    });

    return res.status(200).json({
      message: "Admin tizimga muvaffaqiyatli kirdi",
      token,
      role: "admin",
    });
  } catch (error) {
    console.error("adminLogin error:", error);

    return res.status(500).json({
      message: "Server xatosi",
    });
  }
}

module.exports = { adminLogin };
