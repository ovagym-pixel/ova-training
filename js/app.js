import { registerRoute, startRouter } from "./router.js";
import { renderLogin } from "./modules/login.js";
import { renderDashboard } from "./modules/dashboard.js";
import { renderRoleProfiles } from "./modules/role-profiles.js";
import { renderClientPortal } from "./modules/client-portal.js";
import { renderAdminClientAccess } from "./modules/admin-client-access.js";
import { attachTopbarBehavior } from "./shared/topbar.js";

registerRoute("/login", renderLogin);
registerRoute("/dashboard", renderDashboard);
registerRoute("/role-profiles", renderRoleProfiles);
registerRoute("/admin-client-access", renderAdminClientAccess);
registerRoute("/c/:token", renderClientPortal);

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

window.addEventListener("hashchange", () => {
  setTimeout(attachTopbarBehavior, 50);
});

startRouter();

setTimeout(attachTopbarBehavior, 300);
