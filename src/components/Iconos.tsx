/**
 * Íconos compartidos, sacados del sistema de Figma («1 · Sistema»). Trazo de
 * 2px y puntas redondas, como los de la barra de abajo. Toman el color del
 * texto que los rodea.
 */

type P = { size?: number; className?: string };

const Trazo = ({ size = 20, className, children }: P & { children: React.ReactNode }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
       className={className} aria-hidden="true">
    {children}
  </svg>
);

/** La cuenta maestra: el sombrero de copa de la R y la M del logo. */
export const Sombrero = ({ size = 20, className }: P) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor"
       className={className} aria-hidden="true">
    <path d="M7.6 2.5h8.8c.7 0 1.2.6 1.1 1.3l-.8 6.7H7.3l-.8-6.7c-.1-.7.4-1.3 1.1-1.3Z" />
    <path d="M7.4 12h9.2l-.3 2.2H7.7Z" />
    <path d="M2 17.2c0-1.3 4.5-2.4 10-2.4s10 1.1 10 2.4-4.5 2.6-10 2.6S2 18.5 2 17.2Z" />
  </svg>
);

/** La cuenta de revisión: mira, no toca. */
export const Ojo = (p: P) => (
  <Trazo {...p}>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
  </Trazo>
);

export const Check = (p: P) => <Trazo {...p}><path d="M20 6 9 17l-5-5" /></Trazo>;

export const Borrar = (p: P) => (
  <Trazo {...p}>
    <path d="M21 5H8l-6 7 6 7h13a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1Z" />
    <path d="m16 9-6 6m0-6 6 6" />
  </Trazo>
);

export const Buscar = (p: P) => (
  <Trazo {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Trazo>
);

export const Menos = (p: P) => <Trazo {...p}><path d="M6 12h12" /></Trazo>;

export const Alerta = (p: P) => <Trazo {...p}><path d="M12 7v6" /><path d="M12 17h.01" /></Trazo>;

export const Lapiz = (p: P) => (
  <Trazo {...p}><path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17Z" /><path d="m14 7 3 3" /></Trazo>
);
