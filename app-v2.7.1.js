import {
  loginSuperAdmin, logoutCurrentUser, watchAuth, listInstitutes, createInstitute, loginInstitute, changeInstitutePassword, validateInstituteSession,
  generateInstituteCode, generateTemporaryPassword, updateInstitute, setInstituteStatus,
  archiveInstitute, restoreInstitute, resetInstitutePassword, renewSubscription
} from "./firebase-service-v2.7.1.js";

const app = document.querySelector("#app");
if (window.__HMOS_BOOT_TIMER__) clearTimeout(window.__HMOS_BOOT_TIMER__);
const SUPER_ADMIN_EMAIL = "hmos.superadmin@gmail.com";
const CACHE_KEY = "hmosInstitutesCacheV261";
const state = {
  screen: "institute", authUser: null, institutes: [], instituteSession: null, instituteCurrentPassword: "",
  lastCredentials: null, selectedId: null, search: "", filter: "all", notice: null
};

const esc = (v="") => String(v).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
const readCache = () => { try { return JSON.parse(localStorage.getItem(CACHE_KEY)||"[]"); } catch { return []; } };
const writeCache = items => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(items)); } catch {} };
const dateOf = value => value?.toDate?.() || (value ? new Date(value) : null);
const formatDate = value => { const d=dateOf(value); return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString("en-IN") : "—"; };
const isExpired = item => { const d=dateOf(item.subscriptionEnd); return Boolean(d && d < new Date()); };
const effectiveStatus = item => item.isArchived ? "archived" : isExpired(item) ? "expired" : (item.status || "active");
const INSTITUTE_SESSION_KEY = "hmosInstituteSessionV271";
const REMEMBERED_INSTITUTE_CODE_KEY = "hmosRememberedInstituteCodeV271";
function saveInstituteSession(session, remember=false){
  const safe = { instituteId:session.instituteId, instituteCode:session.instituteCode, instituteName:session.instituteName, hostelType:session.hostelType||"hostel", ownerPhone:session.ownerPhone||"", ownerEmail:session.ownerEmail||"", city:session.city||"", address:session.address||"", status:session.status||"active", subscriptionStatus:session.subscriptionStatus||"active", subscriptionEnd:session.subscriptionEnd||null, mustChangePassword:Boolean(session.mustChangePassword) };
  try { (remember?localStorage:sessionStorage).setItem(INSTITUTE_SESSION_KEY, JSON.stringify(safe)); if(remember) sessionStorage.removeItem(INSTITUTE_SESSION_KEY); else localStorage.removeItem(INSTITUTE_SESSION_KEY); } catch {}
}
function restoreInstituteSession(){
  try { return JSON.parse(sessionStorage.getItem(INSTITUTE_SESSION_KEY)||localStorage.getItem(INSTITUTE_SESSION_KEY)||"null"); } catch { return null; }
}
function clearInstituteSession(){ try{localStorage.removeItem(INSTITUTE_SESSION_KEY);sessionStorage.removeItem(INSTITUTE_SESSION_KEY);}catch{} }


function brand(){return `<div class="brand"><div class="brand-mark"><span class="roof"></span><span class="door"></span><span class="shield">✓</span></div><div><p class="eyebrow">HMOS</p><h1>Hostel Management<br class="mobile-break"/> Operating System</h1><p class="tagline">Smart Multi-Institute Hostel Management Platform</p></div></div>`;}
function shell(content,compact=false){return `<main class="shell ${compact?"shell-compact":""}"><section class="hero">${brand()}<div class="trust-row"><span>Secure access</span><span>Multi-institute</span><span>Mobile ready</span></div></section>${content}<footer>Powered by <strong>Hostel Management Operating System</strong></footer></main>`;}
function field(id,label,type="text",placeholder="",value="",extra=""){return `<label class="field" for="${id}"><span>${label}</span><input id="${id}" type="${type}" placeholder="${placeholder}" value="${esc(value)}" ${extra}/></label>`;}
function notify(message,type="success-message"){state.notice={message,type};}
function consumeNotice(){const n=state.notice; state.notice=null; return n;}

