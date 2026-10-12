import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
const crons = cronJobs();
crons.interval(
  "Evaluate care and delivery queues",
  { minutes: 15 },
  internal.engine.run,
);
export default crons;
