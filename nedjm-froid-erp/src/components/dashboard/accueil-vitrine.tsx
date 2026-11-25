"use client";

import styles from "./accueil-vitrine.module.css";

const KPIS = ["kpi-1.png", "kpi-2.png", "kpi-3.png", "kpi-4.png"] as const;

/** Approved company artwork, kept at its real proportions on every screen. */
export function AccueilVitrine() {
  return (
    <div className={styles.frame}>
      <div className={styles.board}>
      <div className={styles.root}>
        <section className={styles.hero}>
          <img src="/accueil/board/hero.png" alt="NEDJM FROID — Solutions industrielles de froid et de climatisation" />
          <div className={styles.dots} aria-hidden>
            <i />
            <i />
            <i />
          </div>
        </section>

        <section className={styles.kpis}>
          {KPIS.map((file) => (
            <div key={file} className={styles.float}>
              <img src={`/accueil/board/${file}`} alt="" />
            </div>
          ))}
        </section>

        <div className={styles.float}>
          <img src="/accueil/board/clients.png" alt="Nos clients : Bicold Maghreb, Anadarko, Sonatrach, Carrier, Enafor, ENTP" />
        </div>

        <section className={styles.split}>
          <div className={styles.float}>
            <img src="/accueil/board/why.png" alt="Pourquoi nous choisir : service après-vente, qualité certifiée, produit garanti" />
          </div>
          <div className={styles.float}>
            <img src="/accueil/board/certs.png" alt="Certifications ISO 9001, ISO 45001 et ISO 14001" />
          </div>
        </section>

        <div className={styles.float}>
          <img src="/accueil/board/gallery.png" alt="Nos réalisations" />
        </div>

        <footer className={styles.foot}>
          <img src="/accueil/board/footer.png" alt="Nedjm Froid, l'expertise au service de vos projets" />
        </footer>
      </div>
      </div>
    </div>
  );
}
