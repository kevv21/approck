# POS Restaurante

Spec completo: @docs/SPEC.md — léelo antes de cualquier fase.
Estado actual: @docs/PROGRESS.md — léelo al iniciar cada sesión.

## Reglas
- Trabaja UNA fase a la vez (ver "Fases" en SPEC.md). No avances sin mi confirmación.
- Antes de cada fase: plan + lista de archivos. Espera aprobación.
- Dinero en centavos (enteros). Nunca floats.
- El cálculo del recibo vive en una sola función pura con tests; no dupliques lógica de montos.
- Usa el MCP de Appwrite para crear colecciones, índices y permisos; no los describas, créalos.
- Nada fiscal/DGI hardcodeado: va en `settings`, marcado como pendiente de validar.
- Si en SPEC.md queda algún [CORCHETE] sin llenar, pregúntame. No inventes valores.
- Si algo del spec es inviable o contradictorio, dilo antes de implementar.
- Al terminar una fase: corre tests y actualiza docs/PROGRESS.md (hecho, pendiente, decisiones).
- UI en español.

## Comandos
- dev: npm run dev
- test: npm test
- build: npm run build
