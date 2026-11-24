"use client";

import { useEffect, useState } from "react";
import type {
  VentesAdminDefaults,
  VentesAdminUser,
  VentesListItem,
} from "@/lib/actions/ventes-admin";
import type { VentesClientOption } from "@/lib/actions/ventes";

type AdminTab = "clients" | "utilisateurs" | "parametres";

type ClientForm = {
  id?: string;
  nom_fr: string;
  adresse: string;
  nif: string;
  article_imposition: string;
  rc: string;
  telephone: string;
};

const emptyClient = (): ClientForm => ({
  nom_fr: "",
  adresse: "",
  nif: "",
  article_imposition: "",
  rc: "",
  telephone: "",
});

export function VentesAdminModal({
  onClose,
  onChanged,
  onError,
  onOk,
}: {
  onClose: () => void;
  onChanged: () => void | Promise<void>;
  onError: (msg: string) => void;
  onOk: (msg: string) => void;
}) {
  const [tab, setTab] = useState<AdminTab>("clients");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<VentesAdminUser[]>([]);
  const [clients, setClients] = useState<VentesClientOption[]>([]);
  const [lists, setLists] = useState<VentesListItem[]>([]);
  const [defaults, setDefaults] = useState<VentesAdminDefaults>({
    tax_rate: 0,
    retention_rate: 0.1,
    stamp_amount: 0,
  });
  const [clientForm, setClientForm] = useState<ClientForm>(emptyClient());
  const [userForm, setUserForm] = useState({
    email: "",
    password: "",
    name: "",
    asAdmin: false,
  });
  const [listDrafts, setListDrafts] = useState({
    BANK_EXPECTED: "",
    ETABLIE_PAR: "",
    PAYMENT_MODE: "",
  });

  async function load() {
    setLoading(true);
    try {
      const { getVentesAdmin } = await import("@/lib/actions/ventes-admin");
      const result = await getVentesAdmin();
      if (!result.ok) {
        onError(result.error);
        return;
      }
      setUsers(result.data.users);
      setClients(result.data.clients);
      setLists(result.data.lists);
      setDefaults(result.data.defaults);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveClient() {
    setBusy(true);
    try {
      const { upsertVentesClient } = await import("@/lib/actions/ventes-admin");
      const result = await upsertVentesClient(clientForm);
      if (!result.ok) {
        onError(result.error);
        return;
      }
      setClientForm(emptyClient());
      onOk(clientForm.id ? "Client mis à jour." : "Client créé.");
      await load();
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  function editClient(c: VentesClientOption) {
    setClientForm({
      id: c.id,
      nom_fr: c.nom_fr,
      adresse: c.adresse || "",
      nif: c.nif || "",
      article_imposition: c.article_imposition || "",
      rc: c.rc || "",
      telephone: c.telephone || "",
    });
    setTab("clients");
  }

  async function createUser() {
    setBusy(true);
    try {
      const { createVentesAdminUser } = await import("@/lib/actions/ventes-admin");
      const result = await createVentesAdminUser(userForm);
      if (!result.ok) {
        onError(result.error);
        return;
      }
      setUserForm({ email: "", password: "", name: "", asAdmin: false });
      onOk("Utilisateur Ventes créé.");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function saveRights() {
    setBusy(true);
    try {
      const { saveVentesRights } = await import("@/lib/actions/ventes-admin");
      const result = await saveVentesRights(
        users.map((u) => ({
          id: u.id,
          ventes_active: u.ventes_active,
          can_saisie: u.can_saisie,
          can_emit: u.can_emit,
          can_encaisser: u.can_encaisser,
          can_cancel: u.can_cancel,
          can_admin: u.can_admin,
          can_export: u.can_export,
        })),
      );
      if (!result.ok) {
        onError(result.error);
        return;
      }
      onOk("Droits Ventes enregistrés.");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function addList(list_key: keyof typeof listDrafts) {
    const label = listDrafts[list_key].trim();
    if (!label) return;
    setBusy(true);
    try {
      const { addVentesListItem } = await import("@/lib/actions/ventes-admin");
      const result = await addVentesListItem({ list_key, label });
      if (!result.ok) {
        onError(result.error);
        return;
      }
      setListDrafts((d) => ({ ...d, [list_key]: "" }));
      onOk("Élément ajouté.");
      await load();
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function toggleList(item: VentesListItem) {
    setBusy(true);
    try {
      const { setVentesListItemActive } = await import("@/lib/actions/ventes-admin");
      const result = await setVentesListItemActive(item.id, !item.active);
      if (!result.ok) {
        onError(result.error);
        return;
      }
      await load();
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function saveDefaults() {
    setBusy(true);
    try {
      const { saveVentesDefaults } = await import("@/lib/actions/ventes-admin");
      const result = await saveVentesDefaults(defaults);
      if (!result.ok) {
        onError(result.error);
        return;
      }
      onOk("Paramètres par défaut enregistrés.");
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  function patchUser(id: string, patch: Partial<VentesAdminUser>) {
    setUsers((list) => list.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  }

  const listsOf = (key: string) => lists.filter((l) => l.list_key === key);

  return (
    <div className="overlay">
      <div className="modal admin-modal">
        <div className="modal-head slate">
          <span>Admin Ventes</span>
          <button type="button" className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="admin-tabs">
            <button
              type="button"
              className={`admin-tab${tab === "clients" ? " active" : ""}`}
              onClick={() => setTab("clients")}
            >
              Clients
            </button>
            <button
              type="button"
              className={`admin-tab${tab === "utilisateurs" ? " active" : ""}`}
              onClick={() => setTab("utilisateurs")}
            >
              Utilisateurs
            </button>
            <button
              type="button"
              className={`admin-tab${tab === "parametres" ? " active" : ""}`}
              onClick={() => setTab("parametres")}
            >
              Paramètres
            </button>
          </div>

          {loading ? (
            <div className="admin-pane">Chargement…</div>
          ) : tab === "clients" ? (
            <div className="admin-pane">
              <div className="admin-bank-layout">
                <div className="admin-card" style={{ textAlign: "left" }}>
                  <h6 style={{ textAlign: "left" }}>
                    {clientForm.id ? "Modifier client" : "＋ Nouveau client"}
                  </h6>
                  <input
                    placeholder="Nom / Raison sociale *"
                    value={clientForm.nom_fr}
                    onChange={(e) => setClientForm((f) => ({ ...f, nom_fr: e.target.value }))}
                    disabled={busy}
                  />
                  <input
                    placeholder="Adresse"
                    value={clientForm.adresse}
                    onChange={(e) => setClientForm((f) => ({ ...f, adresse: e.target.value }))}
                    disabled={busy}
                  />
                  <input
                    placeholder="ID fiscale (NIF)"
                    value={clientForm.nif}
                    onChange={(e) => setClientForm((f) => ({ ...f, nif: e.target.value }))}
                    disabled={busy}
                  />
                  <input
                    placeholder="Article"
                    value={clientForm.article_imposition}
                    onChange={(e) =>
                      setClientForm((f) => ({ ...f, article_imposition: e.target.value }))
                    }
                    disabled={busy}
                  />
                  <input
                    placeholder="R.C"
                    value={clientForm.rc}
                    onChange={(e) => setClientForm((f) => ({ ...f, rc: e.target.value }))}
                    disabled={busy}
                  />
                  <input
                    placeholder="Contact Tél"
                    value={clientForm.telephone}
                    onChange={(e) => setClientForm((f) => ({ ...f, telephone: e.target.value }))}
                    disabled={busy}
                  />
                  <button
                    type="button"
                    className="btn-add-mode"
                    disabled={busy || !clientForm.nom_fr.trim()}
                    onClick={() => void saveClient()}
                  >
                    {clientForm.id ? "ENREGISTRER" : "CRÉER"}
                  </button>
                  {clientForm.id && (
                    <button
                      type="button"
                      className="btn-light"
                      style={{ width: "100%", marginTop: 8 }}
                      disabled={busy}
                      onClick={() => setClientForm(emptyClient())}
                    >
                      Nouveau
                    </button>
                  )}
                </div>
                <div className="admin-card" style={{ padding: 0, overflow: "hidden" }}>
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Client</th>
                        <th>NIF</th>
                        <th>Article</th>
                        <th>R.C</th>
                        <th>Tél</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {clients.length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ textAlign: "center", color: "#94a3b8" }}>
                            Aucun client
                          </td>
                        </tr>
                      ) : (
                        clients.map((c) => (
                          <tr key={c.id}>
                            <td style={{ fontWeight: 700 }}>{c.nom_fr}</td>
                            <td>{c.nif || "—"}</td>
                            <td>{c.article_imposition || "—"}</td>
                            <td>{c.rc || "—"}</td>
                            <td>{c.telephone || "—"}</td>
                            <td>
                              <button
                                type="button"
                                className="btn-light"
                                disabled={busy}
                                onClick={() => editClient(c)}
                              >
                                ✎
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : tab === "utilisateurs" ? (
            <div className="admin-pane">
              <div className="admin-bank-layout">
                <div className="admin-card" style={{ textAlign: "left" }}>
                  <h6 style={{ textAlign: "left" }}>＋ Utilisateur Ventes</h6>
                  <input
                    type="email"
                    placeholder="Email"
                    value={userForm.email}
                    onChange={(e) => setUserForm((f) => ({ ...f, email: e.target.value }))}
                    disabled={busy}
                  />
                  <input
                    type="password"
                    placeholder="Mot de passe (8+)"
                    value={userForm.password}
                    onChange={(e) => setUserForm((f) => ({ ...f, password: e.target.value }))}
                    disabled={busy}
                    autoComplete="new-password"
                  />
                  <input
                    placeholder="Nom complet"
                    value={userForm.name}
                    onChange={(e) => setUserForm((f) => ({ ...f, name: e.target.value }))}
                    disabled={busy}
                  />
                  <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={userForm.asAdmin}
                      onChange={(e) => setUserForm((f) => ({ ...f, asAdmin: e.target.checked }))}
                      disabled={busy}
                    />
                    Admin Ventes (tous droits)
                  </label>
                  <button
                    type="button"
                    className="btn-add-aff"
                    disabled={busy}
                    onClick={() => void createUser()}
                  >
                    CRÉER
                  </button>
                </div>
                <div className="admin-card" style={{ padding: 0, overflow: "auto" }}>
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Utilisateur</th>
                        <th>Actif</th>
                        <th>Saisie</th>
                        <th>Émettre</th>
                        <th>Encaisser</th>
                        <th>Annuler</th>
                        <th>Admin</th>
                        <th>Export</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u) => (
                        <tr key={u.id}>
                          <td>
                            <div style={{ fontWeight: 700 }}>{u.name || u.email}</div>
                            <div style={{ fontSize: 11, color: "#64748b" }}>{u.email}</div>
                          </td>
                          {(
                            [
                              "ventes_active",
                              "can_saisie",
                              "can_emit",
                              "can_encaisser",
                              "can_cancel",
                              "can_admin",
                              "can_export",
                            ] as const
                          ).map((key) => (
                            <td key={key} style={{ textAlign: "center" }}>
                              <input
                                type="checkbox"
                                checked={!!u[key]}
                                disabled={busy}
                                onChange={(e) => patchUser(u.id, { [key]: e.target.checked })}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ padding: 12 }}>
                    <button
                      type="button"
                      className="btn-add-mode"
                      disabled={busy}
                      onClick={() => void saveRights()}
                    >
                      Enregistrer les droits
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="admin-pane">
              <div className="admin-param-grid">
                <div className="admin-card">
                  <div className="admin-ico" style={{ color: "#2563eb" }}>
                    🏛
                  </div>
                  <h6>Banque prévue</h6>
                  <input
                    value={listDrafts.BANK_EXPECTED}
                    onChange={(e) =>
                      setListDrafts((d) => ({ ...d, BANK_EXPECTED: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void addList("BANK_EXPECTED");
                    }}
                  />
                  <button
                    type="button"
                    className="btn-add-aff"
                    disabled={busy || !listDrafts.BANK_EXPECTED.trim()}
                    onClick={() => void addList("BANK_EXPECTED")}
                  >
                    + Ajouter
                  </button>
                  <div style={{ marginTop: 8, textAlign: "left" }}>
                    {listsOf("BANK_EXPECTED").map((l) => (
                      <button
                        key={l.id}
                        type="button"
                        className="admin-list-chip"
                        style={{ opacity: l.active ? 1 : 0.45 }}
                        onClick={() => void toggleList(l)}
                        title={l.active ? "Désactiver" : "Activer"}
                      >
                        {l.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="admin-card">
                  <div className="admin-ico" style={{ color: "#d97706" }}>
                    ✍
                  </div>
                  <h6>Établie par</h6>
                  <input
                    value={listDrafts.ETABLIE_PAR}
                    onChange={(e) => setListDrafts((d) => ({ ...d, ETABLIE_PAR: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void addList("ETABLIE_PAR");
                    }}
                  />
                  <button
                    type="button"
                    className="btn-add-fourn"
                    disabled={busy || !listDrafts.ETABLIE_PAR.trim()}
                    onClick={() => void addList("ETABLIE_PAR")}
                  >
                    + Ajouter
                  </button>
                  <div style={{ marginTop: 8, textAlign: "left" }}>
                    {listsOf("ETABLIE_PAR").map((l) => (
                      <button
                        key={l.id}
                        type="button"
                        className="admin-list-chip"
                        style={{ opacity: l.active ? 1 : 0.45 }}
                        onClick={() => void toggleList(l)}
                      >
                        {l.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="admin-card">
                  <div className="admin-ico" style={{ color: "#16a34a" }}>
                    💳
                  </div>
                  <h6>Mode paiement</h6>
                  <input
                    value={listDrafts.PAYMENT_MODE}
                    onChange={(e) =>
                      setListDrafts((d) => ({ ...d, PAYMENT_MODE: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void addList("PAYMENT_MODE");
                    }}
                  />
                  <button
                    type="button"
                    className="btn-add-mode"
                    disabled={busy || !listDrafts.PAYMENT_MODE.trim()}
                    onClick={() => void addList("PAYMENT_MODE")}
                  >
                    + Ajouter
                  </button>
                  <div style={{ marginTop: 8, textAlign: "left" }}>
                    {listsOf("PAYMENT_MODE").map((l) => (
                      <button
                        key={l.id}
                        type="button"
                        className="admin-list-chip"
                        style={{ opacity: l.active ? 1 : 0.45 }}
                        onClick={() => void toggleList(l)}
                      >
                        {l.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="admin-card" style={{ marginTop: 14, textAlign: "left" }}>
                <h6 style={{ textAlign: "left" }}>Valeurs par défaut (nouvelles factures)</h6>
                <div className="grid-3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                  <div>
                    <label className="form-label">TVA (0–1)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="1"
                      value={defaults.tax_rate}
                      onChange={(e) =>
                        setDefaults((d) => ({ ...d, tax_rate: Number(e.target.value) || 0 }))
                      }
                    />
                  </div>
                  <div>
                    <label className="form-label">% RG (0–1)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="1"
                      value={defaults.retention_rate}
                      onChange={(e) =>
                        setDefaults((d) => ({
                          ...d,
                          retention_rate: Number(e.target.value) || 0,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <label className="form-label">Timbre (DA)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={defaults.stamp_amount}
                      onChange={(e) =>
                        setDefaults((d) => ({
                          ...d,
                          stamp_amount: Number(e.target.value) || 0,
                        }))
                      }
                    />
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-add-mode"
                  style={{ marginTop: 10, width: "auto", minWidth: 160 }}
                  disabled={busy}
                  onClick={() => void saveDefaults()}
                >
                  Enregistrer défauts
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn-light" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
