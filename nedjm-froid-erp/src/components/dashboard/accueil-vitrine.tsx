"use client";

import { useEffect, useState } from "react";
import styles from "./accueil-vitrine.module.css";

const KPIS = ["kpi-1.png", "kpi-2.png", "kpi-3.png", "kpi-4.png"] as const;

/** The banner photo stays. These two replace only the picture on the right. */
const SLIDES = [
  { src: "/accueil/hassi-rmel.jpg", label: "Hassi R'mel", position: "68% center" },
  { src: "/accueil/cellules.jpg", label: "Deux cellules en service", position: "center 40%" },
] as const;

const FRAMES = ["Chambres et condenseurs", SLIDES[0].label, SLIDES[1].label] as const;

const CLIENTS = [
  { name: "Bicold Maghreb", src: "/accueil/bicold.png" },
  { name: "Anadarko", src: "/accueil/anadarko.png" },
  { name: "Sonatrach", src: "/accueil/sonatrach.png" },
  { name: "Carrier", src: "/accueil/carrier.png" },
  { name: "Enafor", src: "/accueil/enafor.png" },
  { name: "ENTP", src: "/accueil/entp.png" },
] as const;

const WORKS = [
  { src: "/accueil/rhourd.jpg", title: "Rhourd Nouss", detail: "Chambre froide installée" },
  { src: "/accueil/hassi-rmel.jpg", title: "Hassi R'mel", detail: "Chambre froide Sonatrach" },
  { src: "/accueil/baguel.jpg", title: "Rhourde El Baguel", detail: "Groupe de froid" },
  { src: "/accueil/compresseurs.jpg", title: "Hassi R'mel", detail: "Compresseurs et condenseurs" },
  { src: "/accueil/berkaoui.jpg", title: "Haoud Berkaoui", detail: "Maintenance sur site" },
  { src: "/accueil/cellules.jpg", title: "Chambres froides", detail: "Deux cellules en service" },
] as const;

/** Approved company artwork, kept to a 1920×1080 screen. */
export function AccueilVitrine() {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) return;
    const timer = window.setTimeout(() => setFrame((current) => (current + 1) % FRAMES.length), 6000);
    return () => window.clearTimeout(timer);
  }, [frame]);

  return (
    <div className={styles.frame}>
      <div className={styles.board}>
        <div className={styles.root}>
          <div className={styles.top}>
            <section className={styles.hero} aria-label="NEDJM FROID">
              <img src="/accueil/board/hero.png" alt="NEDJM FROID — Solutions industrielles de froid et de climatisation" />
              <div className={styles.slides}>
                {SLIDES.map((slide, index) => (
                  <img
                    key={slide.src}
                    src={slide.src}
                    alt={slide.label}
                    aria-hidden={frame === index + 1 ? undefined : true}
                    className={frame === index + 1 ? styles.on : undefined}
                    style={{ objectPosition: slide.position }}
                  />
                ))}
              </div>
              <div className={styles.dots}>
                {FRAMES.map((label, index) => (
                  <button
                    key={label}
                    type="button"
                    aria-label={label}
                    aria-current={frame === index ? "true" : undefined}
                    onClick={() => setFrame(index)}
                  />
                ))}
              </div>
            </section>

            <section className={styles.kpis} aria-label="Chiffres">
              {KPIS.map((file) => (
                <div key={file} className={styles.float}>
                  <img src={`/accueil/board/${file}`} alt="" />
                </div>
              ))}
            </section>
          </div>

          <section className={styles.clients} aria-labelledby="home-clients">
            <header className={styles.head}>
              <h2 id="home-clients">Nos clients</h2>
              <p>Des entreprises de classe mondiale nous font confiance</p>
            </header>
            <ul className={styles.clientRow}>
              {CLIENTS.map((client) => (
                <li key={client.name} className={`${styles.clientCard} ${styles.float}`}>
                  <img src={client.src} alt={client.name} />
                </li>
              ))}
            </ul>
          </section>

          <div className={styles.mid}>
            <section className={styles.split}>
              <div className={`${styles.why} ${styles.float}`}>
                <img src="/accueil/board/why.png" alt="Pourquoi nous choisir : service après-vente, qualité certifiée, produit garanti" />
              </div>
              <div className={`${styles.certs} ${styles.float}`}>
                <img src="/accueil/board/certs.png" alt="Certifications ISO 9001, ISO 45001 et ISO 14001" />
              </div>
            </section>

            <section className={styles.gallery} aria-labelledby="home-works">
              <header className={styles.head}>
                <h2 id="home-works">Nos réalisations</h2>
              </header>
              <ul className={styles.workRow}>
                {WORKS.map((work) => (
                  <li key={work.src} className={`${styles.workCard} ${styles.float}`}>
                    <img src={work.src} alt="" />
                    <p>
                      <b>{work.title}</b>
                      {work.detail}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <footer className={styles.foot}>
            <img src="/accueil/board/footer.png" alt="Nedjm Froid, l'expertise au service de vos projets" />
          </footer>
        </div>
      </div>
    </div>
  );
}
