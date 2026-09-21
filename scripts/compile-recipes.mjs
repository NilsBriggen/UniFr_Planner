/** Offline compiler. Never derives academic rules from catalogue titles. */
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseDocument } from "yaml";
import Ajv from "ajv";
import {
  assertRecipeRegistry,
  resolveRecipeVariants,
} from "../packages/domain/src/recipes.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const schema = JSON.parse(
  await readFile(resolve(root, "data/programmes/recipes.schema.json"), "utf8"),
);
const validate = new Ajv({ allErrors: true, strict: true }).compile(schema);
const stable = (value) =>
  Array.isArray(value)
    ? value.map(stable)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => [key, stable(value)]),
        )
      : value;
const serialize = (value) => JSON.stringify(stable(value), null, 2) + "\n";

export async function compileRecipes(yaml) {
  const document = parseDocument(yaml, { uniqueKeys: true });
  if (document.errors.length || document.warnings.length)
    throw new Error(
      [...document.errors, ...document.warnings]
        .map((x) => x.message)
        .join("\n"),
    );
  const registry = document.toJS({ maxAliasCount: 0 });
  if (!validate(registry))
    throw new Error(JSON.stringify(validate.errors, null, 2));
  assertRecipeRegistry(registry);
  const variants = resolveRecipeVariants(registry);
  const nodeGaps = (node) =>
    !node
      ? ["Missing requirements"]
      : [
          ...(node.reviewStatus !== "verified"
            ? [`Unreviewed requirement: ${node.id}`]
            : []),
          ...(!node.citations.length ||
          node.citations.some(
            (c) =>
              !c.url.startsWith("https://") ||
              !c.title ||
              !c.section ||
              !c.cohort ||
              !c.retrievedAt ||
              !c.revisionDate,
          )
            ? [`Incomplete source citation: ${node.id}`]
            : []),
          ...("children" in node ? node.children.flatMap(nodeGaps) : []),
        ];
  const programmeGaps = registry.programmes
    .map((p) => ({
      programmeId: p.id,
      title: p.title,
      faculty: p.faculty,
      gaps: [
        ...p.gaps,
        ...(p.reviewStatus !== "verified"
          ? ["Programme review incomplete"]
          : []),
        ...(!p.sourceIds.length ||
        p.sourceIds.some(
          (id) =>
            registry.sources.find((s) => s.id === id)?.reviewStatus !==
            "verified",
        )
          ? ["Programme source review incomplete"]
          : []),
      ],
      variants: p.variants
        .map((raw) => {
          const v = variants.get(`${p.id}/${raw.id}`);
          return {
            id: v.id,
            gaps: [
              ...v.gaps,
              ...(v.reviewStatus !== "verified"
                ? ["Component review incomplete"]
                : []),
              ...(!v.applicableFrom ? ["Missing cohort applicability"] : []),
              ...nodeGaps(v.requirements),
            ],
          };
        })
        .filter((v) => v.gaps.length),
      sourceIds: p.sourceIds,
      curriculumUrls: p.curriculumUrls ?? [],
    }))
    .filter((p) => p.gaps.length || p.variants.length);
  const report = {
    edition: registry.edition,
    directoryEntries: registry.coverage.length,
    programmes: registry.programmes.length,
    variants: registry.programmes.reduce((n, p) => n + p.variants.length, 0),
    fullyReviewed: registry.programmes.length - programmeGaps.length,
    programmesWithGaps: programmeGaps.length,
    dispositions: Object.fromEntries(
      ["recipe", "alias", "excluded", "source_gap"].map((kind) => [
        kind,
        registry.coverage.filter((x) => x.disposition === kind).length,
      ]),
    ),
    gaps: programmeGaps,
  };
  return { registry: stable(registry), report: stable(report) };
}

async function atomicWrite(path, body) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = path + ".tmp";
  await writeFile(temporary, body);
  await rename(temporary, path);
}
async function main() {
  const write = process.argv.includes("--write");
  const { registry, report } = await compileRecipes(
    await readFile(resolve(root, "data/programmes/recipes.yaml"), "utf8"),
  );
  for (const source of registry.sources) {
    if (!source.archive) continue;
    const file = resolve(root, source.archive);
    if (
      relative(resolve(root, "data/programmes/sources"), file).startsWith("..")
    )
      throw new Error("Source archive outside source directory: " + source.id);
    const raw = await readFile(file),
      bytes = file.endsWith(".gz") ? gunzipSync(raw) : raw;
    if (createHash("sha256").update(bytes).digest("hex") !== source.sha256)
      throw new Error("Source archive digest mismatch: " + source.id);
  }
  const outputs = [
    ["packages/domain/src/recipe-registry.json", registry],
    ["data/programmes/coverage-report.json", report],
    [
      "data/programmes/recipe-source-monitor.json",
      {
        edition: registry.edition,
        purpose:
          "Change detection only. Changed digests never update recipe rules automatically.",
        documents: registry.sources
          .filter((s) => s.sha256)
          .map((s) => ({
            id: s.id,
            url: s.url,
            sha256: s.sha256,
            contentSha256: s.contentSha256,
            programmeIds: registry.programmes
              .filter(
                (p) => s.id === "directory-index" || p.sourceIds.includes(s.id),
              )
              .map((p) => p.id),
          })),
      },
    ],
  ];
  for (const [file, value] of outputs) {
    const path = resolve(root, file),
      content = serialize(value);
    if (write) await atomicWrite(path, content);
    else if ((await readFile(path, "utf8").catch(() => null)) !== content)
      throw new Error(file + " is stale; run npm run recipes:build");
  }
  console.log(
    `${registry.edition}: ${report.programmes} programmes, ${report.variants} variants; ${report.fullyReviewed} fully reviewed, ${report.programmesWithGaps} with documented gaps.`,
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
