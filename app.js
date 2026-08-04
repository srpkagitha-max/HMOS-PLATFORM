import {
  loginSuperAdmin,
  logoutCurrentUser,
  watchAuth,
  getCurrentUserProfile,
  listInstitutes,
  createInstitute,
  loginInstitute,
  generateInstituteCode,
  generateTemporaryPassword
} from "./firebase-service.js";

const app = document.querySelector("#app");
if (window.__HMOS_BOOT_TIMER__) clearTimeout(window.__HMOS_BOOT_TIMER__);
const state = {
  screen: "institute",
  authUser: null,
  profile: null,
  institutes: [],
  loading: false,
  lastCredentials: null,
  instituteSession: null
};

const INSTITUTES_CACHE_KEY = "hmosInstitutesCacheV23";
const SUPER_ADMIN_EMAIL = "hmos.superadmin@gmail.com";

function readInstitutesCache() {
  try { return JSON.parse(localStorage.getItem(INSTITUTES_CACHE_KEY) || "[]"); } catch { return []; }
}

function writeInstitutesCache(items) {
  try { localStorage.setItem(INSTITUTES_CACHE_KEY, JSON.stringify(items)); } catch {}
}

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
        <div class="trust-row"><span>Secure access</span><span>Multi-institute</span><span>Mobile ready</span></div>
      </section>
      ${content}
      <footer>Powered by <strong>Hostel Management Operating System</strong></footer>
    </main>`;
}

function field({ id, label, type = "text", placeholder = "", autocomplete = "off", min = "" }) {
  return `<label class="field" for="${id}"><span>${label}</span>
    <input id="${id}" name="${id}" type="${type}" placeholder="${placeholder}" autocomplete="${autocomplete}" ${min ? `min="${min}"` : ""} required />
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

  document.querySelector("#institute-form").addEventListener("submit", async event => {
    event.preventDefault();
    const messageEl = document.querySelector("#form-message");
    const button = event.currentTarget.querySelector("button[type='submit']");
    const instituteCode = document.querySelector("#institute-id").value.trim();
    const password = document.querySelector("#institute-password").value;
    if (!instituteCode || !password) {
      messageEl.textContent = "Enter the institute code and password.";
      messageEl.className = "form-message show error";
      return;
    }
    button.disabled = true;
    button.textContent = "Checking…";
    try {
      state.instituteSession = await loginInstitute(instituteCode, password);
      renderInstitutePortal();
    } catch (error) {
      const messages = {
        "invalid-institute-credential": "Incorrect institute code or password.",
        "institute-inactive": "This institute account is inactive.",
        "subscription-expired": "The institute subscription has expired.",
        "permission-denied": "Publish the included Firestore rules before using institute login."
      };
      messageEl.textContent = messages[error?.code] || "Institute login failed.";
      messageEl.className = "form-message show error";
      button.disabled = false;
      button.innerHTML = "Continue <span>→</span>";
    }
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
        <p>Only an authorized HMOS platform administrator can continue.</p></div>
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
  document.querySelector("#admin-form").addEventListener("submit", async event => {
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
    } catch (error) {
      console.error("HMOS Firebase login error:", error);
      const messages = {
        "auth/invalid-credential": "Incorrect email or password.",
        "auth/invalid-login-credentials": "Incorrect email or password.",
        "auth/user-not-found": "No Firebase Authentication user exists for this email.",
        "auth/wrong-password": "The password is incorrect.",
        "auth/user-disabled": "This account has been disabled in Firebase Authentication.",
        "auth/too-many-requests": "Too many attempts. Wait a few minutes and try again.",
        "auth/network-request-failed": "Network error. Check your internet connection.",
        "auth/unauthorized-domain": "This website domain is not authorized in Firebase Authentication.",
        "auth/operation-not-allowed": "Email/Password sign-in is not enabled in Firebase Authentication.",
        "auth/invalid-api-key": "The Firebase API key in firebase-config.js is invalid.",
        "auth/app-deleted": "Firebase was not initialized correctly."
      };
      const code = error?.code || "unknown-error";
      messageEl.textContent = `${messages[code] || "Login failed."} Error: ${code}`;
      messageEl.className = "form-message show error";
      button.disabled = false;
      button.innerHTML = "Secure Login <span>→</span>";
    }
  });
}

