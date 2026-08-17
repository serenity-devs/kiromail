import { defaultVisualTheme, type VisualBlock, type VisualTheme } from "./email-template-compiler";

export type HtmlToVisualResult = {
  blocks: VisualBlock[];
  theme: VisualTheme;
};

const visualFonts: VisualTheme["font_family"][] = ["Arial", "Georgia", "Verdana", "Tahoma"];

function textWithBreaks(element: Element) {
  const clone = element.cloneNode(true) as Element;
  for (const br of clone.querySelectorAll("br")) br.replaceWith("\n");
  return (clone.textContent ?? "").replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim();
}

function numberFromCss(value: string | null | undefined) {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : undefined;
}

function hexColor(value: string | null | undefined) {
  const normalized = (value ?? "").trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(normalized)) return normalized;
  if (/^#[0-9a-f]{3}$/.test(normalized)) return `#${[...normalized.slice(1)].map(character => character.repeat(2)).join("")}`;
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(normalized);
  if (!rgb) return undefined;
  return `#${rgb.slice(1).map(component => Math.min(255, Number(component)).toString(16).padStart(2, "0")).join("")}`;
}

function elementColor(element: HTMLElement | null, property: "color" | "backgroundColor") {
  if (!element) return undefined;
  const own = hexColor(element.style[property]);
  if (own) return own;
  if (property === "backgroundColor") return hexColor(element.getAttribute("bgcolor"));
  return undefined;
}

function alignment(element: HTMLElement): VisualBlock["align"] {
  const value = (element.style.textAlign || element.getAttribute("align") || "").toLowerCase();
  return value === "center" || value === "right" ? value : "left";
}

function isHidden(element: HTMLElement) {
  const style = element.style;
  return style.display === "none" || style.visibility === "hidden" ||
    ((style.maxHeight === "0" || style.maxHeight === "0px") && style.overflow === "hidden") || style.getPropertyValue("mso-hide") === "all";
}

function isButtonLink(element: HTMLAnchorElement) {
  const parent = element.parentElement as HTMLElement | null;
  return Boolean(
    element.style.background || element.style.backgroundColor || element.style.padding ||
    element.style.display === "inline-block" || parent?.getAttribute("bgcolor") || parent?.style.backgroundColor,
  );
}

function closestBlockId(element: Element, usedIds: Set<string>) {
  const stored = element.closest("[data-block-id]")?.getAttribute("data-block-id")?.trim();
  const id = stored && !usedIds.has(stored) ? stored : crypto.randomUUID();
  usedIds.add(id);
  return id;
}

/**
 * Converts the content that can be represented by the block editor. Email table
 * wrappers are deliberately traversed rather than exposed as fake content.
 */
