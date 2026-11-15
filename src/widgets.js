// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): `lakes`.
//
// Without a lake chosen: one status line per created lake or point (10 at
// most), with the temperature now, the maximum of the next 48 hours and the
// trend icon. With one chosen: its live tiles (temperature, then the maximum of
// the next 24 and 48 hours and the change in 24 hours), bound to the device
// features.
//
// Both end with the attribution Alplakes asks for (CC BY 4.0) and the date of
// the series, then a link to the Alplakes website. Settings hide the forecast
// and the link. Budget: 4 tiles or 1 status, 1 caption, 1 button.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { SITE_URL } from './alplakes.js';
import { targetIds, targetKey, targetOfId } from './devices.js';
import { trendOf } from './forecast.js';
import { formatDate, formatTemperature } from './messages.js';
import { WIDGET_KEY } from './monitor.js';

export const MAX_STATUS_ITEMS = 10;
export const TTL_SECONDS = 600;
const MAX_STATUS_TEXT = 40;

export const TEXT = {
  empty: {
    en: 'No lake yet: fill in the configuration of the Alplakes integration, then create the devices in the Discover tab.',
    fr: "Aucun lac pour l'instant : remplissez la configuration de l'intégration Alplakes, puis créez les appareils dans l'onglet Découverte.",
    de: 'Noch kein See: Fülle die Konfiguration der Integration Alplakes aus und lege dann die Geräte im Tab „Entdecken“ an.',
    es: 'Aún no hay lagos: rellene la configuración de la integración Alplakes y, después, cree los dispositivos en la pestaña Descubrir.',
  },
  gone: {
    en: 'This lake is no longer followed.',
    fr: "Ce lac n'est plus suivi.",
    de: 'Dieser See wird nicht mehr verfolgt.',
    es: 'Este lago ya no se sigue.',
  },
  water: { en: 'Water', fr: 'Eau', de: 'Wasser', es: 'Agua' },
  max24: { en: 'Max. 24 h', fr: 'Max. 24 h', de: 'Max. 24 h', es: 'Máx. 24 h' },
  max48: { en: 'Max. 48 h', fr: 'Max. 48 h', de: 'Max. 48 h', es: 'Máx. 48 h' },
  trend: { en: 'In 24 h', fr: 'Dans 24 h', de: 'In 24 h', es: 'En 24 h' },
  max: { en: 'max.', fr: 'max.', de: 'max.', es: 'máx.' },
  waiting: { en: 'Waiting', fr: 'En attente', de: 'Wartet', es: 'En espera' },
  source: {
    en: 'Data: Alplakes, Eawag (CC BY 4.0)',
    fr: 'Données : Alplakes, Eawag (CC BY 4.0)',
    de: 'Daten: Alplakes, Eawag (CC BY 4.0)',
    es: 'Datos: Alplakes, Eawag (CC BY 4.0)',
  },
  site: { en: 'Alplakes', fr: 'Alplakes', de: 'Alplakes', es: 'Alplakes' },
};

const t = (text, language) => text[language] ?? text.en;
const clip = (text, max = MAX_STATUS_TEXT) =>
  text.length <= max ? text : `${text.slice(0, max - 1)}…`;

const TREND_ICONS = { rising: 'trending-up', falling: 'trending-down', steady: 'minus' };

/** "18,4 °C · max. 19,1 °C" (40 characters at most). */
export function lakeValue(summary, language, { forecast = true } = {}) {
  if (summary.current === null) {
    return t(TEXT.waiting, language);
  }
  const now = formatTemperature(summary.current, language);
  if (!forecast || summary.max48 === null) {
    return now;
  }
  return clip(`${now} · ${t(TEXT.max, language)} ${formatTemperature(summary.max48, language)}`);
}

function footer(monitor, keys, language, showLink) {
  const times = keys.map((key) => monitor.fetchedAt(key)).filter((at) => at !== null);
  const source = t(TEXT.source, language);
  const components = [
    {
      type: 'text',
      variant: 'caption',
      text: times.length === 0 ? source : `${source} · ${formatDate(Math.max(...times), language)}`,
    },
  ];
  if (showLink) {
    components.push({
      type: 'button',
      label: t(TEXT.site, language),
      icon: 'external-link',
      link: { url: SITE_URL },
    });
  }
  return components;
}

function overview(monitor, keys, language, options) {
  const items = keys.slice(0, MAX_STATUS_ITEMS).map((key) => {
    const summary = monitor.summary(key);
    const trend = options.forecast ? trendOf(summary.trend24) : null;
    return {
      label: clip(monitor.displayName(key, language)),
      value: lakeValue(summary, language, options),
      color: WIDGET_COLORS.NEUTRAL,
      icon: summary.current === null ? 'clock' : (TREND_ICONS[trend] ?? 'thermometer'),
    };
  });
  return [{ type: 'status', items }, ...footer(monitor, keys, language, options.link)];
}

function detail(monitor, target, language, options) {
  const key = targetKey(target);
  const ids = targetIds(monitor.gladys, target);
  const components = [
    { type: 'value', label: t(TEXT.water, language), device_feature: ids.temperature },
  ];
  if (options.forecast) {
    components.push(
      { type: 'value', label: t(TEXT.max24, language), device_feature: ids.max_24h },
      { type: 'value', label: t(TEXT.max48, language), device_feature: ids.max_48h },
      { type: 'value', label: t(TEXT.trend, language), device_feature: ids.trend_24h },
    );
  }
  return [...components, ...footer(monitor, [key], language, options.link)];
}

export const WIDGETS = {
  [WIDGET_KEY]: {
    async get(monitor, { settings, language = 'en' }) {
      const lang = TEXT.water[language] ? language : 'en';
      const options = {
        forecast: settings?.show_forecast !== false,
        link: settings?.show_link !== false,
      };
      const created = monitor.createdKeys();
      const chosen = typeof settings?.lake === 'string' && settings.lake ? settings.lake : null;
      if (chosen) {
        const target = targetOfId(monitor.gladys, chosen);
        const key = target ? targetKey(target) : null;
        const components =
          key && created.includes(key)
            ? detail(monitor, target, lang, options)
            : [{ type: 'text', variant: 'body', text: t(TEXT.gone, lang) }];
        return { ttl_seconds: TTL_SECONDS, components };
      }
      if (created.length === 0) {
        return {
          ttl_seconds: TTL_SECONDS,
          components: [{ type: 'text', variant: 'body', text: t(TEXT.empty, lang) }],
        };
      }
      return { ttl_seconds: TTL_SECONDS, components: overview(monitor, created, lang, options) };
    },
  },
};
