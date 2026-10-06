import { defineConfig } from "vitest/config";

// Las pruebas viven en src/. Sin esto vitest busca en todo el repositorio y
// toma como pruebas las plantillas de las skills de .claude/ (por ejemplo
// playwright-component-testing/templates/*/button.spec.ts), que importan
// paquetes que este proyecto no tiene: el CI quedaba en rojo.
export default defineConfig({
  test: { include: ["src/**/*.test.ts"] },
});
