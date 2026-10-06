import { describe, expect, it } from "vitest";
import {
  customDocDefInputSchema,
  customDocData,
  customDocFields,
  customDocSample,
  customLetterhead,
  emptyCustomDocDef,
  formatReference,
  inputValues,
  isCustomDocType,
  numberingPeriod,
  starterTemplate,
  suggestCode,
  suggestInputKey,
  CUSTOM_STARTERS,
  DEFAULT_NUMBERING,
  EMPTY_CUSTOM_CONTEXT,
  type CustomInput,
} from "@/lib/doc/custom-docs";
import { renderTemplate } from "@/lib/doc/engine";
import { docFontOptions, fontFaceCss, fontFileFormat, fontStack, withFontFaces, type UploadedFont } from "@/lib/doc/fonts";
import { DEFAULT_PAGE_SETUP, applyPageSetup, normalizePageSetup, pageSetupCss, pageWidthPx } from "@/lib/doc/page-setup";
import { EMPTY_COMPANY_PROFILE } from "@/lib/hr/company-profile";

const input = (patch: Partial<CustomInput> & Pick<CustomInput, "key">): CustomInput => ({
  label_fr: patch.key,
  label_ar: "",
  type: "text",
  list_kind: "",
  required: false,
  default_value: "",
  ...patch,
});

const company = { ...EMPTY_COMPANY_PROFILE, name_fr: "NEDJM FROID", city_fr: "Hassi Messaoud", doc_prefix: "NF" };

describe("custom document types", () => {
  it("recognises custom doc types only", () => {
    expect(isCustomDocType("custom_attestation_stage")).toBe(true);
    expect(isCustomDocType("work_certificate")).toBe(false);
    expect(isCustomDocType("custom_A")).toBe(false);
  });

  it("suggests codes and field keys from labels", () => {
    expect(suggestCode("Attestation de stage (été)")).toBe("attestation_de_stage_ete");
    expect(suggestInputKey("2e motif")).toBe("e_motif");
    expect(suggestInputKey("éé")).toBe("ee");
    expect(suggestInputKey("123")).toBe("champ");
  });
});

describe("references", () => {
  it("formats the numbering pattern", () => {
    const ref = formatReference(DEFAULT_NUMBERING, { seq: 7, isoDate: "2026-10-06", prefix: "NF", code: "stage" });
    expect(ref).toBe("NF/STAGE/0007/26");
  });

  it("drops empty tokens without double slashes", () => {
    const ref = formatReference(
      { ...DEFAULT_NUMBERING, pattern: "{prefix}/{code}/{yyyy}-{mm}/{seq}", pad: 3 },
      { seq: 12, isoDate: "2026-03-01", prefix: "", code: "att" },
    );
    expect(ref).toBe("ATT/2026-03/012");
  });

  it("restarts every year or never", () => {
    expect(numberingPeriod(DEFAULT_NUMBERING, "2026-10-06")).toBe("2026");
    expect(numberingPeriod({ ...DEFAULT_NUMBERING, reset: "never" }, "2026-10-06")).toBe("");
  });
});

describe("definition schema", () => {
  const base = { ...emptyCustomDocDef("fr"), code: "stage", name_fr: "Attestation de stage" };

  it("accepts a minimal definition", () => {
    expect(customDocDefInputSchema.safeParse(base).success).toBe(true);
  });

  it("rejects duplicate keys, lists without a list and custom letterheads without an image", () => {
    const dup = customDocDefInputSchema.safeParse({ ...base, inputs: [input({ key: "a" }), input({ key: "a" })] });
    expect(dup.success).toBe(false);
    const list = customDocDefInputSchema.safeParse({ ...base, inputs: [input({ key: "a", type: "list" })] });
    expect(list.success).toBe(false);
    const head = customDocDefInputSchema.safeParse({ ...base, page: { ...base.page, letterhead: "custom", letterhead_url: "" } });
    expect(head.success).toBe(false);
  });

  it("uses an Arabic font for Arabic documents", () => {
    expect(emptyCustomDocDef("ar").page.font_family).toBe("Amiri");
    expect(emptyCustomDocDef("fr").page.font_family).toBe("Roboto");
  });
});

