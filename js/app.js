import { registerRoute, startRouter } from "./router.js";
import { renderLogin } from "./modules/login.js";
import { renderDashboard } from "./modules/dashboard.js";
import { attachTopbarBehavior } from "./shared/topbar.js";

registerRoute("/login", renderLogin);
registerRoute("/dashboard", renderDashboard);

registerRoute("/", ({ user }) => {
  window.location.hash = user ? "/dashboard" : "/login";
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(err => {
      console.warn("Service worker registration failed:", err);
    });
  });
}

const observer = new MutationObserver(() => {
  if (document.getElementById("theme-toggle")) {
    attachTopbarBehavior();
  }
});
observer.observe(document.body, { childList: true, subtree: true });

startRouter();
