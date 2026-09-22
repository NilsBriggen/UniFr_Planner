import type { Language } from "../i18n";

const labels = {
  en: { autumn: "Autumn", spring: "Spring", season: "Season", year: "Year" },
  de: {
    autumn: "Herbst",
    spring: "Frühling",
    season: "Jahreszeit",
    year: "Jahr",
  },
  fr: {
    autumn: "Automne",
    spring: "Printemps",
    season: "Saison",
    year: "Année",
  },
} satisfies Record<Language, Record<string, string>>;

// Shared with compact summaries that must match the field's localized terms.
// eslint-disable-next-line react-refresh/only-export-components
export function semesterLabel(term: string, language: Language): string {
  const [season, year] = term.split("-");
  return `${season === "SS" ? labels[language].spring : labels[language].autumn} ${year}`;
}

export function SemesterField({
  label,
  value,
  onChange,
  language,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  language: Language;
  disabled?: boolean;
}) {
  const [season = "AS", year = ""] = value.split("-");
  const t = labels[language];
  return (
    <fieldset className="semester-field">
      <legend>{label}</legend>
      <label>
        {t.season}
        <select
          aria-label={`${label} · ${t.season}`}
          value={season}
          disabled={disabled}
          onChange={(event) => onChange(`${event.target.value}-${year}`)}
        >
          <option value="AS">{t.autumn}</option>
          <option value="SS">{t.spring}</option>
        </select>
      </label>
      <label>
        {t.year}
        <input
          aria-label={`${label} · ${t.year}`}
          type="number"
          min="2000"
          max="2099"
          required
          disabled={disabled}
          value={year}
          onChange={(event) => onChange(`${season}-${event.target.value}`)}
        />
      </label>
    </fieldset>
  );
}
