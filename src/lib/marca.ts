/**
 * LA MARCA DEL LOCAL
 *
 * Lo que cambia de un local a otro: el nombre y el logo, más los cuatro
 * colores `--acc*` de globals.css. Todo lo demás —la pared, la hiedra, el
 * ladrillo, el sticker, la firma— es de la plataforma y no se toca.
 *
 * Hoy es Rock Munchies. Hacerlo configurable por local es el paso siguiente;
 * por eso vive aquí y no escrito dentro de cada pantalla.
 */
export const MARCA = {
  nombre: "Rock Munchies",
  logo: "/marca/rock-munchies.svg",
  /** Proporción del logo: reserva su lugar antes de que cargue. */
  ancho: 564,
  alto: 355,
} as const;
