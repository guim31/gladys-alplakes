// -----------------------------------------------------------------------------
// Texts sent from the container (connection status, action messages, scene
// variables, widget values), in the four languages of the Gladys interface.
// Entries are strings or functions of one parameter object. German says "du",
// Spanish "usted".
// -----------------------------------------------------------------------------

import { LANGUAGES } from './config.js';

export const TREND_NAMES = {
  en: { rising: 'warming', steady: 'steady', falling: 'cooling' },
  fr: { rising: 'se réchauffe', steady: 'stable', falling: 'se refroidit' },
  de: { rising: 'wird wärmer', steady: 'gleichbleibend', falling: 'kühlt ab' },
  es: { rising: 'se calienta', steady: 'estable', falling: 'se enfría' },
};

// Connection status of the Configuration screen.
export const STATUS = {
  en: {
    initFailed: 'Initialization failed, check the integration logs.',
    down: 'Alplakes does not answer: the temperatures come back with it.',
    unknown: ({ names }) => `Unknown lake: ${names}. Use "Find lakes".`,
    ambiguous: ({ names }) => `Several lakes match ${names}: give the key shown by "Find lakes".`,
    invalidPoint: ({ names }) =>
      `Unreadable point: ${names}. Write "lake: latitude, longitude", e.g. "Léman: 46.2107, 6.1613".`,
    no3d: ({ names }) => `No 3D model for ${names}: precise points are not available there.`,
    offLake: ({ names }) => `Point too far from the lake: ${names}.`,
    noData: ({ names }) => `No temperature from Alplakes for ${names} at the moment.`,
    tooMany: ({ max }) => `Only the first ${max} lakes and ${max} points are followed.`,
    none: 'No lake yet: fill in the configuration, or use "Find lakes".',
  },
  fr: {
    initFailed: "L'initialisation a échoué, consultez les logs de l'intégration.",
    down: 'Alplakes ne répond pas : les températures reviendront avec lui.',
    unknown: ({ names }) => `Lac inconnu : ${names}. Utilisez « Chercher des lacs ».`,
    ambiguous: ({ names }) =>
      `Plusieurs lacs correspondent à ${names} : donnez la clé affichée par « Chercher des lacs ».`,
    invalidPoint: ({ names }) =>
      `Point illisible : ${names}. Écrivez « lac: latitude, longitude », par exemple « Léman: 46.2107, 6.1613 ».`,
    no3d: ({ names }) =>
      `Pas de modèle 3D pour ${names} : les points précis n'y sont pas possibles.`,
    offLake: ({ names }) => `Point trop loin du lac : ${names}.`,
    noData: ({ names }) => `Pas de température d'Alplakes pour ${names} en ce moment.`,
    tooMany: ({ max }) =>
      `Seuls les ${max} premiers lacs et les ${max} premiers points sont suivis.`,
    none: 'Aucun lac : remplissez la configuration, ou utilisez « Chercher des lacs ».',
  },
  de: {
    initFailed: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
    down: 'Alplakes antwortet nicht: Die Temperaturen kommen mit ihm zurück.',
    unknown: ({ names }) => `Unbekannter See: ${names}. Nutze „Seen suchen“.`,
    ambiguous: ({ names }) =>
      `Mehrere Seen passen zu ${names}: Gib den Schlüssel an, den „Seen suchen“ anzeigt.`,
    invalidPoint: ({ names }) =>
      `Unlesbarer Punkt: ${names}. Schreibe „See: Breite, Länge“, z. B. „Léman: 46.2107, 6.1613“.`,
    no3d: ({ names }) => `Kein 3D-Modell für ${names}: Genaue Punkte sind dort nicht möglich.`,
    offLake: ({ names }) => `Punkt zu weit vom See entfernt: ${names}.`,
    noData: ({ names }) => `Derzeit keine Temperatur von Alplakes für ${names}.`,
    tooMany: ({ max }) => `Nur die ersten ${max} Seen und ${max} Punkte werden verfolgt.`,
    none: 'Noch kein See: Fülle die Konfiguration aus oder nutze „Seen suchen“.',
  },
  es: {
    initFailed: 'La inicialización ha fallado, consulte los registros de la integración.',
    down: 'Alplakes no responde: las temperaturas volverán con él.',
    unknown: ({ names }) => `Lago desconocido: ${names}. Use «Buscar lagos».`,
    ambiguous: ({ names }) =>
      `Varios lagos corresponden a ${names}: indique la clave que muestra «Buscar lagos».`,
    invalidPoint: ({ names }) =>
      `Punto ilegible: ${names}. Escriba «lago: latitud, longitud», por ejemplo «Léman: 46.2107, 6.1613».`,
    no3d: ({ names }) =>
      `No hay modelo 3D para ${names}: los puntos precisos no son posibles allí.`,
    offLake: ({ names }) => `Punto demasiado lejos del lago: ${names}.`,
    noData: ({ names }) => `Ninguna temperatura de Alplakes para ${names} en este momento.`,
    tooMany: ({ max }) => `Solo se siguen los ${max} primeros lagos y los ${max} primeros puntos.`,
    none: 'Aún no hay lagos: rellene la configuración o use «Buscar lagos».',
  },
};

