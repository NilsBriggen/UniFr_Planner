// Generated contract: structural schema comes directly from the guest planner.
// Cross-field invariants are mirrored in account_models.py and parity-tested.
import { writeFileSync } from "node:fs";
import { z } from "zod";
import { planSchema } from "../apps/web/src/planner/domain.ts";
writeFileSync(
  "apps/api/unifr_api/guest-plan.schema.json",
  JSON.stringify(z.toJSONSchema(planSchema), null, 2) + "\n",
);