export function htmlToVisualDocument(html: string): HtmlToVisualResult {
  const document = new DOMParser().parseFromString(html, "text/html");
  const blocks: VisualBlock[] = [];
  const usedIds = new Set<string>();

  const add = (element: Element, block: Omit<VisualBlock, "id">) => {
    if (block.type !== "image" && block.type !== "divider" && block.type !== "spacer" && !block.content.trim()) return;
    blocks.push({ id: closestBlockId(element, usedIds), ...block });
  };

  const visit = (element: Element) => {
    const htmlElement = element as HTMLElement;
    if (isHidden(htmlElement)) return;
    const tag = element.tagName.toLowerCase();
    if (["script", "style", "noscript", "template", "svg", "head"].includes(tag)) return;

    if (/^h[1-6]$/.test(tag)) {
      add(element, {
        type: "heading", content: textWithBreaks(element), align: alignment(htmlElement),
        color: elementColor(htmlElement, "color"), size: numberFromCss(htmlElement.style.fontSize) ?? (tag === "h1" ? 38 : 28),
      });
      return;
    }
    if (tag === "blockquote") {
      add(element, { type: "quote", content: textWithBreaks(element), align: alignment(htmlElement), color: elementColor(htmlElement, "color"), size: numberFromCss(htmlElement.style.fontSize) ?? 18 });
      return;
    }
    if (tag === "ul" || tag === "ol") {
      const items = [...element.querySelectorAll(":scope > li")].map(item => textWithBreaks(item)).filter(Boolean);
      add(element, { type: "list", content: items.join("\n"), align: alignment(htmlElement), color: elementColor(htmlElement, "color"), size: numberFromCss(htmlElement.style.fontSize) ?? 16 });
      return;
    }
    if (tag === "img") {
      const image = element as HTMLImageElement;
      add(element, { type: "image", content: "", url: image.getAttribute("src") ?? "", link_url: image.closest("a")?.getAttribute("href") ?? undefined, alt: image.getAttribute("alt") ?? "", align: alignment(htmlElement) });
      return;
    }
    if (tag === "hr") {
      add(element, { type: "divider", content: "", color: elementColor(htmlElement, "color") ?? hexColor(htmlElement.style.borderColor) });
      return;
    }
    if (tag === "p") {
      const anchors = element.querySelectorAll("a");
      const link = anchors.length === 1 ? anchors[0] as HTMLAnchorElement : null;
      if (link && textWithBreaks(element) === textWithBreaks(link) && isButtonLink(link)) {
        add(element, { type: "button", content: textWithBreaks(link), url: link.getAttribute("href") ?? "", align: alignment(htmlElement), color: elementColor(link, "backgroundColor") ?? elementColor(link.parentElement as HTMLElement, "backgroundColor") });
      } else {
        add(element, { type: "text", content: textWithBreaks(element), align: alignment(htmlElement), color: elementColor(htmlElement, "color"), size: numberFromCss(htmlElement.style.fontSize) ?? 17 });
      }
      return;
    }
    if (tag === "a") {
      const link = element as HTMLAnchorElement;
      if (link.querySelector("img")) { for (const child of link.children) visit(child); return; }
      add(element, { type: "button", content: textWithBreaks(link), url: link.getAttribute("href") ?? "", align: alignment(htmlElement), color: elementColor(link, "backgroundColor") });
      return;
    }

    const borderTop = htmlElement.style.borderTop || htmlElement.style.borderTopWidth;
    if ((tag === "td" || tag === "div") && borderTop && !textWithBreaks(element) && !element.querySelector("img")) {
      add(element, { type: "divider", content: "", color: hexColor(htmlElement.style.borderTopColor) ?? "#ded8cc" });
      return;
    }

    const semanticContent = "h1,h2,h3,h4,h5,h6,p,blockquote,ul,ol,img,hr,a";
    if (["div", "section", "main", "article", "header", "footer", "td"].includes(tag) && !element.querySelector(semanticContent) && textWithBreaks(element)) {
      add(element, { type: "text", content: textWithBreaks(element), align: alignment(htmlElement), color: elementColor(htmlElement, "color"), size: numberFromCss(htmlElement.style.fontSize) ?? 17 });
      return;
    }
    const children = [...element.children];
    if (children.length) {
      for (const child of children) visit(child);
      return;
    }
    if (!["body", "html", "table", "tbody", "thead", "tfoot", "tr", "td"].includes(tag)) {
      add(element, { type: "text", content: textWithBreaks(element), align: alignment(htmlElement), color: elementColor(htmlElement, "color"), size: numberFromCss(htmlElement.style.fontSize) ?? 17 });
    } else if (textWithBreaks(element)) {
      add(element, { type: "text", content: textWithBreaks(element), align: alignment(htmlElement), color: elementColor(htmlElement, "color"), size: numberFromCss(htmlElement.style.fontSize) ?? 17 });
    }
  };

  for (const child of document.body.children) visit(child);

  const body = document.body;
  const widthCandidates = [...body.querySelectorAll<HTMLElement>("table[width], table[style*='width'], div[style*='width'], main[style*='width'], section[style*='width'], article[style*='width']")].map(element => ({
    element,
    width: numberFromCss(element.getAttribute("width")) ?? numberFromCss(element.style.width) ?? numberFromCss(element.style.maxWidth),
  })).filter((item): item is { element: HTMLElement; width: number } => Boolean(item.width && item.width >= 300 && item.width <= 800));
  const shell = widthCandidates.at(-1)?.element ?? body.querySelector<HTMLElement>("[style*='max-width']");
  const familySource = shell?.style.fontFamily || body.style.fontFamily;
  const font = visualFonts.find(item => familySource.toLowerCase().includes(item.toLowerCase())) ?? defaultVisualTheme.font_family;
  const firstButton = body.querySelector<HTMLAnchorElement>("a[style*='background'], td[bgcolor] a");
  const theme: VisualTheme = {
    ...defaultVisualTheme,
    outer_bg: elementColor(body, "backgroundColor") ?? defaultVisualTheme.outer_bg,
    content_bg: shell ? elementColor(shell, "backgroundColor") ?? defaultVisualTheme.content_bg : defaultVisualTheme.content_bg,
    text_color: shell ? elementColor(shell, "color") ?? defaultVisualTheme.text_color : defaultVisualTheme.text_color,
    primary_color: firstButton ? elementColor(firstButton, "backgroundColor") ?? elementColor(firstButton.parentElement as HTMLElement, "backgroundColor") ?? defaultVisualTheme.primary_color : defaultVisualTheme.primary_color,
    font_family: font,
    width: widthCandidates.at(-1)?.width ?? numberFromCss(shell?.style.maxWidth) ?? defaultVisualTheme.width,
  };

  return { blocks, theme };
}
