const crypto = require("crypto");

/**
 * Middleware to validate Asana request timeliness and (optionally) signature.
 * 
 * - Rejects expired requests based on `expires_at` param
 * - Validates HMAC-SHA256 signature when CLIENT_SECRET is configured
 */
function validateAsanaRequest(req, res, next) {
  // 1. Check timeliness
  const expiresAt = req.query.expires_at || req.body?.expires_at;
  if (expiresAt) {
    const now = new Date();
    const expiry = new Date(expiresAt);
    if (now.getTime() > expiry.getTime()) {
      console.warn("[Security] Request expired:", expiresAt);
      return res.status(400).json({ error: "Request expired" });
    }
  }

  // 2. Validate signature (only if CLIENT_SECRET is set)
  const secret = process.env.ASANA_CLIENT_SECRET;
  if (secret && secret !== "your-client-secret") {
    const signature = req.headers["x-asana-request-signature"];
    if (!signature) {
      console.warn("[Security] Missing x-asana-request-signature header");
      return res.status(401).json({ error: "Missing signature" });
    }

    let stringToVerify;
    if (req.method === "POST") {
      // For POST, sign the JSON body's `data` field
      stringToVerify = JSON.stringify(req.body.data || req.body);
    } else {
      // For GET, sign the query string (without leading ?)
      stringToVerify = req._parsedUrl?.query || "";
    }

    const computed = crypto
      .createHmac("sha256", secret)
      .update(stringToVerify)
      .digest("hex");

    if (
      !crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(computed)
      )
    ) {
      console.warn("[Security] Signature mismatch");
      return res.status(401).json({ error: "Invalid signature" });
    }
  }

  next();
}

module.exports = { validateAsanaRequest };
