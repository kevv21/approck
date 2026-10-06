# Skills de OmniRoute

Copiadas de https://github.com/diegosouzapw/OmniRoute (ver OMNIROUTE-LICENSE),
commit 994324f5, el 2026-10-06: las 45 de `skills/` (todas `omni-*`,
`cli-*` y `config-codex-cli`). Se omitió su copia de `ponytail`: ya está el
original.

**Son para otros proyectos, no para este POS.** Cada SKILL.md lleva
`disable-model-invocation: true` (única modificación): Claude no las usa por su
cuenta, solo cuando alguien escribe el comando, por ejemplo `/omni-models` o
`/cli-serve`. Sirven para manejar un servidor OmniRoute (gateway de IA en
`localhost:20128`), que el POS no usa.

Para tenerlas en otro proyecto: copiar estas carpetas a su `.claude/skills/`,
o a `~/.claude/skills/` en tu computadora para tenerlas en todos.