function renderInstitutePortal() {
  const institute = state.instituteSession;
  app.innerHTML = shell(`
    <section class="card login-card">
      <span class="step success-step">Institute access verified</span>
      <h2>${escapeHtml(institute?.instituteName || "Institute Portal")}</h2>
      <p class="blocked-copy">Code: <strong>${escapeHtml(institute?.instituteCode || "")}</strong></p>
      <div class="notice"><strong>Institute portal is ready.</strong><p>Students, rooms, fees and admissions modules will be connected in Phase 2.</p></div>
      <button id="institute-logout" class="primary" type="button">Return to Login</button>
    </section>`, true);
  document.querySelector("#institute-logout").addEventListener("click", () => {
    state.instituteSession = null;
    state.screen = "institute";
    render();
  });
}

function dashboardShell(content) {
  const email = state.authUser?.email || "Authorized administrator";
  return shell(`
    <section class="card dashboard-card wide-card">
      <div class="dashboard-head">
        <div><span class="step success-step">Authorized platform access</span><h2>Super Admin Dashboard</h2><p>${escapeHtml(email)}</p></div>
        <button id="logout" class="secondary" type="button">Logout</button>
      </div>
      ${content}
    </section>`, true);
}

function instituteRows() {
  if (!state.institutes.length) {
    return `<div class="empty-state"><strong>No institutes created yet.</strong><p>Create the first hostel institute using the button above.</p></div>`;
  }
  return `<div class="institute-list">${state.institutes.map(item => `
    <article class="institute-row">
      <div class="avatar">${escapeHtml((item.instituteName || "H").slice(0,1).toUpperCase())}</div>
      <div class="institute-main"><strong>${escapeHtml(item.instituteName)}</strong><span>${escapeHtml(item.instituteCode)} · ${escapeHtml(item.hostelType || "hostel")}</span></div>
      <div><span class="pill active-pill">${escapeHtml(item.status || "active")}</span></div>
      <div class="limit-text">${Number(item.studentLimit || 0)} students</div>
    </article>`).join("")}</div>`;
}

function renderAdminDashboard(message = "", status = "") {
  app.innerHTML = dashboardShell(`
    <div class="metric-grid">
      <article><span>Total Institutes</span><strong>${state.institutes.length}</strong><small>Registered on HMOS</small></article>
      <article><span>Active Plans</span><strong>${state.institutes.filter(x => x.subscriptionStatus === "active").length}</strong><small>Yearly subscriptions</small></article>
      <article><span>System Status</span><strong class="health-text">Healthy</strong><small>Firebase connected</small></article>
    </div>
    <div class="section-title"><div><h3>Institute Management</h3><p>Create and review institutes registered on the platform.</p></div><button id="open-create" class="primary compact-primary" type="button">+ Create Institute</button></div>
    <p id="dashboard-message" class="form-message ${message ? `show ${status}` : ""}">${escapeHtml(message)}</p>
    ${state.lastCredentials ? `<div class="credentials-card"><div><span class="step success-step">Generated institute login</span><strong>${escapeHtml(state.lastCredentials.instituteCode)}</strong><small>ID: ${escapeHtml(state.lastCredentials.instituteId)}</small></div><div class="credential-value"><span>Temporary Password</span><code>${escapeHtml(state.lastCredentials.temporaryPassword)}</code><small>Plan valid until ${escapeHtml(state.lastCredentials.subscriptionEnd)}</small></div><button id="copy-credentials" class="secondary" type="button">Copy Login</button></div>` : ""}
    ${instituteRows()}
    <div class="setup-note"><strong>Security checkpoint</strong><p>Institute portal passwords are intentionally not stored in the browser. Secure password creation will be added through a server function in the next build.</p></div>
  `);
  bindDashboardEvents();
}