function renderInstituteLogin(message="") {
  const rememberedCode = (() => { try { return localStorage.getItem(REMEMBERED_INSTITUTE_CODE_KEY) || ""; } catch { return ""; } })();
  app.innerHTML = shell(`<section class="card login-card"><div class="card-heading"><span class="step">Institute access</span><h2>Institute Login</h2><p>Enter credentials issued by HMOS.</p></div><form id="institute-form">${field("institute-id","Institute Code / ID","text","Example: ABCO1234",rememberedCode,"autocomplete='username' autocapitalize='characters'")}<label class="field password-field" for="institute-password"><span>Institute Password</span><div class="password-input-wrap"><input id="institute-password" type="password" placeholder="Enter password" autocomplete="current-password" required/><button id="toggle-institute-password" class="password-toggle" type="button" aria-label="Show password">Show</button></div></label><label class="check"><input type="checkbox" id="remember-institute" ${rememberedCode?"checked":""}/><span>Remember this institute on this device</span></label><p id="form-message" class="form-message ${message?"show error":""}">${esc(message)}</p><button id="institute-submit" class="primary">Continue <span>→</span></button></form><button id="super-admin-link" class="text-link">Super Admin Login</button></section>`);
  document.querySelector("#super-admin-link").onclick=()=>{state.screen="super-admin";render();};
  const passwordInput=document.querySelector("#institute-password");
  document.querySelector("#toggle-institute-password").onclick=e=>{const show=passwordInput.type==="password";passwordInput.type=show?"text":"password";e.currentTarget.textContent=show?"Hide":"Show";};
  document.querySelector("#institute-form").onsubmit=async e=>{
    e.preventDefault();
    const b=document.querySelector("#institute-submit"),m=document.querySelector("#form-message"),code=document.querySelector("#institute-id").value,password=passwordInput.value,remember=document.querySelector("#remember-institute").checked;
    b.disabled=true;b.textContent="Checking…";m.className="form-message";
    try{
      state.instituteSession=await loginInstitute(code,password);
      state.instituteCurrentPassword=password;
      try { remember ? localStorage.setItem(REMEMBERED_INSTITUTE_CODE_KEY,state.instituteSession.instituteCode) : localStorage.removeItem(REMEMBERED_INSTITUTE_CODE_KEY); } catch {}
      if(state.instituteSession.mustChangePassword){state.screen="institute-password-change";}else{saveInstituteSession(state.instituteSession,remember);state.screen="institute-portal";}
      render();
    }catch(err){
      m.textContent={"invalid-institute-credential":"Incorrect institute code or password.","institute-inactive":"This institute account is inactive.","subscription-expired":"Subscription expired. Contact HMOS support.","missing-credentials":"Enter institute code and password.","institute-login-timeout":"Network is slow. Check internet and try again."}[err.code]||`Institute login failed. ${err.code||""}`;
      m.className="form-message show error";b.disabled=false;b.innerHTML="Continue <span>→</span>";
    }
  };
}
function renderInstitutePasswordChange(){
  const i=state.instituteSession;if(!i){state.screen="institute";return render();}
  app.innerHTML=shell(`<section class="card login-card"><span class="step">First login security</span><h2>Create New Password</h2><p class="blocked-copy">For <strong>${esc(i.instituteName||i.instituteCode)}</strong>. Temporary password must be changed before continuing.</p><form id="change-institute-password">${field("new-institute-password","New Password","password","Minimum 10 characters","","autocomplete='new-password'")}${field("confirm-institute-password","Confirm New Password","password","Re-enter new password","","autocomplete='new-password'")}<div class="password-rules"><span>✓ Uppercase</span><span>✓ Lowercase</span><span>✓ Number</span><span>✓ Special character</span></div><p id="form-message" class="form-message"></p><button id="change-password-submit" class="primary">Save & Continue <span>→</span></button></form><button id="cancel-institute-login" class="text-link">Cancel Institute Login</button></section>`,true);
  document.querySelector("#cancel-institute-login").onclick=()=>{state.instituteSession=null;state.instituteCurrentPassword="";state.screen="institute";render();};
  document.querySelector("#change-institute-password").onsubmit=async e=>{e.preventDefault();const n=document.querySelector("#new-institute-password").value,c=document.querySelector("#confirm-institute-password").value,m=document.querySelector("#form-message"),b=document.querySelector("#change-password-submit");if(n!==c){m.textContent="Passwords do not match.";m.className="form-message show error";return;}b.disabled=true;b.textContent="Saving…";try{state.instituteSession=await changeInstitutePassword(i.instituteCode,state.instituteCurrentPassword,n);state.instituteCurrentPassword="";saveInstituteSession(state.instituteSession,true);state.screen="institute-portal";render();}catch(err){m.textContent=err.code==="weak-institute-password"?"Use at least 10 characters with uppercase, lowercase, number and special character.":"Could not change password. Please login again.";m.className="form-message show error";b.disabled=false;b.innerHTML="Save & Continue <span>→</span>";}};
}
function renderSuperAdmin(message=""){
  app.innerHTML=shell(`<section class="card login-card"><button id="back" class="back">← Institute Login</button><div class="card-heading"><span class="step">Restricted access</span><h2>Super Admin Login</h2><p>Only the authorized HMOS administrator can continue.</p></div><form id="admin-form">${field("admin-email","Email Address","email","Registered email","","autocomplete='username'")}${field("admin-password","Password","password","Enter password","","autocomplete='current-password'")}<p id="form-message" class="form-message ${message?"show error":""}">${esc(message)}</p><button id="admin-submit" class="primary">Secure Login <span>→</span></button></form></section>`,true);
  document.querySelector("#back").onclick=()=>{state.screen="institute";render();};
  document.querySelector("#admin-form").onsubmit=async e=>{e.preventDefault();const b=document.querySelector("#admin-submit"),m=document.querySelector("#form-message");b.disabled=true;b.textContent="Signing in…";try{await loginSuperAdmin(document.querySelector("#admin-email").value.trim(),document.querySelector("#admin-password").value);}catch(err){m.textContent=(err.code==="auth/invalid-credential"?"Incorrect email or password.":"Login failed.")+` Error: ${err.code||"unknown"}`;m.className="form-message show error";b.disabled=false;b.innerHTML="Secure Login <span>→</span>";}};
}
function renderInstitutePortal(){const i=state.instituteSession;if(!i){state.screen="institute";return render();}app.innerHTML=shell(`<section class="card portal-card wide-card"><div class="portal-head"><div class="portal-logo">${esc((i.instituteName||"H").slice(0,1).toUpperCase())}</div><div><span class="step success-step">Institute portal</span><h2>${esc(i.instituteName||"Institute Portal")}</h2><p>${esc(i.city||i.address||"HMOS verified institute")} · Code: <strong>${esc(i.instituteCode||"")}</strong></p></div><button id="institute-logout" class="secondary">Logout</button></div><div class="portal-status"><span class="pill active-pill">${esc(i.status||"active")}</span><span>Subscription ends: <strong>${formatDate(i.subscriptionEnd)}</strong></span><button id="refresh-institute-session" class="text-link compact-link" type="button">Refresh access</button></div><div class="portal-actions"><button id="new-admission-card" class="portal-action"><span>＋</span><strong>New Admission</strong><small>Open public admission form</small></button><button id="student-login-card" class="portal-action"><span>🎓</span><strong>Student Login</strong><small>Student ID and password</small></button><button id="admin-login-card" class="portal-action"><span>🛡</span><strong>Admin Login</strong><small>Owner, warden and staff</small></button></div><p id="portal-message" class="form-message"></p><div class="portal-contact"><strong>Institute Contact</strong><p>${esc(i.ownerPhone||"Contact not added")}${i.ownerEmail?` · ${esc(i.ownerEmail)}`:""}</p></div></section>`,true);document.querySelector("#institute-logout").onclick=()=>{clearInstituteSession();state.instituteSession=null;state.screen="institute";render();};document.querySelector("#refresh-institute-session").onclick=async e=>{const b=e.currentTarget,m=document.querySelector("#portal-message");b.disabled=true;b.textContent="Checking…";try{state.instituteSession=await validateInstituteSession(i.instituteCode);saveInstituteSession(state.instituteSession,true);m.textContent="Institute access is active and up to date.";m.className="form-message show success-message";}catch(err){clearInstituteSession();state.instituteSession=null;state.screen="institute";return renderInstituteLogin(err.code==="subscription-expired"?"Subscription expired. Contact HMOS support.":"Institute access is no longer active. Please login again.");}finally{if(document.body.contains(b)){b.disabled=false;b.textContent="Refresh access";}}};["new-admission-card","student-login-card","admin-login-card"].forEach(id=>document.querySelector(`#${id}`).onclick=()=>{const m=document.querySelector("#portal-message");m.textContent=id==="new-admission-card"?"Admission module will open in the next build.":id==="student-login-card"?"Student login foundation is scheduled for V2.8.":"Admin role login foundation is scheduled for V2.7.";m.className="form-message show info";});}
function dashboardShell(content){return shell(`<section class="card dashboard-card wide-card"><div class="dashboard-head"><div><span class="step success-step">Authorized platform access</span><h2>Super Admin Dashboard</h2><p>${esc(state.authUser?.email||"")}</p></div><button id="logout" class="secondary">Logout</button></div>${content}</section>`,true);}

