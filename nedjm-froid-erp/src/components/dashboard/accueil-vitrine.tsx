"use client";

import { useEffect, useState } from "react";
import styles from "./accueil-vitrine.module.css";

const SLIDES = [
  { src: "/accueil/rooms.jpg", label: "Chambres et condenseurs", position: "center" },
  { src: "/accueil/hassi-rmel.jpg", label: "Hassi R'mel", position: "68% center" },
  { src: "/accueil/cellules.jpg", label: "Deux cellules", position: "center 40%" },
] as const;

const KPIS = [
  { tone: styles.k1, title: "Expérience unique", value: "+25", note: "ans · depuis juin 1999", icon: "cal" },
  { tone: styles.k2, title: "Grands projets", value: "+45", note: "publiés sur le site", icon: "case" },
  { tone: styles.k3, title: "Salariés qualifiés", value: "+60", note: "chiffre du site public", icon: "people" },
  { tone: styles.k4, title: "Projets réussis", value: "100%", note: "tel que publié", icon: "check" },
] as const;

const CLIENTS = [
  ["bicold.png", "Bicold Maghreb"],
  ["anadarko.png", "Anadarko"],
  ["sonatrach.png", "Sonatrach"],
  ["carrier.png", "Carrier"],
  ["enafor.png", "Enafor"],
  ["entp.png", "ENTP"],
] as const;

const REASONS = [
  ["rocket", "Service après-vente", "Des services adaptés aux besoins des entreprises, avec suivi du bon fonctionnement."],
  ["shield", "Qualité certifiée", "Des produits soumis aux normes internationales, pour la performance et la longévité."],
  ["medal", "Produit garanti", "Une garantie alignée sur le besoin, portée par la qualité des réalisations."],
] as const;

const ISOS = [
  ["iso-9001.png", "ISO 9001", "Quality management systems"],
  ["iso-45001.png", "ISO 45001", "Health and safety management"],
  ["iso-14001.png", "ISO 14001", "Environmental management systems"],
] as const;

const SHOTS = [
  ["rhourd.jpg", "Rhourd Nouss — Chambre froide installée"],
  ["hassi-rmel.jpg", "Hassi R'mel — Chambre froide Sonatrach"],
  ["baguel.jpg", "Rhourde El Baguel — Groupe de froid"],
  ["compresseurs.jpg", "Hassi R'mel — Compresseurs et condenseurs"],
  ["berkaoui.jpg", "Haoud Berkaoui — Maintenance sur site"],
  ["cellules.jpg", "Chambres froides — Deux cellules en service"],
] as const;