describe("input values", () => {
  const listLabel = (kind: string, code: string) => ({ fr: `${kind}:${code}`, ar: `ع:${code}` });

  it("formats dates, amounts, lists and yes / no", () => {
    const out = inputValues(
      [
        input({ key: "d", type: "date" }),
        input({ key: "m", type: "amount" }),
        input({ key: "l", type: "list", list_kind: "leave_kind" }),
        input({ key: "b", type: "bool" }),
        input({ key: "t", type: "textarea" }),
      ],
      { d: "2026-10-06", m: "1500", l: "ANNUAL", b: "false", t: "a\nb" },
      "fr",
      listLabel,
    );
    expect(out.d).toBe("06/10/2026");
    expect(String(out.m)).toMatch(/1\s?500,00/);
    expect(String(out.m_lettres)).toMatch(/mille cinq cents/i);
    expect(String(out.m_lettres_ar)).toContain("دينار");
    expect(out.l).toBe("leave_kind:ANNUAL");
    expect(out.b).toBe("Non");
    expect(out.t).toBe("a\nb");
  });

  it("uses Arabic list labels in Arabic documents", () => {
    const out = inputValues([input({ key: "l", type: "list", list_kind: "k" })], { l: "X" }, "ar", listLabel);
    expect(out.l).toBe("ع:X");
  });
});

describe("fields offered to the designer", () => {
  const employeeFields = [
    { code: "matricule", label_fr: "Matricule", label_ar: "", value_type: "text", is_active: true },
    { code: "photo_url", label_fr: "Photo", label_ar: "", value_type: "text", is_active: true },
    { code: "old", label_fr: "Ancien", label_ar: "", value_type: "text", is_active: false },
  ];

  it("groups inputs, employee and source fields", () => {
    const fields = customDocFields({ source: "leave", inputs: [input({ key: "motif", type: "textarea" }), input({ key: "prime", type: "amount" })] }, employeeFields);
    const paths = fields.map((f) => f.path);
    expect(paths).toContain("input.motif");
    expect(fields.find((f) => f.path === "input.motif")?.format).toBe("multiline");
    expect(paths).toEqual(expect.arrayContaining(["input.prime_lettres", "input.prime_lettres_ar"]));
    expect(paths).toContain("emp.matricule");
    expect(paths).not.toContain("emp.photo_url");
    expect(paths).not.toContain("emp.old");
    expect(paths.some((p) => p.startsWith("lv."))).toBe(true);
    expect(paths.some((p) => p.startsWith("ct."))).toBe(false);
    expect(paths.some((p) => p.startsWith("company."))).toBe(true);
  });

  it("has no employee fields for free documents", () => {
    const paths = customDocFields({ source: "free", inputs: [] }, employeeFields).map((f) => f.path);
    expect(paths.some((p) => p.startsWith("emp."))).toBe(false);
  });
});

describe("data and templates", () => {
  const def = { ...emptyCustomDocDef("fr"), code: "stage", name_fr: "Attestation de stage", name_ar: "شهادة تربص" };

  it("builds the print data from the context", () => {
    const data = customDocData(
      def,
      { ...EMPTY_CUSTOM_CONTEXT, employee: { last_name: "BENALI", first_name: "Karim" }, sex: "F" },
      {},
      { company, letterheadUrl: "", reference: "NF/STAGE/0001/26", today: "2026-10-01", listLabel: () => ({ fr: "", ar: "" }) },
    );
    expect(data.reference).toBe("NF/STAGE/0001/26");
    expect(data.date_doc).toBe("01/10/2026");
    expect(data.date_doc_long).toBe("1er octobre 2026");
    expect(data.fait_a).toBe("Hassi Messaoud");
    expect((data.emp as Record<string, string>).nom).toBe("BENALI Karim");
    expect((data.emp as Record<string, string>).civ).toBe("Madame");
  });

  it("picks the letterhead of the page setup", () => {
    expect(customLetterhead({ ...DEFAULT_PAGE_SETUP, letterhead: "company" }, "/c.png")).toBe("/c.png");
    expect(customLetterhead({ ...DEFAULT_PAGE_SETUP, letterhead: "custom", letterhead_url: "/x.png" }, "/c.png")).toBe("/x.png");
    expect(customLetterhead({ ...DEFAULT_PAGE_SETUP, letterhead: "none" }, "/c.png")).toBe("");
  });

  it("renders every starter in every language", () => {
    for (const lang of ["fr", "ar", "bi"] as const) {
      for (const s of CUSTOM_STARTERS) {
        const d = { ...def, lang, source: "employee" as const };
        const html = starterTemplate(d, s.id, '"Amiri", serif');
        expect(html).toContain('id="doc-setup"');
        expect(html).toContain(`dir="${lang === "ar" ? "rtl" : "ltr"}"`);
        const out = renderTemplate(html, customDocSample(d, [], { company, letterheadUrl: "/l.png" }));
        expect(out).not.toContain("data-field");
        expect(out).toContain("doc-letterhead");
      }
    }
  });
});