function filteredInstitutes(){const q=state.search.toLowerCase();return state.institutes.filter(i=>{const status=effectiveStatus(i);const matchesFilter=state.filter==="all"||status===state.filter;const hay=`${i.instituteName||""} ${i.instituteCode||""} ${i.ownerName||""} ${i.ownerPhone||""} ${i.city||""}`.toLowerCase();return matchesFilter&&(!q||hay.includes(q));});}
function metric(status){return state.institutes.filter(i=>effectiveStatus(i)===status).length;}
function instituteRows(){const items=filteredInstitutes();if(!items.length)return `<div class="empty-state"><strong>No matching institutes.</strong><p>Change search/filter or create a new institute.</p></div>`;return `<div class="institute-list">${items.map(i=>{const s=effectiveStatus(i);return `<article class="institute-row pro-row"><div class="avatar">${esc((i.instituteName||"H")[0].toUpperCase())}</div><div class="institute-main"><strong>${esc(i.instituteName)}</strong><span>${esc(i.instituteCode)} · ${esc(i.hostelType||"hostel")} · ${esc(i.city||"No city")}</span><small>${esc(i.ownerName||"")} · ${esc(i.ownerPhone||"")}</small></div><span class="pill ${s}-pill">${s}</span><div class="row-meta"><strong>${Number(i.currentStudents||0)}/${Number(i.studentLimit||0)}</strong><small>Students</small></div><button class="row-menu" data-action="view" data-id="${esc(i.id)}">Manage</button></article>`}).join("")}</div>`;}