function Icon({ name }: { name: string }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8 };
  if (name === "cal") {
    return (
      <svg {...common}>
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <path d="M8 3v4M16 3v4M4 10h16" />
      </svg>
    );
  }
  if (name === "case") {
    return (
      <svg {...common}>
        <rect x="3" y="7" width="18" height="13" rx="2" />
        <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18" />
      </svg>
    );
  }
  if (name === "people") {
    return (
      <svg {...common}>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 19a6 6 0 0 1 12 0" />
        <circle cx="17" cy="9" r="2.2" />
        <path d="M16 19a5 5 0 0 1 5-4" />
      </svg>
    );
  }
  if (name === "rocket") {
    return (
      <svg {...common}>
        <path d="M14 4c3 1 5 4 5 7-3 0-5-1-7-3" />
        <path d="M9 10 4 15l5 1 1 5 5-5" />
        <path d="M14 14c-2 2-4 3-7 3" />
      </svg>
    );
  }
  if (name === "shield") {
    return (
      <svg {...common}>
        <path d="M12 3 5 6v6c0 4 2.8 6.8 7 8 4.2-1.2 7-4 7-8V6z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    );
  }
  if (name === "medal") {
    return (
      <svg {...common}>
        <circle cx="12" cy="9" r="5" />
        <path d="m9 13-2 8 5-3 5 3-2-8" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="8" />
      <path d="m8.5 12 2.2 2.2 4.8-5" />
    </svg>
  );
}

/** Company home, sized to the window. Cards lift on hover. */
export function AccueilVitrine() {
  const [frame, setFrame] = useState(0);
  const [armed, setArmed] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setFrame((current) => (current + 1) % SLIDES.length), 6000);
    return () => window.clearInterval(id);
  }, [armed]);

  return (
    <div className={styles.root}>
      <section className={styles.hero}>
        <div className={styles.copy}>
          <h2>NEDJM FROID</h2>
          <p className={styles.lead}>Solutions industrielles de froid et de climatisation</p>
          <p className={styles.script}>Notre expertise au service de vos projets</p>
          <div className={styles.dots}>
            {SLIDES.map((slide, index) => (
              <button
                key={slide.label}
                type="button"
                aria-label={slide.label}
                aria-current={frame === index ? "true" : undefined}
                onClick={() => {
                  setFrame(index);
                  setArmed((value) => value + 1);
                }}
              />
            ))}
          </div>
        </div>
        <div className={styles.photo}>
          {SLIDES.map((slide, index) => (
            <img
              key={slide.src}
              src={slide.src}
              alt=""
              className={frame === index ? styles.on : undefined}
              style={{ objectPosition: slide.position }}
            />
          ))}
        </div>
      </section>

      <section className={styles.kpis}>
        {KPIS.map((item) => (
          <article key={item.title} className={`${styles.kpi} ${item.tone} ${styles.float}`}>
            <i aria-hidden>
              <Icon name={item.icon} />
            </i>
            <div>
              <small>{item.title}</small>
              <b>{item.value}</b>
              <em>{item.note}</em>
            </div>
          </article>
        ))}
      </section>

      <section className={`${styles.panel} ${styles.float}`}>
        <header className={styles.hd}>
          <h3>Nos clients</h3>
          <span>Des entreprises de classe mondiale nous font confiance</span>
        </header>
        <div className={styles.logos}>
          {CLIENTS.map(([file, name]) => (
            <div key={name} className={`${styles.logo} ${styles.float}`}>
              <img src={`/accueil/${file}`} alt={name} />
            </div>
          ))}
        </div>
      </section>

      <section className={styles.split}>
        <article className={`${styles.panel} ${styles.float}`}>
          <header className={styles.hd}>
            <h3>Pourquoi nous choisir ?</h3>
          </header>
          <div className={styles.why}>
            <ul className={styles.reasons}>
              {REASONS.map(([icon, title, text]) => (
                <li key={title}>
                  <i aria-hidden>
                    <Icon name={icon} />
                  </i>
                  <div>
                    <b>{title}</b>
                    <span>{text}</span>
                  </div>
                </li>
              ))}
            </ul>
            <div className={styles.portrait}>
              <img src="/accueil/worker.jpg" alt="Technicien Nedjm Froid" />
            </div>
          </div>
        </article>
        <article className={`${styles.panel} ${styles.float}`}>
          <header className={styles.hd}>
            <h3>Certifications</h3>
            <span>Atteindre l'excellence</span>
          </header>
          <div className={styles.isos}>
            {ISOS.map(([file, name, text]) => (
              <article key={name} className={`${styles.iso} ${styles.float}`}>
                <img src={`/accueil/${file}`} alt={name} />
                <b>{name}</b>
                <span>{text}</span>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className={`${styles.panel} ${styles.float}`}>
        <header className={styles.hd}>
          <h3>Nos réalisations</h3>
          <span>Voir toutes les réalisations</span>
        </header>
        <div className={styles.shots}>
          {SHOTS.map(([file, caption]) => (
            <article key={caption} className={`${styles.shot} ${styles.float}`}>
              <img src={`/accueil/${file}`} alt={caption} />
              <small>{caption}</small>
            </article>
          ))}
        </div>
      </section>

      <footer className={styles.foot}>
        <svg viewBox="0 0 1440 48" preserveAspectRatio="none" aria-hidden>
          <path fill="#dbe8ff" d="M0 24c120 16 240 16 360 0s240-16 360 0 240 16 360 0 240-16 360 0v24H0z" />
          <path fill="#3b6ef5" fillOpacity="0.18" d="M0 30c140 14 260 8 400-4 160-14 280-6 420 4 150 10 280 2 420-8 80-4 150-2 200 2v24H0z" />
        </svg>
        <p>Nedjm Froid… L'expertise au service de vos projets</p>
      </footer>
    </div>
  );
}