describe("page setup", () => {
  it("normalises bad values to defaults", () => {
    const page = normalizePageSetup({ size: "B5", margin_top: -4, font_size: 99, letterhead: "company" });
    expect(page.size).toBe("A4");
    expect(page.margin_top).toBe(20);
    expect(page.font_size).toBe(11);
  });

  it("sizes the sheet and the page number band", () => {
    expect(pageWidthPx({ size: "A4", orientation: "portrait" })).toBe(794);
    expect(pageWidthPx({ size: "A4", orientation: "landscape" })).toBe(1123);
    const css = pageSetupCss({ ...DEFAULT_PAGE_SETUP, page_numbers: "center", page_number_label: "ar" }, "Amiri");
    expect(css).toContain("@page { size: 210mm 297mm; margin: 0 0 10mm 0; @bottom-center");
    expect(css).toContain("صفحة");
  });

  it("rewrites the managed block and syncs watermark, letterhead and header", () => {
    const html =
      '<!doctype html><html><head><style>p{color:red}</style></head><body><img class="doc-letterhead" src="" data-attr-src="letterhead" alt=""><table class="doc-frame"><tbody><tr><td>x</td></tr></tbody></table></body></html>';
    const first = applyPageSetup(html, {
      page: { ...DEFAULT_PAGE_SETUP, watermark: "COPIE", header_height: 15, letterhead: "none" },
      lang: "ar",
      fontStack: "Amiri",
    });
    expect(first).toContain('dir="rtl"');
    expect(first).toContain('<div class="doc-watermark">COPIE</div>');
    expect(first).toContain('class="doc-header"');
    expect(first).not.toContain("doc-letterhead\" src");
    expect(first.indexOf('id="doc-setup"')).toBeLessThan(first.indexOf("p{color:red}"));

    const second = applyPageSetup(first, { page: { ...DEFAULT_PAGE_SETUP, size: "A5" }, lang: "fr", fontStack: "Roboto" });
    expect(second.match(/id="doc-setup"/g)).toHaveLength(1);
    expect(second).toContain("size: 148mm 210mm");
    expect(second).not.toContain("doc-watermark\">");
    expect(second).toContain('data-attr-src="letterhead"');
    expect(second).toContain('dir="ltr"');
  });
});

describe("fonts", () => {
  const uploaded: UploadedFont[] = [
    { id: "1", family: "Charte Sans", weight: 400, style: "normal", format: "woff2", url: "https://x.test/a.woff2", is_active: true },
    { id: "2", family: "Old Font", weight: 400, style: "normal", format: "truetype", url: "https://x.test/b.ttf", is_active: false },
  ];

  it("lists bundled, active uploaded and system fonts", () => {
    const options = docFontOptions(uploaded);
    expect(options.find((o) => o.family === "Amiri")?.group).toBe("arabic");
    expect(options.find((o) => o.family === "Roboto")?.group).toBe("latin");
    expect(options.find((o) => o.family === "Charte Sans")?.group).toBe("upload");
    expect(options.some((o) => o.family === "Old Font")).toBe(false);
    expect(fontStack("charte sans", options)).toBe('"Charte Sans", Arial, sans-serif');
    expect(fontStack("Inconnue", options)).toBe('"Inconnue", Arial, sans-serif');
  });

  it("writes @font-face rules and injects them in the head", () => {
    const css = fontFaceCss(uploaded);
    expect(css).toContain('font-family: "Amiri"');
    expect(css).toContain("https://x.test/a.woff2");
    expect(css).not.toContain("b.ttf");
    const html = withFontFaces("<html><head><title>t</title></head><body></body></html>", css);
    expect(html.indexOf('<style id="doc-fonts">')).toBeLessThan(html.indexOf("<title>"));
  });

  it("detects font file formats", () => {
    expect(fontFileFormat("Brand-Bold.TTF")).toEqual({ ext: "ttf", format: "truetype", mime: "font/ttf" });
    expect(fontFileFormat("logo.png")).toBeNull();
  });
});
