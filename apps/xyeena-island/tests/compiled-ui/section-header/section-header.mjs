function SectionHeader(initialProps) {
  let currentProps = { ...initialProps };
  const container = document.createElement("div");
  const textWrap = document.createElement("div");
  textWrap.className = "section-hdr-text";
  const kickerEl = document.createElement("span");
  kickerEl.className = "section-hdr-kicker";
  const titleEl = document.createElement("h2");
  titleEl.className = "section-hdr-title";
  textWrap.appendChild(titleEl);
  const actionWrap = document.createElement("div");
  actionWrap.className = "section-hdr-action";
  container.appendChild(textWrap);
  container.appendChild(actionWrap);
  function render() {
    container.className = `section-hdr ${currentProps.className || ""}`.trim();
    titleEl.textContent = currentProps.title;
    if (currentProps.kicker) {
      kickerEl.textContent = currentProps.kicker;
      if (!textWrap.contains(kickerEl)) {
        textWrap.insertBefore(kickerEl, titleEl);
      }
    } else if (textWrap.contains(kickerEl)) {
      textWrap.removeChild(kickerEl);
    }
    actionWrap.textContent = "";
    if (currentProps.action) {
      actionWrap.appendChild(currentProps.action);
      actionWrap.style.display = "flex";
    } else {
      actionWrap.style.display = "none";
    }
  }
  render();
  return {
    get element() {
      return container;
    },
    update(nextProps) {
      currentProps = { ...currentProps, ...nextProps };
      render();
    },
    destroy() {
      actionWrap.textContent = "";
    }
  };
}
export {
  SectionHeader
};
