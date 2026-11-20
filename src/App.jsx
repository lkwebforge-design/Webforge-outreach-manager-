import { useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowUpRight, Check, ChevronDown, CirclePlus, Clipboard,
  Download, ExternalLink, Filter, Globe2, Instagram, LayoutDashboard,
  LogOut, Mail, MessageSquareText, Search, Send, Settings2, Sparkles,
  Target, Trash2, Upload, Users, X
} from "lucide-react";
import { isSupabaseConfigured, supabase } from "./lib/supabase";

const STATUSES = ["new", "researched", "draft_ready", "contacted", "replied", "interested", "client", "not_interested", "do_not_contact"];
const STATUS_LABELS = {
  new: "New", researched: "Researched", draft_ready: "Draft ready", contacted: "Contacted", replied: "Replied", interested: "Interested",
  client: "Client", not_interested: "Not interested", do_not_contact: "Do not contact"
};
const emptyLead = {
  business_name: "", instagram_handle: "", instagram_profile_url: "", website_url: "",
  location: "Kandy, Sri Lanka", business_type: "", opportunity: "", notes: ""
};

function safeText(value) { return typeof value === "string" ? value : value == null ? "" : String(value); }
function cleanHandle(value = "") {
  return safeText(value).trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/^@/, "").split(/[/?#]/)[0].toLowerCase();
}
function profileUrl(lead) {
  const savedUrl = safeText(lead?.instagram_profile_url).trim();
  if (/^https?:\/\/(www\.)?instagram\.com\//i.test(savedUrl)) return savedUrl;
  const handle = cleanHandle(lead?.instagram_handle);
  return handle ? `https://www.instagram.com/${handle}/` : "";
}
function whatsappUrl(lead) {
  let digits = safeText(lead?.phone).replace(/[^0-9]/g, "");
  const location = safeText(lead?.location).toLowerCase();
  if (digits.startsWith("0") && location.includes("sri lanka")) digits = `94${digits.slice(1)}`;
  if (digits.length >= 8 && digits.length <= 15) return `https://wa.me/${digits}`;
  return "";
}
function contactSearchUrl(lead, query) {
  const business = safeText(lead?.business_name).trim();
  const location = safeText(lead?.location).trim();
  return `https://www.google.com/search?q=${encodeURIComponent(`${business} ${query} ${location}`.trim())}`;
}
function contactOptions(lead) {
  const instagram = profileUrl(lead);
  const whatsapp = whatsappUrl(lead);
  const email = safeText(lead?.email).trim();
  const website = safeText(lead?.website_url).trim();
  const validWebsite = /^https?:\/\//i.test(website) ? website : "";
  return [
    { label: instagram ? "Instagram" : "Find Instagram", url: instagram || contactSearchUrl(lead, "site:instagram.com"), kind: "instagram", fallback: !instagram },
    { label: whatsapp ? "WhatsApp" : "Find WhatsApp", url: whatsapp || contactSearchUrl(lead, "WhatsApp contact phone number"), kind: "whatsapp", fallback: !whatsapp },
    { label: email ? "Email" : "Find Email", url: email ? `mailto:${email}` : contactSearchUrl(lead, "official contact email"), kind: "email", fallback: !email },
    { label: validWebsite ? "Website" : "Find Website", url: validWebsite || contactSearchUrl(lead, "official website"), kind: "website", fallback: !validWebsite }
  ];
}
function contactTarget(lead) {
  const options = contactOptions(lead);
  return options.find(option => option.url && !option.fallback) || options.find(option => option.url) || null;
}
function normalizeLead(lead = {}, draft = null) {
  const normalized = { ...lead };
  for (const key of ["business_name", "instagram_handle", "instagram_profile_url", "website_url", "location", "business_type", "opportunity", "notes", "email", "phone", "contact_name", "lead_category", "research_evidence"]) {
    normalized[key] = safeText(lead[key]).trim();
  }
  normalized.instagram_handle = cleanHandle(normalized.instagram_handle);
  normalized.status = STATUSES.includes(lead.status) ? lead.status : "new";
  normalized.created_at = safeText(lead.created_at) || new Date().toISOString();
  normalized.dm_draft = safeText(draft?.message_text);
  normalized.latestDraftId = draft?.id || null;
  normalized.draftStatus = ["draft", "approved", "sent", "unapproved"].includes(draft?.status) ? draft.status : null;
  return normalized;
}
function validHttpUrl(value) {
  if (!value) return true;
  try { const url = new URL(value); return url.protocol === "https:" || url.protocol === "http:"; }
  catch { return false; }
}
function makeDraftVariants(lead = {}) {
  const name = safeText(lead.business_name).trim() || "your business";
  const category = safeText(lead.business_type).trim() || "business";
  const observation = safeText(lead.opportunity || lead.research_evidence || lead.notes).trim().replace(/[.!?]+$/, "");
  const detail = observation || \`I noticed there may be an opportunity to make it easier for customers to discover \${name} and learn what you offer\`;
  const signature = "\n\n— WebForge Signature";
  return [
    { label: "Personal & friendly", message: \`Hi \${name}! I came across your \${category} business and wanted to reach out. \${detail}. I have a couple of ideas that could help more people find the information they need before choosing a business like yours. Would you be open to me sharing them?\${signature}\` },
    { label: "Customer-focused", message: \`Hi! I was checking out \${name} and started thinking about the experience customers have before they visit. \${detail}. A clear, helpful website can answer common questions and make it easier for people to contact you. Would it be okay if I sent over a few suggestions?\${signature}\` },
    { label: "Short & direct", message: \`Hey \${name}! I'm with WebForge Signature. I noticed an opportunity for your \${category} business: \${detail}. We create modern websites that help customers understand your services and get in touch easily. Open to seeing a few ideas?\${signature}\` },
    { label: "Value-first / soft approach", message: \`Hello \${name}, I hope you're doing well. I was researching \${category} businesses and came across yours. \${detail}. I don't want to send you a generic sales pitch — I'd rather share a few practical ideas that may improve how customers discover and learn about your business online. Would that be useful?\${signature}\` }
  ];
}
function makeDraft(lead = {}) { return makeDraftVariants(lead)[0].message; }
function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}
function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], next = text[i + 1];
    if (c === '"' && quoted && next === '"') { cell += '"'; i++; }
    else if (c === '"') quoted = !quoted;
    else if (c === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && next === "\n") i++;
      row.push(cell); if (row.some(v => v.trim())) rows.push(row);
      row = []; cell = "";
    } else cell += c;
  }
  row.push(cell); if (row.some(v => v.trim())) rows.push(row);
  const headers = (rows.shift() || []).map(h => h.trim().toLowerCase());
  return rows.map(values => Object.fromEntries(headers.map((h, i) => [h, (values[i] || "").trim()])));
}

function AuthScreen() {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError("");
    const action = mode === "signin"
      ? supabase.auth.signInWithPassword({ email, password })
      : supabase.auth.signUp({ email, password, options: { emailRedirectTo: "https://lkwebforge-design.github.io/Webforge-outreach-manager-/" } });
    const { error: authError } = await action;
    setBusy(false);
    if (authError) setError(authError.message);
    else if (mode === "signup") setError("Account created. If email confirmation is enabled, check your inbox to verify it, then sign in.");
  };
  return <main className="auth-wrap"><div className="auth-card">
    <Brand />
    <div className="eyebrow">WEBFORGE SIGNATURE / SALES WORKSPACE</div>
    <h1>{mode === "signin" ? "Welcome back." : "Create your workspace."}</h1>
    <p className="muted">Manage prospects, prepare thoughtful outreach, and keep every conversation organized.</p>
    <form onSubmit={submit} className="auth-form">
      <label>Email address<input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" /></label>
      <label>Password<input type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 6 characters" /></label>
      {error && <div className="notice">{error}</div>}
      <button className="btn primary full" disabled={busy}>{busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}</button>
    </form>
    <button className="text-btn" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); }}>
      {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
    </button>
  </div></main>;
}

function Brand() {
  return <div className="brand"><div className="brand-mark">W<span>.</span></div><div><strong>WEBFORGE</strong><small>OUTREACH MANAGER</small></div></div>;
}

export default function App() {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);
  const [leads, setLeads] = useState([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [view, setView] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyLead);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState("");
  const [draftVariants, setDraftVariants] = useState([]);
  const [activeVariant, setActiveVariant] = useState(0);
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const [busyImport, setBusyImport] = useState(false);
  const [showBulkQueue, setShowBulkQueue] = useState(false);

  useEffect(() => {
    if (!supabase) { setReady(true); return; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => listener.subscription.unsubscribe();
  }, []);

  async function loadLeads() {
    if (!session?.user) return;
    const { data, error } = await supabase.from("outreach_leads").select("*").order("created_at", { ascending: false });
    if (error) { notify(error.message); return; }
    const { data: drafts, error: draftError } = await supabase.from("outreach_dm_drafts").select("*").order("created_at", { ascending: false });
    if (draftError) { notify(draftError.message); return; }
    const latest = new Map();
    for (const item of drafts || []) if (!latest.has(item.lead_id)) latest.set(item.lead_id, item);
    setLeads((data || []).map(lead => normalizeLead(lead, latest.get(lead.id) || null)));
  }
  useEffect(() => { loadLeads(); }, [session?.user?.id]);
  function notify(message) { setToast(message); window.setTimeout(() => setToast(""), 3200); }

  const filtered = useMemo(() => leads.filter(lead => {
    const q = query.toLowerCase();
    const matches = !q || [lead.business_name, lead.instagram_handle, lead.location, lead.business_type].some(v => safeText(v).toLowerCase().includes(q));
    const status = statusFilter === "all" || lead.status === statusFilter;
    const section = view === "queue" ? lead.draftStatus === "draft"
      : view === "approved" ? lead.draftStatus === "approved"
      : view === "unapproved" ? lead.draftStatus === "unapproved"
      : view === "followups" ? ["contacted", "replied", "interested"].includes(lead.status)
      : view === "underrated" ? lead.lead_category === "underrated" : true;
    return matches && status && section;
  }), [leads, query, statusFilter, view]);

  const stats = useMemo(() => ({
    total: leads.length, new: leads.filter(l => l.status === "new").length,
    queue: leads.filter(l => l.draftStatus === "draft").length,
    contacted: leads.filter(l => ["contacted", "replied", "interested"].includes(l.status)).length,
    clients: leads.filter(l => l.status === "client").length,
    approved: leads.filter(l => l.draftStatus === "approved").length,
    unapproved: leads.filter(l => l.draftStatus === "unapproved").length,
    underrated: leads.filter(l => l.lead_category === "underrated").length
  }), [leads]);

  function openAdd() { setEditing(null); setForm(emptyLead); setShowAdd(true); }
  function openEdit(lead) { setEditing(lead); setForm({ ...emptyLead, ...lead }); setShowAdd(true); }
  async function saveLead(e) {
    e.preventDefault(); setSaving(true);
    const businessName = safeText(form.business_name).trim();
    const handle = cleanHandle(form.instagram_handle);
    const instagramUrl = safeText(form.instagram_profile_url).trim() || (handle ? `https://www.instagram.com/${handle}/` : "");
    const websiteUrl = safeText(form.website_url).trim();
    if (!businessName) { notify("Business name is required."); setSaving(false); return; }
    if (handle && !/^[a-z0-9._]{1,30}$/i.test(handle)) { notify("That Instagram handle doesn't look valid. Check it before saving."); setSaving(false); return; }
    if (!validHttpUrl(instagramUrl) || !validHttpUrl(websiteUrl)) { notify("Website and Instagram links must be valid http or https URLs."); setSaving(false); return; }
    const payload = {
      business_name: businessName,
      instagram_handle: handle || null,
      instagram_profile_url: instagramUrl || null,
      website_url: websiteUrl || null,
      phone: safeText(form.phone).trim() || null,
      email: safeText(form.email).trim() || null,
      location: safeText(form.location).trim() || null,
      business_type: safeText(form.business_type).trim() || null,
      opportunity: safeText(form.opportunity).trim() || null,
      notes: safeText(form.notes).trim() || null,
      lead_category: form.lead_category || "standard",
      research_evidence: safeText(form.research_evidence).trim() || null
    };
    let result;
    if (editing) result = await supabase.from("outreach_leads").update(payload).eq("id", editing.id).select().single();
    else result = await supabase.from("outreach_leads").insert({ ...payload, user_id: session.user.id }).select().single();
    setSaving(false);
    if (result.error) {
      notify(result.error.code === "23505" ? "Duplicate blocked — this Instagram handle is already in your lead list." : result.error.message);
      return;
    }
    setShowAdd(false); notify(editing ? "Lead updated." : "Lead saved."); await loadLeads();
  }
  async function updateStatus(lead, status) {
    const { error } = await supabase.from("outreach_leads").update({
      status, ...(status === "contacted" ? { last_contacted_at: new Date().toISOString() } : {})
    }).eq("id", lead.id);
    if (error) notify(error.message); else { notify("Lead status updated."); loadLeads(); }
  }
  async function deleteLead(lead) {
    if (!window.confirm(`Delete ${lead.business_name} from your leads?`)) return;
    const { error } = await supabase.from("outreach_leads").delete().eq("id", lead.id);
    if (error) notify(error.message); else { setSelected(null); notify("Lead deleted."); loadLeads(); }
  }
  async function saveDraft(lead, text) {
    const payload = { user_id: session.user.id, lead_id: lead.id, message_text: text, status: lead.draftStatus === "unapproved" ? "unapproved" : "draft" };
    const result = lead.latestDraftId
      ? await supabase.from("outreach_dm_drafts").update({ message_text: text, status: lead.draftStatus === "unapproved" ? "unapproved" : "draft" }).eq("id", lead.latestDraftId).select("id").single()
      : await supabase.from("outreach_dm_drafts").insert(payload).select("id").single();
    if (result.error) { notify(`Message generated, but saving failed: ${result.error.message}`); return false; }
    const savedDraftId = result.data?.id || lead.latestDraftId;
    if (["new", "researched"].includes(lead.status)) {
      const { error } = await supabase.from("outreach_leads").update({ status: "draft_ready" }).eq("id", lead.id);
      if (error) notify(`Draft saved, but lead status could not be updated: ${error.message}`);
    }
    const activity = await supabase.from("outreach_activity").insert({ user_id: session.user.id, lead_id: lead.id, event_type: "dm_drafted", details: "DM draft saved" });
    if (activity.error) notify(`Draft saved, but activity log failed: ${activity.error.message}`);
    else notify("DM generated and saved successfully.");
    setSelected(current => current?.id === lead.id
      ? { ...current, dm_draft: text, latestDraftId: savedDraftId, draftStatus: current.draftStatus === "unapproved" ? "unapproved" : "draft" }
      : current);
    await loadLeads();
    return true;
  }

  async function generateAndSaveDraft(lead) {
    if (!lead?.id || generatingDraft) return;
    setGeneratingDraft(true);
    try {
      const variants = makeDraftVariants(lead);
      setDraftVariants(variants);
      setActiveVariant(0);
      setDraft(variants[0].message);
      notify("4 message styles generated. Saving all options…");
      const payloads = variants.map(item => ({
        user_id: session.user.id, lead_id: lead.id, message_text: item.message, status: "draft"
      }));
      const { data, error } = await supabase.from("outreach_dm_drafts").insert(payloads).select("id");
      if (error) throw error;
      const latestId = data?.[data.length - 1]?.id || null;
      if (["new", "researched"].includes(lead.status)) {
        const { error: statusError } = await supabase.from("outreach_leads").update({ status: "draft_ready" }).eq("id", lead.id);
        if (statusError) notify(\`Messages saved, but lead status could not be updated: \${statusError.message}\`);
      }
      await supabase.from("outreach_activity").insert({
        user_id: session.user.id, lead_id: lead.id, event_type: "dm_drafted",
        details: "Generated and saved four DM variations"
      });
      setSelected(current => current?.id === lead.id
        ? { ...current, dm_draft: variants[0].message, latestDraftId: latestId, draftStatus: "draft" }
        : current);
      await loadLeads();
      notify("4 message options generated and saved. Choose the best one for this lead.");
    } catch (error) {
      notify(\`Could not save message options: \${error?.message || "Please try again."}\`);
    } finally {
      setGeneratingDraft(false);
    }
  }
  async function importCsv(file) {
    setBusyImport(true);
    try {
      const rows = parseCsv(await file.text());
      let added = 0, skipped = 0;
      for (const row of rows) {
        const handle = cleanHandle(row.instagram_handle || row.instagram || row.handle);
        if (!(row.business_name || row.name)) { skipped++; continue; }
        const { error } = await supabase.from("outreach_leads").insert({
          user_id: session.user.id, business_name: row.business_name || row.name,
          instagram_handle: handle || null, instagram_profile_url: row.instagram_url || row.instagram_profile_url || (handle ? `https://www.instagram.com/${handle}/` : null),
          website_url: row.website_url || row.website || "", email: row.email || null, phone: row.phone || row.whatsapp || null,
          location: row.location || "Kandy, Sri Lanka",
          business_type: row.category || row.business_type || "", opportunity: row.opportunity || "", notes: row.notes || "", source: "other"
        });
        if (error?.code === "23505") skipped++; else if (error) skipped++; else added++;
      }
      notify(`Import complete: ${added} added, ${skipped} skipped (duplicates or incomplete rows).`);
      await loadLeads();
    } catch { notify("Could not read this CSV file."); }
    setBusyImport(false);
  }
  function exportCsv() {
    const headers = ["business_name","instagram_handle","instagram_profile_url","website_url","location","business_type","opportunity","notes","dm_draft","status","lead_category","research_evidence"];
    const csv = [headers.join(","), ...leads.map(l => headers.map(h => csvCell(l[h])).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "webforge-leads.csv"; a.click(); URL.revokeObjectURL(url);
  }
  async function approveDraft(lead) {
    const message = (selected?.id === lead.id ? draft : lead.dm_draft) || makeDraft(lead);
    const now = new Date().toISOString();
    let error = null;
    if (lead.latestDraftId) {
      ({ error } = await supabase.from("outreach_dm_drafts").update({ message_text: message, status: "approved", approved_at: now }).eq("id", lead.latestDraftId));
    } else {
      const result = await supabase.from("outreach_dm_drafts").insert({ user_id: session.user.id, lead_id: lead.id, message_text: message, status: "approved", approved_at: now });
      error = result.error;
    }
    if (error) { notify(error.message); return; }
    await supabase.from("outreach_activity").insert({ user_id: session.user.id, lead_id: lead.id, event_type: "dm_approved", details: "Draft approved for manual sending" });
    notify("Draft approved."); await loadLeads();
  }
  async function unapproveDraft(lead) {
    if (!lead.latestDraftId || lead.draftStatus !== "approved") return;
    const confirmed = window.confirm(`Unapprove ${lead.business_name}? It will move to the Unapproved list and won't appear in approved prospects.`);
    if (!confirmed) return;
    const { error } = await supabase.from("outreach_dm_drafts")
      .update({ status: "unapproved", approved_at: null }).eq("id", lead.latestDraftId).eq("status", "approved");
    if (error) { notify(error.message); return; }
    await supabase.from("outreach_activity").insert({
      user_id: session.user.id, lead_id: lead.id, event_type: "dm_unapproved",
      details: "Draft approval withdrawn and returned to review queue"
    });
    setSelected(current => current?.id === lead.id ? { ...current, draftStatus: "unapproved" } : current);
    notify("Prospect moved to Unapproved.");
    await loadLeads();
  }

  async function approveAllProspects() {
    const eligible = leads.filter(lead => !["approved", "sent", "unapproved"].includes(lead.draftStatus));
    if (!eligible.length) { notify("No prospects are waiting for approval."); return; }
    const confirmed = window.confirm(`Prepare and approve messages for all ${eligible.length} eligible prospects? This only approves drafts; it will not send any messages.`);
    if (!confirmed) return;
    setSaving(true);
    const now = new Date().toISOString();
    const missing = eligible.filter(lead => !lead.latestDraftId);
    if (missing.length) {
      const { error } = await supabase.from("outreach_dm_drafts").insert(missing.map(lead => ({
        user_id: session.user.id, lead_id: lead.id, message_text: makeDraft(lead), status: "approved", approved_at: now
      })));
      if (error) { notify(error.message); setSaving(false); return; }
    }
    const existingIds = eligible.filter(lead => lead.latestDraftId).map(lead => lead.latestDraftId);
    if (existingIds.length) {
      const { error } = await supabase.from("outreach_dm_drafts").update({ status: "approved", approved_at: now })
        .in("id", existingIds).in("status", ["draft", "unapproved"]);
      if (error) { notify(error.message); setSaving(false); return; }
    }
    await supabase.from("outreach_activity").insert(eligible.map(lead => ({
      user_id: session.user.id, lead_id: lead.id, event_type: "dm_approved",
      details: "Prospect draft prepared and approved in bulk for manual sending"
    })));
    setSaving(false);
    notify(`Approved ${eligible.length} prospects. No messages were sent.`);
    await loadLeads();
  }

  async function markSent(lead) {
    const now = new Date().toISOString();
    const message = (selected?.id === lead.id ? draft : lead.dm_draft) || makeDraft(lead);
    let error = null;
    if (lead.latestDraftId) {
      ({ error } = await supabase.from("outreach_dm_drafts").update({ message_text: message, status: "sent", sent_at: now, sent_method: "manual_instagram" }).eq("id", lead.latestDraftId));
    } else {
      const result = await supabase.from("outreach_dm_drafts").insert({ user_id: session.user.id, lead_id: lead.id, message_text: message, status: "sent", sent_at: now, sent_method: "manual_instagram" });
      error = result.error;
    }
    if (error) { notify(error.message); return; }
    const leadUpdate = await supabase.from("outreach_leads").update({ status: "contacted", last_contacted_at: now }).eq("id", lead.id);
    if (leadUpdate.error) { notify(leadUpdate.error.message); return; }
    await supabase.from("outreach_activity").insert({ user_id: session.user.id, lead_id: lead.id, event_type: "dm_sent_manually", details: "User marked manually sent" });
    notify("Marked as manually sent."); setSelected(null); await loadLeads();
  }
  async function copyDraft(text) { await navigator.clipboard.writeText(text); notify("DM copied. Review it before sending."); }

  if (!ready) return <div className="loading">Loading WebForge workspace…</div>;
  if (!isSupabaseConfigured) return <main className="auth-wrap"><div className="auth-card"><Brand/><h1>Connect your workspace.</h1><p className="muted">Add your Supabase URL and publishable key to the local <code>.env</code> file, then restart the dev server.</p><p className="notice">Never use a service-role or secret key in this frontend.</p></div></main>;
  if (!session) return <AuthScreen />;

  return <div className="app-shell">
    <aside className="sidebar">
      <Brand />
      <div className="side-label">WORKSPACE</div>
      <button className={view === "all" ? "nav-item active" : "nav-item"} onClick={() => setView("all")}><LayoutDashboard size={17}/> Overview</button>
      <button className={view === "queue" ? "nav-item active" : "nav-item"} onClick={() => setView("queue")}><Send size={17}/> Draft queue <span>{stats.queue}</span></button>
      <button className={view === "approved" ? "nav-item active" : "nav-item"} onClick={() => setView("approved")}><Check size={17}/> Approved prospects <span>{stats.approved}</span></button>
      <button className={view === "unapproved" ? "nav-item active" : "nav-item"} onClick={() => setView("unapproved")}><X size={17}/> Unapproved <span>{stats.unapproved}</span></button>
      <button className={view === "followups" ? "nav-item active" : "nav-item"} onClick={() => setView("followups")}><MessageSquareText size={17}/> Follow-ups</button>
      <button className={view === "underrated" ? "nav-item active" : "nav-item"} onClick={() => {setView("underrated");setStatusFilter("all");}}><Sparkles size={17}/> Underrated Leads <span>{stats.underrated}</span></button>
      <div className="sidebar-bottom">
        <div className="account"><div className="avatar">{session.user.email?.[0]?.toUpperCase() || "W"}</div><div><strong>WebForge</strong><small>{session.user.email}</small></div></div>
        <button className="nav-item" onClick={() => supabase.auth.signOut()}><LogOut size={17}/> Sign out</button>
      </div>
    </aside>

    <main className="main">
      <header className="topbar"><div className="crumb">WebForge Signature <span>/</span> {view === "all" ? "Overview" : view === "queue" ? "Draft queue" : view === "approved" ? "Approved prospects" : view === "unapproved" ? "Unapproved prospects" : view === "underrated" ? "Underrated Leads" : "Follow-ups"}</div><div className="top-actions"><span className="secure"><span/> Private workspace</span><button className="btn primary" onClick={openAdd}><CirclePlus size={16}/> Add lead</button></div></header>
      <section className="page-head"><div><div className="eyebrow">YOUR SALES PIPELINE</div><h1>{view === "all" ? "Outreach overview" : view === "queue" ? "Ready for review" : view === "approved" ? "Approved prospects" : view === "unapproved" ? "Unapproved prospects" : view === "underrated" ? "Underrated Leads" : "Keep conversations moving."}</h1><p className="muted">{view === "queue" ? "Review saved drafts and approve the messages you want to use." : view === "approved" ? "These prospects have an approved message and are ready for your manual outreach batch." : view === "unapproved" ? "Prospects you reviewed and chose not to approve. They stay separate from the draft queue." : view === "followups" ? "Track prospects who have already been contacted or shown interest." : view === "underrated" ? "Businesses with an underserved online presence and a ready-to-use customer-focused DM." : "A clear view of every prospect, every draft, and every opportunity."}</p></div><div className="head-actions"><label className="btn secondary import-btn"><Upload size={16}/>{busyImport ? "Importing…" : "Import CSV"}<input type="file" accept=".csv,text/csv" disabled={busyImport} onChange={e => e.target.files?.[0] && importCsv(e.target.files[0])}/></label><button className="btn secondary" onClick={exportCsv}><Download size={16}/> Export</button></div></section>

      <section className="stats-grid">
        <Stat icon={<Users/>} label="Total prospects" value={stats.total} note="All saved leads" active={view === "all"} onClick={() => {setView("all");setStatusFilter("all");}}/>
        <Stat icon={<Sparkles/>} label="New leads" value={stats.new} note="Not contacted yet" active={false} onClick={() => {setView("all");setStatusFilter("new");}}/>
        <Stat icon={<Send/>} label="Draft queue" value={stats.queue} note="Awaiting approval" active={view === "queue"} onClick={() => {setView("queue");setStatusFilter("all");}}/>
        <Stat icon={<Check/>} label="Approved prospects" value={stats.approved} note="Approved for outreach" active={view === "approved"} onClick={() => {setView("approved");setStatusFilter("all");}}/>
        <Stat icon={<X/>} label="Unapproved" value={stats.unapproved} note="Removed from approval" active={view === "unapproved"} onClick={() => {setView("unapproved");setStatusFilter("all");}}/>
        <Stat icon={<Activity/>} label="In conversation" value={stats.contacted} note="Contacted or interested" active={view === "followups"} onClick={() => {setView("followups");setStatusFilter("all");}}/>
        <Stat icon={<Target/>} label="Clients" value={stats.clients} note="Won opportunities" active={false} onClick={() => {setView("all");setStatusFilter("client");}}/>
        <Stat icon={<Sparkles/>} label="Underrated Leads" value={stats.underrated} note="Hidden growth opportunities" active={view === "underrated"} onClick={() => {setView("underrated");setStatusFilter("all");}}/>
      </section>

      <section className="panel">
        <div className="panel-head"><div><h2>{view === "queue" ? "Message review queue" : view === "approved" ? "Approved prospects" : view === "unapproved" ? "Unapproved prospects" : view === "followups" ? "Follow-up pipeline" : view === "underrated" ? "Underrated Leads" : "All prospects"}</h2><p className="muted">{filtered.length} records · duplicate Instagram handles are blocked</p></div><div className="filters"><div className="searchbox"><Search size={16}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search business or handle"/></div><div className="select-wrap"><Filter size={15}/><select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="all">All statuses</option>{STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}</select><ChevronDown size={14}/></div></div>{view === "all" && <button className="btn primary" onClick={approveAllProspects} disabled={saving || !leads.some(l => !["approved", "sent", "unapproved"].includes(l.draftStatus))}><Check size={15}/>{saving ? "Approving…" : "Approve all prospects"}</button>}</div>
        {filtered.length === 0 ? <div className="empty"><div className="empty-icon"><Instagram/></div><h3>{view === "approved" ? "No approved prospects yet" : view === "unapproved" ? "No unapproved prospects" : "No prospects here yet"}</h3><p className="muted">{view === "approved" ? "Approve a saved message draft to add a business to this list." : view === "unapproved" ? "When you unapprove a prospect, it will appear here." : "Add a lead manually or import your verified Instagram prospect list."}</p>{view !== "approved" && <button className="btn primary" onClick={openAdd}><CirclePlus size={16}/> Add your first lead</button>}</div> :
          <div className="table-wrap"><table><thead><tr><th>BUSINESS</th><th>LOCATION</th><th>OPPORTUNITY</th><th>STATUS</th><th>APPROVAL</th><th>ADDED</th><th></th></tr></thead><tbody>{filtered.map(lead => <tr key={lead.id} onClick={() => { setSelected(lead); setDraft(safeText(lead.dm_draft) || makeDraft(lead)); }}><td><div className="business-cell"><div className="ig-avatar"><Instagram size={16}/></div><div><strong>{lead.business_name}</strong><small>@{lead.instagram_handle}</small></div></div></td><td className="location-cell">{lead.location || "—"}</td><td className="opportunity">{lead.opportunity || lead.business_type || "Needs review"}</td><td><span className={`status status-${lead.status}`}>{STATUS_LABELS[lead.status]}</span></td><td><span className={`approval-pill ${["approved", "sent"].includes(lead.draftStatus) ? "is-approved" : "is-pending"}`}>{["approved", "sent"].includes(lead.draftStatus) ? "Approved" : "Not approved"}</span></td><td>{new Date(lead.created_at).toLocaleDateString()}</td><td><button className="icon-btn" onClick={e => { e.stopPropagation(); setSelected(lead); setDraft(safeText(lead.dm_draft) || makeDraft(lead)); }}><ArrowUpRight size={17}/></button></td></tr>)}</tbody></table></div>}
      </section>
      {view === "approved" && filtered.length > 0 && <div className="bulk-bar"><div><strong>{filtered.length} approved prospect{filtered.length === 1 ? "" : "s"}</strong><small>Messages are prepared for manual sending. Nothing is sent automatically.</small></div><button className="btn primary" onClick={() => setShowBulkQueue(true)}><Send size={15}/> Start bulk-send queue</button></div>}
      <footer className="footer-note"><span><Check size={14}/> Duplicate protection active</span><span>Manual review before every Instagram send · WebForge Signature</span></footer>
    </main>

    {showBulkQueue && <div className="overlay" onMouseDown={e => e.target === e.currentTarget && setShowBulkQueue(false)}><div className="detail-modal bulk-modal"><div className="modal-head"><div><div className="eyebrow">APPROVED OUTREACH BATCH</div><h2>Send approved messages</h2><p className="muted">Copy each message, send it in Instagram, then mark it sent here. This queue will never auto-send or mark a message sent by itself.</p></div><button className="icon-btn" onClick={() => setShowBulkQueue(false)}><X/></button></div><div className="bulk-list">{leads.filter(l => l.draftStatus === "approved").map(lead => <div className="bulk-item" key={lead.id}><div><strong>{lead.business_name}</strong><small>@{lead.instagram_handle || "Instagram handle missing"}</small><p>{(lead.dm_draft || makeDraft(lead)).slice(0,150)}…</p></div><div className="bulk-item-actions"><button className="btn secondary" onClick={() => {const target = contactTarget(lead); if (target) window.open(target.url, "_blank", "noopener,noreferrer"); else notify("No Instagram, WhatsApp number, email, or website is saved for this prospect."); copyDraft(lead.dm_draft || makeDraft(lead));}}><Clipboard size={14}/> Copy + open contact</button><button className="btn primary" onClick={() => markSent(lead)}>Mark sent</button></div></div>)}</div><div className="send-warning"><MessageSquareText size={16}/><span>“Copy + open” prepares one message at a time. You must send it yourself in Instagram before choosing “Mark sent”. Automatic Instagram cold-DM sending is not connected.</span></div></div></div>}
    {showAdd && <div className="overlay" onMouseDown={e => e.target === e.currentTarget && setShowAdd(false)}><form className="modal" onSubmit={saveLead}><div className="modal-head"><div><div className="eyebrow">{editing ? "EDIT PROSPECT" : "NEW PROSPECT"}</div><h2>{editing ? "Update lead" : "Add a business lead"}</h2></div><button type="button" className="icon-btn" onClick={() => setShowAdd(false)}><X/></button></div>
      <div className="form-grid"><label>Business name *<input required value={form.business_name} onChange={e => setForm({...form,business_name:e.target.value})} placeholder="e.g. Cafe Example"/></label><label>Instagram handle (optional)<input value={form.instagram_handle} onChange={e => setForm({...form,instagram_handle:e.target.value})} placeholder="@businessname or leave blank"/></label><label>Instagram profile URL<input value={form.instagram_profile_url} onChange={e => setForm({...form,instagram_profile_url:e.target.value})} placeholder="https://instagram.com/…"/></label><label>Website URL<input value={form.website_url} onChange={e => setForm({...form,website_url:e.target.value})} placeholder="https://… or leave blank"/></label><label>WhatsApp / phone<input value={form.phone || ""} onChange={e => setForm({...form,phone:e.target.value})} placeholder="+94… / +91…"/></label><label>Contact email<input type="email" value={form.email || ""} onChange={e => setForm({...form,email:e.target.value})} placeholder="hello@business.com"/></label><label>Location<input value={form.location} onChange={e => setForm({...form,location:e.target.value})} placeholder="Kandy, Sri Lanka"/></label><label>Business category<input value={form.business_type} onChange={e => setForm({...form,business_type:e.target.value})} placeholder="Cafe, salon, retail…"/></label><label className="wide">Opportunity / specific observation<textarea value={form.opportunity} onChange={e => setForm({...form,opportunity:e.target.value})} placeholder="What could WebForge improve for this business?"/></label><label className="wide">Notes<textarea value={form.notes} onChange={e => setForm({...form,notes:e.target.value})} placeholder="Public details, contact context, next steps…"/></label></div>
      <div className="modal-actions"><button type="button" className="btn secondary" onClick={() => setShowAdd(false)}>Cancel</button><button className="btn primary" disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Save prospect"}</button></div></form></div>}

    {selected && <div className="overlay" onMouseDown={e => e.target === e.currentTarget && setSelected(null)}><div className="detail-modal"><div className="modal-head"><div><div className="eyebrow">PROSPECT DETAILS</div><h2>{selected.business_name}</h2><p className="muted">{selected.instagram_handle ? `@${selected.instagram_handle}` : "No Instagram profile"} · {selected.location || "Location not set"}</p></div><button className="icon-btn" onClick={() => setSelected(null)}><X/></button></div>
      <div className="detail-links">{contactOptions(selected).map(option => <a key={option.kind} className={option.fallback ? "contact-fallback" : ""} href={option.url} target="_blank" rel="noreferrer" aria-label={`${option.fallback ? "Search for" : "Open"} ${option.label}`} title={option.fallback ? "No verified detail saved; search for this business contact" : `Open saved ${option.label} detail`}>{option.kind === "instagram" ? <Instagram size={16}/> : option.kind === "whatsapp" ? <MessageSquareText size={16}/> : option.kind === "email" ? <Mail size={16}/> : <Globe2 size={16}/>} {option.label} <ExternalLink size={13}/></a>)}</div>
      <div className="draft-label">MESSAGE OPTIONS {draftVariants.length > 0 && <span className="muted">· {draftVariants.length} styles for this lead</span>}</div>
      {draftVariants.length > 0 && <div className="variant-list">{draftVariants.map((item, index) => <button type="button" key={item.label} className={activeVariant === index ? "variant-option active" : "variant-option"} onClick={() => { setActiveVariant(index); setDraft(item.message); }}><strong>{index + 1}. {item.label}</strong><span>{item.message.slice(0, 105)}…</span></button>)}</div>}
      <label className="draft-label">EDIT SELECTED MESSAGE<textarea className="draft-area" value={draft} onChange={e => setDraft(e.target.value)} rows={9}/></label>
      <div className="draft-actions"><button className="btn secondary" onClick={() => generateAndSaveDraft(selected)} disabled={generatingDraft}><Sparkles size={15}/> {generatingDraft ? "Generating…" : "Generate 4 message styles"}</button><button className="btn secondary" onClick={() => saveDraft(selected,draft)}><Check size={15}/> Save draft</button>{["approved", "sent"].includes(selected.draftStatus) ? <button className="btn secondary" onClick={() => unapproveDraft(selected)} disabled={selected.draftStatus === "sent"}>Unapprove</button> : <button className="btn secondary" onClick={() => approveDraft(selected)}>Approve</button>}<button className="btn primary" onClick={() => copyDraft(draft)}><Clipboard size={15}/> Copy message</button></div>
      <div className="send-warning"><MessageSquareText size={16}/><span>Review the message, open Instagram, and send it yourself. This tool does not auto-send cold DMs.</span></div><div className="draft-actions"><button className="btn secondary" onClick={() => markSent(selected)}>Mark manually sent</button></div>
      <div className="detail-bottom"><label>Status<select value={selected.status} onChange={e => { updateStatus(selected,e.target.value); setSelected({...selected,status:e.target.value}); }} >{STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}</select></label><button className="btn danger" onClick={() => deleteLead(selected)}><Trash2 size={15}/> Delete lead</button></div>
      <button className="text-btn edit-link" onClick={() => { setSelected(null); openEdit(selected); }}>Edit prospect details</button>
    </div></div>}
    {toast && <div className="toast"><Check size={16}/>{toast}</div>}
  </div>;
}

function Stat({ icon, label, value, note, onClick, active }) {
  return <button type="button" className={active ? "stat-card stat-card-active" : "stat-card"} onClick={onClick}><div className="stat-top"><span className="stat-icon">{icon}</span><span className="stat-label">{label}</span></div><div className="stat-value">{value}</div><div className="stat-note">{note}</div></button>;
}