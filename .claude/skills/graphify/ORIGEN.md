# Skill de Graphify

Copiada de https://github.com/Graphify-Labs/graphify (Apache 2.0, ver LICENSE),
commit 5c7b847, el 2026-10-06: `graphify/skill.md` como SKILL.md y
`graphify/skills/claude/references/`.

Necesita el programa `graphifyy` (Python). La skill lo instala sola con
`uv tool install` o `pip` la primera vez que se usa en cada sesión.

Uso: `/graphify .` arma el mapa del proyecto en `graphify-out/` (ignorado por
git). Después, `/graphify query "pregunta"`, `/graphify path A B`,
`/graphify explain X`. El código se analiza local (sin LLM ni API key).

No se instalaron sus hooks de git (post-commit) ni la integración con CLAUDE.md.
