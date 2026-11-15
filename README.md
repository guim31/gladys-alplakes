# Alplakes for Gladys Assistant

A [Gladys Assistant](https://gladysassistant.com) integration that brings the
**water temperature of Alpine lakes** into Gladys, with a two-day forecast:
Lake Geneva, Lake Annecy, Lake Bourget, Lake Constance, Lake Zurich, Lake
Lucerne, Lake Maggiore, Lake Garda and more than a hundred Swiss, French,
Italian, German, Austrian and Slovenian lakes. The values come from
[Alplakes](https://www.alplakes.eawag.ch), the lake platform of
[Eawag](https://www.eawag.ch), the Swiss Federal Institute of Aquatic Science
and Technology.

> The values are **simulations calibrated on measurements, not direct
> measurements**. This project is not affiliated with Eawag.

## Features

- One device per lake (1D model Simstrat): water temperature now, maximum of
  the next 24 and 48 hours, change expected in 24 hours.
- One device per precise point (a beach, a harbour) on the lakes with a 3D
  model (Delft3D-FLOW, MITgcm): the same values at the nearest grid cell.
- Temperature at the surface or at 1, 2, 5 or 10 m.
- Scene trigger "Water temperature threshold crossed" (10 to 28 °C, now or in
  the 48-hour forecast, with a 0.3 °C hysteresis).
- Dashboard widget: your lakes, their temperature, forecast and trend.
- "Find lakes" button in the configuration; four languages (en, fr, de, es).

## Requirements

- Gladys Assistant 5.3.0 or later.
- Internet access from Gladys. No account, no key.

## Installation

In Gladys: **Integrations → Install from GitHub**, address
`https://github.com/guim31/gladys-alplakes`. Then fill in the lakes in the
**Configuration** tab and create the devices in the **Discover** tab. The full
guide: [docs/en.md](docs/en.md) ([fr](docs/fr.md), [de](docs/de.md),
[es](docs/es.md)).

## How it works

- Every 3 hours (the pace of the models), one request per lake or point to the
  Alplakes API, for a window of 6 hours back and 54 hours ahead, spaced by one
  second and with an identifying User-Agent; the lake list once a day.
- Every hour, the values at the current time are computed from the series kept
  (linear between two steps) and only the changes are published.
- A failed request keeps the last series: the forecast stays usable, and the
  connection status says Alplakes does not answer. A failed try waits 3 hours
  like a success, and a 429 stops the refresh until the next one.

## Limitations

- Simulations, not measurements: expect a degree or more of difference near a
  river mouth, in a shallow bay or after a storm.
- Precise points only on the lakes with a 3D model.
- Spanish lake names for the big lakes only.

## Development

```bash
npm ci
npm run format:check && npm run lint && npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

Tests run against the SDK's fake Gladys and answers of the Alplakes API
recorded on 15/11/2026 (`test/fixtures/alplakes`); they never touch the
network. See [CLAUDE.md](CLAUDE.md) for the project rules.

## Credits

- Data: Alplakes, Eawag (CC BY 4.0) — https://www.alplakes.eawag.ch. Models
  Simstrat, Delft3D-FLOW and MITgcm, driven by MeteoSwiss forecasts.
- Cover: the official Alplakes logo, from the
  [alplakes-react](https://github.com/eawag-surface-waters-research/alplakes-react)
  repository of Eawag.
- Built with the
  [Gladys integration SDK](https://github.com/GladysAssistant/integration-sdk-js)
  and the official integration template.

## License

Apache-2.0, see [LICENSE](LICENSE). The data keep their own licence
(CC BY 4.0, attribution "Data: Alplakes, Eawag (CC BY 4.0)").
