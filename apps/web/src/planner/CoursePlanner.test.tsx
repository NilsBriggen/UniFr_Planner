import { expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import CoursePlanner from "./CoursePlanner";
import {
  publishedCourses,
  publishedPlan,
  publishedStatus,
} from "./published-fixture";
import { activeScenario, type Plan } from "./domain";

const save = vi.fn<(plan: Plan) => Promise<boolean>>(async () => true);
const plan = publishedPlan();
plan.scenarios[0].courses = [];
vi.mock("./context", () => ({
  usePlans: () => ({ plan, ready: true, busy: false, save }),
}));

it("can save a new course unscheduled through the allocation disclosure", async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <CoursePlanner
        offering={publishedCourses()[0].offerings[0]}
        status={publishedStatus}
        language="en"
      />
    </MemoryRouter>,
  );
  await user.click(screen.getByText("Change semester"));
  await user.selectOptions(screen.getByLabelText("Semester"), "");
  await user.click(screen.getByRole("button", { name: /add/i }));
  expect(save).toHaveBeenCalledOnce();
  expect(activeScenario(save.mock.calls[0][0]).courses[0]).toMatchObject({
    status: "unscheduled",
    semester: null,
  });
});
