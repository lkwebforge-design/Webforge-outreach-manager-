# WebForge Outreach Manager

A private-workflow CRM for WebForge Signature: lead imports, duplicate protection, personalized Instagram DM drafts, a manual send queue, and follow-up tracking.

## Stack
- React + Vite
- Supabase Auth + Postgres
- Lucide icons

## Local setup
1. Install Node.js 20.19+ or 22.12+.
2. Run `npm install`.
3. Copy `.env.example` to `.env`.
4. Add the Supabase project URL and the project's **publishable** key (or legacy anon key). Never put a service-role/secret key in frontend environment variables.
5. Run `npm run dev`.

## Database
The `outreach_leads`, `outreach_dm_drafts`, and `outreach_activity` tables are provisioned in the dedicated WebForge Outreach Manager Supabase project. Row Level Security is enabled and policies scope records to the signed-in user.

## Outreach safety
This app prepares and tracks messages. It does not automate unsolicited Instagram DMs, scrape private data, or bypass Meta restrictions. A user reviews each draft, opens the public Instagram profile, sends manually, and then marks the lead contacted.

## Import format
CSV columns: `business_name,instagram_handle,instagram_url,website_url,location,category,opportunity,notes`.