function renderAdminDashboard(){const n=consumeNotice();app.innerHTML=dashboardShell(`<div class="metric-grid four"><article><span>Total Institutes</span><strong>${state.institutes.filter(i=>!i.isArchived).length}</strong><small>Registered on HMOS</small></article><article><span>Active</span><strong>${metric("active")}</strong><small>Operational accounts</small></article><article><span>Expired</span><strong>${metric("expired")}</strong><small>Need renewal</small></article><article><span>Archived</span><strong>${metric("archived")}</strong><small>Soft deleted</small></article></div><div class="section-title"><div><h3>Institute Management Pro</h3><p>Search, edit, control access and renew subscriptions.</p></div><button id="open-create" class="primary compact-primary">+ Create Institute</button></div>${n?`<p class="form-message show ${n.type}">${esc(n.message)}</p>`:""}${state.lastCredentials?credentialCard():""}<div class="toolbar"><input id="search" placeholder="Search name, code, owner, phone or city" value="${esc(state.search)}"/><select id="filter"><option value="all">All</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="expired">Expired</option><option value="archived">Archived</option></select></div>${instituteRows()}`);bindCommon();document.querySelector("#open-create").onclick=()=>{state.screen="create";render();};document.querySelector("#search").oninput=e=>{state.search=e.target.value;document.querySelector(".institute-list, .empty-state")?.remove();document.querySelector(".toolbar").insertAdjacentHTML("afterend",instituteRows());bindRowButtons();};document.querySelector("#filter").value=state.filter;document.querySelector("#filter").onchange=e=>{state.filter=e.target.value;renderAdminDashboard();};bindRowButtons();bindCredentialButtons();}
function credentialCard(){const c=state.lastCredentials;return `<div class="credentials-card"><div><span class="step success-step">Institute login generated</span><strong>${esc(c.instituteCode)}</strong><small>${esc(c.instituteName||"")} · ID ${esc(c.instituteId)}</small></div><div class="credential-value"><span>Temporary Password</span><code>${esc(c.temporaryPassword)}</code><small>Valid until ${esc(c.subscriptionEnd)}</small></div><div class="credential-actions"><button id="copy-credentials" class="secondary">Copy</button><button id="share-whatsapp" class="secondary">WhatsApp</button></div></div>`;}
function bindCredentialButtons(){if(!state.lastCredentials)return;const c=state.lastCredentials,text=`HMOS Institute Login\nInstitute: ${c.instituteName||""}\nCode: ${c.instituteCode}\nPassword: ${c.temporaryPassword}\nLogin: ${location.origin}${location.pathname}`;document.querySelector("#copy-credentials").onclick=async e=>{try{await navigator.clipboard.writeText(text);e.target.textContent="Copied";}catch{e.target.textContent="Copy failed";}};document.querySelector("#share-whatsapp").onclick=()=>window.open(`https://wa.me/?text=${encodeURIComponent(text)}`,"_blank","noopener");}
function bindRowButtons(){document.querySelectorAll("[data-action='view']").forEach(b=>b.onclick=()=>{state.selectedId=b.dataset.id;state.screen="manage";render();});}
function bindCommon(){document.querySelector("#logout").onclick=async()=>{await logoutCurrentUser();state.screen="super-admin";state.institutes=[];render();};}

function renderCreate(){app.innerHTML=dashboardShell(`<button id="back-dashboard" class="back">← Dashboard</button><div class="card-heading"><span class="step">Institute onboarding</span><h2>Create Institute</h2><p>Create identity, limits, subscription and portal credentials.</p></div>${instituteForm()}`);bindCommon();document.querySelector("#back-dashboard").onclick=()=>{state.screen="dashboard";render();};bindInstituteForm();}
function instituteForm(i={}){return `<form id="institute-form-pro" class="form-grid"><label class="field"><span>Institute Code</span><div class="input-action"><input id="f-code" value="${esc(i.instituteCode||"")}" placeholder="Auto-generated or enter code" ${i.id?"readonly":""}/>${i.id?"":"<button id='gen-code' class='mini-button' type='button'>Generate</button>"}</div></label>${field("f-name","Institute Name","text","Enter hostel name",i.instituteName||"")}<label class="field"><span>Hostel Type</span><select id="f-type"><option value="boys">Boys Hostel</option><option value="girls">Girls Hostel</option><option value="mixed">Mixed Hostel</option></select></label>${field("f-owner","Owner Name","text","Enter owner name",i.ownerName||"")}${field("f-phone","Owner Phone","tel","10-digit mobile number",i.ownerPhone||"")}${field("f-email","Owner Email","email","Optional email",i.ownerEmail||"")}${field("f-city","City / Town","text","Enter city",i.city||"")}${field("f-limit","Student Limit","number","100",i.studentLimit||100,"min='1'")}<label class="field form-wide"><span>Address</span><textarea id="f-address" placeholder="Complete address">${esc(i.address||"")}</textarea></label>${i.id?"":`<label class="field"><span>Subscription</span><select id="f-months"><option value="12">1 Year</option><option value="6">6 Months</option><option value="24">2 Years</option></select></label><label class="field"><span>Temporary Password</span><div class="input-action"><input id="f-password"/><button id="gen-password" class="mini-button" type="button">Generate</button></div></label>`}<p id="form-msg" class="form-message form-wide"></p><button id="save-institute" class="primary form-wide">${i.id?"Update Institute":"Save Institute"} <span>→</span></button></form>`;}
function collectForm(){return {instituteCode:document.querySelector("#f-code").value.trim(),instituteName:document.querySelector("#f-name").value.trim(),hostelType:document.querySelector("#f-type").value,ownerName:document.querySelector("#f-owner").value.trim(),ownerPhone:document.querySelector("#f-phone").value.trim(),ownerEmail:document.querySelector("#f-email").value.trim(),city:document.querySelector("#f-city").value.trim(),studentLimit:document.querySelector("#f-limit").value,address:document.querySelector("#f-address").value.trim(),subscriptionMonths:document.querySelector("#f-months")?.value,temporaryPassword:document.querySelector("#f-password")?.value.trim()};}
function validateInput(x){return x.instituteName&&x.ownerName&&/^\d{10}$/.test(x.ownerPhone)&&Number(x.studentLimit)>0;}
function bindInstituteForm(existing=null){document.querySelector("#f-type").value=existing?.hostelType||"boys";if(!existing){document.querySelector("#f-password").value=generateTemporaryPassword();document.querySelector("#gen-password").onclick=()=>document.querySelector("#f-password").value=generateTemporaryPassword();document.querySelector("#gen-code").onclick=()=>document.querySelector("#f-code").value=generateInstituteCode(document.querySelector("#f-name").value||"HMOS");}document.querySelector("#institute-form-pro").onsubmit=e=>{e.preventDefault();const x=collectForm(),m=document.querySelector("#form-msg"),b=document.querySelector("#save-institute");if(!validateInput(x)||(!existing&&(!x.instituteCode||!x.temporaryPassword))){m.textContent="Complete required fields and enter a valid 10-digit phone number.";m.className="form-message show error form-wide";return;}if(existing){b.disabled=true;b.textContent="Saving…";m.textContent="Saving institute details securely…";m.className="form-message show info form-wide";updateInstitute(existing.id,x,state.authUser.uid,existing).then(updated=>{state.institutes=state.institutes.map(i=>i.id===existing.id?{...i,...updated}:i);writeCache(state.institutes);closeModal();state.screen="dashboard";renderAdminDashboard("Institute saved successfully.","success-message");}).catch(err=>{console.error("HMOS institute save error:",err);const code=err?.code||"unknown-error";m.textContent=`Could not save institute. Error: ${code}`;m.className="form-message show error form-wide";b.disabled=false;b.innerHTML="Update Institute <span>→</span>";});return;}b.disabled=true;b.textContent="Saving…";createInstitute(x,state.authUser.uid).then(created=>{state.institutes=[created,...state.institutes];state.lastCredentials={instituteId:created.instituteId,instituteCode:created.instituteCode,instituteName:created.instituteName,temporaryPassword:created.temporaryPassword,subscriptionEnd:formatDate(created.subscriptionEnd)};writeCache(state.institutes);state.screen="dashboard";render();notify("Institute created successfully.");}).catch(err=>{console.error("HMOS institute create error:",err);const code=err?.code||"unknown-error";m.textContent=`Could not create institute. Error: ${code}`;m.className="form-message show error form-wide";b.disabled=false;b.innerHTML="Save Institute <span>→</span>";});};}


