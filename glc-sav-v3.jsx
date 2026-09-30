import React, { useState, useEffect, useMemo } from "react";
import {
  Wrench, User, Search, Plus, X, Phone, Printer, LogOut, ArrowLeft,
  CheckCircle2, Circle, ChevronRight, AlertCircle, FileText,
  Smartphone, Laptop, Tablet, Cpu, MapPin, Loader2, Trash2, Pencil
} from "lucide-react";

/* ---------------------------------- supabase (REST) ---------------------------------- */
// Connexion directe à l'API REST auto-générée par Supabase (PostgREST), sans SDK externe.
// SUPABASE_URL et SUPABASE_KEY sont des valeurs publiques par conception (protégées par les
// règles RLS côté base de données) — elles peuvent être exposées côté client sans risque.

const SUPABASE_URL = "https://nifnmmivqmhsfwyycawk.supabase.co";
const SUPABASE_KEY = "sb_publishable_PMuVagm6yjMzY_zCKvFqsA_-n3qGdyC";

async function sb(path, options = {}) {
  const isWrite = options.method && options.method !== "GET";
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      "Content-Type": "application/json",
      ...(isWrite ? { Prefer: "return=representation" } : {}),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Supabase ${res.status}: ${detail}`);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/* ---- mapping DB (snake_case) <-> app (camelCase), tel qu'utilisé par les composants ---- */
const mapClient = (r) => ({ id: r.id, nom: r.nom, telephone: r.telephone, email: r.email || "", adresse: r.adresse || "" });
const mapAppareil = (r) => ({ id: r.id, clientId: r.client_id, type: r.type, marque: r.marque, modele: r.modele || "", numeroSerie: r.numero_serie || "" });
const mapReparation = (r, historiqueRows) => ({
  id: r.id, code: r.code, clientId: r.client_id, appareilId: r.appareil_id,
  panneDeclaree: r.panne_declaree, diagnostic: r.diagnostic || "", statut: r.statut,
  technicien: r.technicien || "", dateReception: r.date_reception, dateEstimee: r.date_estimee || "",
  montantDevis: Number(r.montant_devis) || 0, notes: r.notes || "",
  historique: historiqueRows.filter((h) => h.reparation_id === r.id).sort((a, b) => new Date(a.date) - new Date(b.date)).map((h) => ({ statut: h.statut, date: h.date })),
});
const mapFacture = (f, ligneRows) => ({
  id: f.id, reparationId: f.reparation_id, type: f.type, date: f.date,
  total: Number(f.total) || 0, statutPaiement: f.statut_paiement,
  lignes: ligneRows.filter((l) => l.facture_id === f.id).map((l) => ({ designation: l.designation, qte: Number(l.quantite), prix: Number(l.prix_unitaire) })),
});

/* ---------------------------------- constants ---------------------------------- */

const DEVICE_TYPES = [
  { key: "telephone", label: "Téléphone", Icon: Smartphone },
  { key: "ordi_portable", label: "Ordinateur portable", Icon: Laptop },
  { key: "ordi_bureau", label: "Ordinateur de bureau", Icon: Cpu },
  { key: "tablette", label: "Tablette", Icon: Tablet },
  { key: "autre", label: "Autre", Icon: Wrench },
];

const STATUT_FLOW = ["Reçu", "En cours", "Prêt", "Livré"];

const STATUT_STYLE = {
  "Reçu": { color: "#5C6B82", bg: "#EEF0F3" },
  "En cours": { color: "#C46A1E", bg: "#FCEEDD" },
  "Prêt": { color: "#2E7D50", bg: "#E5F3EA" },
  "Livré": { color: "#123C4A", bg: "#E3EAEC" },
  "Annulé": { color: "#B0392F", bg: "#FBEAE9" },
};

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const nowIso = () => new Date().toISOString();
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const fmtDateTime = (iso) => iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const fmtXAF = (n) => (Number(n) || 0).toLocaleString("fr-FR") + " FCFA";
const genCode = (reparations) => {
  const year = new Date().getFullYear();
  const seq = reparations.length + 1;
  return `GLC-${year}-${String(seq).padStart(4, "0")}`;
};
const deviceIcon = (typeKey) => (DEVICE_TYPES.find((d) => d.key === typeKey) || DEVICE_TYPES[4]).Icon;
const deviceLabel = (typeKey) => (DEVICE_TYPES.find((d) => d.key === typeKey) || DEVICE_TYPES[4]).label;

/* ---------------------------------- small pieces ---------------------------------- */

function StatusPill({ statut, size = "md" }) {
  const s = STATUT_STYLE[statut] || STATUT_STYLE["Reçu"];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${size === "sm" ? "text-xs px-2.5 py-1" : "text-sm px-3 py-1.5"}`}
      style={{ color: s.color, backgroundColor: s.bg }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.color }} />
      {statut}
    </span>
  );
}

function Perforation() {
  return (
    <div
      className="w-full h-2"
      style={{
        backgroundImage: "radial-gradient(circle, rgba(28,36,48,0.18) 1.6px, transparent 2px)",
        backgroundSize: "12px 8px",
        backgroundRepeat: "repeat-x",
        backgroundPosition: "center",
      }}
    />
  );
}

function EmptyState({ icon: Icon, title, subtitle, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6 rounded-2xl border border-dashed" style={{ borderColor: "#C7CDD6" }}>
      <div className="w-12 h-12 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: "#EEF0F3" }}>
        <Icon size={22} style={{ color: "#5C6B82" }} />
      </div>
      <p className="font-display font-semibold text-base" style={{ color: "#1C2430" }}>{title}</p>
      {subtitle && <p className="text-sm mt-1 max-w-sm" style={{ color: "#6B7684" }}>{subtitle}</p>}
      {action}
    </div>
  );
}

