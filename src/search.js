// -----------------------------------------------------------------------------
// The "Find lakes" configuration action: lists the Alplakes lakes matching a
// name (in any language, accents ignored) with their key and whether a 3D model
// allows precise points. Without words: the lakes with a 3D model.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { findLakes } from './alplakes.js';
import { SEARCH, render } from './messages.js';

const logger = createLogger({ name: 'alplakes-search' });

export const MAX_RESULTS = 15;

/**
 * Handler of the `search_lakes` action.
 * @param {import('./monitor.js').Monitor} monitor
 * @param {{ query?: string }} fields
 */
export async function searchLakes(monitor, fields = {}) {
  const catalogue = await monitor.ensureCatalogue();
  if (!catalogue) {
    return render(SEARCH, 'unavailable');
  }
  const query = String(fields?.query ?? '').trim();
  const found = query
    ? findLakes(catalogue, query)
    : [...catalogue.values()].filter((lake) => lake.model3d);
  logger.info(`Lake search: ${found.length} lake(s) found`);
  if (found.length === 0) {
    return render(SEARCH, 'none');
  }
  return Object.fromEntries(
    Object.keys(SEARCH).map((language) => {
      const texts = SEARCH[language];
      const listed = [...found]
        .sort((a, b) => a.names[language].localeCompare(b.names[language], language))
        .slice(0, MAX_RESULTS);
      const lines = listed.map(
        (lake) =>
          `${lake.names[language]} — ${lake.key}${lake.model3d ? ` (${texts.with3d})` : ''}`,
      );
      const head = texts.found({ count: listed.length, total: found.length });
      return [language, `${head}\n${lines.join('\n')}`];
    }),
  );
}
