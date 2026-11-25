"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./accueil-vitrine.module.css";

const SLIDES = [
  { src: "", label: "Chambres et condenseurs", position: "center" },
  { src: "/accueil/hassi-rmel.jpg", label: "Hassi R'mel", position: "68% center" },
  { src: "/accueil/cellules.jpg", label: "Deux cellules", position: "center 40%" },
] as const;

const KPIS = ["kpi-1.png", "kpi-2.png", "kpi-3.png", "kpi-4.png"] as const;

/** The company board, using the approved artwork, fitted to the window. Cards lift on hover. */
const ARTWORK_RATIO = 1.25;

export function AccueilVitrine() {
  const frameRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState(0);
  const [armed, setArmed] = useState(0);

  useEffect(() => {
    const box = frameRef.current;
    const sheet = sheetRef.current;
    if (!box || !sheet) return;
    const fit = () => {
      const width = box.clientWidth;
      const height = box.clientHeight;
      if (width < 1 || height < 1) return;
      const natural = width * ARTWORK_RATIO;
      const close = natural <= height * 1.12 && height <= natural * 1.12;
      sheet.style.height = `${close ? height : natural}px`;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setFrame((current) => (current + 1) % SLIDES.length), 6000);
    return () => window.clearInterval(id);
  }, [armed]);

  return (
    <div className={styles.frame} ref={frameRef}>
    <div className={styles.root} ref={sheetRef}>
      <section className={styles.hero}>
        <img src="/accueil/board/hero.png" alt="NEDJM FROID — Solutions industrielles de froid et de climatisation" />
        <div className={styles.slides}>
          {SLIDES.slice(1).map((slide, index) => (
            <img
              key={slide.src}
              src={slide.src}
              alt=""
              className={frame === index + 1 ? styles.on : undefined}
              style={{ objectPosition: slide.position }}
            />
          ))}
        </div>
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
  );
}