function renderCreateInstitute(message = "", status = "") {
  app.innerHTML = dashboardShell(`
    <button id="back-dashboard" class="back" type="button">← Dashboard</button>
    <div class="card-heading"><span class="step">Institute onboarding</span><h2>Create Institute</h2><p>Add the hostel identity and yearly plan limits.</p></div>
    <form id="create-institute-form" class="form-grid" novalidate>
      <label class="field" for="new-code"><span>Institute Code</span><div class="input-action"><input id="new-code" name="new-code" type="text" placeholder="Auto-generated or enter code" autocomplete="off" required /><button id="generate-code" class="mini-button" type="button">Generate</button></div></label>
      ${field({ id: "new-name", label: "Institute Name", placeholder: "Enter hostel name" })}
      <label class="field" for="new-type"><span>Hostel Type</span><select id="new-type" required><option value="boys">Boys Hostel</option><option value="girls">Girls Hostel</option><option value="mixed">Mixed Hostel</option></select></label>
      ${field({ id: "new-owner", label: "Owner Name", placeholder: "Enter owner name" })}
      ${field({ id: "new-phone", label: "Owner Phone", type: "tel", placeholder: "10-digit mobile number" })}
      ${field({ id: "new-limit", label: "Student Limit", type: "number", placeholder: "100", min: "1" })}
      <label class="field form-wide" for="new-password"><span>Temporary Institute Password</span><div class="input-action"><input id="new-password" name="new-password" type="text" placeholder="Generate secure password" autocomplete="off" required /><button id="generate-password" class="mini-button" type="button">Generate</button></div></label>
      <p id="create-message" class="form-message ${message ? `show ${status}` : ""}">${escapeHtml(message)}</p>
      <button id="create-submit" class="primary form-wide" type="submit">Save Institute <span>→</span></button>
    </form>
  `);
  document.querySelector("#back-dashboard").addEventListener("click", () => { state.screen = "admin-dashboard"; render(); });
  document.querySelector("#logout").addEventListener("click", logoutHandler);
  const nameInput = document.querySelector("#new-name");
  document.querySelector("#generate-code").addEventListener("click", () => {
    document.querySelector("#new-code").value = generateInstituteCode(nameInput.value || "HMOS");
  });
  document.querySelector("#generate-password").addEventListener("click", () => {
    document.querySelector("#new-password").value = generateTemporaryPassword();
  });
  document.querySelector("#new-password").value = generateTemporaryPassword();
  document.querySelector("#create-institute-form").addEventListener("submit", submitInstitute);
}

async function submitInstitute(event) {
  event.preventDefault();
  const messageEl = document.querySelector("#create-message");
  const button = document.querySelector("#create-submit");
  const input = {
    instituteCode: document.querySelector("#new-code").value.trim(),
    instituteName: document.querySelector("#new-name").value.trim(),
    hostelType: document.querySelector("#new-type").value,
    ownerName: document.querySelector("#new-owner").value.trim(),
    ownerPhone: document.querySelector("#new-phone").value.trim(),
    studentLimit: document.querySelector("#new-limit").value,
    temporaryPassword: document.querySelector("#new-password").value.trim()
  };
  if (!input.instituteCode || !input.instituteName || !input.ownerName || !input.temporaryPassword || !/^\d{10}$/.test(input.ownerPhone) || Number(input.studentLimit) < 1) {
    messageEl.textContent = "Complete all fields and enter a valid 10-digit phone number.";
    messageEl.className = "form-message show error form-wide";
    return;
  }
  button.disabled = true;
  button.textContent = "Saving…";
  try {
    const created = await createInstitute(input, state.authUser.uid);
    state.institutes = [created, ...state.institutes];
    writeInstitutesCache(state.institutes);
    state.lastCredentials = {
      instituteId: created.instituteId,
      instituteCode: created.instituteCode,
      temporaryPassword: created.temporaryPassword,
      subscriptionEnd: created.subscriptionEnd?.toDate ? created.subscriptionEnd.toDate().toLocaleDateString("en-IN") : "1 year"
    };
    state.screen = "admin-dashboard";
    renderAdminDashboard("Institute created successfully.", "success-message");
  } catch (error) {
    messageEl.textContent = error.code === "permission-denied"
      ? "Firestore permission denied. Publish the included v2.3 rules."
      : error.code === "institute-code-exists"
        ? "This institute code already exists. Generate a new code."
        : "Could not create the institute. Please try again.";
    messageEl.className = "form-message show error form-wide";
    button.disabled = false;
    button.innerHTML = "Save Institute <span>→</span>";
  }
}

