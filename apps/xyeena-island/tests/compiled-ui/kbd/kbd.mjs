function Kbd(initialProps) {
  let currentProps = { ...initialProps };
  const span = document.createElement("span");
  function render() {
    span.className = `kbd-shortcut ${currentProps.className || ""}`.trim();
    span.textContent = "";
    const parts = (currentProps.shortcut || "").split("+");
    parts.forEach((part, idx) => {
      const kbd = document.createElement("kbd");
      kbd.className = "kbd-key";
      kbd.textContent = part.trim();
      span.appendChild(kbd);
      if (idx < parts.length - 1) {
        const plus = document.createElement("span");
        plus.className = "kbd-sep";
        plus.textContent = "+";
        plus.setAttribute("aria-hidden", "true");
        span.appendChild(plus);
      }
    });
  }
  render();
  return {
    get element() {
      return span;
    },
    update(nextProps) {
      currentProps = { ...currentProps, ...nextProps };
      render();
    },
    destroy() {
      span.textContent = "";
    }
  };
}
export {
  Kbd
};
