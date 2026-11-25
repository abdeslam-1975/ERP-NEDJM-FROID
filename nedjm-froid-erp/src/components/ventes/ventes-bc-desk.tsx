"use client";

import { logoutAction } from "@/lib/actions/auth";
import { VentesBcPanel } from "@/components/ventes/ventes-bc-panel";
import "./ventes.css";

/** Desk BC — même chrome que Ventes/Banque/Caisse, page séparée (pas à l'intérieur de Factures). */
export function VentesBcDesk() {
  return (
    <div className="ventes-app">
      <div className="top-navbar">
        <div className="brand">📄 BON DE COMMANDE</div>
        <div className="user-info">
          <span>Commandes client — module Ventes</span>
          <span className="role-badge">LIVE</span>
          <form action={logoutAction} style={{ display: "inline" }}>
            <button type="submit" className="btn-quitter">
              ⏻ QUITTER
            </button>
          </form>
        </div>
      </div>

      <div className="ui-live-banner">
        Bons de commande client — sous Ventes, sans lien Achats / Banque / Caisse.
      </div>

      <VentesBcPanel />
    </div>
  );
}
