export function renderTopbar(role) {
  return `
    <div class="topbar">
      <div class="brand">OVA Training</div>
      <div class="center">
        <span class="mono" style="color:var(--ink-3);font-size:10px;letter-spacing:0.14em;text-transform:uppercase">${role || ""}</span>
      </div>
      <div class="right">
        <button class="icon-btn" id="theme-toggle" title="Dark/Light">◐</button>
        <button class="icon-btn" id="fs-toggle" title="Tamaño de fuente">Aa</button>
      </div>
    </div>
  `;
}

export function attachTopbarBehavior() {
  const theme = document.getElementById("theme-toggle");
  const fs = document.getElementById("fs-toggle");

  if (theme) {
    const stored = localStorage.getItem("ova-theme");
    if (stored === "light") {
      document.body.classList.add("light");
      theme.textContent = "◑";
    }

    theme.addEventListener("click", () => {
      const isLight = document.body.classList.toggle("light");
      theme.textContent = isLight ? "◑" : "◐";
      localStorage.setItem("ova-theme", isLight ? "light" : "dark");
    });
  }

  if (fs) {
    const modes = ["fs-sm", "", "fs-lg"];
    const labels = ["A-", "Aa", "A+"];
    let idx = parseInt(localStorage.getItem("ova-fs-idx") || "1", 10);

    applyFs();

    function applyFs() {
      document.body.classList.remove("fs-sm", "fs-lg");
      if (modes[idx]) document.body.classList.add(modes[idx]);
      fs.textContent = labels[idx];
    }

    fs.addEventListener("click", () => {
      idx = (idx + 1) % modes.length;
      localStorage.setItem("ova-fs-idx", String(idx));
      applyFs();
    });
  }
}

document.addEventListener("click", e => {
  if (e.target && (e.target.id === "theme-toggle" || e.target.id === "fs-toggle")) {
    setTimeout(attachTopbarBehavior, 0);
  }
}, true);

window.attachTopbarBehavior = attachTopbarBehavior;
