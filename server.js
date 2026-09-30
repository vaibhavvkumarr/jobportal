require("dotenv").config();
const express = require("express");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const { MongoClient, GridFSBucket, ObjectId } = require("mongodb");

const app = express();
const PORT = process.env.PORT || 3000;
const fs = require("fs");

// Monthly price in rupees: change PRICE_INR in .env, then restart the server.
const PRICE_INR = Number(process.env.PRICE_INR) || 499;
if (!Number.isInteger(PRICE_INR) || PRICE_INR < 1) throw new Error("PRICE_INR must be a whole number of rupees, e.g. 500");
const indexHtml = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf8")
  .replaceAll("{{PRICE}}", PRICE_INR.toLocaleString("en-IN"))
  .replaceAll("{{PER_DAY}}", PRICE_INR >= 300 ? Math.round(PRICE_INR / 30) : (PRICE_INR / 30).toFixed(2));

const RESUME_TYPES = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
};

// MongoDB: customer details in the "applications" collection, CV files in GridFS ("resumes" bucket).
const mongo = process.env.MONGODB_URI ? new MongoClient(process.env.MONGODB_URI) : null;
const db = mongo?.db(process.env.MONGODB_DB || "jobalert");
const applications = db?.collection("applications");
const resumes = db ? new GridFSBucket(db, { bucketName: "resumes" }) : null;
if (mongo) {
  // The old unique paymentId index (from the Razorpay version) would reject every signup without a payment ID.
  applications.dropIndex("paymentId_1").catch(() => {})
    .then(() => applications.createIndex({ createdAt: -1 }))
    .then(() => console.log("Connected to MongoDB"))
    .catch(e => console.error("MongoDB connection failed:", e.message));
} else {
  console.warn("MongoDB is not configured: set MONGODB_URI in .env");
}

// Basic spam protection: each IP can submit at most 5 times per hour.
const submissions = new Map();
function rateLimit(req, res, next) {
  const now = Date.now();
  const recent = (submissions.get(req.ip) || []).filter(t => now - t < 60 * 60 * 1000);
  if (recent.length >= 5) return res.status(429).json({ error: "Too many submissions. Please try again later or contact us on WhatsApp." });
  recent.push(now);
  submissions.set(req.ip, recent);
  next();
}

// Keep the upload in memory until the details are validated.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const ok = path.extname(file.originalname).toLowerCase() in RESUME_TYPES;
    cb(ok ? null : new Error("Only PDF, DOC and DOCX resumes are allowed."), ok);
  }
});

// Hosts like Render/Railway sit behind a proxy; this makes req.ip the visitor's real IP.
app.set("trust proxy", 1);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.get(["/", "/index.html"], (_, res) => res.type("html").send(indexHtml));
app.use(express.static(path.join(__dirname, "public")));

