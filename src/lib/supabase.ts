import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const hayConfig = Boolean(url && key && !url.includes("xxxxxxxx"));

export const supabase = createClient(
  url ?? "http://localhost:54321",
  key ?? "anon",
  { auth: { persistSession: false } }
);
