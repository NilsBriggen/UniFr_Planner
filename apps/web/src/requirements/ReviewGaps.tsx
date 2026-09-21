import { recipeRegistry } from "../../../../packages/domain/src/registry";
import type { ResolvedDegree } from "../../../../packages/domain/src/recipes";
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
  const consumed = new Set<string>();
  const technical =
    /^(Unresolved requirement evidence|Missing requirement children|Unresolved programme review|Unresolved combination rule|Missing applicability dates|Missing programme sources|Missing requirements|Composed requirement credit discrepancy):/;
  const groups = degree.selection.components.flatMap((component) => {
    const programme = recipeRegistry.programmes.find(
      (p) => p.id === component.programmeId,
    );
    if (!programme) return [];
    const prefix = `${programme.id}/${component.variantId}`;
    const messages = new Set<string>();
    for (const issue of degree.issues) {
      if (issue.startsWith(`${programme.id}: `)) {
        messages.add(issue.slice(programme.id.length + 2));
        consumed.add(issue);
      } else if (issue.startsWith(`${prefix}: `)) {
        messages.add(issue.slice(prefix.length + 2));
        consumed.add(issue);
      } else if (issue.includes(prefix)) {
        if (issue.startsWith("Missing applicability dates:"))
          messages.add(t.applicabilityGap);
        if (issue.startsWith("Missing requirements:"))
          messages.add(t.curriculumGap);
        if (issue.startsWith("Missing programme sources:"))
          messages.add(t.sourceGap);
        if (issue.startsWith("Composed requirement credit discrepancy:"))
          messages.add(t.creditGap);
      }
    }
    return messages.size
      ? [
          {
            title: programme.titles?.[language] ?? programme.title,
            messages: [...messages],
            key: component.slotId,
          },
        ]
      : [];
  });
  const humanize = (issue: string) => {
    let text = issue.replace(
      "Unknown combination permission: ",
      `${t.unknown}: `,
    );
    for (const p of recipeRegistry.programmes)
      text = text.replaceAll(p.id, p.titles?.[language] ?? p.title);
    return text;
  };
  const other = [
    ...new Set(
      degree.issues
        .filter((i) => !consumed.has(i) && !technical.test(i))
        .map(humanize),
    ),
  ];
  return (
    <section aria-label={t.gaps}>
      <h4>{t.gaps}</h4>
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
