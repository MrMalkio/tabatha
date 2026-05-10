const express = require("express");
const path = require("path");
const router = express.Router();

// Auth endpoint — serves the OAuth success page
// In production, this would handle the full OAuth flow
router.get("/", (req, res) => {
  console.log("[Auth] OAuth flow triggered");
  res.sendFile(path.join(__dirname, "..", "auth.html"));
});

module.exports = router;
