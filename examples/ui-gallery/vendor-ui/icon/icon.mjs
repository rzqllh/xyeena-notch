import {
  PHOSPHOR_VIEWBOX,
  getIconPath
} from "./registry.generated.mjs";
const SVG_NS = "http://www.w3.org/2000/svg";
function Icon(initialProps) {
  let currentProps = { ...initialProps };
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("xmlns", SVG_NS);
  svg.setAttribute("viewBox", PHOSPHOR_VIEWBOX);
  svg.setAttribute("fill", "currentColor");
  const path = document.createElementNS(SVG_NS, "path");
  svg.appendChild(path);
  function applyProps(props) {
    const size = props.size !== void 0 ? String(props.size) : "18";
    svg.setAttribute("width", size);
    svg.setAttribute("height", size);
    if (props.className) {
      svg.setAttribute("class", `xyn-icon ${props.className}`);
    } else {
      svg.setAttribute("class", "xyn-icon");
    }
    if (props.label && props.label.trim()) {
      svg.setAttribute("role", "img");
      svg.setAttribute("aria-label", props.label.trim());
      svg.removeAttribute("aria-hidden");
    } else {
      svg.removeAttribute("role");
      svg.removeAttribute("aria-label");
      svg.setAttribute("aria-hidden", "true");
    }
    const d = getIconPath(props.name);
    path.setAttribute("d", d);
  }
  applyProps(currentProps);
  return {
    get element() {
      return svg;
    },
    update(nextProps) {
      currentProps = { ...currentProps, ...nextProps };
      applyProps(currentProps);
    },
    destroy() {
    }
  };
}
function renderIconSvgString(name, size = 18, options = {}) {
  const d = getIconPath(name);
  const s = Math.max(1, Number(size) || 18);
  const titleTag = options.title ? `<title>${escapeXml(options.title)}</title>` : "";
  const ariaAttr = options.label ? `role="img" aria-label="${escapeXml(options.label)}"` : 'aria-hidden="true"';
  const cls = options.className ? ` class="xyn-icon ${escapeXml(options.className)}"` : ' class="xyn-icon"';
  return `<svg xmlns="http://www.w3.org/2000/svg"${cls} ${ariaAttr} width="${s}" height="${s}" viewBox="${PHOSPHOR_VIEWBOX}" fill="currentColor">${titleTag}<path d="${d}"/></svg>`;
}
function escapeXml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
export {
  Icon,
  renderIconSvgString
};
