import { loginSuperAdmin, logoutCurrentUser, watchAuth } from "./firebase-service.js";

const app = document.querySelector("#app");
const state = { screen: "institute", institute: null, authUser: null };

const escapeHtml = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

function brand() {
  return `
    <div class="brand">
      <div class="brand-mark" aria-hidden="true">
        <span class="roof"></span><span class="door"></span><span class="shield">✓</span>
      </div>
      <div>
        <p class="eyebrow">HMOS</p>
        <h1>Hostel Management<br class="mobile-break" /> Operating System</h1>
        <p class="tagline">Smart Multi-Institute Hostel Management Platform</p>
      </div>
    </div>`;
}

function shell(content, compact = false) {
  return `
    <main class="shell ${compact ? "shell-compact" : ""}">
      <section class="hero">${brand()}
        <div class="trust-row">
          <span>Secure access</span><span>Multi-institute</span><span>Mobile ready</span>
        </div>
      </section>
      ${content}
      <footer>Powered by <strong>Hostel Management Operating System</strong></footer>
    </main>`;
}

function field({ id, label, type = "text", placeholder = "", autocomplete = "off" }) {
  return `<label class="field" for="${id}"><span>${label}</span>
    <input id="${id}" name="${id}" type="${type}" placeholder="${placeholder}" autocomplete="${autocomplete}" required />
  </label>`;
}

function renderInstituteLogin(message = "") {
  app.innerHTML = shell(`
    <section class="card login-card">
      <div class="card-heading"><span class="step">Institute access</span><h2>Institute Login</h2>
        <p>Enter the institute credentials issued by HMOS.</p></div>
      <form id="institute-form" novalidate>
        ${field({ id: "institute-id", label: "Institute Name / ID", placeholder: "Enter institute name or ID" })}
        ${field({ id: "institute-password", label: "Institute Password", type: "password", placeholder: "Enter institute password", autocomplete: "current-password" })}
        <label class="check"><input type="checkbox" id="remember-institute" /><span>Remember this institute</span></label>
        <p id="form-message" class="form-message ${message ? "show info" : ""}">${escapeHtml(message)}</p>
        <button class="primary" type="submit">Continue <span>→</span></button>
      </form>
      <button id="super-admin-link" class="text-link" type="button">Super Admin Login</button>
    </section>`);

  document.querySelector("#institute-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const id = document.querySelector("#institute-id").value.trim();
    const password = document.querySelector("#institute-password").value;
    const messageEl = document.querySelector("#form-message");
    if (!id || !password) {
      messageEl.textContent = "Please enter both Institute ID and password.";
      messageEl.className = "form-message show error";
      return;
    }
    messageEl.textContent = "Institute verification will be activated after the secure Firestore rule and server verification step.";
    messageEl.className = "form-message show info";
  });
  document.querySelector("#super-admin-link").addEventListener("click", () => {
    state.screen = "super-admin";
    render();
  });
}

function renderSuperAdmin(message = "", status = "") {
  app.innerHTML = shell(`
    <section class="card login-card">
      <button id="back-button" class="back" type="button">← Institute Login</button>
      <div class="card-heading"><span class="step">Restricted access</span><h2>Super Admin Login</h2>
        <p>Only the authorized HMOS platform administrator can continue.</p></div>
      <form id="admin-form" novalidate>
        ${field({ id: "admin-email", label: "Email Address", type: "email", placeholder: "Enter registered email", autocomplete: "username" })}
        ${field({ id: "admin-password", label: "Password", type: "password", placeholder: "Enter password", autocomplete: "current-password" })}
        <p id="form-message" class="form-message ${message ? `show ${status}` : ""}">${escapeHtml(message)}</p>
        <button id="admin-submit" class="primary" type="submit">Secure Login <span>→</span></button>
      </form>
    </section>`, true);

  document.querySelector("#back-button").addEventListener("click", () => {
    state.screen = "institute";
    render();
  });
  document.querySelector("#admin-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = document.querySelector("#admin-submit");
    const messageEl = document.querySelector("#form-message");
    const email = document.querySelector("#admin-email").value.trim();
    const password = document.querySelector("#admin-password").value;
    if (!email || !password) {
      messageEl.textContent = "Enter the registered email and password.";
      messageEl.className = "form-message show error";
      return;
    }
    button.disabled = true;
    button.textContent = "Signing in…";
    try {
      await loginSuperAdmin(email, password);
      state.screen = "admin-dashboard";
      render();
    } catch (error) {
      const messages = {
        "auth/invalid-credential": "Incorrect email or password.",
        "auth/too-many-requests": "Too many attempts. Please wait and try again.",
        "auth/network-request-failed": "Network error. Check your internet connection."
      };
      messageEl.textContent = messages[error.code] || "Login failed. Please verify your credentials.";
      messageEl.className = "form-message show error";
      button.disabled = false;
      button.innerHTML = "Secure Login <span>→</span>";
    }
  });
}

function renderAdminDashboard() {
  const email = state.authUser?.email || "Authorized administrator";
  app.innerHTML = shell(`
    <section class="card dashboard-card">
      <div class="dashboard-head"><div><span class="step success-step">Authenticated</span><h2>Super Admin Console</h2>
        <p>${escapeHtml(email)}</p></div><button id="logout" class="secondary" type="button">Logout</button></div>
      <div class="status-grid">
        <article><strong>Firebase Auth</strong><span class="status success">Connected</span></article>
        <article><strong>Firestore</strong><span class="status pending">Rules pending</span></article>
        <article><strong>Institutes</strong><span class="status pending">Setup pending</span></article>
      </div>
      <div class="notice"><strong>Foundation build ready.</strong><p>The next secure step is Super Admin authorization and institute creation in Firestore.</p></div>
    </section>`, true);
  document.querySelector("#logout").addEventListener("click", async () => {
    await logoutCurrentUser();
    state.screen = "super-admin";
    render();
  });
}

function render() {
  if (state.screen === "super-admin") return renderSuperAdmin();
  if (state.screen === "admin-dashboard") return renderAdminDashboard();
  return renderInstituteLogin();
}

watchAuth((user) => {
  state.authUser = user;
  if (!user && state.screen === "admin-dashboard") state.screen = "super-admin";
  render();
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("service-worker.js").catch(() => {}));
}
