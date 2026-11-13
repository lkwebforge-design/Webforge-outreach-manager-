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

function cleanHandle(value = "") {
  return value.trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/^@/, "").split(/[/?#]/)[0].toLowerCase();
}
function profileUrl(lead) {
  return lead.instagram_profile_url?.trim() || (cleanHandle(lead.instagram_handle)
    ? `https://www.instagram.com/${cleanHandle(lead.instagram_handle)}/` : "https://www.instagram.com/");
}
function makeDraft(lead) {
  const name = lead.business_name?.trim() || "there";
  const detail = lead.opportunity?.trim()
    ? ` I noticed ${lead.opportunity.trim().replace(/[.!?]+$/, "")}.`
    : " I came across your business and wanted to reach out.";
  return `Hi ${name}! 👋 I'm reaching out from WebForge Signature, a Sri Lankan web design team.${detail} We build modern websites that help businesses present their services clearly and make it easier for customers to contact them. Would you be open to seeing a few ideas for your business?\n\nhttps://lkwebforge-design.github.io/WEBFORGE-SIGNATURE/`;
}
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
      : supabase.auth.signUp({ email, password });
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
  const [busyImport, setBusyImport] = useState(false);

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
    setLeads((data || []).map(lead => {
      const item = latest.get(lead.id);
      return { ...lead, dm_draft: item?.message_text || "", latestDraftId: item?.id || null, draftStatus: item?.status || null };
    }));
  }
  useEffect(() => { loadLeads(); }, [session?.user?.id]);
  function notify(message) { setToast(message); window.setTimeout(() => setToast(""), 3200); }

  const filtered = useMemo(() => leads.filter(lead => {
    const q = query.toLowerCase();
    const matches = !q || [lead.business_name, lead.instagram_handle, lead.location, lead.business_type].some(v => (v || "").toLowerCase().includes(q));
    const status = statusFilter === "all" || lead.status === statusFilter;
    const section = view === "queue" ? (lead.status === "draft_ready" || lead.status === "new")
      : view === "followups" ? ["contacted", "replied", "interested"].includes(lead.status) : true;
    return matches && status && section;
  }), [leads, query, statusFilter, view]);

  const stats = useMemo(() => ({
    total: leads.length, new: leads.filter(l => l.status === "new").length,
    queue: leads.filter(l => l.status === "draft_ready").length,
    contacted: leads.filter(l => ["contacted", "interested"].includes(l.status)).length,
    clients: leads.filter(l => l.status === "client").length
  }), [leads]);

  function openAdd() { setEditing(null); setForm(emptyLead); setShowAdd(true); }
  function openEdit(lead) { setEditing(lead); setForm({ ...emptyLead, ...lead }); setShowAdd(true); }
  async function saveLead(e) {
    e.preventDefault(); setSaving(true);
    const handle = cleanHandle(form.instagram_handle);
    if (!form.business_name.trim() || !handle) { notify("Business name and Instagram handle are required."); setSaving(false); return; }
    const payload = {
      business_name: form.business_name.trim(),
      instagram_handle: handle,
      instagram_profile_url: form.instagram_profile_url.trim() || `https://www.instagram.com/${handle}/`,
      website_url: form.website_url?.trim() || null,
      location: form.location?.trim() || null,
      category: form.business_type?.trim() || null,
      opportunity: form.opportunity?.trim() || null,
      notes: form.notes?.trim() || null
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
    const { error } = await supabase.from("outreach_leads").update({ dm_draft: text, status: lead.status === "new" ? "drafted" : lead.status }).eq("id", lead.id);
    if (error) notify(error.message); else { notify("Draft saved."); await loadLeads(); }
  }
  async function importCsv(file) {
    setBusyImport(true);
    try {
      const rows = parseCsv(await file.text());
      let added = 0, skipped = 0;
      for (const row of rows) {
        const handle = cleanHandle(row.instagram_handle || row.instagram || row.handle);
        if (!handle || !(row.business_name || row.name)) { skipped++; continue; }
        const { error } = await supabase.from("outreach_leads").insert({
          user_id: session.user.id, business_name: row.business_name || row.name,
          instagram_handle: handle, instagram_profile_url: row.instagram_url || row.instagram_profile_url || `https://www.instagram.com/${handle}/`,
          website_url: row.website_url || row.website || "", location: row.location || "Kandy, Sri Lanka",
          business_type: row.category || row.business_type || row.business_type || "", opportunity: row.opportunity || "", notes: row.notes || "", source: "other"
        });
        if (error?.code === "23505") skipped++; else if (error) skipped++; else added++;
      }
      notify(`Import complete: ${added} added, ${skipped} skipped (duplicates or incomplete rows).`);
      await loadLeads();
    } catch { notify("Could not read this CSV file."); }
    setBusyImport(false);
  }
  function exportCsv() {
    const headers = ["business_name","instagram_handle","instagram_profile_url","website_url","location","business_type","opportunity","notes","dm_draft","status"];
    const csv = [headers.join(","), ...leads.map(l => headers.map(h => csvCell(l[h])).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "webforge-leads.csv"; a.click(); URL.revokeObjectURL(url);
  }
  async function approveDraft(lead) {
    if (!lead.latestDraftId) { notify("Save the draft before approving it."); return; }
    const { error } = await supabase.from("outreach_dm_drafts").update({ status: "approved", approved_at: new Date().toISOString() }).eq("id", lead.latestDraftId);
    if (error) notify(error.message);
    else { await supabase.from("outreach_activity").insert({ user_id: session.user.id, lead_id: lead.id, event_type: "dm_approved", details: "Draft approved for manual sending" }); notify("Draft approved."); await loadLeads(); }
  }
  async function markSent(lead) {
    if (!lead.latestDraftId || lead.draftStatus !== "approved") { notify("Approve the saved draft before marking it sent."); return; }
    const now = new Date().toISOString();
    const { error } = await supabase.from("outreach_dm_drafts").update({ status: "sent", sent_at: now, sent_method: "manual_instagram" }).eq("id", lead.latestDraftId);
    if (error) { notify(error.message); return; }
    await supabase.from("outreach_leads").update({ status: "contacted", last_contacted_at: now }).eq("id", lead.id);
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
      <button className={view === "followups" ? "nav-item active" : "nav-item"} onClick={() => setView("followups")}><MessageSquareText size={17}/> Follow-ups</button>
      <div className="sidebar-bottom">
        <div className="account"><div className="avatar">{session.user.email?.[0]?.toUpperCase() || "W"}</div><div><strong>WebForge</strong><small>{session.user.email}</small></div></div>
        <button className="nav-item" onClick={() => supabase.auth.signOut()}><LogOut size={17}/> Sign out</button>
      </div>
    </aside>

    <main className="main">
      <header className="topbar"><div className="crumb">WebForge Signature <span>/</span> {view === "all" ? "Overview" : view === "queue" ? "Draft queue" : "Follow-ups"}</div><div className="top-actions"><span className="secure"><span/> Private workspace</span><button className="btn primary" onClick={openAdd}><CirclePlus size={16}/> Add lead</button></div></header>
      <section className="page-head"><div><div className="eyebrow">YOUR SALES PIPELINE</div><h1>{view === "all" ? "Outreach overview" : view === "queue" ? "Ready for review" : "Keep conversations moving."}</h1><p className="muted">{view === "queue" ? "Review each personalized message, then send it manually from Instagram." : view === "followups" ? "Track prospects who have already been contacted or shown interest." : "A clear view of every prospect, every draft, and every opportunity."}</p></div><div className="head-actions"><label className="btn secondary import-btn"><Upload size={16}/>{busyImport ? "Importing…" : "Import CSV"}<input type="file" accept=".csv,text/csv" disabled={busyImport} onChange={e => e.target.files?.[0] && importCsv(e.target.files[0])}/></label><button className="btn secondary" onClick={exportCsv}><Download size={16}/> Export</button></div></section>

      <section className="stats-grid">
        <Stat icon={<Users/>} label="Total prospects" value={stats.total} note="All saved leads"/>
        <Stat icon={<Sparkles/>} label="New leads" value={stats.new} note="Not contacted yet"/>
        <Stat icon={<Send/>} label="Draft queue" value={stats.queue} note="Waiting for your review"/>
        <Stat icon={<Activity/>} label="In conversation" value={stats.contacted} note="Contacted or interested"/>
        <Stat icon={<Target/>} label="Clients" value={stats.clients} note="Won opportunities"/>
      </section>

      <section className="panel">
        <div className="panel-head"><div><h2>{view === "queue" ? "Message review queue" : view === "followups" ? "Follow-up pipeline" : "All prospects"}</h2><p className="muted">{filtered.length} records · duplicate Instagram handles are blocked</p></div><div className="filters"><div className="searchbox"><Search size={16}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search business or handle"/></div><div className="select-wrap"><Filter size={15}/><select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="all">All statuses</option>{STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}</select><ChevronDown size={14}/></div></div></div>
        {filtered.length === 0 ? <div className="empty"><div className="empty-icon"><Instagram/></div><h3>No prospects here yet</h3><p className="muted">Add a lead manually or import your verified Instagram prospect list.</p><button className="btn primary" onClick={openAdd}><CirclePlus size={16}/> Add your first lead</button></div> :
          <div className="table-wrap"><table><thead><tr><th>BUSINESS</th><th>LOCATION</th><th>OPPORTUNITY</th><th>STATUS</th><th>ADDED</th><th></th></tr></thead><tbody>{filtered.map(lead => <tr key={lead.id} onClick={() => { setSelected(lead); setDraft(lead.dm_draft || makeDraft(lead)); }}><td><div className="business-cell"><div className="ig-avatar"><Instagram size={16}/></div><div><strong>{lead.business_name}</strong><small>@{lead.instagram_handle}</small></div></div></td><td>{lead.location || "—"}</td><td className="opportunity">{lead.opportunity || lead.category || "Needs review"}</td><td><span className={`status status-${lead.status}`}>{STATUS_LABELS[lead.status]}</span></td><td>{new Date(lead.created_at).toLocaleDateString()}</td><td><button className="icon-btn" onClick={e => { e.stopPropagation(); setSelected(lead); setDraft(lead.dm_draft || makeDraft(lead)); }}><ArrowUpRight size={17}/></button></td></tr>)}</tbody></table></div>}
      </section>
      <footer className="footer-note"><span><Check size={14}/> Duplicate protection active</span><span>Manual review before every Instagram send · WebForge Signature</span></footer>
    </main>

    {showAdd && <div className="overlay" onMouseDown={e => e.target === e.currentTarget && setShowAdd(false)}><form className="modal" onSubmit={saveLead}><div className="modal-head"><div><div className="eyebrow">{editing ? "EDIT PROSPECT" : "NEW PROSPECT"}</div><h2>{editing ? "Update lead" : "Add a business lead"}</h2></div><button type="button" className="icon-btn" onClick={() => setShowAdd(false)}><X/></button></div>
      <div className="form-grid"><label>Business name *<input required value={form.business_name} onChange={e => setForm({...form,business_name:e.target.value})} placeholder="e.g. Cafe Example"/></label><label>Instagram handle *<input required value={form.instagram_handle} onChange={e => setForm({...form,instagram_handle:e.target.value})} placeholder="@businessname"/></label><label>Instagram profile URL<input value={form.instagram_url} onChange={e => setForm({...form,instagram_url:e.target.value})} placeholder="https://instagram.com/…"/></label><label>Website URL<input value={form.website_url} onChange={e => setForm({...form,website_url:e.target.value})} placeholder="https://… or leave blank"/></label><label>Location<input value={form.location} onChange={e => setForm({...form,location:e.target.value})} placeholder="Kandy, Sri Lanka"/></label><label>Business category<input value={form.category} onChange={e => setForm({...form,category:e.target.value})} placeholder="Cafe, salon, retail…"/></label><label className="wide">Opportunity / specific observation<textarea value={form.opportunity} onChange={e => setForm({...form,opportunity:e.target.value})} placeholder="What could WebForge improve for this business?"/></label><label className="wide">Notes<textarea value={form.notes} onChange={e => setForm({...form,notes:e.target.value})} placeholder="Public details, contact context, next steps…"/></label></div>
      <div className="modal-actions"><button type="button" className="btn secondary" onClick={() => setShowAdd(false)}>Cancel</button><button className="btn primary" disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Save prospect"}</button></div></form></div>}

    {selected && <div className="overlay" onMouseDown={e => e.target === e.currentTarget && setSelected(null)}><div className="detail-modal"><div className="modal-head"><div><div className="eyebrow">PROSPECT DETAILS</div><h2>{selected.business_name}</h2><p className="muted">@{selected.instagram_handle} · {selected.location || "Location not set"}</p></div><button className="icon-btn" onClick={() => setSelected(null)}><X/></button></div>
      <div className="detail-links"><a href={profileUrl(selected)} target="_blank" rel="noreferrer"><Instagram size={16}/> Open Instagram <ExternalLink size={13}/></a>{selected.website_url && <a href={selected.website_url} target="_blank" rel="noreferrer"><Globe2 size={16}/> Website <ExternalLink size={13}/></a>}</div>
      <label className="draft-label">PERSONALIZED MESSAGE DRAFT<textarea className="draft-area" value={draft} onChange={e => setDraft(e.target.value)} rows={9}/></label>
      <div className="draft-actions"><button className="btn secondary" onClick={() => setDraft(makeDraft(selected))}><Sparkles size={15}/> Regenerate draft</button><button className="btn secondary" onClick={() => saveDraft(selected,draft)}><Check size={15}/> Save draft</button><button className="btn secondary" onClick={() => approveDraft(selected)} disabled={!selected.latestDraftId || selected.draftStatus === "approved"}>Approve</button><button className="btn primary" onClick={() => copyDraft(draft)}><Clipboard size={15}/> Copy message</button></div>
      <div className="send-warning"><MessageSquareText size={16}/><span>Review the message, open Instagram, and send it yourself. This tool does not auto-send cold DMs.</span></div><div className="draft-actions"><button className="btn secondary" disabled={selected.draftStatus !== "approved"} onClick={() => markSent(selected)}>Mark manually sent</button></div>
      <div className="detail-bottom"><label>Status<select value={selected.status} onChange={e => { updateStatus(selected,e.target.value); setSelected({...selected,status:e.target.value}); }} >{STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}</select></label><button className="btn danger" onClick={() => deleteLead(selected)}><Trash2 size={15}/> Delete lead</button></div>
      <button className="text-btn edit-link" onClick={() => { setSelected(null); openEdit(selected); }}>Edit prospect details</button>
    </div></div>}
    {toast && <div className="toast"><Check size={16}/>{toast}</div>}
  </div>;
}

function Stat({ icon, label, value, note }) {
  return <div className="stat-card"><div className="stat-top"><span className="stat-icon">{icon}</span><span className="stat-label">{label}</span></div><div className="stat-value">{value}</div><div className="stat-note">{note}</div></div>;
}