function Stepper({ statut, historique }) {
  const isCancelled = statut === "Annulé";
  const currentIndex = STATUT_FLOW.indexOf(statut);
  const dateFor = (key) => (historique || []).slice().reverse().find((h) => h.statut === key)?.date;
  return (
    <div className="w-full">
      {isCancelled ? (
        <div className="flex items-center gap-2 rounded-xl px-4 py-3" style={{ backgroundColor: STATUT_STYLE["Annulé"].bg }}>
          <AlertCircle size={18} style={{ color: STATUT_STYLE["Annulé"].color }} />
          <span className="font-semibold text-sm" style={{ color: STATUT_STYLE["Annulé"].color }}>Cette réparation a été annulée</span>
        </div>
      ) : (
        <div className="flex items-start">
          {STATUT_FLOW.map((step, i) => {
            const done = i <= currentIndex;
            const active = i === currentIndex;
            const s = STATUT_STYLE[step];
            return (
              <React.Fragment key={step}>
                <div className="flex flex-col items-center" style={{ width: 84 }}>
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors"
                    style={{
                      borderColor: done ? s.color : "#D5DAE1",
                      backgroundColor: done ? s.color : "#fff",
                      boxShadow: active ? `0 0 0 4px ${s.bg}` : "none",
                    }}
                  >
                    {done ? <CheckCircle2 size={16} color="#fff" /> : <Circle size={14} color="#C7CDD6" />}
                  </div>
                  <span className="text-xs font-semibold mt-2 text-center" style={{ color: done ? "#1C2430" : "#9AA3AF" }}>{step}</span>
                  <span className="text-[11px] mt-0.5" style={{ color: "#9AA3AF" }}>{done ? fmtDate(dateFor(step)) : ""}</span>
                </div>
                {i < STATUT_FLOW.length - 1 && (
                  <div className="flex-1 mt-4" style={{ height: 2, backgroundColor: i < currentIndex ? s.color : "#E3E6EB" }} />
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------- app ---------------------------------- */

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("GLC SAV — erreur applicative:", error, info); }
  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "sans-serif", backgroundColor: "#F6F3ED" }}>
          <div style={{ maxWidth: 480, textAlign: "center" }}>
            <p style={{ fontWeight: 700, fontSize: 18, marginBottom: 8, color: "#1C2430" }}>Un problème est survenu dans l'application</p>
            <p style={{ fontSize: 13, color: "#B0392F", fontFamily: "monospace", wordBreak: "break-word", backgroundColor: "#FBEAE9", padding: 12, borderRadius: 8 }}>
              {String(this.state.error?.message || this.state.error)}
            </p>
            <p style={{ fontSize: 13, color: "#6B7684", marginTop: 12 }}>Copiez ce message et partagez-le pour obtenir de l'aide.</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
}

function AppInner() {
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState("gate"); // gate | staffAuth | staff | client
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
  const [lookupResult, setLookupResult] = useState(undefined);

  const [dbError, setDbError] = useState("");

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2200); };

  /* ---- chargement complet depuis Supabase (appelé à l'entrée dans l'espace technicien) ---- */
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
        sb("facture_lignes?select=*"),
      ]);
      setClients((clientsRows || []).map(mapClient));
      setAppareils((appareilsRows || []).map(mapAppareil));
      setReparations((reparationsRows || []).map((r) => mapReparation(r, historiqueRows || [])));
      setFactures((facturesRows || []).map((f) => mapFacture(f, lignesRows || [])));
    } catch (e) {
      console.error(e);
      setDbError("Impossible de charger les données depuis Supabase. Vérifiez la connexion.");
    }
    setLoading(false);
  };

  useEffect(() => {
    if (view === "staff") loadAll();
  }, [view]);

  const clientById = (id) => clients.find((c) => c.id === id);
  const appareilById = (id) => appareils.find((a) => a.id === id);
  const facturesForReparation = (id) => factures.filter((f) => f.reparationId === id);

  /* ---- ticket creation ---- */
  const createTicket = async (form) => {
    try {
      let clientId = form.existingClientId;
      if (!clientId) {
        const [newClientRow] = await sb("clients", {
          method: "POST",
          body: JSON.stringify([{ nom: form.nom.trim(), telephone: form.telephone.trim(), email: form.email.trim() || null, adresse: form.adresse.trim() || null }]),
        });
        clientId = newClientRow.id;
      }
      const [newAppareilRow] = await sb("appareils", {
        method: "POST",
        body: JSON.stringify([{ client_id: clientId, type: form.type, marque: form.marque.trim(), modele: form.modele.trim() || null, numero_serie: form.numeroSerie.trim() || null }]),
      });
      const [newReparationRow] = await sb("reparations", {
        method: "POST",
        body: JSON.stringify([{
          client_id: clientId, appareil_id: newAppareilRow.id, panne_declaree: form.panneDeclaree.trim(),
          technicien: form.technicien.trim() || null, date_reception: form.dateReception || new Date().toISOString().slice(0, 10),
          date_estimee: form.dateEstimee || null, montant_devis: form.montantDevis ? Number(form.montantDevis) : 0,
        }]),
      });
      await loadAll();
      setSelectedTicketId(newReparationRow.id);
      setStaffTab("dashboard");
      showToast(`Ticket ${newReparationRow.code} créé`);
    } catch (e) {
      console.error(e);
      showToast("Erreur lors de la création du ticket");
    }
  };

  const advanceStatus = async (id, newStatut) => {
    try {
      await sb(`reparations?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ statut: newStatut }) });
      await loadAll();
      showToast(`Statut mis à jour : ${newStatut}`);
    } catch (e) {
      console.error(e);
      showToast("Erreur lors de la mise à jour du statut");
    }
  };

  const updateTicket = async (id, patch) => {
    const dbPatch = {};
    if ("diagnostic" in patch) dbPatch.diagnostic = patch.diagnostic;
    if ("montantDevis" in patch) dbPatch.montant_devis = patch.montantDevis;
    if ("dateEstimee" in patch) dbPatch.date_estimee = patch.dateEstimee;
    setReparations((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
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
        body: JSON.stringify([{ reparation_id: form.reparationId, type: form.type, statut_paiement: form.statutPaiement, total }]),
      });
      await sb("facture_lignes", {
        method: "POST",
        body: JSON.stringify(lignes.map((l) => ({ facture_id: newFactureRow.id, designation: l.designation, quantite: Number(l.qte) || 1, prix_unitaire: Number(l.prix) || 0 }))),
      });
      await loadAll();
      showToast(`${form.type === "facture" ? "Facture" : "Devis"} créé(e)`);
    } catch (e) {
      console.error(e);
      showToast("Erreur lors de l'enregistrement du document");
    }
  };

  /* ---- client lookup (requêtes ciblées, sans charger tout l'atelier) ---- */
  const [lookupLoading, setLookupLoading] = useState(false);
  const runLookup = async () => {
    const code = lookupCode.trim().toUpperCase();
    const phoneDigits = lookupPhone.replace(/\D/g, "");
    if (!code || !phoneDigits) return;
    setLookupLoading(true);
    try {
      const repRows = await sb(`reparations?select=*&code=eq.${encodeURIComponent(code)}&limit=1`);
      const repRow = repRows && repRows[0];
      if (!repRow) { setLookupResult(null); setLookupLoading(false); return; }

      const clientRows = await sb(`clients?select=*&id=eq.${repRow.client_id}&limit=1`);
      const clientRow = clientRows && clientRows[0];
      const clientPhoneDigits = (clientRow?.telephone || "").replace(/\D/g, "");
      if (!clientRow || !clientPhoneDigits.endsWith(phoneDigits.slice(-8))) {
        setLookupResult(null); setLookupLoading(false); return;
      }

      const [appareilRows, historiqueRows, facturesRows] = await Promise.all([
        sb(`appareils?select=*&id=eq.${repRow.appareil_id}&limit=1`),
        sb(`reparation_historique?select=*&reparation_id=eq.${repRow.id}`),
        sb(`factures?select=*&reparation_id=eq.${repRow.id}`),
      ]);
      const factureIds = (facturesRows || []).map((f) => f.id);
      const ligneRows = factureIds.length
        ? await sb(`facture_lignes?select=*&facture_id=in.(${factureIds.join(",")})`)
        : [];

      setLookupResult({
        rep: mapReparation(repRow, historiqueRows || []),
        client: mapClient(clientRow),
        appareil: mapAppareil((appareilRows && appareilRows[0]) || {}),
        factures: (facturesRows || []).map((f) => mapFacture(f, ligneRows || [])),
      });
    } catch (e) {
      console.error(e);
      setLookupResult(null);
    }
    setLookupLoading(false);
  };

  /* ---- derived ---- */
  const filteredReparations = useMemo(() => {
    let list = reparations;
    if (statutFilter !== "Tous") list = list.filter((r) => r.statut === statutFilter);
    const q = dashSearch.trim().toLowerCase();
    if (q) {
      list = list.filter((r) => {
        const c = clientById(r.clientId);
        const a = appareilById(r.appareilId);
        return r.code.toLowerCase().includes(q) || (c?.nom || "").toLowerCase().includes(q) ||
          (c?.telephone || "").includes(q) || (a?.marque || "").toLowerCase().includes(q) || (a?.modele || "").toLowerCase().includes(q);
      });
    }
    return list.sort((a, b) => new Date(b.dateReception) - new Date(a.dateReception));
  }, [reparations, statutFilter, dashSearch, clients, appareils]);

  const counts = useMemo(() => {
    const c = { Tous: reparations.length };
    STATUT_FLOW.concat(["Annulé"]).forEach((s) => { c[s] = reparations.filter((r) => r.statut === s).length; });
    return c;
  }, [reparations]);

  const selectedTicket = selectedTicketId ? reparations.find((r) => r.id === selectedTicketId) : null;

  /* ---------------------------------- render ---------------------------------- */

  return (
    <div className="min-h-screen w-full" style={{ backgroundColor: "#F6F3ED", fontFamily: "'Inter', sans-serif", color: "#1C2430" }}>
      <style>{`
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
      `}</style>

      {loading ? (
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="animate-spin" size={28} style={{ color: "#1E5F74" }} />
        </div>
      ) : view === "gate" ? (
        <GateView onStaff={() => setView("staffAuth")} onClient={() => { setView("client"); setLookupResult(undefined); }} />
      ) : view === "staffAuth" ? (
        <StaffAuthView
          pin={pin} setPin={setPin} error={pinError}
          onBack={() => { setView("gate"); setPin(""); setPinError(""); }}
          onSubmit={() => { if (pin === "2026") { setView("staff"); setPinError(""); } else setPinError("Code incorrect. (Indice démo : 2026)"); }}
        />
      ) : view === "client" ? (
        <ClientPortalView
          lookupCode={lookupCode} setLookupCode={setLookupCode}
          lookupPhone={lookupPhone} setLookupPhone={setLookupPhone}
          result={lookupResult} onSearch={runLookup} searching={lookupLoading}
          onBack={() => { setView("gate"); setLookupResult(undefined); setLookupCode(""); setLookupPhone(""); }}
          appareilLabel={deviceLabel} appareilIcon={deviceIcon}
        />
      ) : (
        <StaffApp
          staffTab={staffTab} setStaffTab={setStaffTab}
          onLogout={() => { setView("gate"); setStaffTab("dashboard"); setSelectedTicketId(null); }}
          reparations={filteredReparations} allReparations={reparations}
          clients={clients} appareils={appareils} factures={factures}
          counts={counts} statutFilter={statutFilter} setStatutFilter={setStatutFilter}
          dashSearch={dashSearch} setDashSearch={setDashSearch}
          selectedTicket={selectedTicket} setSelectedTicketId={setSelectedTicketId}
          clientById={clientById} appareilById={appareilById} facturesForReparation={facturesForReparation}
          createTicket={createTicket} advanceStatus={advanceStatus} updateTicket={updateTicket} createFacture={createFacture}
          dbError={dbError}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-full shadow-lg font-medium text-sm no-print" style={{ backgroundColor: "#1C2430", color: "#F6F3ED" }}>
          {toast}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------- gate ---------------------------------- */

function GateView({ onStaff, onClient }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-md mb-10 text-center">
        <div className="inline-flex items-center gap-2 mb-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#1E5F74" }}>
            <Wrench size={19} color="#fff" />
          </div>
          <span className="font-display font-bold text-xl tracking-tight">GLC SARL</span>
        </div>
        <h1 className="font-display font-bold text-2xl sm:text-3xl leading-tight">Atelier SAV — Informatique &amp; Téléphonie</h1>
        <div className="flex items-center justify-center gap-1.5 mt-2 text-sm" style={{ color: "#6B7684" }}>
          <MapPin size={14} /> Kribi, Cameroun
        </div>
      </div>

      <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-sm border mb-8" style={{ borderColor: "#E3E0D6", backgroundColor: "#fff" }}>
        <div className="px-5 pt-5 pb-3 flex items-center justify-between">
          <span className="font-mono text-xs font-semibold tracking-wider" style={{ color: "#9AA3AF" }}>TICKET N° GLC-2026-0001</span>
          <StatusPill statut="En cours" size="sm" />
        </div>
        <Perforation />
        <div className="px-5 py-4 grid grid-cols-2 gap-3 text-sm">
          <div><p style={{ color: "#9AA3AF" }} className="text-xs">Appareil</p><p className="font-medium">iPhone 12 — écran</p></div>
          <div><p style={{ color: "#9AA3AF" }} className="text-xs">Reçu le</p><p className="font-medium">02 août 2026</p></div>
        </div>
      </div>

      <div className="w-full max-w-md grid grid-cols-1 gap-3">
        <button onClick={onStaff} className="group flex items-center gap-4 rounded-2xl p-4 border transition-all hover:shadow-md" style={{ backgroundColor: "#1E5F74", borderColor: "#1E5F74" }}>
          <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "rgba(255,255,255,0.15)" }}>
            <Wrench size={20} color="#fff" />
          </div>
          <div className="text-left flex-1">
            <p className="font-display font-semibold text-white">Espace technicien</p>
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.75)" }}>Gérer les tickets, clients et factures</p>
          </div>
          <ChevronRight size={18} color="rgba(255,255,255,0.7)" className="group-hover:translate-x-0.5 transition-transform" />
        </button>

        <button onClick={onClient} className="group flex items-center gap-4 rounded-2xl p-4 border transition-all hover:shadow-md bg-white" style={{ borderColor: "#E3E0D6" }}>
          <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#FCEEDD" }}>
            <Search size={20} style={{ color: "#C46A1E" }} />
          </div>
          <div className="text-left flex-1">
            <p className="font-display font-semibold">Suivre ma réparation</p>
            <p className="text-sm" style={{ color: "#6B7684" }}>Avec mon numéro de ticket</p>
          </div>
          <ChevronRight size={18} style={{ color: "#9AA3AF" }} className="group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>
    </div>
  );
}

function StaffAuthView({ pin, setPin, error, onBack, onSubmit }) {
  const handleValidate = () => { onSubmit(); };
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-sm font-medium mb-6" style={{ color: "#6B7684" }}>
          <ArrowLeft size={16} /> Retour
        </button>
        <h2 className="font-display font-bold text-xl mb-1">Accès équipe</h2>
        <p className="text-sm mb-6" style={{ color: "#6B7684" }}>Entrez le code d'accès de l'atelier.</p>
        <div>
          <input
            type="text" inputMode="numeric" value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleValidate(); }}
            placeholder="Code d'accès"
            className="w-full rounded-xl border px-4 py-3 font-mono text-lg tracking-widest text-center"
            style={{ borderColor: "#D5DAE1" }}
          />
          <p className="text-xs mt-1.5 text-center" style={{ color: "#9AA3AF" }}>Saisie actuelle : {pin ? pin : "(vide)"}</p>
          {error && <p className="text-sm mt-2 flex items-center gap-1.5" style={{ color: "#B0392F" }}><AlertCircle size={14} />{error}</p>}
          <button type="button" onClick={handleValidate} className="w-full mt-4 rounded-xl py-3 font-semibold text-white transition-opacity hover:opacity-90 cursor-pointer" style={{ backgroundColor: "#1E5F74" }}>
            Entrer
          </button>
        </div>
        <p className="text-xs mt-4 text-center" style={{ color: "#9AA3AF" }}>Accès simplifié pour cette démo — à remplacer par une authentification réelle en production.</p>
      </div>
    </div>
  );
}

/* ---------------------------------- client portal ---------------------------------- */

function ClientPortalView({ lookupCode, setLookupCode, lookupPhone, setLookupPhone, result, onSearch, searching, onBack, appareilLabel, appareilIcon }) {
  const DeviceIcon = result?.rep ? appareilIcon(result.appareil?.type) : Smartphone;
  return (
    <div className="min-h-screen px-6 py-10 flex flex-col items-center">
      <div className="w-full max-w-md">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-medium mb-6" style={{ color: "#6B7684" }}>
          <ArrowLeft size={16} /> Retour
        </button>
        <h2 className="font-display font-bold text-xl mb-1">Suivre ma réparation</h2>
        <p className="text-sm mb-6" style={{ color: "#6B7684" }}>Entrez votre numéro de ticket et votre téléphone.</p>

        <form onSubmit={(e) => { e.preventDefault(); onSearch(); }} className="space-y-3 mb-6">
          <div>
            <label className="text-xs font-semibold" style={{ color: "#6B7684" }}>Numéro de ticket</label>
            <input value={lookupCode} onChange={(e) => setLookupCode(e.target.value)} placeholder="GLC-2026-0001"
              className="w-full mt-1 rounded-xl border px-4 py-3 font-mono uppercase" style={{ borderColor: "#D5DAE1" }} />
          </div>
          <div>
            <label className="text-xs font-semibold" style={{ color: "#6B7684" }}>Numéro de téléphone</label>
            <input value={lookupPhone} onChange={(e) => setLookupPhone(e.target.value)} placeholder="6XX XX XX XX"
              className="w-full mt-1 rounded-xl border px-4 py-3" style={{ borderColor: "#D5DAE1" }} />
          </div>
          <button type="submit" disabled={searching} className="w-full rounded-xl py-3 font-semibold text-white flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-60" style={{ backgroundColor: "#1E5F74" }}>
            {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} {searching ? "Recherche…" : "Rechercher"}
          </button>
        </form>

        {result === null && (
          <div className="rounded-xl px-4 py-3 flex items-start gap-2" style={{ backgroundColor: "#FBEAE9" }}>
            <AlertCircle size={16} style={{ color: "#B0392F" }} className="mt-0.5 flex-shrink-0" />
            <p className="text-sm" style={{ color: "#B0392F" }}>Aucune réparation trouvée avec ces informations. Vérifiez le numéro de ticket et le téléphone utilisé lors du dépôt.</p>
          </div>
        )}

        {result && (
          <div className="rounded-2xl overflow-hidden border shadow-sm bg-white">
            <div className="px-5 pt-5 pb-3 flex items-center justify-between">
              <span className="font-mono text-sm font-semibold tracking-wider" style={{ color: "#1C2430" }}>{result.rep.code}</span>
              <StatusPill statut={result.rep.statut} size="sm" />
            </div>
            <Perforation />
            <div className="px-5 py-5">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#EEF0F3" }}>
                  <DeviceIcon size={18} style={{ color: "#1E5F74" }} />
                </div>
                <div>
                  <p className="font-semibold text-sm">{result.appareil?.marque} {result.appareil?.modele}</p>
                  <p className="text-xs" style={{ color: "#9AA3AF" }}>{appareilLabel(result.appareil?.type)}</p>
                </div>
              </div>

              <Stepper statut={result.rep.statut} historique={result.rep.historique} />

              <div className="mt-6 pt-5 border-t space-y-3" style={{ borderColor: "#E9E6DE" }}>
                <div>
                  <p className="text-xs font-semibold" style={{ color: "#9AA3AF" }}>Panne signalée</p>
                  <p className="text-sm mt-0.5">{result.rep.panneDeclaree || "—"}</p>
                </div>
                {result.rep.diagnostic && (
                  <div>
                    <p className="text-xs font-semibold" style={{ color: "#9AA3AF" }}>Diagnostic technicien</p>
                    <p className="text-sm mt-0.5">{result.rep.diagnostic}</p>
                  </div>
                )}
                <div className="flex justify-between items-center pt-2">
                  <span className="text-sm font-medium">Montant estimé</span>
                  <span className="font-mono font-semibold">{fmtXAF(result.rep.montantDevis)}</span>
                </div>
                {result.factures.length > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Statut paiement</span>
                    <span className="text-sm font-semibold">{result.factures[result.factures.length - 1].statutPaiement}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <p className="text-xs mt-8 text-center" style={{ color: "#9AA3AF" }}>GLC SARL · Atelier SAV · Kribi, Cameroun</p>
      </div>
    </div>
  );
}

/* ---------------------------------- staff app shell ---------------------------------- */

function StaffApp(props) {
  const { staffTab, setStaffTab, onLogout } = props;
  const tabs = [
    { key: "dashboard", label: "Tableau de bord" },
    { key: "nouveau", label: "Nouveau ticket" },
    { key: "clients", label: "Clients" },
    { key: "facturation", label: "Facturation" },
  ];
  return (
    <div className="min-h-screen flex flex-col">
      <header className="no-print sticky top-0 z-10 border-b" style={{ backgroundColor: "#F6F3ED", borderColor: "#E3E0D6" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#1E5F74" }}>
              <Wrench size={15} color="#fff" />
            </div>
            <span className="font-display font-bold text-sm sm:text-base">GLC SARL · Atelier</span>
          </div>
          <button onClick={onLogout} className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-white transition-colors" style={{ color: "#6B7684" }}>
            <LogOut size={15} /> <span className="hidden sm:inline">Quitter</span>
          </button>
        </div>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex gap-1 overflow-x-auto pb-2">
          {tabs.map((t) => (
            <button key={t.key} onClick={() => setStaffTab(t.key)}
              className="px-3.5 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition-colors"
              style={staffTab === t.key ? { backgroundColor: "#1C2430", color: "#F6F3ED" } : { color: "#6B7684" }}>
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6">
        {props.dbError && (
          <div className="mb-4 rounded-xl px-4 py-3 flex items-start gap-2" style={{ backgroundColor: "#FBEAE9" }}>
            <AlertCircle size={16} style={{ color: "#B0392F" }} className="mt-0.5 flex-shrink-0" />
            <p className="text-sm" style={{ color: "#B0392F" }}>{props.dbError}</p>
          </div>
        )}
        {staffTab === "dashboard" && <DashboardTab {...props} />}
        {staffTab === "nouveau" && <NouveauTicketTab {...props} />}
        {staffTab === "clients" && <ClientsTab {...props} />}
        {staffTab === "facturation" && <FacturationTab {...props} />}
      </main>

      {props.selectedTicket && <TicketDetail {...props} />}
    </div>
  );
}

/* ---------------------------------- dashboard ---------------------------------- */

function DashboardTab({ reparations, counts, statutFilter, setStatutFilter, dashSearch, setDashSearch, clientById, appareilById, setSelectedTicketId }) {
  const chips = ["Tous", ...STATUT_FLOW, "Annulé"];
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        {chips.map((c) => {
          const active = statutFilter === c;
          const style = c === "Tous" ? { color: "#1C2430", bg: "#EDEAE1" } : { color: STATUT_STYLE[c].color, bg: STATUT_STYLE[c].bg };
          return (
            <button key={c} onClick={() => setStatutFilter(c)}
              className="px-3 py-1.5 rounded-full text-sm font-semibold flex items-center gap-1.5 border transition-all"
              style={{ backgroundColor: active ? style.color : style.bg, color: active ? "#fff" : style.color, borderColor: "transparent" }}>
              {c} <span className="opacity-70 font-mono text-xs">{counts[c] || 0}</span>
            </button>
          );
        })}
      </div>

      <div className="relative mb-5 max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#9AA3AF" }} />
        <input value={dashSearch} onChange={(e) => setDashSearch(e.target.value)} placeholder="Rechercher un ticket, client, appareil…"
          className="w-full pl-9 pr-3 py-2.5 rounded-xl border text-sm" style={{ borderColor: "#D5DAE1", backgroundColor: "#fff" }} />
      </div>

      {reparations.length === 0 ? (
        <EmptyState icon={Wrench} title="Aucun ticket pour ce filtre" subtitle="Créez un nouveau ticket ou changez de filtre." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {reparations.map((r) => {
            const c = clientById(r.clientId);
            const a = appareilById(r.appareilId);
            const DeviceIcon = deviceIcon(a?.type);
            const s = STATUT_STYLE[r.statut];
            return (
              <button key={r.id} onClick={() => setSelectedTicketId(r.id)}
                className="text-left rounded-2xl border bg-white overflow-hidden hover:shadow-md transition-shadow"
                style={{ borderColor: "#E3E0D6", borderLeft: `4px solid ${s.color}` }}>
                <div className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-xs font-semibold tracking-wide" style={{ color: "#9AA3AF" }}>{r.code}</span>
                    <StatusPill statut={r.statut} size="sm" />
                  </div>
                  <div className="flex items-center gap-2 mb-1">
                    <DeviceIcon size={14} style={{ color: "#1E5F74" }} />
                    <span className="font-semibold text-sm">{a?.marque} {a?.modele}</span>
                  </div>
                  <p className="text-sm" style={{ color: "#6B7684" }}>{c?.nom}</p>
                  <div className="flex items-center justify-between mt-3 pt-3 border-t" style={{ borderColor: "#EEEBE3" }}>
                    <span className="text-xs" style={{ color: "#9AA3AF" }}>Reçu le {fmtDate(r.dateReception)}</span>
                    <span className="font-mono text-xs font-semibold">{fmtXAF(r.montantDevis)}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------- nouveau ticket ---------------------------------- */

function NouveauTicketTab({ clients, createTicket }) {
  const [mode, setMode] = useState("new");
  const [existingClientId, setExistingClientId] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [form, setForm] = useState({
    nom: "", telephone: "", email: "", adresse: "",
    type: "telephone", marque: "", modele: "", numeroSerie: "",
    panneDeclaree: "", technicien: "", dateReception: new Date().toISOString().slice(0, 10),
    dateEstimee: "", montantDevis: "",
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const matches = clientSearch.trim()
    ? clients.filter((c) => c.nom.toLowerCase().includes(clientSearch.toLowerCase()) || c.telephone.includes(clientSearch)).slice(0, 5)
    : [];

  const canSubmit = (mode === "existing" ? !!existingClientId : (form.nom.trim() && form.telephone.trim())) && form.marque.trim() && form.panneDeclaree.trim();

  const submit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    createTicket({ ...form, existingClientId: mode === "existing" ? existingClientId : null });
    setForm({ nom: "", telephone: "", email: "", adresse: "", type: "telephone", marque: "", modele: "", numeroSerie: "", panneDeclaree: "", technicien: "", dateReception: new Date().toISOString().slice(0, 10), dateEstimee: "", montantDevis: "" });
    setExistingClientId(""); setClientSearch(""); setMode("new");
  };

  const inputCls = "w-full mt-1 rounded-xl border px-3.5 py-2.5 text-sm bg-white";
  const labelCls = "text-xs font-semibold";

  return (
    <form onSubmit={submit} className="max-w-2xl space-y-6">
      <section>
        <h3 className="font-display font-semibold mb-3 flex items-center gap-2"><User size={16} style={{ color: "#1E5F74" }} /> Client</h3>
        <div className="flex gap-2 mb-3">
          <button type="button" onClick={() => setMode("new")} className="px-3 py-1.5 rounded-full text-sm font-semibold" style={mode === "new" ? { backgroundColor: "#1C2430", color: "#fff" } : { backgroundColor: "#EDEAE1", color: "#6B7684" }}>Nouveau client</button>
          <button type="button" onClick={() => setMode("existing")} className="px-3 py-1.5 rounded-full text-sm font-semibold" style={mode === "existing" ? { backgroundColor: "#1C2430", color: "#fff" } : { backgroundColor: "#EDEAE1", color: "#6B7684" }}>Client existant</button>
        </div>

        {mode === "new" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className={labelCls} style={{ color: "#6B7684" }}>Nom complet *</label><input required value={form.nom} onChange={(e) => set("nom", e.target.value)} className={inputCls} style={{ borderColor: "#D5DAE1" }} /></div>
            <div><label className={labelCls} style={{ color: "#6B7684" }}>Téléphone *</label><input required value={form.telephone} onChange={(e) => set("telephone", e.target.value)} placeholder="6XX XX XX XX" className={inputCls} style={{ borderColor: "#D5DAE1" }} /></div>
            <div><label className={labelCls} style={{ color: "#6B7684" }}>Email</label><input value={form.email} onChange={(e) => set("email", e.target.value)} className={inputCls} style={{ borderColor: "#D5DAE1" }} /></div>
            <div><label className={labelCls} style={{ color: "#6B7684" }}>Adresse / Quartier</label><input value={form.adresse} onChange={(e) => set("adresse", e.target.value)} className={inputCls} style={{ borderColor: "#D5DAE1" }} /></div>
          </div>
        ) : (
          <div className="relative">
            <input value={clientSearch} onChange={(e) => { setClientSearch(e.target.value); setExistingClientId(""); }} placeholder="Rechercher par nom ou téléphone…" className={inputCls} style={{ borderColor: "#D5DAE1" }} />
            {matches.length > 0 && !existingClientId && (
              <div className="mt-1 rounded-xl border bg-white overflow-hidden" style={{ borderColor: "#D5DAE1" }}>
                {matches.map((c) => (
                  <button type="button" key={c.id} onClick={() => { setExistingClientId(c.id); setClientSearch(`${c.nom} — ${c.telephone}`); }}
                    className="w-full text-left px-3.5 py-2.5 text-sm hover:bg-gray-50 border-b last:border-0" style={{ borderColor: "#F0EEE8" }}>
                    <span className="font-medium">{c.nom}</span> <span style={{ color: "#9AA3AF" }}>· {c.telephone}</span>
                  </button>
                ))}
              </div>
            )}
            {existingClientId && <p className="text-xs mt-1.5 flex items-center gap-1" style={{ color: "#2E7D50" }}><CheckCircle2 size={13} /> Client sélectionné</p>}
          </div>
        )}
      </section>

      <section>
        <h3 className="font-display font-semibold mb-3 flex items-center gap-2"><Smartphone size={16} style={{ color: "#1E5F74" }} /> Appareil</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls} style={{ color: "#6B7684" }}>Type d'appareil</label>
            <select value={form.type} onChange={(e) => set("type", e.target.value)} className={inputCls} style={{ borderColor: "#D5DAE1" }}>
              {DEVICE_TYPES.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
            </select>
          </div>
          <div><label className={labelCls} style={{ color: "#6B7684" }}>Marque *</label><input required value={form.marque} onChange={(e) => set("marque", e.target.value)} placeholder="Samsung, HP, Apple…" className={inputCls} style={{ borderColor: "#D5DAE1" }} /></div>
          <div><label className={labelCls} style={{ color: "#6B7684" }}>Modèle</label><input value={form.modele} onChange={(e) => set("modele", e.target.value)} className={inputCls} style={{ borderColor: "#D5DAE1" }} /></div>
          <div><label className={labelCls} style={{ color: "#6B7684" }}>N° série / IMEI</label><input value={form.numeroSerie} onChange={(e) => set("numeroSerie", e.target.value)} className={`${inputCls} font-mono`} style={{ borderColor: "#D5DAE1" }} /></div>
        </div>
      </section>

      <section>
        <h3 className="font-display font-semibold mb-3 flex items-center gap-2"><FileText size={16} style={{ color: "#1E5F74" }} /> Réparation</h3>
        <div className="grid grid-cols-1 gap-3">
          <div><label className={labelCls} style={{ color: "#6B7684" }}>Panne déclarée par le client *</label><textarea required value={form.panneDeclaree} onChange={(e) => set("panneDeclaree", e.target.value)} rows={2} className={inputCls} style={{ borderColor: "#D5DAE1" }} /></div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div><label className={labelCls} style={{ color: "#6B7684" }}>Technicien assigné</label><input value={form.technicien} onChange={(e) => set("technicien", e.target.value)} className={inputCls} style={{ borderColor: "#D5DAE1" }} /></div>
            <div><label className={labelCls} style={{ color: "#6B7684" }}>Date de réception</label><input type="date" value={form.dateReception} onChange={(e) => set("dateReception", e.target.value)} className={inputCls} style={{ borderColor: "#D5DAE1" }} /></div>
            <div><label className={labelCls} style={{ color: "#6B7684" }}>Livraison estimée</label><input type="date" value={form.dateEstimee} onChange={(e) => set("dateEstimee", e.target.value)} className={inputCls} style={{ borderColor: "#D5DAE1" }} /></div>
          </div>
          <div className="max-w-xs"><label className={labelCls} style={{ color: "#6B7684" }}>Devis estimé (FCFA)</label><input type="number" min="0" value={form.montantDevis} onChange={(e) => set("montantDevis", e.target.value)} className={`${inputCls} font-mono`} style={{ borderColor: "#D5DAE1" }} /></div>
        </div>
      </section>

      <button type="submit" disabled={!canSubmit} className="w-full sm:w-auto px-6 py-3 rounded-xl font-semibold text-white flex items-center justify-center gap-2 transition-opacity"
        style={{ backgroundColor: canSubmit ? "#1E5F74" : "#B7C0C7", cursor: canSubmit ? "pointer" : "not-allowed" }}>
        <Plus size={16} /> Créer le ticket
      </button>
    </form>
  );
}

/* ---------------------------------- clients tab ---------------------------------- */

function ClientsTab({ clients, appareils, allReparations, setSelectedTicketId, setStaffTab }) {
  const [q, setQ] = useState("");
  const filtered = q.trim() ? clients.filter((c) => c.nom.toLowerCase().includes(q.toLowerCase()) || c.telephone.includes(q)) : clients;

  return (
    <div>
      <div className="relative mb-5 max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#9AA3AF" }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un client…" className="w-full pl-9 pr-3 py-2.5 rounded-xl border text-sm bg-white" style={{ borderColor: "#D5DAE1" }} />
      </div>
      {filtered.length === 0 ? (
        <EmptyState icon={User} title="Aucun client" subtitle="Les clients apparaissent ici dès qu'un ticket est créé." />
      ) : (
        <div className="space-y-3">
          {filtered.map((c) => {
            const tickets = allReparations.filter((r) => r.clientId === c.id);
            return (
              <div key={c.id} className="rounded-2xl border bg-white p-4" style={{ borderColor: "#E3E0D6" }}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-semibold">{c.nom}</p>
                    <p className="text-sm flex items-center gap-1.5 mt-0.5" style={{ color: "#6B7684" }}><Phone size={12} /> {c.telephone}{c.email ? ` · ${c.email}` : ""}</p>
                    {c.adresse && <p className="text-xs mt-0.5" style={{ color: "#9AA3AF" }}>{c.adresse}</p>}
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: "#EEF0F3", color: "#5C6B82" }}>{tickets.length} ticket{tickets.length > 1 ? "s" : ""}</span>
                </div>
                {tickets.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t" style={{ borderColor: "#EEEBE3" }}>
                    {tickets.map((t) => (
                      <button key={t.id} onClick={() => { setSelectedTicketId(t.id); setStaffTab("dashboard"); }}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono border hover:bg-gray-50" style={{ borderColor: "#E3E0D6" }}>
                        {t.code} <StatusPill statut={t.statut} size="sm" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------- facturation tab ---------------------------------- */

function FacturationTab({ allReparations, clientById, appareilById, factures, createFacture }) {
  const [reparationId, setReparationId] = useState("");
  const [type, setType] = useState("devis");
  const [statutPaiement, setStatutPaiement] = useState("Non payé");
  const [lignes, setLignes] = useState([{ designation: "", qte: 1, prix: 0 }]);
  const [printing, setPrinting] = useState(null);

  const total = lignes.reduce((s, l) => s + (Number(l.qte) || 0) * (Number(l.prix) || 0), 0);
  const setLigne = (i, patch) => setLignes((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addLigne = () => setLignes((ls) => [...ls, { designation: "", qte: 1, prix: 0 }]);
  const removeLigne = (i) => setLignes((ls) => ls.filter((_, idx) => idx !== i));

  const submit = async (e) => {
    e.preventDefault();
    if (!reparationId || total <= 0) return;
    await createFacture({ reparationId, type, statutPaiement, lignes });
    setLignes([{ designation: "", qte: 1, prix: 0 }]); setReparationId(""); setType("devis"); setStatutPaiement("Non payé");
  };

  const inputCls = "rounded-xl border px-3 py-2 text-sm bg-white";

  return (
    <div className="grid lg:grid-cols-2 gap-8">
      <form onSubmit={submit} className="space-y-4">
        <h3 className="font-display font-semibold flex items-center gap-2"><FileText size={16} style={{ color: "#1E5F74" }} /> Nouveau devis / facture</h3>
        <div>
          <label className="text-xs font-semibold" style={{ color: "#6B7684" }}>Ticket concerné *</label>
          <select required value={reparationId} onChange={(e) => setReparationId(e.target.value)} className={`${inputCls} w-full mt-1`} style={{ borderColor: "#D5DAE1" }}>
            <option value="">Sélectionner un ticket…</option>
            {allReparations.map((r) => {
              const c = clientById(r.clientId); const a = appareilById(r.appareilId);
              return <option key={r.id} value={r.id}>{r.code} — {c?.nom} — {a?.marque} {a?.modele}</option>;
            })}
          </select>
        </div>

        <div className="flex gap-2">
          {["devis", "facture"].map((t) => (
            <button key={t} type="button" onClick={() => setType(t)} className="px-3 py-1.5 rounded-full text-sm font-semibold capitalize"
              style={type === t ? { backgroundColor: "#1C2430", color: "#fff" } : { backgroundColor: "#EDEAE1", color: "#6B7684" }}>{t}</button>
          ))}
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold" style={{ color: "#6B7684" }}>Lignes</label>
          {lignes.map((l, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input value={l.designation} onChange={(e) => setLigne(i, { designation: e.target.value })} placeholder="Désignation" className={`${inputCls} flex-1`} style={{ borderColor: "#D5DAE1" }} />
              <input type="number" min="1" value={l.qte} onChange={(e) => setLigne(i, { qte: e.target.value })} className={`${inputCls} w-16 font-mono`} style={{ borderColor: "#D5DAE1" }} />
              <input type="number" min="0" value={l.prix} onChange={(e) => setLigne(i, { prix: e.target.value })} placeholder="Prix" className={`${inputCls} w-28 font-mono`} style={{ borderColor: "#D5DAE1" }} />
              {lignes.length > 1 && <button type="button" onClick={() => removeLigne(i)}><Trash2 size={15} style={{ color: "#B0392F" }} /></button>}
            </div>
          ))}
          <button type="button" onClick={addLigne} className="text-sm font-semibold flex items-center gap-1" style={{ color: "#1E5F74" }}><Plus size={14} /> Ajouter une ligne</button>
        </div>

        <div>
          <label className="text-xs font-semibold" style={{ color: "#6B7684" }}>Statut paiement</label>
          <select value={statutPaiement} onChange={(e) => setStatutPaiement(e.target.value)} className={`${inputCls} w-full mt-1`} style={{ borderColor: "#D5DAE1" }}>
            <option>Non payé</option><option>Partiel</option><option>Payé</option>
          </select>
        </div>

        <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: "#EEEBE3" }}>
          <span className="font-semibold">Total</span>
          <span className="font-mono font-bold text-lg">{fmtXAF(total)}</span>
        </div>

        <button type="submit" disabled={!reparationId || total <= 0} className="px-5 py-2.5 rounded-xl font-semibold text-white"
          style={{ backgroundColor: reparationId && total > 0 ? "#1E5F74" : "#B7C0C7" }}>Enregistrer</button>
      </form>

      <div>
        <h3 className="font-display font-semibold mb-3">Historique</h3>
        {factures.length === 0 ? (
          <EmptyState icon={FileText} title="Aucun document" subtitle="Vos devis et factures apparaîtront ici." />
        ) : (
          <div className="space-y-2">
            {factures.map((f) => {
              const r = allReparations.find((x) => x.id === f.reparationId);
              const c = r ? clientById(r.clientId) : null;
              return (
                <div key={f.id} className="rounded-xl border bg-white p-3.5 flex items-center justify-between gap-3" style={{ borderColor: "#E3E0D6" }}>
                  <div>
                    <p className="text-sm font-semibold capitalize">{f.type} — {r?.code || "—"}</p>
                    <p className="text-xs" style={{ color: "#9AA3AF" }}>{c?.nom} · {fmtDate(f.date)} · {f.statutPaiement}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-semibold text-sm">{fmtXAF(f.total)}</span>
                    <button onClick={() => setPrinting(f)} className="p-1.5 rounded-lg hover:bg-gray-50"><Printer size={15} style={{ color: "#6B7684" }} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {printing && <PrintModal facture={printing} reparation={allReparations.find((r) => r.id === printing.reparationId)} clientById={clientById} appareilById={appareilById} onClose={() => setPrinting(null)} />}
    </div>
  );
}

function PrintModal({ facture, reparation, clientById, appareilById, onClose }) {
  const c = reparation ? clientById(reparation.clientId) : null;
  const a = reparation ? appareilById(reparation.appareilId) : null;
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(28,36,48,0.5)" }}>
      <div className="w-full max-w-md bg-white rounded-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="no-print flex justify-end p-3"><button onClick={onClose}><X size={18} /></button></div>
        <div className="px-8 pb-8" id="print-area">
          <div className="text-center mb-6">
            <p className="font-display font-bold text-lg">GLC SARL</p>
            <p className="text-xs" style={{ color: "#6B7684" }}>Atelier SAV · Informatique &amp; Téléphonie · Kribi, Cameroun</p>
          </div>
          <p className="font-display font-semibold capitalize mb-1">{facture.type} — {reparation?.code}</p>
          <p className="text-xs mb-4" style={{ color: "#9AA3AF" }}>{fmtDateTime(facture.date)}</p>
          <p className="text-sm font-semibold">{c?.nom}</p>
          <p className="text-sm" style={{ color: "#6B7684" }}>{c?.telephone}</p>
          <p className="text-sm mb-4" style={{ color: "#6B7684" }}>{a?.marque} {a?.modele} ({deviceLabel(a?.type)})</p>
          <table className="w-full text-sm mb-4">
            <thead><tr className="border-b" style={{ borderColor: "#E3E0D6" }}><th className="text-left py-1.5">Désignation</th><th className="text-right py-1.5">Qté</th><th className="text-right py-1.5">P.U.</th><th className="text-right py-1.5">Total</th></tr></thead>
            <tbody>
              {facture.lignes.map((l, i) => (
                <tr key={i} className="border-b" style={{ borderColor: "#F0EEE8" }}>
                  <td className="py-1.5">{l.designation}</td><td className="text-right">{l.qte}</td><td className="text-right font-mono">{fmtXAF(l.prix)}</td><td className="text-right font-mono">{fmtXAF(l.qte * l.prix)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-between font-bold pt-2 border-t" style={{ borderColor: "#E3E0D6" }}><span>Total</span><span className="font-mono">{fmtXAF(facture.total)}</span></div>
          <p className="text-xs mt-2 text-right" style={{ color: "#9AA3AF" }}>Statut : {facture.statutPaiement}</p>
          <button onClick={() => window.print()} className="no-print w-full mt-6 rounded-xl py-2.5 font-semibold text-white flex items-center justify-center gap-2" style={{ backgroundColor: "#1E5F74" }}>
            <Printer size={15} /> Imprimer
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------- ticket detail ---------------------------------- */

function TicketDetail({ selectedTicket, setSelectedTicketId, clientById, appareilById, advanceStatus, updateTicket, facturesForReparation }) {
  const r = selectedTicket;
  const c = clientById(r.clientId);
  const a = appareilById(r.appareilId);
  const DeviceIcon = deviceIcon(a?.type);
  const [diagDraft, setDiagDraft] = useState(r.diagnostic || "");
  const currentIdx = STATUT_FLOW.indexOf(r.statut);
  const nextStatut = r.statut !== "Annulé" && currentIdx < STATUT_FLOW.length - 1 ? STATUT_FLOW[currentIdx + 1] : null;

  return (
    <div className="fixed inset-0 z-20 flex items-end sm:items-center justify-center sm:p-6" style={{ backgroundColor: "rgba(28,36,48,0.5)" }} onClick={() => setSelectedTicketId(null)}>
      <div className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 pt-6 pb-3 flex items-center justify-between">
          <span className="font-mono text-sm font-semibold tracking-wide" style={{ color: "#9AA3AF" }}>{r.code}</span>
          <button onClick={() => setSelectedTicketId(null)}><X size={18} style={{ color: "#6B7684" }} /></button>
        </div>
        <Perforation />
        <div className="px-6 py-5">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#EEF0F3" }}>
              <DeviceIcon size={20} style={{ color: "#1E5F74" }} />
            </div>
            <div>
              <p className="font-display font-semibold">{a?.marque} {a?.modele}</p>
              <p className="text-sm" style={{ color: "#6B7684" }}>{deviceLabel(a?.type)} {a?.numeroSerie && `· ${a.numeroSerie}`}</p>
            </div>
          </div>

          <Stepper statut={r.statut} historique={r.historique} />

          <div className="flex flex-wrap gap-2 mt-5">
            {nextStatut && (
              <button onClick={() => advanceStatus(r.id, nextStatut)} className="px-3.5 py-1.5 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: STATUT_STYLE[nextStatut].color }}>
                Passer à « {nextStatut} »
              </button>
            )}
            {r.statut !== "Annulé" && r.statut !== "Livré" && (
              <button onClick={() => advanceStatus(r.id, "Annulé")} className="px-3.5 py-1.5 rounded-lg text-sm font-semibold" style={{ backgroundColor: STATUT_STYLE["Annulé"].bg, color: STATUT_STYLE["Annulé"].color }}>
                Annuler
              </button>
            )}
          </div>

          <div className="mt-6 pt-5 border-t space-y-4" style={{ borderColor: "#EEEBE3" }}>
            <div>
              <p className="text-xs font-semibold" style={{ color: "#9AA3AF" }}>Client</p>
              <p className="text-sm font-medium">{c?.nom} · {c?.telephone}</p>
            </div>
            <div>
              <p className="text-xs font-semibold" style={{ color: "#9AA3AF" }}>Panne déclarée</p>
              <p className="text-sm">{r.panneDeclaree}</p>
            </div>
            <div>
              <p className="text-xs font-semibold mb-1" style={{ color: "#9AA3AF" }}>Diagnostic technicien</p>
              <textarea value={diagDraft} onChange={(e) => setDiagDraft(e.target.value)} onBlur={() => updateTicket(r.id, { diagnostic: diagDraft })}
                rows={2} placeholder="Ajouter un diagnostic…" className="w-full rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "#D5DAE1" }} />
            </div>
            <div className="flex justify-between text-sm">
              <span style={{ color: "#6B7684" }}>Technicien</span><span className="font-medium">{r.technicien || "—"}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span style={{ color: "#6B7684" }}>Reçu le</span><span className="font-medium">{fmtDate(r.dateReception)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span style={{ color: "#6B7684" }}>Livraison estimée</span><span className="font-medium">{r.dateEstimee ? fmtDate(r.dateEstimee) : "—"}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span style={{ color: "#6B7684" }}>Devis estimé</span><span className="font-mono font-semibold">{fmtXAF(r.montantDevis)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
