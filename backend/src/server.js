import "dotenv/config";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import routes from "./routes/index.js";

const app = express();
app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json({ limit: "20kb" }));
app.use("/api", routes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Server error." });
});

await mongoose.connect(process.env.MONGODB_URI);
const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Support agent API on http://localhost:${port}`));
