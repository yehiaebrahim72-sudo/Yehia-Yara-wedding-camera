// هذا هو Publishable Key فقط. لا تضع Secret / service_role key هنا.
const SUPABASE_URL = "https://nlgxrbvvcsmvzvxtabir.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_HA8wt6S31v561LfBthc9Og_nu7HoSqc";

const { createClient } = window.supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const BUCKET = "wedding-media";
const TABLE = "wedding_media";
