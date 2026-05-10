const cors = require("cors");

// Asana requires CORS from app.asana.com origin
const asanaCors = cors({
  origin: "https://app.asana.com",
});

module.exports = { asanaCors };
