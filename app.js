import React, { useState, useEffect, useMemo } from "react";
import {
  Wrench,
  User,
  Search,
  Plus,
  X,
  Phone,
  Printer,
  LogOut,
  ArrowLeft,
  CheckCircle2,
  Circle,
  ChevronRight,
  AlertCircle,
  FileText,
  Smartphone,
  Laptop,
  Tablet,
  Cpu,
  MapPin,
  Loader2,
  Trash2,
  Pencil
} from "lucide-react";
const SUPABASE_URL = "https://nifnmmivqmhsfwyycawk.supabase.co";
const SUPABASE_KEY = "sb_publishable_PMuVagm6yjMzY_zCKvFqsA_-n3qGdyC";
const SESSION_KEY = "glc_sav_session";
let session = null;
function readStoredSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}
function storeSession(s) {
  session = s;
  try {
    if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch (e) {
  }
}
function restoreSession() {
  if (!session) session = readStoredSession();
  return session;
}
function currentSession() {
  return session;
}
async function authFetch(path, body) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error_description || data.msg || data.message || `Erreur ${res.status}`);
  return data;
}
async function signIn(email, password) {
  const data = await authFetch("token?grant_type=password", { email: email.trim(), password });
  storeSession(data);
  return data;
}
async function refreshSession() {
  const current = restoreSession();
  if (!current?.refresh_token) return null;
  try {
    const data = await authFetch("token?grant_type=refresh_token", { refresh_token: current.refresh_token });
    storeSession(data);
    return data;
  } catch (e) {
    storeSession(null);
    return null;
  }
}
async function signOut() {
  const current = restoreSession();
  storeSession(null);
  if (!current?.access_token) return;
  try {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${current.access_token}` }
    });
  } catch (e) {
  }
}
async function sb(path, options = {}, allowRetry = true) {
  const isWrite = options.method && options.method !== "GET";
  const token = restoreSession()?.access_token;
  if (!token) throw new Error("Session expiree, reconnectez-vous.");
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...isWrite ? { Prefer: "return=representation" } : {},
      ...options.headers || {}
    }
  });
  if ((res.status === 401 || res.status === 403) && allowRetry) {
    const refreshed = await refreshSession();
    if (refreshed) return sb(path, options, false);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Supabase ${res.status}: ${detail}`);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}
