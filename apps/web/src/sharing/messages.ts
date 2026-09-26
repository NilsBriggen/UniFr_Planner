import type { Language } from "../i18n";
const en = {
  share: "Share plan",
  title: "Share your plan",
  intro:
    "Anyone with the link can view the active scenario and import an independent copy. Your saved changes update the link automatically.",
  personal: "Include personal unavailable periods",
  privacy: "Other scenarios and private requirement notes are excluded.",
  create: "Create share link",
  link: "Read-only share link",
  copy: "Copy link",
  copied: "Link copied",
  open: "Open shared plan",
  revoke: "Stop sharing",
  revokeConfirm: "Stop sharing? This link will no longer open your plan.",
  localOwner:
    "Keep this browser's data to manage this link. A signed-in creator can also manage it through their account.",
  publishing: "Updating shared plan…",
  synced: "Shared plan is up to date",
  offline:
    "Your local plan is saved, but its share link could not update. Retry when connected.",
  conflict:
    "This shared plan changed on another device. Open the shared plan and choose Edit original to continue from its latest version.",
  unavailable:
    "This link was revoked or you no longer have permission to update it.",
  retry: "Retry update",
  error: "Could not complete sharing. Your local plan is unchanged.",
  shared: "Shared plan",
  readOnly: "Read-only · changes by the owner appear automatically",
  import: "Import as my plan",
  imported: "Imported copy",
  edit: "Edit original",
  editHelp:
    "You are verified as this plan's owner. Editing opens the latest shared version on this device.",
  missing:
    "This shared plan is unavailable. The owner may have stopped sharing it.",
  loading: "Opening shared plan…",
  updated: "Last updated",
  semester: "Semester",
  week: "Week of",
  courses: "Courses",
  noCourses: "No courses in this semester.",
  close: "Close",
  print: "Print week / save PDF",
  wallPrint: "Wall timetable · typical week",
  excel: "Download Excel",
  exporting: "Preparing Excel…",
  exportError: "The download could not be created. Try again.",
  lessons: "Lesson list",
  notes: "My notes & activities",
  notesHelp:
    "Add your own activities in empty timetable cells or here. This workbook is an editable copy; changes do not sync to the planner.",
  time: "Time",
  date: "Date",
  course: "Course / activity",
  start: "Start",
  end: "End",
  room: "Room",
  source: "Source",
  missingDates:
    "Some courses have unpublished or incomplete dates and are not fully shown.",
  conflicts: "Conflicts",
  overlap: "Overlapping lessons",
  printHelp: "Landscape A4 · choose Save as PDF or your printer",
  printNote:
    "Exact times and rooms are listed on the following page. All times use Europe/Zurich.",
  closePrint: "Back to planner",
  weekly: "Weekly plan",
  noEvents: "No dated lessons this week.",
};
type Copy = { [K in keyof typeof en]: string };
export const shareMessages: Record<Language, Copy> = {
  en,
  de: {
    share: "Plan teilen",
    title: "Deinen Plan teilen",
    intro:
      "Alle mit dem Link können das aktive Szenario ansehen und eine eigene Kopie importieren. Gespeicherte Änderungen aktualisieren den Link automatisch.",
    personal: "Persönliche Sperrzeiten einbeziehen",
    privacy:
      "Andere Szenarien und private Anrechnungsnotizen werden nicht geteilt.",
    create: "Freigabelink erstellen",
    link: "Freigabelink zum Ansehen",
    copy: "Link kopieren",
    copied: "Link kopiert",
    open: "Geteilten Plan öffnen",
    revoke: "Freigabe beenden",
    revokeConfirm:
      "Freigabe beenden? Über diesen Link ist dein Plan dann nicht mehr erreichbar.",
    localOwner:
      "Behalte die Browserdaten, um den Link zu verwalten. Angemeldete Ersteller können ihn auch über ihr Konto verwalten.",
    publishing: "Geteilten Plan aktualisieren…",
    synced: "Geteilter Plan ist aktuell",
    offline:
      "Dein lokaler Plan ist gespeichert, aber der Freigabelink konnte nicht aktualisiert werden. Versuche es erneut, sobald du online bist.",
    conflict:
      "Der geteilte Plan wurde auf einem anderen Gerät geändert. Öffne ihn und wähle Original bearbeiten, um die aktuelle Version zu verwenden.",
    unavailable:
      "Dieser Link wurde widerrufen oder du darfst ihn nicht mehr ändern.",
    retry: "Erneut aktualisieren",
    error: "Teilen fehlgeschlagen. Dein lokaler Plan bleibt unverändert.",
    shared: "Geteilter Plan",
    readOnly: "Nur ansehen · Änderungen des Erstellers erscheinen automatisch",
    import: "Als eigenen Plan importieren",
    imported: "Importierte Kopie",
    edit: "Original bearbeiten",
    editHelp:
      "Du bist als Eigentümer bestätigt. Beim Bearbeiten wird die aktuelle geteilte Version auf diesem Gerät geöffnet.",
    missing:
      "Dieser geteilte Plan ist nicht verfügbar. Die Freigabe wurde möglicherweise beendet.",
    loading: "Geteilten Plan öffnen…",
    updated: "Zuletzt aktualisiert",
    semester: "Semester",
    week: "Woche ab",
    courses: "Kurse",
    noCourses: "Keine Kurse in diesem Semester.",
    close: "Schliessen",
    print: "Woche drucken / PDF speichern",
    wallPrint: "Stundenplan zum Aufhängen · typische Woche",
    excel: "Excel herunterladen",
    exporting: "Excel vorbereiten…",
    exportError:
      "Der Download konnte nicht erstellt werden. Versuche es erneut.",
    lessons: "Terminliste",
    notes: "Meine Notizen & Aktivitäten",
    notesHelp:
      "Ergänze eigene Aktivitäten in leeren Stundenplanfeldern oder hier. Diese Datei ist eine bearbeitbare Kopie; Änderungen werden nicht mit dem Planer synchronisiert.",
    time: "Zeit",
    date: "Datum",
    course: "Kurs / Aktivität",
    start: "Beginn",
    end: "Ende",
    room: "Raum",
    source: "Quelle",
    missingDates:
      "Einige Kurse haben noch keine vollständigen Termine und werden nicht vollständig angezeigt.",
    conflicts: "Konflikte",
    overlap: "Überlappende Termine",
    printHelp: "A4 quer · Als PDF speichern oder Drucker wählen",
    printNote:
      "Genaue Zeiten und Räume stehen auf der folgenden Seite. Alle Zeiten gelten für Europe/Zurich.",
    closePrint: "Zurück zum Planer",
    weekly: "Wochenplan",
    noEvents: "Keine datierten Termine in dieser Woche.",
  },
  fr: {
    share: "Partager le plan",
    title: "Partager votre plan",
    intro:
      "Toute personne disposant du lien peut consulter le scénario actif et importer sa propre copie. Vos modifications enregistrées actualisent le lien automatiquement.",
    personal: "Inclure mes indisponibilités personnelles",
    privacy:
      "Les autres scénarios et notes privées de reconnaissance sont exclus.",
    create: "Créer un lien de partage",
    link: "Lien de consultation",
    copy: "Copier le lien",
    copied: "Lien copié",
    open: "Ouvrir le plan partagé",
    revoke: "Arrêter le partage",
    revokeConfirm:
      "Arrêter le partage ? Ce lien ne permettra plus de consulter votre plan.",
    localOwner:
      "Conservez les données de ce navigateur pour gérer ce lien. Le créateur connecté peut aussi le gérer depuis son compte.",
    publishing: "Actualisation du plan partagé…",
    synced: "Le plan partagé est à jour",
    offline:
      "Votre plan local est enregistré, mais le lien n’a pas pu être actualisé. Réessayez une fois connecté.",
    conflict:
      "Ce plan partagé a été modifié sur un autre appareil. Ouvrez-le et choisissez Modifier l’original pour repartir de la dernière version.",
    unavailable:
      "Ce lien a été révoqué ou vous n’avez plus l’autorisation de le modifier.",
    retry: "Réessayer",
    error: "Le partage a échoué. Votre plan local reste inchangé.",
    shared: "Plan partagé",
    readOnly:
      "Lecture seule · les modifications du créateur apparaissent automatiquement",
    import: "Importer comme mon plan",
    imported: "Copie importée",
    edit: "Modifier l’original",
    editHelp:
      "Vous êtes identifié comme propriétaire. La modification ouvre la dernière version partagée sur cet appareil.",
    missing:
      "Ce plan partagé n’est pas disponible. Son propriétaire a peut-être arrêté le partage.",
    loading: "Ouverture du plan partagé…",
    updated: "Dernière mise à jour",
    semester: "Semestre",
    week: "Semaine du",
    courses: "Cours",
    noCourses: "Aucun cours dans ce semestre.",
    close: "Fermer",
    print: "Imprimer la semaine / PDF",
    wallPrint: "Emploi du temps à afficher · semaine type",
    excel: "Télécharger Excel",
    exporting: "Préparation d’Excel…",
    exportError: "Le téléchargement n’a pas pu être créé. Réessayez.",
    lessons: "Liste des séances",
    notes: "Mes notes et activités",
    notesHelp:
      "Ajoutez vos activités dans les cases vides de l’horaire ou ici. Ce classeur est une copie modifiable ; les changements ne sont pas synchronisés avec le planificateur.",
    time: "Heure",
    date: "Date",
    course: "Cours / activité",
    start: "Début",
    end: "Fin",
    room: "Salle",
    source: "Source",
    missingDates:
      "Certains cours ont des dates absentes ou incomplètes et ne sont pas entièrement affichés.",
    conflicts: "Conflits",
    overlap: "Séances simultanées",
    printHelp: "A4 paysage · choisir Enregistrer en PDF ou votre imprimante",
    printNote:
      "Les horaires exacts et les salles figurent sur la page suivante. Fuseau horaire : Europe/Zurich.",
    closePrint: "Retour au planificateur",
    weekly: "Plan de la semaine",
    noEvents: "Aucune séance datée cette semaine.",
  },
};
