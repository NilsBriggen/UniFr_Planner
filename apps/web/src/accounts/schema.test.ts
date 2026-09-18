import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { z } from "zod";
import { planSchema } from "../planner/domain";

it("keeps the server snapshot structure identical to the guest Zod schema", () => {
  expect(
    JSON.parse(readFileSync("../api/unifr_api/guest-plan.schema.json", "utf8")),
  ).toEqual(z.toJSONSchema(planSchema));
});
