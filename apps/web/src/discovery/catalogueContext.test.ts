import { afterEach, expect, it } from "vitest";
import { catalogueLinkFor, rememberCatalogueContext } from "./catalogueContext";

afterEach(() => sessionStorage.clear());

it("remembers applied course context per plan and scenario without overriding explicit links", () => {
  rememberCatalogueContext("p", "s", new URLSearchParams("term=SS-2027&faculty=Psychology&language=fr&focus=all&offset=20"));
  expect(catalogueLinkFor("p", "s")).toBe("/catalogue?term=SS-2027&faculty=Psychology&language=fr&focus=all&offset=20");
  expect(catalogueLinkFor("other", "s")).toBe("/catalogue");
  expect(catalogueLinkFor("p", "other")).toBe("/catalogue");
  expect(catalogueLinkFor("p", "s", "?q=Law")).toBe("/catalogue?q=Law");
});