async function logoutHandler() {
  await logoutCurrentUser();
  state.profile = null;
  state.institutes = [];
  state.screen = "super-admin";
  render();
}

function bindDashboardEvents() {
  document.querySelector("#logout").addEventListener("click", logoutHandler);
  document.querySelector("#open-create").addEventListener("click", () => { state.screen = "create-institute"; render(); });
  const copyButton = document.querySelector("#copy-credentials");
  if (copyButton && state.lastCredentials) {
    copyButton.addEventListener("click", async () => {
      const text = `HMOS Institute Login\nCode: ${state.lastCredentials.instituteCode}\nPassword: ${state.lastCredentials.temporaryPassword}`;
      try { await navigator.clipboard.writeText(text); copyButton.textContent = "Copied"; }
      catch { copyButton.textContent = "Copy failed"; }
    });
  }
}

function renderUnauthorized(reason = "This account is not authorized as the HMOS Super Admin.") {
  app.innerHTML = shell(`
    <section class="card login-card"><span class="step danger-step">Access blocked</span><h2>Authorization Required</h2><p class="blocked-copy">${escapeHtml(reason)}</p><button id="blocked-logout" class="primary" type="button">Return to Login</button></section>`, true);
  document.querySelector("#blocked-logout").addEventListener("click", logoutHandler);
}

function renderLoading() {
  app.innerHTML = shell(`<section class="card login-card loading-card"><div class="loader"></div><h2>Checking authorization…</h2><p>Please wait while HMOS verifies this account.</p></section>`, true);
}

function render() {
  if (state.screen === "super-admin") return renderSuperAdmin();
  if (state.screen === "admin-dashboard") return renderAdminDashboard();
  if (state.screen === "create-institute") return renderCreateInstitute();
  if (state.screen === "unauthorized") return renderUnauthorized();
  if (state.screen === "loading") return renderLoading();
  if (state.screen === "institute-portal") return renderInstitutePortal();
  return renderInstituteLogin();
}

watchAuth(async user => {
  state.authUser = user;
  if (!user) {
    if (["admin-dashboard", "create-institute", "loading", "unauthorized"].includes(state.screen)) state.screen = "super-admin";
    render();
    return;
  }

  const cached = readInstitutesCache();
  if (cached.length) {
    state.institutes = cached;
    state.screen = "admin-dashboard";
    render();
  } else {
    state.screen = "loading";
    render();
  }

  try {
    const [profile, institutes] = await Promise.all([
      getCurrentUserProfile(user.uid).catch(() => null),
      listInstitutes()
    ]);
    state.profile = profile;
    const emailAllowed = String(user.email || "").toLowerCase() === SUPER_ADMIN_EMAIL;
    const profileAllowed = profile && profile.userType === "superAdmin" && profile.accountStatus === "active";
    if (!emailAllowed && !profileAllowed) {
      state.screen = "unauthorized";
      render();
      return;
    }
    state.institutes = institutes;
    writeInstitutesCache(institutes);
    state.screen = "admin-dashboard";
    render();
  } catch (error) {
    if (String(user.email || "").toLowerCase() === SUPER_ADMIN_EMAIL && state.institutes.length) return;
    state.screen = "unauthorized";
    renderUnauthorized(error.code === "permission-denied" ? "Publish the included v2.3 Firestore rules before using the dashboard." : undefined);
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("service-worker.js").catch(() => {}));
}
