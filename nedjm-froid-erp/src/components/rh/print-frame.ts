/** Prints a standalone HTML document through a hidden iframe (waits for web fonts). */
export function printHtml(html: string, frameId = "hr-print-frame") {
  document.getElementById(frameId)?.remove();
  const frame = document.createElement("iframe");
  frame.id = frameId;
  frame.setAttribute("aria-hidden", "true");
  Object.assign(frame.style, { position: "fixed", left: "-10000px", top: "0", width: "794px", height: "1123px", border: "0" });
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) {
    frame.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  const cleanup = () => frame.remove();
  win.addEventListener("afterprint", cleanup);
  const run = () => {
    win.focus();
    win.print();
    window.setTimeout(cleanup, 2000);
  };
  const fonts = (doc as Document & { fonts?: FontFaceSet }).fonts;
  const ready = fonts?.ready ?? Promise.resolve();
  const images = Array.from(doc.images).map(
    (img) =>
      new Promise<void>((resolve) => {
        if (img.complete) resolve();
        else {
          img.addEventListener("load", () => resolve());
          img.addEventListener("error", () => resolve());
        }
      }),
  );
  Promise.race([Promise.all([ready, ...images]), new Promise((r) => window.setTimeout(r, 2500))]).then(() =>
    window.setTimeout(run, 150),
  );
}