function copyText(value) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
  const area = document.createElement("textarea");
  area.value = value;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  document.execCommand("copy");
  area.remove();
  return Promise.resolve();
}
function futureDate(value, months) {
  const current = dateOf(value);
  const base = current && current > new Date() ? new Date(current) : new Date();
  base.setMonth(base.getMonth() + Number(months || 12));
  return base;
}
function closeModal() {
  document.querySelector("#hmos-modal")?.remove();
  document.body.classList.remove("modal-open");
}
function openModal({ title, eyebrow = "Institute action", content = "", tone = "default", wide = false, onReady }) {
  closeModal();
  document.body.insertAdjacentHTML("beforeend", `<div id="hmos-modal" class="modal-layer" role="presentation">
    <section class="modal-card ${tone === "danger" ? "danger-modal" : ""} ${wide ? "modal-wide" : ""}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal-head"><div><span class="step">${esc(eyebrow)}</span><h3 id="modal-title">${esc(title)}</h3></div><button id="modal-close" class="modal-close" type="button" aria-label="Close">×</button></div>
      <div class="modal-body">${content}</div>
    </section></div>`);
  document.body.classList.add("modal-open");
  const layer = document.querySelector("#hmos-modal");
  layer.onclick = event => { if (event.target === layer) closeModal(); };
  document.querySelector("#modal-close").onclick = closeModal;
  document.addEventListener("keydown", function escapeOnce(event) { if (event.key === "Escape") { closeModal(); document.removeEventListener("keydown", escapeOnce); } });
  onReady?.(layer);
}
function modalMessage(text, type = "error") {
  const el = document.querySelector("#modal-message");
  if (!el) return;
  el.textContent = text;
  el.className = `form-message show ${type === "success" ? "success-message" : "error"}`;
}
function setActionBusy(button, busy, label = "Working…") {
  if (!button) return;
  if (busy) {
    button.dataset.original = button.innerHTML;
    button.disabled = true;
    button.textContent = label;
  } else {
    button.disabled = false;
    button.innerHTML = button.dataset.original || button.innerHTML;
  }
}
function loginText(i, password = "") {
  return `HMOS Institute Login\nInstitute: ${i.instituteName}\nCode: ${i.instituteCode}${password ? `\nTemporary Password: ${password}` : ""}\nPortal: ${location.origin}${location.pathname}`;
}
function showCredentialsModal(i, password) {
  openModal({ title: "New Login Credentials", eyebrow: "Password reset successful", content: `
    <div class="success-panel"><span>Institute</span><strong>${esc(i.instituteName)}</strong></div>
    <div class="credential-modal-grid"><article><span>Institute Code</span><code>${esc(i.instituteCode)}</code></article><article><span>Temporary Password</span><code>${esc(password)}</code></article></div>
    <p class="modal-note">This password is shown now for secure sharing. The institute must change it on first login.</p>
    <div class="modal-actions"><button id="copy-new-login" class="secondary" type="button">Copy Login</button><button id="share-new-login" class="primary" type="button">Share on WhatsApp</button></div>`,
    onReady() {
      document.querySelector("#copy-new-login").onclick = async () => { await copyText(loginText(i, password)); modalMessage("Login details copied.", "success"); };
      document.querySelector("#share-new-login").onclick = () => window.open(`https://wa.me/?text=${encodeURIComponent(loginText(i, password))}`, "_blank", "noopener");
      document.querySelector(".modal-body").insertAdjacentHTML("beforeend", '<p id="modal-message" class="form-message"></p>');
    }
  });
}

