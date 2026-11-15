# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- Water temperature of more than a hundred Alpine lakes (Lake Geneva, Annecy,
  Bourget, Constance, Zurich, Maggiore, Garda…) from Alplakes (Eawag): one
  device per lake with the temperature now, the maximum of the next 24 and 48
  hours and the change expected in 24 hours.
- Precise points (a beach, a harbour) on the lakes with a 3D model.
- Depth of the temperature: surface, 1, 2, 5 or 10 m.
- Scene trigger "Water temperature threshold crossed", now or in the 48-hour
  forecast, with a hysteresis.
- Dashboard widget `lakes`, and a "Find lakes" button in the configuration.
- Documentation in English, French, German and Spanish.
