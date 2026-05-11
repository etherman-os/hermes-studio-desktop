export const HERMES_INSPECTOR_CLICK = "HERMES_INSPECTOR_CLICK";

export type InspectorSelection = {
  selector: string;
  tagName: string;
  text: string;
};

export type InspectorMessage = InspectorSelection & {
  type: typeof HERMES_INSPECTOR_CLICK;
  channel: string;
};

type PreviewDocumentOptions = {
  inspector?: {
    channel: string;
    nonce: string;
    targetOrigin: string;
  };
};

function randomHex(bytesLength: number): string {
  const bytes = new Uint8Array(bytesLength);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createPreviewChannelId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `hermes-preview-${randomHex(16)}`;
}

export function createPreviewNonce(): string {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  const binary = String.fromCharCode(...bytes);
  if (typeof btoa === "function") return btoa(binary);
  return randomHex(16);
}

export function isInspectorMessage(
  data: unknown,
  expectedChannel: string,
): data is InspectorMessage {
  if (!data || typeof data !== "object") return false;
  const record = data as Record<string, unknown>;
  return (
    record.type === HERMES_INSPECTOR_CLICK &&
    record.channel === expectedChannel &&
    typeof record.selector === "string" &&
    record.selector.length > 0 &&
    record.selector.length <= 500 &&
    typeof record.tagName === "string" &&
    record.tagName.length > 0 &&
    record.tagName.length <= 40 &&
    typeof record.text === "string" &&
    record.text.length <= 200
  );
}

function buildInspectorScript(channel: string, targetOrigin: string): string {
  return `
(() => {
  const channel = ${JSON.stringify(channel)};
  const targetOrigin = ${JSON.stringify(targetOrigin)};
  let highlightedEl = null;

  function clearHighlight() {
    if (!highlightedEl) return;
    highlightedEl.classList.remove("hermes-inspector-highlight");
    highlightedEl = null;
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === "function") {
      return window.CSS.escape(value);
    }
    return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\\\$&");
  }

  function getCssSelector(el) {
    if (!el || !el.tagName) return "";
    const tagName = el.tagName.toLowerCase();
    if (tagName === "html") return "html";
    if (el.id) return tagName + "#" + cssEscape(el.id);
    const classes = Array.from(el.classList || []).filter(Boolean).slice(0, 4);
    if (classes.length > 0) {
      return tagName + classes.map((className) => "." + cssEscape(className)).join("");
    }
    return tagName;
  }

  document.addEventListener("mouseover", (event) => {
    clearHighlight();
    if (!(event.target instanceof Element)) return;
    highlightedEl = event.target;
    highlightedEl.classList.add("hermes-inspector-highlight");
  }, true);

  document.addEventListener("mouseout", clearHighlight, true);

  document.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    clearHighlight();
    if (!(event.target instanceof HTMLElement)) return;
    window.parent.postMessage({
      type: ${JSON.stringify(HERMES_INSPECTOR_CLICK)},
      channel,
      selector: getCssSelector(event.target),
      tagName: event.target.tagName.toLowerCase(),
      text: event.target.innerText ? event.target.innerText.substring(0, 200) : ""
    }, targetOrigin);
  }, true);
})();
`;
}

export function sanitizedPreviewDoc(
  content: string,
  options: PreviewDocumentOptions = {},
): string {
  if (typeof window === "undefined") return content;
  const parser = new DOMParser();
  const doc = parser.parseFromString(content, "text/html");
  doc
    .querySelectorAll("script, form, iframe, object, embed")
    .forEach((node) => node.remove());
  doc.querySelectorAll("*").forEach((node) => {
    for (const attr of [...node.attributes]) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim().toLowerCase();
      if (name.startsWith("on") || value.startsWith("javascript:")) {
        node.removeAttribute(attr.name);
      }
    }
  });

  const inspector = options.inspector;
  if (inspector) {
    const style = doc.createElement("style");
    style.setAttribute("nonce", inspector.nonce);
    style.textContent =
      ".hermes-inspector-highlight{outline:2px dashed #ec4899!important;outline-offset:-2px!important;cursor:crosshair!important}";
    doc.head.appendChild(style);

    const inspectorScript = doc.createElement("script");
    inspectorScript.setAttribute("nonce", inspector.nonce);
    inspectorScript.textContent = buildInspectorScript(
      inspector.channel,
      inspector.targetOrigin,
    );
    doc.body.appendChild(inspectorScript);
  }

  const csp = doc.createElement("meta");
  csp.setAttribute("http-equiv", "Content-Security-Policy");
  const scriptSrc = inspector ? `'nonce-${inspector.nonce}'` : "'none'";
  csp.setAttribute(
    "content",
    `default-src 'none'; img-src data: blob: file: http: https:; style-src 'unsafe-inline' file: http: https:; font-src data: file: http: https:; script-src ${scriptSrc}; connect-src 'none'; form-action 'none'; base-uri 'none'`,
  );
  doc.head.prepend(csp);
  return `<!doctype html>${doc.documentElement.outerHTML}`;
}