function selected(){return state.institutes.find(i=>i.id===state.selectedId);}
function renderManage(){
  const i=selected();
  if(!i){ state.screen="dashboard"; return render(); }
  const s=effectiveStatus(i);
  const ownerContact=[i.ownerPhone,i.ownerEmail].filter(Boolean).map(esc).join(" · ") || "No contact details";
  const locationTitle=i.city ? esc(i.city) : "—";
  const locationSub=i.address ? esc(i.address) : "No address";
  const subscriptionEnd=formatDate(i.subscriptionEnd);
  const subscriptionText=isExpired(i) ? "Expired — renewal required" : "Active plan";

  app.innerHTML=dashboardShell(`
    <div class="manage-page" data-institute-id="${esc(i.id)}">
      <button id="back-dashboard" class="back manage-back" type="button">← Dashboard</button>
      <section class="manage-head">
        <div class="avatar large">${esc((i.instituteName||"H")[0].toUpperCase())}</div>
        <div class="manage-title"><span class="step">Institute management</span><h2>${esc(i.instituteName)}</h2><p>${esc(i.instituteCode)} · ${esc(i.instituteId||i.id)}</p></div>
        <span class="pill ${s}-pill">${s}</span>
      </section>
      <section class="detail-grid" aria-label="Institute details">
        <article><span>Owner</span><strong>${esc(i.ownerName||"—")}</strong><small>${ownerContact}</small></article>
        <article><span>Location</span><strong>${locationTitle}</strong><small>${locationSub}</small></article>
        <article><span>Student Capacity</span><strong>${Number(i.currentStudents||0)} / ${Number(i.studentLimit||0)}</strong><small>Current / Limit</small></article>
        <article><span>Subscription End</span><strong>${subscriptionEnd}</strong><small>${subscriptionText}</small></article>
      </section>
      <section class="action-grid" aria-label="Institute actions">
        <button id="edit" class="action-button" type="button">✏️ <span>Edit Details</span></button>
        <button id="toggle" class="action-button" type="button">${i.status==="active"?"⏸":"▶"} <span>${i.status==="active"?"Deactivate":"Activate"}</span></button>
        <button id="reset" class="action-button" type="button">🔐 <span>Reset Password</span></button>
        <button id="renew" class="action-button" type="button">🔄 <span>Renew Plan</span></button>
        <button id="share" class="action-button" type="button">💬 <span>Share Login</span></button>
        <button id="archive" class="action-button danger-action" type="button">${i.isArchived?"↩":"🗄"} <span>${i.isArchived?"Restore":"Archive"}</span></button>
      </section>
      <p id="manage-msg" class="form-message"></p>
    </div>`);

  bindCommon();
  document.querySelector("#back-dashboard").onclick=()=>{state.screen="dashboard";render();};

  document.querySelector("#edit").onclick=()=>openModal({
    title:`Edit ${i.instituteName}`, eyebrow:"Institute details", wide:true,
    content:`<p class="modal-intro">Update owner, location, hostel type and student capacity.</p>${instituteForm(i)}`,
    onReady(){ bindInstituteForm(i); }
  });

  document.querySelector("#toggle").onclick=()=>{
    const next=i.status==="active"?"inactive":"active";
    openModal({title:`${next==="active"?"Activate":"Deactivate"} Institute`,eyebrow:"Portal access",tone:next==="inactive"?"danger":"default",content:`
      <div class="confirm-icon">${next==="active"?"▶":"⏸"}</div><p class="confirm-copy">${next==="active"?"Institute login access will be restored.":"Institute login will be blocked until you activate it again."}</p>
      <p id="modal-message" class="form-message"></p><div class="modal-actions"><button class="secondary" id="cancel-action" type="button">Cancel</button><button class="primary ${next==="inactive"?"danger-primary":""}" id="confirm-action" type="button">${next==="active"?"Activate":"Deactivate"}</button></div>`,
      onReady(){document.querySelector("#cancel-action").onclick=closeModal;document.querySelector("#confirm-action").onclick=async e=>{const b=e.currentTarget;setActionBusy(b,true,"Updating…");try{await setInstituteStatus(i.id,next,state.authUser.uid);i.status=next;writeCache(state.institutes);closeModal();notify(`Institute ${next}.`);state.screen="dashboard";render();}catch(err){modalMessage("Could not update portal access.");setActionBusy(b,false);}};}
    });
  };

  document.querySelector("#reset").onclick=()=>{
    let password=generateTemporaryPassword();
    openModal({title:"Reset Institute Password",eyebrow:"Security action",content:`
      <p class="modal-intro">Generate a temporary password for <strong>${esc(i.instituteName)}</strong>.</p>
      <label class="field"><span>New Temporary Password</span><div class="input-action"><input id="reset-password-value" value="${esc(password)}"/><button id="regenerate-password" class="mini-button" type="button">Generate</button></div></label>
      <label class="check confirm-check"><input id="password-confirm" type="checkbox"/><span>I understand the old password will stop working immediately.</span></label>
      <p id="modal-message" class="form-message"></p><div class="modal-actions"><button class="secondary" id="cancel-reset" type="button">Cancel</button><button class="primary" id="confirm-reset" type="button">Reset Password</button></div>`,
      onReady(){
        document.querySelector("#cancel-reset").onclick=closeModal;
        document.querySelector("#regenerate-password").onclick=()=>{password=generateTemporaryPassword();document.querySelector("#reset-password-value").value=password;};
        document.querySelector("#confirm-reset").onclick=async e=>{password=document.querySelector("#reset-password-value").value.trim();if(password.length<8)return modalMessage("Password must contain at least 8 characters.");if(!document.querySelector("#password-confirm").checked)return modalMessage("Confirm that the old password will stop working.");const b=e.currentTarget;setActionBusy(b,true,"Resetting…");try{const saved=await resetInstitutePassword(i.id,password,state.authUser.uid);state.lastCredentials={instituteId:i.instituteId,instituteCode:i.instituteCode,instituteName:i.instituteName,temporaryPassword:saved,subscriptionEnd:formatDate(i.subscriptionEnd)};closeModal();showCredentialsModal(i,saved);}catch(err){modalMessage("Could not reset the password.");setActionBusy(b,false);}};
      }
    });
  };

  document.querySelector("#renew").onclick=()=>openModal({title:"Renew Subscription",eyebrow:"Plan renewal",content:`
    <p class="modal-intro">Current end date: <strong>${formatDate(i.subscriptionEnd)}</strong></p>
    <div class="plan-options"><label><input type="radio" name="renew-months" value="6"><span><strong>6 Months</strong><small>Until ${futureDate(i.subscriptionEnd,6).toLocaleDateString("en-IN")}</small></span></label><label class="selected-plan"><input type="radio" name="renew-months" value="12" checked><span><strong>1 Year</strong><small>Until ${futureDate(i.subscriptionEnd,12).toLocaleDateString("en-IN")}</small></span></label><label><input type="radio" name="renew-months" value="24"><span><strong>2 Years</strong><small>Until ${futureDate(i.subscriptionEnd,24).toLocaleDateString("en-IN")}</small></span></label></div>
    <p id="modal-message" class="form-message"></p><div class="modal-actions"><button class="secondary" id="cancel-renew" type="button">Cancel</button><button class="primary" id="confirm-renew" type="button">Renew Subscription</button></div>`,
    onReady(){document.querySelector("#cancel-renew").onclick=closeModal;document.querySelectorAll('input[name="renew-months"]').forEach(r=>r.onchange=()=>{document.querySelectorAll(".plan-options label").forEach(x=>x.classList.remove("selected-plan"));r.closest("label").classList.add("selected-plan");});document.querySelector("#confirm-renew").onclick=async e=>{const months=Number(document.querySelector('input[name="renew-months"]:checked').value);const b=e.currentTarget;setActionBusy(b,true,"Renewing…");try{const end=await renewSubscription(i.id,months,state.authUser.uid);i.subscriptionEnd=end;i.status="active";i.subscriptionStatus="active";writeCache(state.institutes);closeModal();notify(`Subscription renewed until ${end.toLocaleDateString("en-IN")}.`);state.screen="dashboard";render();}catch(err){modalMessage("Could not renew subscription.");setActionBusy(b,false);}};}
  });

  document.querySelector("#share").onclick=()=>{
    const known=state.lastCredentials?.instituteCode===i.instituteCode?state.lastCredentials.temporaryPassword:"";
    const text=loginText(i,known);
    openModal({title:"Share Institute Login",eyebrow:"Login credentials",content:`<div class="credential-modal-grid"><article><span>Institute Code</span><code>${esc(i.instituteCode)}</code></article><article><span>Password</span><code>${known?esc(known):"Hidden for security"}</code></article></div>${known?"":'<p class="modal-note warning-note">The current password cannot be recovered. Reset it first to share a new password.</p>'}<p id="modal-message" class="form-message"></p><div class="modal-actions"><button id="copy-login-modal" class="secondary" type="button">Copy Details</button><button id="whatsapp-login-modal" class="primary" type="button">WhatsApp</button></div>`,onReady(){document.querySelector("#copy-login-modal").onclick=async()=>{await copyText(text);modalMessage("Login details copied.","success");};document.querySelector("#whatsapp-login-modal").onclick=()=>window.open(`https://wa.me/?text=${encodeURIComponent(text)}`,"_blank","noopener");}});
  };

  document.querySelector("#archive").onclick=()=>{
    const restoring=Boolean(i.isArchived);
    openModal({title:restoring?"Restore Institute":"Archive Institute",eyebrow:"Institute lifecycle",tone:restoring?"default":"danger",content:`<div class="confirm-icon">${restoring?"↩":"🗄"}</div><p class="confirm-copy">${restoring?"The institute will return to active status and portal access will be restored.":"The institute will be hidden from active operations and its login will be blocked. Data will not be permanently deleted."}</p>${restoring?"":`<label class="field"><span>Type ARCHIVE to confirm</span><input id="archive-word" autocomplete="off" placeholder="ARCHIVE"/></label>`}<p id="modal-message" class="form-message"></p><div class="modal-actions"><button class="secondary" id="cancel-archive" type="button">Cancel</button><button class="primary ${restoring?"":"danger-primary"}" id="confirm-archive" type="button">${restoring?"Restore":"Archive"}</button></div>`,onReady(){document.querySelector("#cancel-archive").onclick=closeModal;document.querySelector("#confirm-archive").onclick=async e=>{if(!restoring&&document.querySelector("#archive-word").value.trim().toUpperCase()!=="ARCHIVE")return modalMessage("Type ARCHIVE to continue.");const b=e.currentTarget;setActionBusy(b,true,restoring?"Restoring…":"Archiving…");try{if(restoring){await restoreInstitute(i.id,state.authUser.uid);i.isArchived=false;i.status="active";}else{await archiveInstitute(i.id,state.authUser.uid);i.isArchived=true;i.status="inactive";}writeCache(state.institutes);closeModal();notify(i.isArchived?"Institute archived safely.":"Institute restored successfully.");state.screen="dashboard";render();}catch(err){modalMessage(restoring?"Could not restore institute.":"Could not archive institute.");setActionBusy(b,false);}};}});
  };
}
function renderEdit(){const i=selected();if(!i){state.screen="dashboard";return render();}app.innerHTML=dashboardShell(`<button id="back-manage" class="back">← Manage Institute</button><div class="card-heading"><span class="step">Edit institute</span><h2>${esc(i.instituteName)}</h2><p>Update owner, location and capacity details.</p></div>${instituteForm(i)}`);bindCommon();document.querySelector("#back-manage").onclick=()=>{state.screen="manage";render();};bindInstituteForm(i);}

