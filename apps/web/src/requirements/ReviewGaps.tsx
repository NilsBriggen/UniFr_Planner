import { recipeRegistryForSelection } from "../../../../packages/domain/src/registry";
import {
  programmeTitle,
  type ResolvedDegree,
} from "../../../../packages/domain/src/recipes";
import type { Language } from "../i18n";
import { recipeMessages } from "./recipeMessages";

export default function ReviewGaps({
  degree,
  language,
}: {
  degree: ResolvedDegree;
  language: Language;
}) {
  const t = recipeMessages[language];
  const registry = recipeRegistryForSelection(degree.selection);
  const consequence = {
    en: "You can schedule courses; degree credit matching for this component is not yet confirmed. Check the official programme source and ask the faculty about recognition before relying on this total.",
    de: "Du kannst Kurse einplanen; die Anrechnung für diesen Teil des Abschlusses ist noch nicht bestätigt. Prüfe die offizielle Programmquelle und kläre die Anerkennung mit der Fakultät, bevor du dich auf diese Summe verlässt.",
    fr: "Vous pouvez planifier des cours ; la prise en compte des crédits pour cette composante du diplôme n’est pas encore confirmée. Consultez la source officielle du programme et clarifiez la reconnaissance avec la faculté avant de vous fier à ce total.",
  }[language];
  const consumed = new Set<string>();
  const technical =
    /^(Unresolved requirement evidence|Missing requirement children|Unresolved programme review|Unresolved combination rule|Missing applicability dates|Missing programme sources|Missing requirements|Composed requirement credit discrepancy):/;
  const summary = (issue: string) => {
    if (issue.startsWith("Missing applicability dates:"))
      return t.applicabilityGap;
    if (
      issue.startsWith("Missing requirements:") ||
      issue.startsWith("Missing requirement children:")
    )
      return t.curriculumGap;
    if (issue.startsWith("Missing programme sources:")) return t.sourceGap;
    if (issue.startsWith("Composed requirement credit discrepancy:"))
      return t.creditGap;
    if (issue.startsWith("Unknown combination permission:")) return t.unknown;
    return t.reviewGap;
  };
  const groups = degree.selection.components.flatMap((component) => {
    const programme = registry.programmes.find(
      (p) => p.id === component.programmeId,
    );
    if (!programme) return [];
    const prefix = `${programme.id}/${component.variantId}`;
    const messages = new Set<string>();
    for (const issue of degree.issues) {
      if (issue.startsWith(`${programme.id}: `)) {
        messages.add(summary(issue.slice(programme.id.length + 2)));
        consumed.add(issue);
      } else if (issue.startsWith(`${prefix}: `)) {
        messages.add(summary(issue.slice(prefix.length + 2)));
        consumed.add(issue);
      } else if (issue.includes(prefix)) {
        messages.add(summary(issue));
        consumed.add(issue);
      }
    }
    return messages.size
      ? [
          {
            title: programmeTitle(programme, language),
            messages: [...messages],
            key: component.slotId,
          },
        ]
      : [];
  });
  const other = [
    ...new Set(
      degree.issues
        .filter((i) => !consumed.has(i) && !technical.test(i))
        .map(summary),
    ),
  ];
  return (
    <section aria-label={t.gaps}>
      <h4>{t.gaps}</h4>
      <p>{consequence}</p>
      {groups.map((group) => (
        <div key={group.key}>
          <h5>{group.title}</h5>
          <ul>
            {group.messages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      ))}
      {other.length > 0 && (
        <ul>
          {other.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}
      {!groups.length && !other.length && <p>{t.reviewGap}</p>}
      <details>
        <summary>{t.diagnostics}</summary>
        <ul>
          {[...new Set(degree.issues)].map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}
