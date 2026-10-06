# Skill de impeccable

Copiada tal cual de https://github.com/pbakaus/impeccable (Apache 2.0, ver
LICENSE), commit cf3d2fa, el 2026-10-06: `.claude/skills/impeccable/`.

Diseño de interfaces: `/impeccable audit`, `critique`, `polish`, `layout`,
`colorize`, `typeset`, `harden`, `adapt`, etc.

Su lanzador (`scripts/impeccable`) descarga un programa la primera vez que se
usa en cada sesión: versión fija (scripts/VERSION), desde los releases de
github.com/pbakaus/impeccable, en ~/.impeccable/, y verifica su SHA-256 antes de
ejecutarlo. Si no hay red, la skill sigue leyendo PRODUCT.md y DESIGN.md a mano.
