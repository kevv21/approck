# Rockzza — la app de Android

Rockzza es la misma app de la caja, instalada como app de Android. El nombre
junta rock y pizza, y el ícono es una porción con forma de púa de guitarra.

## Qué cambia y qué no

- **Lo de todos los días se actualiza solo.** El APK no trae la app adentro:
  abre la que está publicada en Vercel (`https://approck.vercel.app`). Cada
  cambio que se publica llega a todos los teléfonos sin reinstalar nada.
- **Lo que suma el APK** es lo que una página no puede hacer:
  - **Imprimir sin PC**, por Bluetooth clásico, en la PT-210 (la del PIN
    0000). Chrome no puede hablar con esa impresora; el APK sí, sin RawBT.
  - El botón **atrás** de Android cierra primero lo que esté abierto (la hoja
    del pedido, un diálogo) y, en la primera pantalla, deja la app en segundo
    plano en vez de cerrarla.
  - Una **vibración corta** al agregar, cobrar o fallar.
  - Pantalla de arranque y barras del sistema con los colores de la app.
- **iPhone:** no hay APK. En iPhone se sigue usando la página.

## Instalar

1. En el teléfono, abre el enlace del APK (en
   [Releases](https://github.com/kevv21/approck/releases), el más nuevo que
   empiece con «Rockzza»).
2. Android pregunta si permites instalar apps de esa fuente: **Permitir**
   (solo para el navegador o la app de Archivos con que lo abriste).
3. **Instalar** y **Abrir**. La primera vez necesita internet; después abre
   sin señal y se pueden tomar pedidos igual que en la página.

## Usar la impresora sin PC (cuenta maestra)

1. Enciende la impresora.
2. En los ajustes de Android → **Bluetooth** → **Vincular dispositivo nuevo**
   → elige **PT-210** → PIN **0000**.
3. En Rockzza: **Más → Impresora → Impresora de este teléfono → Elegir
   impresora** → toca la PT-210.
4. **Imprimir prueba.**

Desde ese momento, todo lo que se imprime desde ESE teléfono (cobros,
reimpresiones, pre-cuentas) sale por esa impresora y no por la PC. Queda
guardada: no hay que volver a elegirla al abrir la app. **Dejar de usar** la
devuelve a la PC.

## Actualizaciones del APK

El APK cambia rara vez: solo cuando cambia la parte de Android. Cuando se
publica uno nuevo, la app muestra **«Hay una versión nueva de Rockzza ·
Descargar»**. Se descarga, se abre y se toca **Actualizar**. No se pierde
nada: las ventas están en la base y la sesión sigue.

### Para el dueño del repositorio: activar la compilación automática

GitHub compila y publica cada APK nuevo
([.github/workflows/apk.yml](../.github/workflows/apk.yml)), pero necesita la
**llave de firma**. Se configura una sola vez, desde una PC:

1. GitHub → repositorio `approck` → **Settings** → **Secrets and variables**
   → **Actions** → **New repository secret**.
2. Nombre `ANDROID_KEYSTORE_B64` → valor: el texto del archivo
   `rockzza-firma-kjd.b64.txt` (todo, en una línea).
3. Nombre `ANDROID_KEYSTORE_PASSWORD` → valor: la contraseña de la llave.

Sin esos dos secretos, el código se sigue publicando normal; solo no sale un
APK nuevo (GitHub deja un aviso amarillo en la corrida «APK»).

**Guarda una copia de la llave (`rockzza-firma-kjd.jks`) y de su contraseña
fuera de GitHub**, por ejemplo en tu Google Drive personal. Android solo acepta
una actualización firmada con la MISMA llave: si se pierde, hay que desinstalar
Rockzza en cada teléfono e instalarla de nuevo. La llave nunca va en el
repositorio: es público.

La llave está a nombre de kjd: su certificado dice `CN=kjd, O=Rockzza,
L=Managua, C=NI`, y cualquiera lo puede leer en el APK con
`apksigner verify --print-certs Rockzza-2.apk`. Es la única firma de autoría
que no se puede falsificar: solo quien tiene la llave publica actualizaciones.
La primera llave (la de `rockzza-firma.jks`, a nombre de Rock Munchies) se
descartó el 2026-10-12, antes de que el APK 1 se instalara en algún teléfono;
cualquier copia de ella se puede borrar.

## Para desarrollo

- El proyecto Android está en `android/` (Capacitor 8). La configuración, en
  `capacitor.config.ts`: el `appId` es `com.rockzza.app` y **no se puede
  cambiar** (otro appId es otra app para Android).
- El código propio de Android es `RockzzaPlugin.java`: impresoras emparejadas,
  conectar e imprimir por SPP, vibrar, abrir ajustes de Bluetooth y abrir la
  descarga de un APK (solo enlaces https de GitHub).
- En la web: `src/lib/nativo/` (puente y botón atrás), `src/lib/printer/telefono.ts`
  y `salida.ts` (por dónde sale el papel), `src/components/ImpresoraTelefono.tsx`
  y `AppNativa.tsx`, `src/lib/apk/actualizacion.ts`.
- Compilar a mano: `npx cap sync android`, y en `android/`:
  `ROCKZZA_VERSION=N ROCKZZA_KEYSTORE=… ROCKZZA_KEYSTORE_PASSWORD=… ./gradlew assembleRelease`.
  El número tiene que ser mayor que el del APK instalado.

## Lo que falta probar en un teléfono de verdad

No se pudo probar en hardware: el entorno de desarrollo no tiene emulador ni
impresora. La parte web se probó simulando el puente de Android (elegir la
impresora, imprimir, botón atrás, aviso de APK nuevo). Falta confirmar:

1. Que la PT-210 aparece en la lista y la prueba sale bien impresa (acentos y
   ancho, igual que por la PC).
2. Que la app abre sin señal después de la primera vez.
3. Que el aviso de APK nuevo descarga e instala.
