require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const processRouter = require("./routes/process");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.use("/api", processRouter);

if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "../../client/build")));
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "../../client/build", "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`Brokai server running on port ${PORT}`);
});
