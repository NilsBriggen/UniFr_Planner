import type { Language } from "../i18n";
const en = {
  identityChanged:
    "The account changed in another tab. The displayed account has been refreshed. Review it before repeating your action.",
  unreadable:
    "Some saved plans could not be opened. Other plans remain available. Download the original recovery data before repairing an affected plan; it will not be imported automatically.",
  recoverData: "Download recovery data",
  title: "Optional account",
  intro:
    "Plan without an account, or keep private copies across devices. No email is needed. Use a separate password, never your MyUnifr password.",
  local:
    "Your plans stay on this device. Signing in copies them as new account plans. Synchronization happens only when you press Sync current plan.",
  login: "Sign in",
  register: "Create account",
  recover: "Recover account",
  username: "Username",
  password: "Password",
  recovery: "Recovery code",
  submit: "Continue",
  rules:
    "Username: 3–32 letters, numbers, _ or -. Password: 12–128 characters.",
  once: "Save this recovery code somewhere private. It appears only once. Without your password or this code, your account cannot be recovered.",
  saved: "I saved my recovery code",
  signed: "Signed in as",
  logout: "Sign out",
  sync: "Sync current plan",
  refresh: "Refresh account plans",
  cloud: "Account plans",
  empty: "No account plans yet.",
  download: "Copy to this device",
  conflictLabel: "Conflict copy",
  revision: "Revision",
  exported: "Export account JSON",
  remove: "Delete account",
  confirm: "Permanently delete account and server plans",
  cancel: "Cancel",
  deleteHint:
    "Enter your password to permanently remove this account, its server plans, and all sessions. Local copies on your devices remain.",
  error:
    "The action failed. Check your details and connection; your local plans are unchanged.",
  limited: "Too many attempts. Wait 15 minutes before trying again.",
  conflict:
    "Another device changed this plan. Both versions are saved below. Your current local plan is now linked to the conflict copy. Choose which version to copy to this device.",
  done: "Saved. Your local plans are unchanged.",
  copied: "A new local copy is ready in the plan selector.",
  importing:
    "Signed in, but copying local plans failed. Your local plans are safe. Use Sync current plan to retry.",
};
type Copy = { [K in keyof typeof en]: string };
export const accountMessages: Record<Language, Copy> = {
  en,
  de: {
    identityChanged:
      "Das Konto wurde in einem anderen Tab geändert. Das angezeigte Konto wurde aktualisiert. Prüfe es, bevor du die Aktion wiederholst.",
    unreadable:
      "Einige gespeicherte Pläne konnten nicht geöffnet werden. Andere Pläne bleiben verfügbar. Lade vor einer Reparatur die ursprünglichen Wiederherstellungsdaten herunter; sie werden nicht automatisch importiert.",
    recoverData: "Wiederherstellungsdaten herunterladen",
    title: "Optionales Konto",
    intro:
      "Plane ohne Konto oder speichere private Kopien auf mehreren Geräten. Keine E-Mail nötig. Verwende ein eigenes Passwort, niemals dein MyUnifr-Passwort.",
    local:
      "Deine Pläne bleiben auf diesem Gerät. Beim Anmelden werden sie als neue Kontopläne kopiert. Die Synchronisierung erfolgt nur über Aktuellen Plan synchronisieren.",
    login: "Anmelden",
    register: "Konto erstellen",
    recover: "Konto wiederherstellen",
    username: "Benutzername",
    password: "Passwort",
    recovery: "Wiederherstellungscode",
    submit: "Weiter",
    rules:
      "Benutzername: 3–32 Buchstaben, Zahlen, _ oder -. Passwort: 12–128 Zeichen.",
    once: "Bewahre diesen Wiederherstellungscode sicher auf. Er wird nur einmal angezeigt. Ohne Passwort oder Code kann dein Konto nicht wiederhergestellt werden.",
    saved: "Ich habe den Code gesichert",
    signed: "Angemeldet als",
    logout: "Abmelden",
    sync: "Aktuellen Plan synchronisieren",
    refresh: "Kontopläne aktualisieren",
    cloud: "Kontopläne",
    empty: "Noch keine Kontopläne.",
    download: "Auf dieses Gerät kopieren",
    conflictLabel: "Konfliktkopie",
    revision: "Revision",
    exported: "Konto als JSON exportieren",
    remove: "Konto löschen",
    confirm: "Konto und Serverpläne endgültig löschen",
    cancel: "Abbrechen",
    deleteHint:
      "Gib dein Passwort ein, um Konto, Serverpläne und alle Sitzungen endgültig zu löschen. Lokale Kopien auf deinen Geräten bleiben erhalten.",
    error:
      "Aktion fehlgeschlagen. Prüfe deine Angaben und Verbindung; lokale Pläne sind unverändert.",
    limited: "Zu viele Versuche. Bitte warte 15 Minuten.",
    conflict:
      "Ein anderes Gerät hat den Plan geändert. Beide Versionen sind unten gespeichert. Dein lokaler Plan ist jetzt mit der Konfliktkopie verbunden. Wähle eine Version zum Kopieren auf dieses Gerät.",
    done: "Gespeichert. Deine lokalen Pläne sind unverändert.",
    copied: "Eine neue lokale Kopie ist in der Planauswahl verfügbar.",
    importing:
      "Angemeldet, aber lokale Pläne konnten nicht kopiert werden. Sie sind sicher. Versuche es über Aktuellen Plan synchronisieren erneut.",
  },
  fr: {
    identityChanged:
      "Le compte a changé dans un autre onglet. Le compte affiché a été actualisé. Vérifiez-le avant de répéter votre action.",
    unreadable:
      "Certains plans enregistrés n’ont pas pu être ouverts. Les autres restent accessibles. Téléchargez les données originales de récupération avant toute réparation ; elles ne seront pas importées automatiquement.",
    recoverData: "Télécharger les données de récupération",
    title: "Compte facultatif",
    intro:
      "Planifiez sans compte ou conservez des copies privées sur plusieurs appareils. Aucun e-mail requis. Utilisez un mot de passe distinct, jamais celui de MyUnifr.",
    local:
      "Vos plans restent sur cet appareil. La connexion les copie comme nouveaux plans du compte. La synchronisation se fait uniquement avec Synchroniser le plan actuel.",
    login: "Se connecter",
    register: "Créer un compte",
    recover: "Récupérer le compte",
    username: "Nom d’utilisateur",
    password: "Mot de passe",
    recovery: "Code de récupération",
    submit: "Continuer",
    rules:
      "Nom : 3–32 lettres, chiffres, _ ou -. Mot de passe : 12–128 caractères.",
    once: "Conservez ce code de récupération dans un endroit privé. Il ne s’affiche qu’une fois. Sans mot de passe ni code, votre compte ne pourra pas être récupéré.",
    saved: "J’ai sauvegardé mon code",
    signed: "Connecté en tant que",
    logout: "Se déconnecter",
    sync: "Synchroniser le plan actuel",
    refresh: "Actualiser les plans du compte",
    cloud: "Plans du compte",
    empty: "Aucun plan dans le compte.",
    download: "Copier sur cet appareil",
    conflictLabel: "Copie en conflit",
    revision: "Révision",
    exported: "Exporter le compte en JSON",
    remove: "Supprimer le compte",
    confirm: "Supprimer définitivement le compte et les plans du serveur",
    cancel: "Annuler",
    deleteHint:
      "Saisissez votre mot de passe pour supprimer définitivement le compte, ses plans sur le serveur et toutes les sessions. Les copies locales sur vos appareils sont conservées.",
    error:
      "Échec de l’action. Vérifiez vos informations et votre connexion ; vos plans locaux restent inchangés.",
    limited: "Trop de tentatives. Attendez 15 minutes avant de réessayer.",
    conflict:
      "Un autre appareil a modifié ce plan. Les deux versions sont conservées ci-dessous. Votre plan local est désormais lié à la copie en conflit. Choisissez une version à copier sur cet appareil.",
    done: "Enregistré. Vos plans locaux restent inchangés.",
    copied:
      "Une nouvelle copie locale est disponible dans le sélecteur de plans.",
    importing:
      "Connecté, mais la copie des plans locaux a échoué. Ils sont conservés. Réessayez avec Synchroniser le plan actuel.",
  },
};
