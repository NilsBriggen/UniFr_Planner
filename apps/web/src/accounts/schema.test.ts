import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { z } from "zod";
import { planSchema, parsePlan } from "../planner/domain";

it("keeps the server snapshot structure identical to the guest Zod schema", () => {
  expect(
    JSON.parse(readFileSync("../api/unifr_api/guest-plan.schema.json", "utf8")),
  ).toEqual(z.toJSONSchema(planSchema));
});

const parity = JSON.parse(
  readFileSync("../api/tests/fixtures/account-plan-parity.json", "utf8"),
);
for (const testCase of parity.cases) {
  it(`shared server/browser behavioral parity: ${testCase.name}`, () => {
    const value = { ...parity.base, ...testCase.patch };
    if (testCase.valid) expect(parsePlan(JSON.stringify(value))).toEqual(value);
    else expect(() => parsePlan(JSON.stringify(value))).toThrow();
  });
}
it("rejects non-finite numbers before any JSON serialization", () => {
  for (const targetEcts of [NaN, Infinity, -Infinity])
    expect(planSchema.safeParse({ ...parity.base, targetEcts }).success).toBe(
      false,
    );
});
