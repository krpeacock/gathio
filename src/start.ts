import mongoose from "mongoose";
import { getConfig } from "./lib/config.js";
import app from "./app.js";
import { generateRecurringEvents } from "./lib/recurrence.js";

const config = getConfig();

mongoose.connect(config.database.mongodb_url, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
mongoose.set("useCreateIndex", true);
mongoose.set("useFindAndModify", false);
mongoose.Promise = global.Promise;
mongoose.connection
  .on("connected", () => {
    console.log("Mongoose connection open!");
  })
  .on("error", (err: Error) => {
    console.log(`Connection error: ${err.message}`);
  });

app.listen(config.general.port, () => {
  console.log(
    `Welcome to gathio! The app is now running on http://localhost:${config.general.port}`,
  );
});

const MS_PER_DAY = 24 * 60 * 60 * 1000;

mongoose.connection.once("connected", () => {
  generateRecurringEvents().catch((err) =>
    console.error("Recurrence generation failed on startup:", err),
  );
  setInterval(() => {
    generateRecurringEvents().catch((err) =>
      console.error("Recurrence generation failed:", err),
    );
  }, MS_PER_DAY);
});
