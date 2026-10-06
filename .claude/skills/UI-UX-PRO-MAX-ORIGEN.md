# UI/UX Pro Max (Next Level Builder)

Copiadas tal cual de https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
(MIT, ver UI-UX-PRO-MAX-LICENSE), commit 477bcb2, el 2026-10-06: las 7 de
`.claude/skills/`: ui-ux-pro-max, design, design-system, ui-styling, brand,
banner-design y slides.

Por qué, si la cuenta ya trae `anthropic-skills:ui-ux-pro-max`: esa copia es
solo el SKILL.md, sin la base de datos (`data/`) ni los scripts de búsqueda que
el propio SKILL.md manda a usar. Esta está completa.

Los scripts son Python y Node locales. Los únicos que salen a internet:
`design/scripts/logo` e `icon` (API de imágenes de Gemini, solo si se pide
generar un logo o ícono y hay GEMINI_API_KEY) y `fetch-background.py` (fotos
de Pexels).