function render(){if(state.screen==="super-admin")return renderSuperAdmin();if(state.screen==="institute-password-change")return renderInstitutePasswordChange();if(state.screen==="dashboard")return renderAdminDashboard();if(state.screen==="create")return renderCreate();if(state.screen==="manage")return renderManage();if(state.screen==="institute-portal")return renderInstitutePortal();return renderInstituteLogin();}

watchAuth(async user=>{state.authUser=user;if(!user){if(["dashboard","create","manage"].includes(state.screen))state.screen="super-admin";render();return;}if(user.email?.toLowerCase()!==SUPER_ADMIN_EMAIL){await logoutCurrentUser();return renderSuperAdmin("This email is not authorized as HMOS Super Admin.");}state.institutes=readCache();state.screen="dashboard";render();try{state.institutes=await listInstitutes();writeCache(state.institutes);if(state.screen==="dashboard")renderAdminDashboard();}catch(err){console.error(err);}});
const restoredInstitute=restoreInstituteSession();
if(restoredInstitute){
  state.instituteSession=restoredInstitute;
  state.screen="institute-portal";
  validateInstituteSession(restoredInstitute.instituteCode).then(fresh=>{state.instituteSession=fresh;saveInstituteSession(fresh,true);if(state.screen==="institute-portal")renderInstitutePortal();}).catch(err=>{clearInstituteSession();state.instituteSession=null;if(state.screen==="institute-portal"){state.screen="institute";renderInstituteLogin(err.code==="subscription-expired"?"Subscription expired. Contact HMOS support.":"Saved institute session expired. Please login again.");}});
}
let deferredInstallPrompt = null;
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
function ensureInstallButton() {
  let button = document.querySelector("#pwa-install-button");
  if (!button) {
    button = document.createElement("button");
    button.id = "pwa-install-button";
    button.className = "pwa-install-button";
    button.type = "button";
    button.innerHTML = "⬇ Install HMOS";
    document.body.appendChild(button);
  }
  button.hidden = isStandalone();
  button.onclick = async () => {
    if (isStandalone()) {
      button.hidden = true;
      return;
    }
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice.catch(() => null);
      if (choice?.outcome === "accepted") button.hidden = true;
      deferredInstallPrompt = null;
      return;
    }
    alert("Chrome menu (⋮) open చేసి ‘Install app’ నొక్కండి. ‘Create shortcut’ మాత్రమే కనిపిస్తే pageని పూర్తిగా close చేసి మళ్లీ open చేయండి; కొత్త PWA files deploy అయిన తర్వాత ‘Install app’ కనిపిస్తుంది.");
  };
  return button;
}
window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  ensureInstallButton().hidden = false;
});
window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  const button = document.querySelector("#pwa-install-button");
  if (button) button.hidden = true;
});
window.matchMedia("(display-mode: standalone)").addEventListener?.("change", () => ensureInstallButton());
ensureInstallButton();
if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./service-worker-v2.7.1.js", { scope: "./", updateViaCache: "none" }).catch(()=>{}));