app.post("/api/submit-application", rateLimit, upload.single("resume"), async (req, res) => {
  let resumeId;
  try {
    if (!mongo) return res.status(503).json({ error: "Storage is not configured yet." });
    const { name, jobTitle, experience, location, whatsapp } = req.body;
    if (!req.file) return res.status(400).json({ error: "Resume is required." });
    if (!name?.trim() || !jobTitle?.trim() || !experience?.trim() || !location?.trim() || !whatsapp) {
      return res.status(400).json({ error: "Please fill in all the details." });
    }

    // Accept 10-digit Indian mobile numbers, with or without +91 / 0 prefix.
    const phone = String(whatsapp).replace(/\D/g, "").replace(/^(91|0)(?=\d{10}$)/, "");
    if (!/^[6-9]\d{9}$/.test(phone)) {
      return res.status(400).json({ error: "Please enter a valid 10-digit WhatsApp number." });
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    const safeName = name.trim().replace(/[^\w\- ]+/g, "").slice(0, 60) || "resume";
    const fileName = `${safeName} - ${phone}${ext}`;
    resumeId = await saveResume(fileName, req.file.buffer, RESUME_TYPES[ext]);

    const result = await applications.insertOne({
      name: name.trim(),
      jobTitle: jobTitle.trim(),
      experience: experience.trim(),
      location: location.trim(),
      whatsapp: phone,
      resume: { fileId: resumeId, fileName, contentType: RESUME_TYPES[ext], size: req.file.size },
      priceInr: PRICE_INR,
      paymentStatus: "pending",
      createdAt: new Date()
    });

    res.json({ success: true, applicationId: result.insertedId });
  } catch (e) {
    if (resumeId) await resumes.delete(resumeId).catch(() => {});
    console.error("Submission failed:", e.message);
    res.status(500).json({ error: "Could not save your details. Please contact support." });
  }
});

function saveResume(fileName, buffer, contentType) {
  return new Promise((resolve, reject) => {
    const stream = resumes.openUploadStream(fileName, { metadata: { contentType } });
    stream.once("finish", () => resolve(stream.id)).once("error", reject);
    stream.end(buffer);
  });
}

// ---- Admin: view customers and download CVs (browser asks for ADMIN_PASSWORD) ----
function requireAdmin(req, res, next) {
  const password = process.env.ADMIN_PASSWORD;
  const [scheme, encoded] = (req.headers.authorization || "").split(" ");
  const given = scheme === "Basic" ? Buffer.from(encoded || "", "base64").toString().split(":").slice(1).join(":") : "";
  const ok = password && given.length === password.length &&
    crypto.timingSafeEqual(Buffer.from(given), Buffer.from(password));
  if (ok) return next();
  res.set("WWW-Authenticate", 'Basic realm="JobAlertPro Admin"').status(401).send("Login required.");
}

const escapeHtml = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

app.get("/admin", requireAdmin, async (req, res) => {
  if (!mongo) return res.status(503).send("MongoDB is not configured.");
  const rows = await applications.find().sort({ createdAt: -1 }).limit(1000).toArray();
  const body = rows.map(r => `<tr>
      <td>${escapeHtml(r.createdAt?.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }))}</td>
      <td>${escapeHtml(r.name)}</td>
      <td><a href="https://wa.me/91${escapeHtml(String(r.whatsapp).replace(/\D/g, "").slice(-10))}">${escapeHtml(r.whatsapp)}</a></td>
      <td>${escapeHtml(r.jobTitle)}</td>
      <td>${escapeHtml(r.experience)}</td>
      <td>${escapeHtml(r.location)}</td>
      <td><a href="/admin/resume/${r.resume?.fileId}">Download</a></td>
      <td><form method="post" action="/admin/applications/${r._id}/status">
        <span class="status ${r.paymentStatus === "paid" ? "paid" : "pending"}">${r.paymentStatus === "paid" ? "Paid" : "Pending"}</span>
        <button name="status" value="${r.paymentStatus === "paid" ? "pending" : "paid"}">${r.paymentStatus === "paid" ? "Undo" : "Mark paid"}</button>
      </form></td>
    </tr>`).join("");
  const pending = rows.filter(r => r.paymentStatus !== "paid").length;
  res.send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>JobAlertPro Admin</title><style>
body{font:14px system-ui,sans-serif;margin:24px;background:#0a0a0c;color:#f4f1ea}h1{font-size:20px}
table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:10px;border-bottom:1px solid #2a2a2f;white-space:nowrap}
th{color:#d9b877;font-weight:600}a{color:#f3dcaa}.wrap{overflow-x:auto}form{margin:0;display:flex;gap:10px;align-items:center}
.status{padding:3px 9px;border-radius:99px;font-size:12px}.paid{background:#1e3a2a;color:#8fe0a9}.pending{background:#3a2e1a;color:#f3c77a}
button{font:inherit;font-size:12px;padding:4px 10px;border-radius:6px;border:1px solid #444;background:#1a1a20;color:#f4f1ea;cursor:pointer}
</style></head><body><h1>Customers (${rows.length}) · ${pending} awaiting payment</h1><div class="wrap"><table>
<tr><th>Submitted</th><th>Name</th><th>WhatsApp</th><th>Job Title</th><th>Experience</th><th>Location</th><th>CV</th><th>Payment</th></tr>
${body || '<tr><td colspan="8">No customers yet.</td></tr>'}</table></div></body></html>`);
});

app.post("/admin/applications/:id/status", requireAdmin, async (req, res) => {
  // Only accept this form from the admin page itself (blocks cross-site form posts).
  const origin = req.get("origin") || req.get("referer") || "";
  if (origin && new URL(origin).host !== req.get("host")) return res.status(403).send("Forbidden.");
  if (!mongo || !ObjectId.isValid(req.params.id) || !["paid", "pending"].includes(req.body.status)) {
    return res.status(400).send("Bad request.");
  }
  await applications.updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: { paymentStatus: req.body.status, paymentUpdatedAt: new Date() } }
  );
  res.redirect("/admin");
});

app.get("/admin/resume/:id", requireAdmin, async (req, res) => {
  if (!mongo || !ObjectId.isValid(req.params.id)) return res.status(404).send("Not found.");
  const id = new ObjectId(req.params.id);
  const file = await resumes.find({ _id: id }).next();
  if (!file) return res.status(404).send("Not found.");
  res.set("Content-Type", file.metadata?.contentType || "application/octet-stream");
  res.attachment(file.filename);
  resumes.openDownloadStream(id).on("error", () => res.end()).pipe(res);
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err.message) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

app.listen(PORT, () => console.log(`Job Alert Service running at http://localhost:${PORT}`));