async function rpcPublic(name, args) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(args)
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Supabase ${res.status}: ${detail}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}
const mapClient = (r) => ({ id: r.id, nom: r.nom, telephone: r.telephone, email: r.email || "", adresse: r.adresse || "" });
const mapAppareil = (r) => ({ id: r.id, clientId: r.client_id, type: r.type, marque: r.marque, modele: r.modele || "", numeroSerie: r.numero_serie || "" });
const mapReparation = (r, historiqueRows) => ({
  id: r.id,
  code: r.code,
  clientId: r.client_id,
  appareilId: r.appareil_id,
  panneDeclaree: r.panne_declaree,
  diagnostic: r.diagnostic || "",
  statut: r.statut,
  technicien: r.technicien || "",
  dateReception: r.date_reception,
  dateEstimee: r.date_estimee || "",
  montantDevis: Number(r.montant_devis) || 0,
  notes: r.notes || "",
  historique: historiqueRows.filter((h) => h.reparation_id === r.id).sort((a, b) => new Date(a.date) - new Date(b.date)).map((h) => ({ statut: h.statut, date: h.date }))
});
const mapFacture = (f, ligneRows) => ({
  id: f.id,
  reparationId: f.reparation_id,
  type: f.type,
  date: f.date,
  total: Number(f.total) || 0,
  statutPaiement: f.statut_paiement,
  lignes: ligneRows.filter((l) => l.facture_id === f.id).map((l) => ({ designation: l.designation, qte: Number(l.quantite), prix: Number(l.prix_unitaire) }))
});
const DEVICE_TYPES = [
  { key: "telephone", label: "T\xE9l\xE9phone", Icon: Smartphone },
  { key: "ordi_portable", label: "Ordinateur portable", Icon: Laptop },
  { key: "ordi_bureau", label: "Ordinateur de bureau", Icon: Cpu },
  { key: "tablette", label: "Tablette", Icon: Tablet },
  { key: "autre", label: "Autre", Icon: Wrench }
];
const STATUT_FLOW = ["Re\xE7u", "En cours", "Pr\xEAt", "Livr\xE9"];
const STATUT_STYLE = {
  "Re\xE7u": { color: "#5C6B82", bg: "#EEF0F3" },
  "En cours": { color: "#C46A1E", bg: "#FCEEDD" },
  "Pr\xEAt": { color: "#2E7D50", bg: "#E5F3EA" },
  "Livr\xE9": { color: "#123C4A", bg: "#E3EAEC" },
  "Annul\xE9": { color: "#B0392F", bg: "#FBEAE9" }
};
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const nowIso = () => (/* @__PURE__ */ new Date()).toISOString();
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "\u2014";
const fmtDateTime = (iso) => iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "\u2014";
const fmtXAF = (n) => (Number(n) || 0).toLocaleString("fr-FR") + " FCFA";
const genCode = (reparations) => {
  const year = (/* @__PURE__ */ new Date()).getFullYear();
  const seq = reparations.length + 1;
  return `GLC-${year}-${String(seq).padStart(4, "0")}`;
};
const deviceIcon = (typeKey) => (DEVICE_TYPES.find((d) => d.key === typeKey) || DEVICE_TYPES[4]).Icon;
const deviceLabel = (typeKey) => (DEVICE_TYPES.find((d) => d.key === typeKey) || DEVICE_TYPES[4]).label;
function StatusPill({ statut, size = "md" }) {
  const s = STATUT_STYLE[statut] || STATUT_STYLE["Re\xE7u"];
  return /* @__PURE__ */ React.createElement(
    "span",
    {
      className: `inline-flex items-center gap-1.5 rounded-full font-semibold ${size === "sm" ? "text-xs px-2.5 py-1" : "text-sm px-3 py-1.5"}`,
      style: { color: s.color, backgroundColor: s.bg }
    },
    /* @__PURE__ */ React.createElement("span", { className: "w-1.5 h-1.5 rounded-full", style: { backgroundColor: s.color } }),
    statut
  );
}
function Perforation() {
  return /* @__PURE__ */ React.createElement(
    "div",
    {
      className: "w-full h-2",
      style: {
        backgroundImage: "radial-gradient(circle, rgba(28,36,48,0.18) 1.6px, transparent 2px)",
        backgroundSize: "12px 8px",
        backgroundRepeat: "repeat-x",
        backgroundPosition: "center"
      }
    }
  );
}
function EmptyState({ icon: Icon, title, subtitle, action }) {
  return /* @__PURE__ */ React.createElement("div", { className: "flex flex-col items-center justify-center text-center py-16 px-6 rounded-2xl border border-dashed", style: { borderColor: "#C7CDD6" } }, /* @__PURE__ */ React.createElement("div", { className: "w-12 h-12 rounded-full flex items-center justify-center mb-4", style: { backgroundColor: "#EEF0F3" } }, /* @__PURE__ */ React.createElement(Icon, { size: 22, style: { color: "#5C6B82" } })), /* @__PURE__ */ React.createElement("p", { className: "font-display font-semibold text-base", style: { color: "#1C2430" } }, title), subtitle && /* @__PURE__ */ React.createElement("p", { className: "text-sm mt-1 max-w-sm", style: { color: "#6B7684" } }, subtitle), action);
}
function Stepper({ statut, historique }) {
  const isCancelled = statut === "Annul\xE9";
  const currentIndex = STATUT_FLOW.indexOf(statut);
  const dateFor = (key) => (historique || []).slice().reverse().find((h) => h.statut === key)?.date;
  return /* @__PURE__ */ React.createElement("div", { className: "w-full" }, isCancelled ? /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 rounded-xl px-4 py-3", style: { backgroundColor: STATUT_STYLE["Annul\xE9"].bg } }, /* @__PURE__ */ React.createElement(AlertCircle, { size: 18, style: { color: STATUT_STYLE["Annul\xE9"].color } }), /* @__PURE__ */ React.createElement("span", { className: "font-semibold text-sm", style: { color: STATUT_STYLE["Annul\xE9"].color } }, "Cette r\xE9paration a \xE9t\xE9 annul\xE9e")) : /* @__PURE__ */ React.createElement("div", { className: "flex items-start" }, STATUT_FLOW.map((step, i) => {
    const done = i <= currentIndex;
    const active = i === currentIndex;
    const s = STATUT_STYLE[step];
    return /* @__PURE__ */ React.createElement(React.Fragment, { key: step }, /* @__PURE__ */ React.createElement("div", { className: "flex flex-col items-center", style: { width: 84 } }, /* @__PURE__ */ React.createElement(
      "div",
      {
        className: "w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors",
        style: {
          borderColor: done ? s.color : "#D5DAE1",
          backgroundColor: done ? s.color : "#fff",
          boxShadow: active ? `0 0 0 4px ${s.bg}` : "none"
        }
      },
      done ? /* @__PURE__ */ React.createElement(CheckCircle2, { size: 16, color: "#fff" }) : /* @__PURE__ */ React.createElement(Circle, { size: 14, color: "#C7CDD6" })
    ), /* @__PURE__ */ React.createElement("span", { className: "text-xs font-semibold mt-2 text-center", style: { color: done ? "#1C2430" : "#9AA3AF" } }, step), /* @__PURE__ */ React.createElement("span", { className: "text-[11px] mt-0.5", style: { color: "#9AA3AF" } }, done ? fmtDate(dateFor(step)) : "")), i < STATUT_FLOW.length - 1 && /* @__PURE__ */ React.createElement("div", { className: "flex-1 mt-4", style: { height: 2, backgroundColor: i < currentIndex ? s.color : "#E3E6EB" } }));
  })));
}
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error("GLC SAV \u2014 erreur applicative:", error, info);
  }
  render() {
    if (this.state.error) {
      return /* @__PURE__ */ React.createElement("div", { style: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "sans-serif", backgroundColor: "#F6F3ED" } }, /* @__PURE__ */ React.createElement("div", { style: { maxWidth: 480, textAlign: "center" } }, /* @__PURE__ */ React.createElement("p", { style: { fontWeight: 700, fontSize: 18, marginBottom: 8, color: "#1C2430" } }, "Un probl\xE8me est survenu dans l'application"), /* @__PURE__ */ React.createElement("p", { style: { fontSize: 13, color: "#B0392F", fontFamily: "monospace", wordBreak: "break-word", backgroundColor: "#FBEAE9", padding: 12, borderRadius: 8 } }, String(this.state.error?.message || this.state.error)), /* @__PURE__ */ React.createElement("p", { style: { fontSize: 13, color: "#6B7684", marginTop: 12 } }, "Copiez ce message et partagez-le pour obtenir de l'aide.")));
    }
    return this.props.children;
  }
}
function App() {
  return /* @__PURE__ */ React.createElement(ErrorBoundary, null, /* @__PURE__ */ React.createElement(AppInner, null));
}
function AppInner() {
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState("gate");
  const [staffTab, setStaffTab] = useState("dashboard");
  const [clients, setClients] = useState([]);
  const [appareils, setAppareils] = useState([]);
  const [reparations, setReparations] = useState([]);
  const [factures, setFactures] = useState([]);
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [toast, setToast] = useState("");
  const [statutFilter, setStatutFilter] = useState("Tous");
  const [dashSearch, setDashSearch] = useState("");
  const [lookupCode, setLookupCode] = useState("");
  const [lookupPhone, setLookupPhone] = useState("");
  const [lookupResult, setLookupResult] = useState(void 0);
  const [dbError, setDbError] = useState("");
  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2200);
  };
  const loadAll = async () => {
    setLoading(true);
    setDbError("");
    try {
      const [clientsRows, appareilsRows, reparationsRows, historiqueRows, facturesRows, lignesRows] = await Promise.all([
        sb("clients?select=*&order=created_at.desc"),
        sb("appareils?select=*"),
        sb("reparations?select=*&order=created_at.desc"),
        sb("reparation_historique?select=*"),
        sb("factures?select=*&order=date.desc"),
        sb("facture_lignes?select=*")
      ]);
      setClients((clientsRows || []).map(mapClient));
      setAppareils((appareilsRows || []).map(mapAppareil));
      setReparations((reparationsRows || []).map((r) => mapReparation(r, historiqueRows || [])));
      setFactures((facturesRows || []).map((f) => mapFacture(f, lignesRows || [])));
    } catch (e) {
      console.error(e);
      setDbError(`Impossible de charger les donn\xE9es depuis Supabase \u2014 d\xE9tail technique : ${e.message}`);
    }
    setLoading(false);
  };
  useEffect(() => {
    if (view === "staff") loadAll();
  }, [view]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!restoreSession()) return;
      const refreshed = await refreshSession();
      if (!cancelled && refreshed) setView("staff");
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const clientById = (id) => clients.find((c) => c.id === id);
  const appareilById = (id) => appareils.find((a) => a.id === id);
  const facturesForReparation = (id) => factures.filter((f) => f.reparationId === id);
  const createTicket = async (form) => {
    try {
      let clientId = form.existingClientId;
      if (!clientId) {
        const [newClientRow] = await sb("clients", {
          method: "POST",
          body: JSON.stringify([{ nom: form.nom.trim(), telephone: form.telephone.trim(), email: form.email.trim() || null, adresse: form.adresse.trim() || null }])
        });
        clientId = newClientRow.id;
      }
      const [newAppareilRow] = await sb("appareils", {
        method: "POST",
        body: JSON.stringify([{ client_id: clientId, type: form.type, marque: form.marque.trim(), modele: form.modele.trim() || null, numero_serie: form.numeroSerie.trim() || null }])
      });
      const [newReparationRow] = await sb("reparations", {
        method: "POST",
        body: JSON.stringify([{
          client_id: clientId,
          appareil_id: newAppareilRow.id,
          panne_declaree: form.panneDeclaree.trim(),
          technicien: form.technicien.trim() || null,
          date_reception: form.dateReception || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
          date_estimee: form.dateEstimee || null,
          montant_devis: form.montantDevis ? Number(form.montantDevis) : 0
        }])
      });
      await loadAll();
      setSelectedTicketId(newReparationRow.id);
      setStaffTab("dashboard");
      showToast(`Ticket ${newReparationRow.code} cr\xE9\xE9`);
    } catch (e) {
      console.error(e);
      showToast("Erreur lors de la cr\xE9ation du ticket");
    }
  };
  const advanceStatus = async (id, newStatut) => {
    try {
      await sb(`reparations?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ statut: newStatut }) });
      await loadAll();
      showToast(`Statut mis \xE0 jour : ${newStatut}`);
    } catch (e) {
      console.error(e);
      showToast("Erreur lors de la mise \xE0 jour du statut");
    }
  };
  const updateTicket = async (id, patch) => {
    const dbPatch = {};
    if ("diagnostic" in patch) dbPatch.diagnostic = patch.diagnostic;
    if ("montantDevis" in patch) dbPatch.montant_devis = patch.montantDevis;
    if ("dateEstimee" in patch) dbPatch.date_estimee = patch.dateEstimee;
    setReparations((rs) => rs.map((r) => r.id === id ? { ...r, ...patch } : r));
    try {
      await sb(`reparations?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(dbPatch) });
    } catch (e) {
      console.error(e);
      showToast("Erreur lors de l'enregistrement");
    }
  };
  const createFacture = async (form) => {
    try {
      const lignes = form.lignes.filter((l) => l.designation.trim());
      const total = lignes.reduce((sum, l) => sum + (Number(l.qte) || 0) * (Number(l.prix) || 0), 0);
      const [newFactureRow] = await sb("factures", {
        method: "POST",
        body: JSON.stringify([{ reparation_id: form.reparationId, type: form.type, statut_paiement: form.statutPaiement, total }])
      });
      await sb("facture_lignes", {
        method: "POST",
        body: JSON.stringify(lignes.map((l) => ({ facture_id: newFactureRow.id, designation: l.designation, quantite: Number(l.qte) || 1, prix_unitaire: Number(l.prix) || 0 })))
      });
      await loadAll();
      showToast(`${form.type === "facture" ? "Facture" : "Devis"} cr\xE9\xE9(e)`);
    } catch (e) {
      console.error(e);
      showToast("Erreur lors de l'enregistrement du document");
    }
  };
  const [lookupLoading, setLookupLoading] = useState(false);
  const runLookup = async () => {
    const code = lookupCode.trim().toUpperCase();
    const phoneDigits = lookupPhone.replace(/\D/g, "");
    if (!code || !phoneDigits) return;
    setLookupLoading(true);
    try {
      const data = await rpcPublic("suivi_reparation", { p_code: code, p_tel: phoneDigits });
      if (!data || !data.reparation) {
        setLookupResult(null);
      } else {
        const historique = data.historique || [];
        const factures = data.factures || [];
        setLookupResult({
          rep: mapReparation(data.reparation, historique.map((h) => ({ ...h, reparation_id: data.reparation.id }))),
          client: mapClient(data.client || {}),
          appareil: mapAppareil(data.appareil || {}),
          factures: factures.map((f) => mapFacture(f, (f.lignes || []).map((l) => ({ ...l, facture_id: f.id }))))
        });
      }
    } catch (e) {
      console.error(e);
      setLookupResult(null);
    }
    setLookupLoading(false);
  };
  const filteredReparations = useMemo(() => {
    let list = reparations;
    if (statutFilter !== "Tous") list = list.filter((r) => r.statut === statutFilter);
    const q = dashSearch.trim().toLowerCase();
    if (q) {
      list = list.filter((r) => {
        const c = clientById(r.clientId);
        const a = appareilById(r.appareilId);
        return r.code.toLowerCase().includes(q) || (c?.nom || "").toLowerCase().includes(q) || (c?.telephone || "").includes(q) || (a?.marque || "").toLowerCase().includes(q) || (a?.modele || "").toLowerCase().includes(q);
      });
    }
    return list.sort((a, b) => new Date(b.dateReception) - new Date(a.dateReception));
  }, [reparations, statutFilter, dashSearch, clients, appareils]);
  const counts = useMemo(() => {
    const c = { Tous: reparations.length };
    STATUT_FLOW.concat(["Annul\xE9"]).forEach((s) => {
      c[s] = reparations.filter((r) => r.statut === s).length;
    });
    return c;
  }, [reparations]);
  const selectedTicket = selectedTicketId ? reparations.find((r) => r.id === selectedTicketId) : null;
  return /* @__PURE__ */ React.createElement("div", { className: "min-h-screen w-full", style: { backgroundColor: "#F6F3ED", fontFamily: "'Inter', sans-serif", color: "#1C2430" } }, /* @__PURE__ */ React.createElement("style", null, `
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600;700&display=swap');
        .font-display { font-family: 'Space Grotesk', sans-serif; }
        .font-mono { font-family: 'JetBrains Mono', monospace; }
        input:focus, textarea:focus, select:focus { outline: none; box-shadow: 0 0 0 3px rgba(30,95,116,0.18); border-color: #1E5F74 !important; }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-thumb { background: #C7CDD6; border-radius: 8px; }
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
        }
      `), loading ? /* @__PURE__ */ React.createElement("div", { className: "min-h-screen flex items-center justify-center" }, /* @__PURE__ */ React.createElement(Loader2, { className: "animate-spin", size: 28, style: { color: "#1E5F74" } })) : view === "gate" ? /* @__PURE__ */ React.createElement(GateView, { onStaff: () => setView("staffAuth"), onClient: () => {
    setView("client");
    setLookupResult(void 0);
  } }) : view === "staffAuth" ? /* @__PURE__ */ React.createElement(
    StaffAuthView,
    {
      error: pinError,
      onBack: () => {
        setView("gate");
        setPin("");
        setPinError("");
      },
      onSubmit: async (email, password) => {
        setPinError("");
        try {
          await signIn(email, password);
          const roles = await sb("user_roles?select=role");
          if (!roles || roles.length === 0) {
            await signOut();
            setPinError("Ce compte n'est pas autoris\xE9 \xE0 acc\xE9der \xE0 l'atelier.");
            return;
          }
          setView("staff");
        } catch (e) {
          console.error(e);
          setPinError("Identifiants incorrects ou compte inexistant.");
        }
      }
    }
  ) : view === "client" ? /* @__PURE__ */ React.createElement(
    ClientPortalView,
    {
      lookupCode,
      setLookupCode,
      lookupPhone,
      setLookupPhone,
      result: lookupResult,
      onSearch: runLookup,
      searching: lookupLoading,
      onBack: () => {
        setView("gate");
        setLookupResult(void 0);
        setLookupCode("");
        setLookupPhone("");
      },
      appareilLabel: deviceLabel,
      appareilIcon: deviceIcon
    }
  ) : /* @__PURE__ */ React.createElement(
    StaffApp,
    {
      staffTab,
      setStaffTab,
      onLogout: async () => {
        await signOut();
        setView("gate");
        setStaffTab("dashboard");
        setSelectedTicketId(null);
      },
      reparations: filteredReparations,
      allReparations: reparations,
      clients,
      appareils,
      factures,
      counts,
      statutFilter,
      setStatutFilter,
      dashSearch,
      setDashSearch,
      selectedTicket,
      setSelectedTicketId,
      clientById,
      appareilById,
      facturesForReparation,
      createTicket,
      advanceStatus,
      updateTicket,
      createFacture,
      dbError
    }
  ), toast && /* @__PURE__ */ React.createElement("div", { className: "fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-full shadow-lg font-medium text-sm no-print", style: { backgroundColor: "#1C2430", color: "#F6F3ED" } }, toast));
}
function GateView({ onStaff, onClient }) {
  return /* @__PURE__ */ React.createElement("div", { className: "min-h-screen flex flex-col items-center justify-center px-6 py-12" }, /* @__PURE__ */ React.createElement("div", { className: "w-full max-w-md mb-10 text-center" }, /* @__PURE__ */ React.createElement("div", { className: "inline-flex items-center gap-2 mb-4" }, /* @__PURE__ */ React.createElement("div", { className: "w-10 h-10 rounded-xl flex items-center justify-center", style: { backgroundColor: "#1E5F74" } }, /* @__PURE__ */ React.createElement(Wrench, { size: 19, color: "#fff" })), /* @__PURE__ */ React.createElement("span", { className: "font-display font-bold text-xl tracking-tight" }, "GLC SARL")), /* @__PURE__ */ React.createElement("h1", { className: "font-display font-bold text-2xl sm:text-3xl leading-tight" }, "Atelier SAV \u2014 Informatique & T\xE9l\xE9phonie"), /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-center gap-1.5 mt-2 text-sm", style: { color: "#6B7684" } }, /* @__PURE__ */ React.createElement(MapPin, { size: 14 }), " Kribi, Cameroun")), /* @__PURE__ */ React.createElement("div", { className: "w-full max-w-md rounded-2xl overflow-hidden shadow-sm border mb-8", style: { borderColor: "#E3E0D6", backgroundColor: "#fff" } }, /* @__PURE__ */ React.createElement("div", { className: "px-5 pt-5 pb-3 flex items-center justify-between" }, /* @__PURE__ */ React.createElement("span", { className: "font-mono text-xs font-semibold tracking-wider", style: { color: "#9AA3AF" } }, "TICKET N\xB0 GLC-2026-0001"), /* @__PURE__ */ React.createElement(StatusPill, { statut: "En cours", size: "sm" })), /* @__PURE__ */ React.createElement(Perforation, null), /* @__PURE__ */ React.createElement("div", { className: "px-5 py-4 grid grid-cols-2 gap-3 text-sm" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { style: { color: "#9AA3AF" }, className: "text-xs" }, "Appareil"), /* @__PURE__ */ React.createElement("p", { className: "font-medium" }, "iPhone 12 \u2014 \xE9cran")), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { style: { color: "#9AA3AF" }, className: "text-xs" }, "Re\xE7u le"), /* @__PURE__ */ React.createElement("p", { className: "font-medium" }, "02 ao\xFBt 2026")))), /* @__PURE__ */ React.createElement("div", { className: "w-full max-w-md grid grid-cols-1 gap-3" }, /* @__PURE__ */ React.createElement("button", { onClick: onStaff, className: "group flex items-center gap-4 rounded-2xl p-4 border transition-all hover:shadow-md", style: { backgroundColor: "#1E5F74", borderColor: "#1E5F74" } }, /* @__PURE__ */ React.createElement("div", { className: "w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0", style: { backgroundColor: "rgba(255,255,255,0.15)" } }, /* @__PURE__ */ React.createElement(Wrench, { size: 20, color: "#fff" })), /* @__PURE__ */ React.createElement("div", { className: "text-left flex-1" }, /* @__PURE__ */ React.createElement("p", { className: "font-display font-semibold text-white" }, "Espace technicien"), /* @__PURE__ */ React.createElement("p", { className: "text-sm", style: { color: "rgba(255,255,255,0.75)" } }, "G\xE9rer les tickets, clients et factures")), /* @__PURE__ */ React.createElement(ChevronRight, { size: 18, color: "rgba(255,255,255,0.7)", className: "group-hover:translate-x-0.5 transition-transform" })), /* @__PURE__ */ React.createElement("button", { onClick: onClient, className: "group flex items-center gap-4 rounded-2xl p-4 border transition-all hover:shadow-md bg-white", style: { borderColor: "#E3E0D6" } }, /* @__PURE__ */ React.createElement("div", { className: "w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0", style: { backgroundColor: "#FCEEDD" } }, /* @__PURE__ */ React.createElement(Search, { size: 20, style: { color: "#C46A1E" } })), /* @__PURE__ */ React.createElement("div", { className: "text-left flex-1" }, /* @__PURE__ */ React.createElement("p", { className: "font-display font-semibold" }, "Suivre ma r\xE9paration"), /* @__PURE__ */ React.createElement("p", { className: "text-sm", style: { color: "#6B7684" } }, "Avec mon num\xE9ro de ticket")), /* @__PURE__ */ React.createElement(ChevronRight, { size: 18, style: { color: "#9AA3AF" }, className: "group-hover:translate-x-0.5 transition-transform" }))));
}
function StaffAuthView({ error, onBack, onSubmit }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const handleValidate = async () => {
    if (busy || !email.trim() || !password) return;
    setBusy(true);
    await onSubmit(email, password);
    setBusy(false);
  };
  const inputStyle = { borderColor: "#D5DAE1" };
  const inputClass = "w-full rounded-xl border px-4 py-3 text-base";
  return /* @__PURE__ */ React.createElement("div", { className: "min-h-screen flex items-center justify-center px-6" }, /* @__PURE__ */ React.createElement("div", { className: "w-full max-w-sm" }, /* @__PURE__ */ React.createElement("button", { type: "button", onClick: onBack, className: "flex items-center gap-1.5 text-sm font-medium mb-6", style: { color: "#6B7684" } }, /* @__PURE__ */ React.createElement(ArrowLeft, { size: 16 }), " Retour"), /* @__PURE__ */ React.createElement("h2", { className: "font-display font-bold text-xl mb-1" }, "Acc\u00E8s \u00E9quipe"), /* @__PURE__ */ React.createElement("p", { className: "text-sm mb-6", style: { color: "#6B7684" } }, "Connectez-vous avec votre compte professionnel."), /* @__PURE__ */ React.createElement("form", {
    onSubmit: (e) => {
      e.preventDefault();
      handleValidate();
    },
    className: "space-y-3"
  }, /* @__PURE__ */ React.createElement("input", {
    type: "email",
    autoComplete: "username",
    value: email,
    onChange: (e) => setEmail(e.target.value),
    placeholder: "Adresse e-mail",
    className: inputClass,
    style: inputStyle
  }), /* @__PURE__ */ React.createElement("input", {
    type: "password",
    autoComplete: "current-password",
    value: password,
    onChange: (e) => setPassword(e.target.value),
    placeholder: "Mot de passe",
    className: inputClass,
    style: inputStyle
  }), error && /* @__PURE__ */ React.createElement("p", { className: "text-sm flex items-center gap-1.5", style: { color: "#B0392F" } }, /* @__PURE__ */ React.createElement(AlertCircle, { size: 14 }), error), /* @__PURE__ */ React.createElement("button", {
    type: "submit",
    disabled: busy,
    className: "w-full rounded-xl py-3 font-semibold text-white transition-opacity hover:opacity-90 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-60",
    style: { backgroundColor: "#1E5F74" }
  }, busy && /* @__PURE__ */ React.createElement(Loader2, { size: 16, className: "animate-spin" }), busy ? "Connexion\u2026" : "Se connecter")), /* @__PURE__ */ React.createElement("p", { className: "text-xs mt-4 text-center", style: { color: "#9AA3AF" } }, "Acc\u00E8s r\u00E9serv\u00E9 aux techniciens autoris\u00E9s. Les comptes sont cr\u00E9\u00E9s par l'administrateur de l'atelier.")));
}
function ClientPortalView({ lookupCode, setLookupCode, lookupPhone, setLookupPhone, result, onSearch, searching, onBack, appareilLabel, appareilIcon }) {
  const DeviceIcon = result?.rep ? appareilIcon(result.appareil?.type) : Smartphone;
  return /* @__PURE__ */ React.createElement("div", { className: "min-h-screen px-6 py-10 flex flex-col items-center" }, /* @__PURE__ */ React.createElement("div", { className: "w-full max-w-md" }, /* @__PURE__ */ React.createElement("button", { onClick: onBack, className: "flex items-center gap-1.5 text-sm font-medium mb-6", style: { color: "#6B7684" } }, /* @__PURE__ */ React.createElement(ArrowLeft, { size: 16 }), " Retour"), /* @__PURE__ */ React.createElement("h2", { className: "font-display font-bold text-xl mb-1" }, "Suivre ma r\xE9paration"), /* @__PURE__ */ React.createElement("p", { className: "text-sm mb-6", style: { color: "#6B7684" } }, "Entrez votre num\xE9ro de ticket et votre t\xE9l\xE9phone."), /* @__PURE__ */ React.createElement("form", { onSubmit: (e) => {
    e.preventDefault();
    onSearch();
  }, className: "space-y-3 mb-6" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "text-xs font-semibold", style: { color: "#6B7684" } }, "Num\xE9ro de ticket"), /* @__PURE__ */ React.createElement(
    "input",
    {
      value: lookupCode,
      onChange: (e) => setLookupCode(e.target.value),
      placeholder: "GLC-2026-0001",
      className: "w-full mt-1 rounded-xl border px-4 py-3 font-mono uppercase",
      style: { borderColor: "#D5DAE1" }
    }
  )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "text-xs font-semibold", style: { color: "#6B7684" } }, "Num\xE9ro de t\xE9l\xE9phone"), /* @__PURE__ */ React.createElement(
    "input",
    {
      value: lookupPhone,
      onChange: (e) => setLookupPhone(e.target.value),
      placeholder: "6XX XX XX XX",
      className: "w-full mt-1 rounded-xl border px-4 py-3",
      style: { borderColor: "#D5DAE1" }
    }
  )), /* @__PURE__ */ React.createElement("button", { type: "submit", disabled: searching, className: "w-full rounded-xl py-3 font-semibold text-white flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-60", style: { backgroundColor: "#1E5F74" } }, searching ? /* @__PURE__ */ React.createElement(Loader2, { size: 16, className: "animate-spin" }) : /* @__PURE__ */ React.createElement(Search, { size: 16 }), " ", searching ? "Recherche\u2026" : "Rechercher")), result === null && /* @__PURE__ */ React.createElement("div", { className: "rounded-xl px-4 py-3 flex items-start gap-2", style: { backgroundColor: "#FBEAE9" } }, /* @__PURE__ */ React.createElement(AlertCircle, { size: 16, style: { color: "#B0392F" }, className: "mt-0.5 flex-shrink-0" }), /* @__PURE__ */ React.createElement("p", { className: "text-sm", style: { color: "#B0392F" } }, "Aucune r\xE9paration trouv\xE9e avec ces informations. V\xE9rifiez le num\xE9ro de ticket et le t\xE9l\xE9phone utilis\xE9 lors du d\xE9p\xF4t.")), result && /* @__PURE__ */ React.createElement("div", { className: "rounded-2xl overflow-hidden border shadow-sm bg-white" }, /* @__PURE__ */ React.createElement("div", { className: "px-5 pt-5 pb-3 flex items-center justify-between" }, /* @__PURE__ */ React.createElement("span", { className: "font-mono text-sm font-semibold tracking-wider", style: { color: "#1C2430" } }, result.rep.code), /* @__PURE__ */ React.createElement(StatusPill, { statut: result.rep.statut, size: "sm" })), /* @__PURE__ */ React.createElement(Perforation, null), /* @__PURE__ */ React.createElement("div", { className: "px-5 py-5" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-3 mb-6" }, /* @__PURE__ */ React.createElement("div", { className: "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0", style: { backgroundColor: "#EEF0F3" } }, /* @__PURE__ */ React.createElement(DeviceIcon, { size: 18, style: { color: "#1E5F74" } })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "font-semibold text-sm" }, result.appareil?.marque, " ", result.appareil?.modele), /* @__PURE__ */ React.createElement("p", { className: "text-xs", style: { color: "#9AA3AF" } }, appareilLabel(result.appareil?.type)))), /* @__PURE__ */ React.createElement(Stepper, { statut: result.rep.statut, historique: result.rep.historique }), /* @__PURE__ */ React.createElement("div", { className: "mt-6 pt-5 border-t space-y-3", style: { borderColor: "#E9E6DE" } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-xs font-semibold", style: { color: "#9AA3AF" } }, "Panne signal\xE9e"), /* @__PURE__ */ React.createElement("p", { className: "text-sm mt-0.5" }, result.rep.panneDeclaree || "\u2014")), result.rep.diagnostic && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-xs font-semibold", style: { color: "#9AA3AF" } }, "Diagnostic technicien"), /* @__PURE__ */ React.createElement("p", { className: "text-sm mt-0.5" }, result.rep.diagnostic)), /* @__PURE__ */ React.createElement("div", { className: "flex justify-between items-center pt-2" }, /* @__PURE__ */ React.createElement("span", { className: "text-sm font-medium" }, "Montant estim\xE9"), /* @__PURE__ */ React.createElement("span", { className: "font-mono font-semibold" }, fmtXAF(result.rep.montantDevis))), result.factures.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "flex justify-between items-center" }, /* @__PURE__ */ React.createElement("span", { className: "text-sm font-medium" }, "Statut paiement"), /* @__PURE__ */ React.createElement("span", { className: "text-sm font-semibold" }, result.factures[result.factures.length - 1].statutPaiement))))), /* @__PURE__ */ React.createElement("p", { className: "text-xs mt-8 text-center", style: { color: "#9AA3AF" } }, "GLC SARL \xB7 Atelier SAV \xB7 Kribi, Cameroun")));
}
function StaffApp(props) {
  const { staffTab, setStaffTab, onLogout } = props;
  const tabs = [
    { key: "dashboard", label: "Tableau de bord" },
    { key: "nouveau", label: "Nouveau ticket" },
    { key: "clients", label: "Clients" },
    { key: "facturation", label: "Facturation" }
  ];
  return /* @__PURE__ */ React.createElement("div", { className: "min-h-screen flex flex-col" }, /* @__PURE__ */ React.createElement("header", { className: "no-print sticky top-0 z-10 border-b", style: { backgroundColor: "#F6F3ED", borderColor: "#E3E0D6" } }, /* @__PURE__ */ React.createElement("div", { className: "max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2" }, /* @__PURE__ */ React.createElement("div", { className: "w-8 h-8 rounded-lg flex items-center justify-center", style: { backgroundColor: "#1E5F74" } }, /* @__PURE__ */ React.createElement(Wrench, { size: 15, color: "#fff" })), /* @__PURE__ */ React.createElement("span", { className: "font-display font-bold text-sm sm:text-base" }, "GLC SARL \xB7 Atelier")), /* @__PURE__ */ React.createElement("button", { onClick: onLogout, className: "flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-white transition-colors", style: { color: "#6B7684" } }, /* @__PURE__ */ React.createElement(LogOut, { size: 15 }), " ", /* @__PURE__ */ React.createElement("span", { className: "hidden sm:inline" }, "Quitter"))), /* @__PURE__ */ React.createElement("div", { className: "max-w-6xl mx-auto px-4 sm:px-6 flex gap-1 overflow-x-auto pb-2" }, tabs.map((t) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: t.key,
      onClick: () => setStaffTab(t.key),
      className: "px-3.5 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition-colors",
      style: staffTab === t.key ? { backgroundColor: "#1C2430", color: "#F6F3ED" } : { color: "#6B7684" }
    },
    t.label
  )))), /* @__PURE__ */ React.createElement("main", { className: "flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6" }, props.dbError && /* @__PURE__ */ React.createElement("div", { className: "mb-4 rounded-xl px-4 py-3 flex items-start gap-2", style: { backgroundColor: "#FBEAE9" } }, /* @__PURE__ */ React.createElement(AlertCircle, { size: 16, style: { color: "#B0392F" }, className: "mt-0.5 flex-shrink-0" }), /* @__PURE__ */ React.createElement("p", { className: "text-sm", style: { color: "#B0392F" } }, props.dbError)), staffTab === "dashboard" && /* @__PURE__ */ React.createElement(DashboardTab, { ...props }), staffTab === "nouveau" && /* @__PURE__ */ React.createElement(NouveauTicketTab, { ...props }), staffTab === "clients" && /* @__PURE__ */ React.createElement(ClientsTab, { ...props }), staffTab === "facturation" && /* @__PURE__ */ React.createElement(FacturationTab, { ...props })), props.selectedTicket && /* @__PURE__ */ React.createElement(TicketDetail, { ...props }));
}
function DashboardTab({ reparations, counts, statutFilter, setStatutFilter, dashSearch, setDashSearch, clientById, appareilById, setSelectedTicketId }) {
  const chips = ["Tous", ...STATUT_FLOW, "Annul\xE9"];
  return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "flex flex-wrap gap-2 mb-4" }, chips.map((c) => {
    const active = statutFilter === c;
    const style = c === "Tous" ? { color: "#1C2430", bg: "#EDEAE1" } : { color: STATUT_STYLE[c].color, bg: STATUT_STYLE[c].bg };
    return /* @__PURE__ */ React.createElement(
      "button",
      {
        key: c,
        onClick: () => setStatutFilter(c),
        className: "px-3 py-1.5 rounded-full text-sm font-semibold flex items-center gap-1.5 border transition-all",
        style: { backgroundColor: active ? style.color : style.bg, color: active ? "#fff" : style.color, borderColor: "transparent" }
      },
      c,
      " ",
      /* @__PURE__ */ React.createElement("span", { className: "opacity-70 font-mono text-xs" }, counts[c] || 0)
    );
  })), /* @__PURE__ */ React.createElement("div", { className: "relative mb-5 max-w-sm" }, /* @__PURE__ */ React.createElement(Search, { size: 16, className: "absolute left-3 top-1/2 -translate-y-1/2", style: { color: "#9AA3AF" } }), /* @__PURE__ */ React.createElement(
    "input",
    {
      value: dashSearch,
      onChange: (e) => setDashSearch(e.target.value),
      placeholder: "Rechercher un ticket, client, appareil\u2026",
      className: "w-full pl-9 pr-3 py-2.5 rounded-xl border text-sm",
      style: { borderColor: "#D5DAE1", backgroundColor: "#fff" }
    }
  )), reparations.length === 0 ? /* @__PURE__ */ React.createElement(EmptyState, { icon: Wrench, title: "Aucun ticket pour ce filtre", subtitle: "Cr\xE9ez un nouveau ticket ou changez de filtre." }) : /* @__PURE__ */ React.createElement("div", { className: "grid gap-3 sm:grid-cols-2 lg:grid-cols-3" }, reparations.map((r) => {
    const c = clientById(r.clientId);
    const a = appareilById(r.appareilId);
    const DeviceIcon = deviceIcon(a?.type);
    const s = STATUT_STYLE[r.statut];
    return /* @__PURE__ */ React.createElement(
      "button",
      {
        key: r.id,
        onClick: () => setSelectedTicketId(r.id),
        className: "text-left rounded-2xl border bg-white overflow-hidden hover:shadow-md transition-shadow",
        style: { borderColor: "#E3E0D6", borderLeft: `4px solid ${s.color}` }
      },
      /* @__PURE__ */ React.createElement("div", { className: "p-4" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between mb-2" }, /* @__PURE__ */ React.createElement("span", { className: "font-mono text-xs font-semibold tracking-wide", style: { color: "#9AA3AF" } }, r.code), /* @__PURE__ */ React.createElement(StatusPill, { statut: r.statut, size: "sm" })), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 mb-1" }, /* @__PURE__ */ React.createElement(DeviceIcon, { size: 14, style: { color: "#1E5F74" } }), /* @__PURE__ */ React.createElement("span", { className: "font-semibold text-sm" }, a?.marque, " ", a?.modele)), /* @__PURE__ */ React.createElement("p", { className: "text-sm", style: { color: "#6B7684" } }, c?.nom), /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between mt-3 pt-3 border-t", style: { borderColor: "#EEEBE3" } }, /* @__PURE__ */ React.createElement("span", { className: "text-xs", style: { color: "#9AA3AF" } }, "Re\xE7u le ", fmtDate(r.dateReception)), /* @__PURE__ */ React.createElement("span", { className: "font-mono text-xs font-semibold" }, fmtXAF(r.montantDevis))))
    );
  })));
}
function NouveauTicketTab({ clients, createTicket }) {
  const [mode, setMode] = useState("new");
  const [existingClientId, setExistingClientId] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [form, setForm] = useState({
    nom: "",
    telephone: "",
    email: "",
    adresse: "",
    type: "telephone",
    marque: "",
    modele: "",
    numeroSerie: "",
    panneDeclaree: "",
    technicien: "",
    dateReception: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
    dateEstimee: "",
    montantDevis: ""
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const matches = clientSearch.trim() ? clients.filter((c) => c.nom.toLowerCase().includes(clientSearch.toLowerCase()) || c.telephone.includes(clientSearch)).slice(0, 5) : [];
  const canSubmit = (mode === "existing" ? !!existingClientId : form.nom.trim() && form.telephone.trim()) && form.marque.trim() && form.panneDeclaree.trim();
  const submit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    createTicket({ ...form, existingClientId: mode === "existing" ? existingClientId : null });
    setForm({ nom: "", telephone: "", email: "", adresse: "", type: "telephone", marque: "", modele: "", numeroSerie: "", panneDeclaree: "", technicien: "", dateReception: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), dateEstimee: "", montantDevis: "" });
    setExistingClientId("");
    setClientSearch("");
    setMode("new");
  };
  const inputCls = "w-full mt-1 rounded-xl border px-3.5 py-2.5 text-sm bg-white";
  const labelCls = "text-xs font-semibold";
  return /* @__PURE__ */ React.createElement("form", { onSubmit: submit, className: "max-w-2xl space-y-6" }, /* @__PURE__ */ React.createElement("section", null, /* @__PURE__ */ React.createElement("h3", { className: "font-display font-semibold mb-3 flex items-center gap-2" }, /* @__PURE__ */ React.createElement(User, { size: 16, style: { color: "#1E5F74" } }), " Client"), /* @__PURE__ */ React.createElement("div", { className: "flex gap-2 mb-3" }, /* @__PURE__ */ React.createElement("button", { type: "button", onClick: () => setMode("new"), className: "px-3 py-1.5 rounded-full text-sm font-semibold", style: mode === "new" ? { backgroundColor: "#1C2430", color: "#fff" } : { backgroundColor: "#EDEAE1", color: "#6B7684" } }, "Nouveau client"), /* @__PURE__ */ React.createElement("button", { type: "button", onClick: () => setMode("existing"), className: "px-3 py-1.5 rounded-full text-sm font-semibold", style: mode === "existing" ? { backgroundColor: "#1C2430", color: "#fff" } : { backgroundColor: "#EDEAE1", color: "#6B7684" } }, "Client existant")), mode === "new" ? /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-3" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: labelCls, style: { color: "#6B7684" } }, "Nom complet *"), /* @__PURE__ */ React.createElement("input", { required: true, value: form.nom, onChange: (e) => set("nom", e.target.value), className: inputCls, style: { borderColor: "#D5DAE1" } })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: labelCls, style: { color: "#6B7684" } }, "T\xE9l\xE9phone *"), /* @__PURE__ */ React.createElement("input", { required: true, value: form.telephone, onChange: (e) => set("telephone", e.target.value), placeholder: "6XX XX XX XX", className: inputCls, style: { borderColor: "#D5DAE1" } })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: labelCls, style: { color: "#6B7684" } }, "Email"), /* @__PURE__ */ React.createElement("input", { value: form.email, onChange: (e) => set("email", e.target.value), className: inputCls, style: { borderColor: "#D5DAE1" } })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: labelCls, style: { color: "#6B7684" } }, "Adresse / Quartier"), /* @__PURE__ */ React.createElement("input", { value: form.adresse, onChange: (e) => set("adresse", e.target.value), className: inputCls, style: { borderColor: "#D5DAE1" } }))) : /* @__PURE__ */ React.createElement("div", { className: "relative" }, /* @__PURE__ */ React.createElement("input", { value: clientSearch, onChange: (e) => {
    setClientSearch(e.target.value);
    setExistingClientId("");
  }, placeholder: "Rechercher par nom ou t\xE9l\xE9phone\u2026", className: inputCls, style: { borderColor: "#D5DAE1" } }), matches.length > 0 && !existingClientId && /* @__PURE__ */ React.createElement("div", { className: "mt-1 rounded-xl border bg-white overflow-hidden", style: { borderColor: "#D5DAE1" } }, matches.map((c) => /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      key: c.id,
      onClick: () => {
        setExistingClientId(c.id);
        setClientSearch(`${c.nom} \u2014 ${c.telephone}`);
      },
      className: "w-full text-left px-3.5 py-2.5 text-sm hover:bg-gray-50 border-b last:border-0",
      style: { borderColor: "#F0EEE8" }
    },
    /* @__PURE__ */ React.createElement("span", { className: "font-medium" }, c.nom),
    " ",
    /* @__PURE__ */ React.createElement("span", { style: { color: "#9AA3AF" } }, "\xB7 ", c.telephone)
  ))), existingClientId && /* @__PURE__ */ React.createElement("p", { className: "text-xs mt-1.5 flex items-center gap-1", style: { color: "#2E7D50" } }, /* @__PURE__ */ React.createElement(CheckCircle2, { size: 13 }), " Client s\xE9lectionn\xE9"))), /* @__PURE__ */ React.createElement("section", null, /* @__PURE__ */ React.createElement("h3", { className: "font-display font-semibold mb-3 flex items-center gap-2" }, /* @__PURE__ */ React.createElement(Smartphone, { size: 16, style: { color: "#1E5F74" } }), " Appareil"), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-3" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: labelCls, style: { color: "#6B7684" } }, "Type d'appareil"), /* @__PURE__ */ React.createElement("select", { value: form.type, onChange: (e) => set("type", e.target.value), className: inputCls, style: { borderColor: "#D5DAE1" } }, DEVICE_TYPES.map((d) => /* @__PURE__ */ React.createElement("option", { key: d.key, value: d.key }, d.label)))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: labelCls, style: { color: "#6B7684" } }, "Marque *"), /* @__PURE__ */ React.createElement("input", { required: true, value: form.marque, onChange: (e) => set("marque", e.target.value), placeholder: "Samsung, HP, Apple\u2026", className: inputCls, style: { borderColor: "#D5DAE1" } })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: labelCls, style: { color: "#6B7684" } }, "Mod\xE8le"), /* @__PURE__ */ React.createElement("input", { value: form.modele, onChange: (e) => set("modele", e.target.value), className: inputCls, style: { borderColor: "#D5DAE1" } })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: labelCls, style: { color: "#6B7684" } }, "N\xB0 s\xE9rie / IMEI"), /* @__PURE__ */ React.createElement("input", { value: form.numeroSerie, onChange: (e) => set("numeroSerie", e.target.value), className: `${inputCls} font-mono`, style: { borderColor: "#D5DAE1" } })))), /* @__PURE__ */ React.createElement("section", null, /* @__PURE__ */ React.createElement("h3", { className: "font-display font-semibold mb-3 flex items-center gap-2" }, /* @__PURE__ */ React.createElement(FileText, { size: 16, style: { color: "#1E5F74" } }), " R\xE9paration"), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-1 gap-3" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: labelCls, style: { color: "#6B7684" } }, "Panne d\xE9clar\xE9e par le client *"), /* @__PURE__ */ React.createElement("textarea", { required: true, value: form.panneDeclaree, onChange: (e) => set("panneDeclaree", e.target.value), rows: 2, className: inputCls, style: { borderColor: "#D5DAE1" } })), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-1 sm:grid-cols-3 gap-3" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: labelCls, style: { color: "#6B7684" } }, "Technicien assign\xE9"), /* @__PURE__ */ React.createElement("input", { value: form.technicien, onChange: (e) => set("technicien", e.target.value), className: inputCls, style: { borderColor: "#D5DAE1" } })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: labelCls, style: { color: "#6B7684" } }, "Date de r\xE9ception"), /* @__PURE__ */ React.createElement("input", { type: "date", value: form.dateReception, onChange: (e) => set("dateReception", e.target.value), className: inputCls, style: { borderColor: "#D5DAE1" } })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: labelCls, style: { color: "#6B7684" } }, "Livraison estim\xE9e"), /* @__PURE__ */ React.createElement("input", { type: "date", value: form.dateEstimee, onChange: (e) => set("dateEstimee", e.target.value), className: inputCls, style: { borderColor: "#D5DAE1" } }))), /* @__PURE__ */ React.createElement("div", { className: "max-w-xs" }, /* @__PURE__ */ React.createElement("label", { className: labelCls, style: { color: "#6B7684" } }, "Devis estim\xE9 (FCFA)"), /* @__PURE__ */ React.createElement("input", { type: "number", min: "0", value: form.montantDevis, onChange: (e) => set("montantDevis", e.target.value), className: `${inputCls} font-mono`, style: { borderColor: "#D5DAE1" } })))), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "submit",
      disabled: !canSubmit,
      className: "w-full sm:w-auto px-6 py-3 rounded-xl font-semibold text-white flex items-center justify-center gap-2 transition-opacity",
      style: { backgroundColor: canSubmit ? "#1E5F74" : "#B7C0C7", cursor: canSubmit ? "pointer" : "not-allowed" }
    },
    /* @__PURE__ */ React.createElement(Plus, { size: 16 }),
    " Cr\xE9er le ticket"
  ));
}
function ClientsTab({ clients, appareils, allReparations, setSelectedTicketId, setStaffTab }) {
  const [q, setQ] = useState("");
  const filtered = q.trim() ? clients.filter((c) => c.nom.toLowerCase().includes(q.toLowerCase()) || c.telephone.includes(q)) : clients;
  return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "relative mb-5 max-w-sm" }, /* @__PURE__ */ React.createElement(Search, { size: 16, className: "absolute left-3 top-1/2 -translate-y-1/2", style: { color: "#9AA3AF" } }), /* @__PURE__ */ React.createElement("input", { value: q, onChange: (e) => setQ(e.target.value), placeholder: "Rechercher un client\u2026", className: "w-full pl-9 pr-3 py-2.5 rounded-xl border text-sm bg-white", style: { borderColor: "#D5DAE1" } })), filtered.length === 0 ? /* @__PURE__ */ React.createElement(EmptyState, { icon: User, title: "Aucun client", subtitle: "Les clients apparaissent ici d\xE8s qu'un ticket est cr\xE9\xE9." }) : /* @__PURE__ */ React.createElement("div", { className: "space-y-3" }, filtered.map((c) => {
    const tickets = allReparations.filter((r) => r.clientId === c.id);
    return /* @__PURE__ */ React.createElement("div", { key: c.id, className: "rounded-2xl border bg-white p-4", style: { borderColor: "#E3E0D6" } }, /* @__PURE__ */ React.createElement("div", { className: "flex items-start justify-between gap-3 flex-wrap" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "font-semibold" }, c.nom), /* @__PURE__ */ React.createElement("p", { className: "text-sm flex items-center gap-1.5 mt-0.5", style: { color: "#6B7684" } }, /* @__PURE__ */ React.createElement(Phone, { size: 12 }), " ", c.telephone, c.email ? ` \xB7 ${c.email}` : ""), c.adresse && /* @__PURE__ */ React.createElement("p", { className: "text-xs mt-0.5", style: { color: "#9AA3AF" } }, c.adresse)), /* @__PURE__ */ React.createElement("span", { className: "text-xs font-semibold px-2.5 py-1 rounded-full", style: { backgroundColor: "#EEF0F3", color: "#5C6B82" } }, tickets.length, " ticket", tickets.length > 1 ? "s" : "")), tickets.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "flex flex-wrap gap-2 mt-3 pt-3 border-t", style: { borderColor: "#EEEBE3" } }, tickets.map((t) => /* @__PURE__ */ React.createElement(
      "button",
      {
        key: t.id,
        onClick: () => {
          setSelectedTicketId(t.id);
          setStaffTab("dashboard");
        },
        className: "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono border hover:bg-gray-50",
        style: { borderColor: "#E3E0D6" }
      },
      t.code,
      " ",
      /* @__PURE__ */ React.createElement(StatusPill, { statut: t.statut, size: "sm" })
    ))));
  })));
}
function FacturationTab({ allReparations, clientById, appareilById, factures, createFacture }) {
  const [reparationId, setReparationId] = useState("");
  const [type, setType] = useState("devis");
  const [statutPaiement, setStatutPaiement] = useState("Non pay\xE9");
  const [lignes, setLignes] = useState([{ designation: "", qte: 1, prix: 0 }]);
  const [printing, setPrinting] = useState(null);
  const total = lignes.reduce((s, l) => s + (Number(l.qte) || 0) * (Number(l.prix) || 0), 0);
  const setLigne = (i, patch) => setLignes((ls) => ls.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  const addLigne = () => setLignes((ls) => [...ls, { designation: "", qte: 1, prix: 0 }]);
  const removeLigne = (i) => setLignes((ls) => ls.filter((_, idx) => idx !== i));
  const submit = async (e) => {
    e.preventDefault();
    if (!reparationId || total <= 0) return;
    await createFacture({ reparationId, type, statutPaiement, lignes });
    setLignes([{ designation: "", qte: 1, prix: 0 }]);
    setReparationId("");
    setType("devis");
    setStatutPaiement("Non pay\xE9");
  };
  const inputCls = "rounded-xl border px-3 py-2 text-sm bg-white";
  return /* @__PURE__ */ React.createElement("div", { className: "grid lg:grid-cols-2 gap-8" }, /* @__PURE__ */ React.createElement("form", { onSubmit: submit, className: "space-y-4" }, /* @__PURE__ */ React.createElement("h3", { className: "font-display font-semibold flex items-center gap-2" }, /* @__PURE__ */ React.createElement(FileText, { size: 16, style: { color: "#1E5F74" } }), " Nouveau devis / facture"), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "text-xs font-semibold", style: { color: "#6B7684" } }, "Ticket concern\xE9 *"), /* @__PURE__ */ React.createElement("select", { required: true, value: reparationId, onChange: (e) => setReparationId(e.target.value), className: `${inputCls} w-full mt-1`, style: { borderColor: "#D5DAE1" } }, /* @__PURE__ */ React.createElement("option", { value: "" }, "S\xE9lectionner un ticket\u2026"), allReparations.map((r) => {
    const c = clientById(r.clientId);
    const a = appareilById(r.appareilId);
    return /* @__PURE__ */ React.createElement("option", { key: r.id, value: r.id }, r.code, " \u2014 ", c?.nom, " \u2014 ", a?.marque, " ", a?.modele);
  }))), /* @__PURE__ */ React.createElement("div", { className: "flex gap-2" }, ["devis", "facture"].map((t) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: t,
      type: "button",
      onClick: () => setType(t),
      className: "px-3 py-1.5 rounded-full text-sm font-semibold capitalize",
      style: type === t ? { backgroundColor: "#1C2430", color: "#fff" } : { backgroundColor: "#EDEAE1", color: "#6B7684" }
    },
    t
  ))), /* @__PURE__ */ React.createElement("div", { className: "space-y-2" }, /* @__PURE__ */ React.createElement("label", { className: "text-xs font-semibold", style: { color: "#6B7684" } }, "Lignes"), lignes.map((l, i) => /* @__PURE__ */ React.createElement("div", { key: i, className: "flex gap-2 items-center" }, /* @__PURE__ */ React.createElement("input", { value: l.designation, onChange: (e) => setLigne(i, { designation: e.target.value }), placeholder: "D\xE9signation", className: `${inputCls} flex-1`, style: { borderColor: "#D5DAE1" } }), /* @__PURE__ */ React.createElement("input", { type: "number", min: "1", value: l.qte, onChange: (e) => setLigne(i, { qte: e.target.value }), className: `${inputCls} w-16 font-mono`, style: { borderColor: "#D5DAE1" } }), /* @__PURE__ */ React.createElement("input", { type: "number", min: "0", value: l.prix, onChange: (e) => setLigne(i, { prix: e.target.value }), placeholder: "Prix", className: `${inputCls} w-28 font-mono`, style: { borderColor: "#D5DAE1" } }), lignes.length > 1 && /* @__PURE__ */ React.createElement("button", { type: "button", onClick: () => removeLigne(i) }, /* @__PURE__ */ React.createElement(Trash2, { size: 15, style: { color: "#B0392F" } })))), /* @__PURE__ */ React.createElement("button", { type: "button", onClick: addLigne, className: "text-sm font-semibold flex items-center gap-1", style: { color: "#1E5F74" } }, /* @__PURE__ */ React.createElement(Plus, { size: 14 }), " Ajouter une ligne")), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "text-xs font-semibold", style: { color: "#6B7684" } }, "Statut paiement"), /* @__PURE__ */ React.createElement("select", { value: statutPaiement, onChange: (e) => setStatutPaiement(e.target.value), className: `${inputCls} w-full mt-1`, style: { borderColor: "#D5DAE1" } }, /* @__PURE__ */ React.createElement("option", null, "Non pay\xE9"), /* @__PURE__ */ React.createElement("option", null, "Partiel"), /* @__PURE__ */ React.createElement("option", null, "Pay\xE9"))), /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between pt-2 border-t", style: { borderColor: "#EEEBE3" } }, /* @__PURE__ */ React.createElement("span", { className: "font-semibold" }, "Total"), /* @__PURE__ */ React.createElement("span", { className: "font-mono font-bold text-lg" }, fmtXAF(total))), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "submit",
      disabled: !reparationId || total <= 0,
      className: "px-5 py-2.5 rounded-xl font-semibold text-white",
      style: { backgroundColor: reparationId && total > 0 ? "#1E5F74" : "#B7C0C7" }
    },
    "Enregistrer"
  )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", { className: "font-display font-semibold mb-3" }, "Historique"), factures.length === 0 ? /* @__PURE__ */ React.createElement(EmptyState, { icon: FileText, title: "Aucun document", subtitle: "Vos devis et factures appara\xEEtront ici." }) : /* @__PURE__ */ React.createElement("div", { className: "space-y-2" }, factures.map((f) => {
    const r = allReparations.find((x) => x.id === f.reparationId);
    const c = r ? clientById(r.clientId) : null;
    return /* @__PURE__ */ React.createElement("div", { key: f.id, className: "rounded-xl border bg-white p-3.5 flex items-center justify-between gap-3", style: { borderColor: "#E3E0D6" } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-sm font-semibold capitalize" }, f.type, " \u2014 ", r?.code || "\u2014"), /* @__PURE__ */ React.createElement("p", { className: "text-xs", style: { color: "#9AA3AF" } }, c?.nom, " \xB7 ", fmtDate(f.date), " \xB7 ", f.statutPaiement)), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-3" }, /* @__PURE__ */ React.createElement("span", { className: "font-mono font-semibold text-sm" }, fmtXAF(f.total)), /* @__PURE__ */ React.createElement("button", { onClick: () => setPrinting(f), className: "p-1.5 rounded-lg hover:bg-gray-50" }, /* @__PURE__ */ React.createElement(Printer, { size: 15, style: { color: "#6B7684" } }))));
  }))), printing && /* @__PURE__ */ React.createElement(PrintModal, { facture: printing, reparation: allReparations.find((r) => r.id === printing.reparationId), clientById, appareilById, onClose: () => setPrinting(null) }));
}
function PrintModal({ facture, reparation, clientById, appareilById, onClose }) {
  const c = reparation ? clientById(reparation.clientId) : null;
  const a = reparation ? appareilById(reparation.appareilId) : null;
  return /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 z-30 flex items-center justify-center p-4", style: { backgroundColor: "rgba(28,36,48,0.5)" } }, /* @__PURE__ */ React.createElement("div", { className: "w-full max-w-md bg-white rounded-2xl overflow-hidden max-h-[90vh] overflow-y-auto" }, /* @__PURE__ */ React.createElement("div", { className: "no-print flex justify-end p-3" }, /* @__PURE__ */ React.createElement("button", { onClick: onClose }, /* @__PURE__ */ React.createElement(X, { size: 18 }))), /* @__PURE__ */ React.createElement("div", { className: "px-8 pb-8", id: "print-area" }, /* @__PURE__ */ React.createElement("div", { className: "text-center mb-6" }, /* @__PURE__ */ React.createElement("p", { className: "font-display font-bold text-lg" }, "GLC SARL"), /* @__PURE__ */ React.createElement("p", { className: "text-xs", style: { color: "#6B7684" } }, "Atelier SAV \xB7 Informatique & T\xE9l\xE9phonie \xB7 Kribi, Cameroun")), /* @__PURE__ */ React.createElement("p", { className: "font-display font-semibold capitalize mb-1" }, facture.type, " \u2014 ", reparation?.code), /* @__PURE__ */ React.createElement("p", { className: "text-xs mb-4", style: { color: "#9AA3AF" } }, fmtDateTime(facture.date)), /* @__PURE__ */ React.createElement("p", { className: "text-sm font-semibold" }, c?.nom), /* @__PURE__ */ React.createElement("p", { className: "text-sm", style: { color: "#6B7684" } }, c?.telephone), /* @__PURE__ */ React.createElement("p", { className: "text-sm mb-4", style: { color: "#6B7684" } }, a?.marque, " ", a?.modele, " (", deviceLabel(a?.type), ")"), /* @__PURE__ */ React.createElement("table", { className: "w-full text-sm mb-4" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", { className: "border-b", style: { borderColor: "#E3E0D6" } }, /* @__PURE__ */ React.createElement("th", { className: "text-left py-1.5" }, "D\xE9signation"), /* @__PURE__ */ React.createElement("th", { className: "text-right py-1.5" }, "Qt\xE9"), /* @__PURE__ */ React.createElement("th", { className: "text-right py-1.5" }, "P.U."), /* @__PURE__ */ React.createElement("th", { className: "text-right py-1.5" }, "Total"))), /* @__PURE__ */ React.createElement("tbody", null, facture.lignes.map((l, i) => /* @__PURE__ */ React.createElement("tr", { key: i, className: "border-b", style: { borderColor: "#F0EEE8" } }, /* @__PURE__ */ React.createElement("td", { className: "py-1.5" }, l.designation), /* @__PURE__ */ React.createElement("td", { className: "text-right" }, l.qte), /* @__PURE__ */ React.createElement("td", { className: "text-right font-mono" }, fmtXAF(l.prix)), /* @__PURE__ */ React.createElement("td", { className: "text-right font-mono" }, fmtXAF(l.qte * l.prix)))))), /* @__PURE__ */ React.createElement("div", { className: "flex justify-between font-bold pt-2 border-t", style: { borderColor: "#E3E0D6" } }, /* @__PURE__ */ React.createElement("span", null, "Total"), /* @__PURE__ */ React.createElement("span", { className: "font-mono" }, fmtXAF(facture.total))), /* @__PURE__ */ React.createElement("p", { className: "text-xs mt-2 text-right", style: { color: "#9AA3AF" } }, "Statut : ", facture.statutPaiement), /* @__PURE__ */ React.createElement("button", { onClick: () => window.print(), className: "no-print w-full mt-6 rounded-xl py-2.5 font-semibold text-white flex items-center justify-center gap-2", style: { backgroundColor: "#1E5F74" } }, /* @__PURE__ */ React.createElement(Printer, { size: 15 }), " Imprimer"))));
}
function TicketDetail({ selectedTicket, setSelectedTicketId, clientById, appareilById, advanceStatus, updateTicket, facturesForReparation }) {
  const r = selectedTicket;
  const c = clientById(r.clientId);
  const a = appareilById(r.appareilId);
  const DeviceIcon = deviceIcon(a?.type);
  const [diagDraft, setDiagDraft] = useState(r.diagnostic || "");
  const currentIdx = STATUT_FLOW.indexOf(r.statut);
  const nextStatut = r.statut !== "Annul\xE9" && currentIdx < STATUT_FLOW.length - 1 ? STATUT_FLOW[currentIdx + 1] : null;
  return /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 z-20 flex items-end sm:items-center justify-center sm:p-6", style: { backgroundColor: "rgba(28,36,48,0.5)" }, onClick: () => setSelectedTicketId(null) }, /* @__PURE__ */ React.createElement("div", { className: "w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl max-h-[92vh] overflow-y-auto", onClick: (e) => e.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "px-6 pt-6 pb-3 flex items-center justify-between" }, /* @__PURE__ */ React.createElement("span", { className: "font-mono text-sm font-semibold tracking-wide", style: { color: "#9AA3AF" } }, r.code), /* @__PURE__ */ React.createElement("button", { onClick: () => setSelectedTicketId(null) }, /* @__PURE__ */ React.createElement(X, { size: 18, style: { color: "#6B7684" } }))), /* @__PURE__ */ React.createElement(Perforation, null), /* @__PURE__ */ React.createElement("div", { className: "px-6 py-5" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-3 mb-5" }, /* @__PURE__ */ React.createElement("div", { className: "w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0", style: { backgroundColor: "#EEF0F3" } }, /* @__PURE__ */ React.createElement(DeviceIcon, { size: 20, style: { color: "#1E5F74" } })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "font-display font-semibold" }, a?.marque, " ", a?.modele), /* @__PURE__ */ React.createElement("p", { className: "text-sm", style: { color: "#6B7684" } }, deviceLabel(a?.type), " ", a?.numeroSerie && `\xB7 ${a.numeroSerie}`))), /* @__PURE__ */ React.createElement(Stepper, { statut: r.statut, historique: r.historique }), /* @__PURE__ */ React.createElement("div", { className: "flex flex-wrap gap-2 mt-5" }, nextStatut && /* @__PURE__ */ React.createElement("button", { onClick: () => advanceStatus(r.id, nextStatut), className: "px-3.5 py-1.5 rounded-lg text-sm font-semibold text-white", style: { backgroundColor: STATUT_STYLE[nextStatut].color } }, "Passer \xE0 \xAB ", nextStatut, " \xBB"), r.statut !== "Annul\xE9" && r.statut !== "Livr\xE9" && /* @__PURE__ */ React.createElement("button", { onClick: () => advanceStatus(r.id, "Annul\xE9"), className: "px-3.5 py-1.5 rounded-lg text-sm font-semibold", style: { backgroundColor: STATUT_STYLE["Annul\xE9"].bg, color: STATUT_STYLE["Annul\xE9"].color } }, "Annuler")), /* @__PURE__ */ React.createElement("div", { className: "mt-6 pt-5 border-t space-y-4", style: { borderColor: "#EEEBE3" } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-xs font-semibold", style: { color: "#9AA3AF" } }, "Client"), /* @__PURE__ */ React.createElement("p", { className: "text-sm font-medium" }, c?.nom, " \xB7 ", c?.telephone)), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-xs font-semibold", style: { color: "#9AA3AF" } }, "Panne d\xE9clar\xE9e"), /* @__PURE__ */ React.createElement("p", { className: "text-sm" }, r.panneDeclaree)), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-xs font-semibold mb-1", style: { color: "#9AA3AF" } }, "Diagnostic technicien"), /* @__PURE__ */ React.createElement(
    "textarea",
    {
      value: diagDraft,
      onChange: (e) => setDiagDraft(e.target.value),
      onBlur: () => updateTicket(r.id, { diagnostic: diagDraft }),
      rows: 2,
      placeholder: "Ajouter un diagnostic\u2026",
      className: "w-full rounded-xl border px-3 py-2 text-sm",
      style: { borderColor: "#D5DAE1" }
    }
  )), /* @__PURE__ */ React.createElement("div", { className: "flex justify-between text-sm" }, /* @__PURE__ */ React.createElement("span", { style: { color: "#6B7684" } }, "Technicien"), /* @__PURE__ */ React.createElement("span", { className: "font-medium" }, r.technicien || "\u2014")), /* @__PURE__ */ React.createElement("div", { className: "flex justify-between text-sm" }, /* @__PURE__ */ React.createElement("span", { style: { color: "#6B7684" } }, "Re\xE7u le"), /* @__PURE__ */ React.createElement("span", { className: "font-medium" }, fmtDate(r.dateReception))), /* @__PURE__ */ React.createElement("div", { className: "flex justify-between text-sm" }, /* @__PURE__ */ React.createElement("span", { style: { color: "#6B7684" } }, "Livraison estim\xE9e"), /* @__PURE__ */ React.createElement("span", { className: "font-medium" }, r.dateEstimee ? fmtDate(r.dateEstimee) : "\u2014")), /* @__PURE__ */ React.createElement("div", { className: "flex justify-between text-sm" }, /* @__PURE__ */ React.createElement("span", { style: { color: "#6B7684" } }, "Devis estim\xE9"), /* @__PURE__ */ React.createElement("span", { className: "font-mono font-semibold" }, fmtXAF(r.montantDevis)))))));
}
export {
  App as default
};

import { createRoot } from "react-dom/client";
createRoot(document.getElementById("root")).render(React.createElement(App));
