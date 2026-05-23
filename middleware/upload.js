const multer = require("multer");
const path   = require("path");
const fs     = require("fs");

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename:    (req, file, cb) => {
    const ext  = path.extname(file.originalname);
    const name = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, name);
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = ["image/jpeg","image/png","image/webp","application/pdf"];
  allowed.includes(file.mimetype) ? cb(null, true) : cb(new Error("Only JPEG/PNG/PDF allowed"));
};

const MAX_MB = parseInt(process.env.MAX_FILE_SIZE_MB || "5");

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_MB * 1024 * 1024 }
});

module.exports = upload;
