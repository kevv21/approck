import { FIRMA } from "@/lib/autoria";

/** Firma de autoría (ver `lib/autoria.ts`). Pequeña y tenue a propósito. */
export default function Firma({ className = "" }: { className?: string }) {
  return <p className={`firma ${className}`}>{FIRMA}</p>;
}
