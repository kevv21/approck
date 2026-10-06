# Skills de Playwright (Microsoft)

Copiadas tal cual (Apache 2.0, ver PLAYWRIGHT-LICENSE), el 2026-10-06:
- `playwright-cli`: de https://github.com/microsoft/playwright-cli, commit b85c7a7
  (coincide con el programa publicado, @playwright/cli 0.1.22).
- `playwright-trace` y `playwright-component-testing`: de
  https://github.com/microsoft/playwright, commit b814764, packages/playwright-core/src/tools/skills/.

No se instalaron las 5 de `.claude/skills/` de microsoft/playwright
(cherry-pick, dev, devops, test-results, triage): son para quienes desarrollan
Playwright, no para quien lo usa.

## Usarlo en el contenedor de Claude Code en la web

El programa busca Google Chrome por defecto, y el contenedor trae Chromium.
Copiar `.playwright/cli.config.json.ejemplo` a `.playwright/cli.config.json`
(ignorado por git: la ruta es de este contenedor, en tu computadora no hace
falta). Sin instalar nada: `npx playwright cli open http://localhost:3000`.
