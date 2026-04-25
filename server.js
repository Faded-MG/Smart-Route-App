import express from "express";
import fs from "fs";
import path from "path";
import { CLIENT_RENEG_LIMIT } from "tls";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const publicDir = path.join(__dirname, "public");
const roadsPath = path.join(__dirname, "../road-closure-bot/data/roads.json");

app.use(express.static(publicDir, { index: "index.html" }));

app.get("/roads", (req, res) => {
  if (!fs.existsSync(roadsPath)) {
    res.status(404).json({ error: "roads.json not found" });
    return;
  }
  const data = fs.readFileSync(roadsPath, "utf-8");
  res.json(JSON.parse(data));
});

app.listen(3000, () => {
   console.log(`Map + static app: http://localhost:3000/`);
  console.log(`Roads API: http://localhost:3000/roads`);
  console.log(`3000 is the port number specified in the .env file or 3001 by default`);
});