// Messages of the "Find lakes" action.
export const SEARCH = {
  en: {
    none: 'No lake found.',
    found: ({ count, total }) =>
      `${total > count ? `${count} of ${total}` : count} lake(s). Copy a name or key into "Lakes", then save:`,
    unavailable: 'Alplakes does not answer, try again in a few minutes.',
    with3d: '3D model: precise points possible',
  },
  fr: {
    none: 'Aucun lac trouvé.',
    found: ({ count, total }) =>
      `${total > count ? `${count} sur ${total}` : count} lac(s). Copiez un nom ou une clé dans « Lacs », puis enregistrez :`,
    unavailable: 'Alplakes ne répond pas, réessayez dans quelques minutes.',
    with3d: 'modèle 3D : points précis possibles',
  },
  de: {
    none: 'Kein See gefunden.',
    found: ({ count, total }) =>
      `${total > count ? `${count} von ${total}` : count} See(n). Kopiere einen Namen oder Schlüssel in „Seen“ und speichere:`,
    unavailable: 'Alplakes antwortet nicht, versuche es in ein paar Minuten erneut.',
    with3d: '3D-Modell: genaue Punkte möglich',
  },
  es: {
    none: 'No se ha encontrado ningún lago.',
    found: ({ count, total }) =>
      `${total > count ? `${count} de ${total}` : count} lago(s). Copie un nombre o una clave en «Lagos» y guarde:`,
    unavailable: 'Alplakes no responde, inténtelo de nuevo en unos minutos.',
    with3d: 'modelo 3D: puntos precisos posibles',
  },
};

/** One entry of a message table, in every language: `{ en, fr, de, es }`. */
export function render(table, key, params = {}) {
  return Object.fromEntries(
    LANGUAGES.map((language) => {
      const entry = table[language][key];
      return [language, typeof entry === 'function' ? entry(params) : entry];
    }),
  );
}

/** Several multi-language texts joined, language by language. */
export function join(...messages) {
  return Object.fromEntries(
    LANGUAGES.map((language) => [
      language,
      messages
        .filter(Boolean)
        .map((message) => message[language])
        .join(' '),
    ]),
  );
}

const LOCALES = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' };

/** "18.4 °C" / "18,4 °C"; a trend carries its sign ("+0.6 °C"). */
export function formatTemperature(value, language, { signed = false } = {}) {
  const text = new Intl.NumberFormat(LOCALES[language] ?? 'en-GB', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    signDisplay: signed ? 'exceptZero' : 'auto',
  }).format(value);
  return `${text} °C`;
}

/** "15/11 14:00" in the time zone of Gladys (TZ, set by the supervisor). */
export function formatDate(time, language) {
  const parts = new Intl.DateTimeFormat(LOCALES[language] ?? 'en-GB', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(time));
  const get = (type) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('day')}/${get('month')} ${get('hour')}:${get('minute')}`;
}
