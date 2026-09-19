# Puente de impresión

Servicio que corre en la **PC de caja**. Consulta la cola de impresión y
manda los tickets a la impresora térmica por el puerto serial que crea el
emparejamiento Bluetooth.

## Por qué existe

Safari en iPhone no implementa Web Bluetooth, y Apple no piensa hacerlo. Sin
puente, ningún iPhone puede imprimir.

La solución obvia sería que los teléfonos le manden el ticket al puente por
la red local. **No funciona:** una PWA servida por HTTPS no puede hacer
peticiones a `http://192.168.x.x`. El navegador lo bloquea por contenido
mixto y Private Network Access, y no hay forma de evitarlo desde el sitio.

Por eso el puente **consulta** en vez de recibir:

```
PC de caja     ─┐
iPhone (mesero)─┼──► cola en Supabase ◄──consulta── PUENTE ──serial──► PT-210
Tablet         ─┘                                  (PC de caja)
```

Ventaja extra: no depende de que alguien deje una pantalla abierta.
Desventaja: **necesita internet para imprimir.**

## Instalación en Windows

### 1. Emparejar la impresora

1. Encendé la PT-210.
2. Configuración → Bluetooth y dispositivos → Agregar dispositivo.
3. Emparejá (el PIN suele ser `0000` o `1234`).
4. Más opciones de Bluetooth → pestaña **Puertos COM**.
5. Anotá el puerto marcado como **Saliente**, por ejemplo `COM5`.
   El de entrada no sirve.

### 2. Instalar el servicio

```bash
cd bridge
npm install
cp .env.example .env
```

Editá `.env`:

```
SUPABASE_URL=...            # los mismos de la app web
SUPABASE_ANON_KEY=...
PUERTO=COM5                 # el puerto SALIENTE del paso anterior
BAUDIOS=9600                # si sale basura, probá 115200
```

### 3. Verificar

```bash
npm run puertos   # lista los puertos serie que ve el sistema
npm run prueba    # imprime un ticket de prueba y sale
```

Si `npm run prueba` imprime, ya está. Si no, revisá que sea el puerto
saliente y que la impresora esté encendida.

### 4. Arrancar

```bash
npm start
```

Dejalo corriendo. Para que arranque solo con Windows, creá un acceso directo
a `npm start` en la carpeta de Inicio (`Win+R` → `shell:startup`).

## Probar sin impresora

```bash
SIMULAR=true npm start
```

Los tickets se guardan como archivos `.bin` en `bridge/salida/` en vez de
imprimirse. Sirve para verificar que la cola y la conexión funcionan antes de
tener el hardware en la mano.

## Linux / macOS

**Linux:**
```bash
sudo rfcomm bind 0 <MAC_DE_LA_IMPRESORA> 1
# luego PUERTO=/dev/rfcomm0
```

**macOS:** el emparejamiento crea `/dev/tty.PT-210-SerialPort` o similar.
Usá `npm run puertos` para ver el nombre exacto.

## Comportamiento

- Consulta la cola cada 3 segundos (configurable con `INTERVALO`).
- Procesa **un ticket a la vez**: mandar dos a la vez a una térmica los
  entrelaza y salen ilegibles.
- Si un ticket falla, marca el error y **para el resto de la tanda**, para no
  gastar el rollo reventando la cola entera.
- Descarta los trabajos que fallaron 5 veces.
- Registra un latido cada 10 segundos. La app lo usa para avisar en pantalla
  si el puente se cayó.
- El puerto SPP se cierra cuando la impresora se duerme; el puente lo reabre
  solo antes del siguiente ticket.

## Problemas comunes

| Síntoma | Causa |
|---|---|
| "No se pudo cargar 'serialport'" | Falta `npm install` en `bridge/` |
| Imprime basura | Codepage o baudios equivocados. Probá 115200 |
| No imprime nada | Puerto COM de entrada en vez de saliente |
| Se corta a la mitad | Impresora con poca batería; dejala enchufada |
| "no hay señal del puente" en la app | El servicio no está corriendo |
