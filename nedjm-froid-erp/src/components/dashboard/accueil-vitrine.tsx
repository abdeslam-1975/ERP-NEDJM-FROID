"use client";

import { useEffect, useRef, useState } from "react";

const SLIDES = [
  { src: "/accueil/hassi-rmel.jpg", position: "68% center" },
  { src: "/accueil/cellules.jpg", position: "center 40%" },
] as const;

const DOTS = ["Chambres et condenseurs", "Hassi R'mel", "Deux cellules"] as const;

/** Company home: the approved banner, scaled to the window, with three slow photos. */
export function AccueilVitrine() {
  const fitRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState(0);
  const [armed, setArmed] = useState(0);

  useEffect(() => {
    const fit = fitRef.current;
    const board = boardRef.current;
    if (!fit || !board) return;

    const apply = () => {
      board.style.width = "1000px";
      const ratio = board.offsetHeight / 1000;
      if (!ratio) return;
      const width = Math.min(fit.clientWidth, fit.clientHeight / ratio);
      board.style.width = `${width}px`;
      board.style.left = `${Math.max(0, (fit.clientWidth - width) / 2)}px`;
    };

    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(fit);
    for (const img of board.querySelectorAll("img")) {
      if (!img.complete) img.addEventListener("load", apply, { once: true });
    }
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setFrame((current) => (current + 1) % 3), 6000);
    return () => window.clearInterval(id);
  }, [armed]);

  return (
    <div ref={fitRef} className="relative min-h-0 flex-1 overflow-hidden">
      <div ref={boardRef} className="absolute top-0 left-0">
        <div className="relative">
          <img
            src="/accueil/hero-base.jpg"
            alt="NEDJM FROID, solutions industrielles de froid et de climatisation"
            className="block h-auto w-full"
          />
          <div className="absolute inset-[0_0_2%_46%]">
            {SLIDES.map((slide, index) => (
              <img
                key={slide.src}
                src={slide.src}
                alt=""
                className="absolute inset-0 h-full w-full object-cover transition-opacity duration-700 motion-reduce:transition-none"
                style={{
                  objectPosition: slide.position,
                  opacity: frame === index + 1 ? 1 : 0,
                  maskImage: "linear-gradient(90deg, transparent 0%, #000 24%)",
                  WebkitMaskImage: "linear-gradient(90deg, transparent 0%, #000 24%)",
                }}
              />
            ))}
          </div>
          <div className="absolute top-[80.5%] left-[6%] z-10 flex gap-1.5">
            {DOTS.map((label, index) => (
              <button
                key={label}
                type="button"
                aria-label={label}
                aria-current={frame === index ? "true" : undefined}
                onClick={() => {
                  setFrame(index);
                  setArmed((value) => value + 1);
                }}
                className={`h-[7px] cursor-pointer rounded-full border-0 p-0 ${
                  frame === index ? "w-[18px] bg-[#7ec8ff]" : "w-[7px] bg-white/55"
                }`}
              />
            ))}
          </div>
        </div>
        <img src="/accueil/page-rest.jpg" alt="" className="block h-auto w-full" />
      </div>
    </div>
  );
}
