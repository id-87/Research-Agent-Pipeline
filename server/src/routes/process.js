const express = require("express");
const multer = require("multer");
const XLSX = require("xlsx");
const { runPipeline } = require("../lib/pipeline");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function parseFileToRows(buffer, originalname) {
  const ext = (originalname || "").split(".").pop().toLowerCase();
  let workbook;
  if (ext === "csv") {
    const csvText = buffer.toString("utf8");
    workbook = XLSX.read(csvText, { type: "string" });
  } else {
    workbook = XLSX.read(buffer, { type: "buffer" });
  }
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
}

router.post("/upload", upload.single("file"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file received. Please select a file before uploading." });
    }

    const rows = parseFileToRows(req.file.buffer, req.file.originalname);

    const companies = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      const firstCell = String(row[0] || "").trim();
      if (!firstCell) continue;

      const lowerFirst = firstCell.toLowerCase();
      const isHeader =
        i === 0 &&
        (lowerFirst === "company" ||
          lowerFirst === "company name" ||
          lowerFirst === "name" ||
          lowerFirst === "companies" ||
          lowerFirst === "s.no" ||
          lowerFirst === "sr no" ||
          lowerFirst === "sr." ||
          lowerFirst === "#");
      if (isHeader) continue;

      companies.push({
        name: firstCell,
        location: String(row[1] || "").trim(),
      });
    }

    if (companies.length === 0) {
      return res.status(400).json({
        error: "No companies found. Make sure Column A contains company names.",
      });
    }

    if (companies.length > 20) {
      return res.status(400).json({
        error: "Found " + companies.length + " rows. Maximum is 20 per batch.",
      });
    }

    return res.json({ companies, total: companies.length });
  } catch (err) {
    console.error("Upload error:", err);
    return res.status(500).json({ error: "File parse failed: " + err.message });
  }
});

router.post("/run", async (req, res) => {
  const { companies } = req.body;
  if (!companies || !Array.isArray(companies) || companies.length === 0) {
    return res.status(400).json({ error: "No companies provided" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  const sendEvent = (data) => {
    res.write("data: " + JSON.stringify(data) + "\n\n");
  };

  sendEvent({ type: "start", total: companies.length });

  for (let i = 0; i < companies.length; i++) {
    const { name, location } = companies[i];
    sendEvent({ type: "progress", index: i, company: name, status: "processing" });

    const result = await runPipeline(name, location);
    sendEvent({ type: "result", index: i, data: result });
  }

  sendEvent({ type: "done" });
  res.end();
});

module.exports = router;
