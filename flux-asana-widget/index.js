require("dotenv").config();

const express = require("express");
const https = require("https");
const http = require("http");
const fs = require("fs");
const { asanaCors } = require("./middleware/cors");
const { validateAsanaRequest } = require("./middleware/security");

// Routes
const authRoutes = require("./routes/auth");
const widgetRoutes = require("./routes/widget");
const formRoutes = require("./routes/form");

const app = express();
const port = process.env.PORT || 8000;

// --- Middleware ---
app.use(express.json());
app.use(asanaCors);
app.use(validateAsanaRequest);

// --- Request logging ---
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// --- Routes ---
app.get("/", (req, res) => {
  res.json({
    app: "Flux Time Tracker",
    version: "1.0.0",
    status: "running",
    endpoints: {
      auth: "/auth",
      widget: "/widget",
      form_metadata: "/form/metadata",
      form_submit: "/form/submit",
    },
  });
});

app.use("/auth", authRoutes);
app.use("/widget", widgetRoutes);
app.use("/form", formRoutes);

// --- Health check ---
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// --- Start server ---
// Try HTTPS first (for Asana integration), fall back to HTTP for local dev
const keyPath = "./key.pem";
const certPath = "./cert.pem";

if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
  https
    .createServer(
      {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath),
      },
      app
    )
    .listen(port, () => {
      console.log(`\n🚀 Flux Time Tracker (HTTPS) listening on https://localhost:${port}`);
      console.log(`   Widget:  https://localhost:${port}/widget`);
      console.log(`   Form:    https://localhost:${port}/form/metadata`);
      console.log(`   Auth:    https://localhost:${port}/auth\n`);
    });
} else {
  console.log("⚠️  No SSL certs found — starting HTTP server (dev mode)");
  console.log("   For Asana, generate certs:");
  console.log("   openssl req -x509 -newkey rsa:2048 -keyout keytmp.pem -out cert.pem -days 365");
  console.log("   openssl rsa -in keytmp.pem -out key.pem\n");

  http.createServer(app).listen(port, () => {
    console.log(`\n🚀 Flux Time Tracker (HTTP) listening on http://localhost:${port}`);
    console.log(`   Widget:  http://localhost:${port}/widget`);
    console.log(`   Form:    http://localhost:${port}/form/metadata`);
    console.log(`   Auth:    http://localhost:${port}/auth\n`);
  });
}
