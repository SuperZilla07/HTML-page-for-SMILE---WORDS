import "./styles.css";
import {
  acceptContact,
  hasFirebaseConfig,
  requestContact,
  sendGlobalMessage,
  sendPrivateMessage,
  signInEmail,
  signInGoogle,
  signOutUser,
  registerEmail,
  upsertUserProfile,
  watchAuth,
  watchContacts,
  watchGlobalMessages,
  watchIncomingRequests,
  watchPrivateMessages
} from "./lib/firebase.js";
import {
  cactusImageUrl,
  decodeMessage,
  encodeText,
  makeLocalStructureSvg,
  pubChemImageUrl
} from "./lib/vcmc.js";

const demoEmail = import.meta.env.VITE_DEMO_EMAIL || "demo@vcmc.app";
const demoPassword = import.meta.env.VITE_DEMO_PASSWORD || "demo123456";

let currentUser = null;
let activeRoom = { type: "global", id: "global", title: "Global room" };
let unsubscribeMessages = null;
let unsubscribeContacts = null;
let unsubscribeRequests = null;
let contacts = [];
let requests = [];
let messages = [];

const app = document.querySelector("#app");

app.innerHTML = `
  <main class="shell">
    <section class="hero">
      <div>
        <div class="eyebrow"><span class="beta">Beta</span><span>VCMC molecular messenger</span></div>
        <h1>Send words as molecules.</h1>
        <p>Messages are stored as VCMC SMILES, rendered as molecular cards, and decoded client-side when tapped.</p>
      </div>
      <div class="demo-card">
        <span>Demo credentials</span>
        <strong>${escapeHtml(demoEmail)}</strong>
        <code>${escapeHtml(demoPassword)}</code>
        <button type="button" id="fill-demo">Use demo</button>
      </div>
    </section>

    <section class="app-grid">
      <aside class="panel auth-panel">
        <div class="panel-head">
          <h2>Access</h2>
          <span id="auth-state" class="state-pill">Disconnected</span>
        </div>
        <div id="config-warning" class="warning" hidden>
          Firebase env vars are missing. Add them in Vercel or a local <code>.env</code> file.
        </div>
        <form id="auth-form" class="auth-form">
          <label>Name <input id="display-name" autocomplete="name" placeholder="Only needed for register"></label>
          <label>Email <input id="email" autocomplete="email" value="${escapeHtml(demoEmail)}"></label>
          <label>Password <input id="password" type="password" autocomplete="current-password" value="${escapeHtml(demoPassword)}"></label>
          <div class="button-row">
            <button class="primary" type="submit" data-mode="signin">Sign in</button>
            <button class="secondary" type="button" id="register-button">Register</button>
          </div>
        </form>
        <button class="google-button" type="button" id="google-button">Continue with Google</button>
        <button class="ghost-button" type="button" id="signout-button" hidden>Sign out</button>

        <div class="identity-card" id="identity-card" hidden></div>

        <div class="divider"></div>
        <div class="panel-head compact">
          <h2>Rooms</h2>
        </div>
        <button class="room-button active" id="global-room-button" type="button">
          <span class="room-dot global"></span>
          <span>Global chatroom</span>
        </button>
        <div id="private-rooms" class="private-rooms"></div>

        <div class="divider"></div>
        <form id="friend-form" class="friend-form">
          <label>Add by email <input id="friend-email" type="email" placeholder="friend@example.com"></label>
          <button class="secondary full" type="submit">Send request</button>
        </form>
        <div id="request-list" class="request-list"></div>
      </aside>

      <section class="panel chat-panel">
        <div class="chat-head">
          <div>
            <span class="room-kicker">Live room</span>
            <h2 id="room-title">Global room</h2>
          </div>
          <span id="room-count" class="state-pill">0 messages</span>
        </div>
        <div id="message-list" class="message-list">
          <div class="empty">Sign in to load live messages.</div>
        </div>
        <form id="message-form" class="composer">
          <textarea id="message-input" placeholder="Type a word or sentence. It will be stored as SMILES only." rows="2"></textarea>
          <button class="primary send-button" type="submit">Send</button>
        </form>
      </section>

      <aside class="panel decode-panel">
        <div class="panel-head">
          <h2>Decoder</h2>
        </div>
        <p class="small-copy">Tap any molecular message to decode it here. Plain text is reconstructed locally from SMILES.</p>
        <div id="decode-output" class="decode-output">
          <span>No message selected.</span>
        </div>
        <div class="rule-card">
          <strong>Storage model</strong>
          <p>Realtime Database stores sender metadata, timestamp, and an array of SMILES words. The original phrase is not written to the database.</p>
        </div>
      </aside>
    </section>
  </main>
`;

bindEvents();
setFirebaseState();

watchAuth(async (user) => {
  currentUser = user;
  if (user) {
    await upsertUserProfile(user);
  }
  renderAuth();
  attachRealtimeListeners();
});

function bindEvents() {
  document.querySelector("#fill-demo").addEventListener("click", () => {
    document.querySelector("#email").value = demoEmail;
    document.querySelector("#password").value = demoPassword;
  });

  document.querySelector("#auth-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    await withStatus(async () => {
      const email = fieldValue("#email");
      const password = fieldValue("#password");
      await signInEmail(email, password);
    });
  });

  document.querySelector("#register-button").addEventListener("click", async () => {
    await withStatus(async () => {
      const email = fieldValue("#email");
      const password = fieldValue("#password");
      const displayName = fieldValue("#display-name");
      await registerEmail(email, password, displayName);
    });
  });

  document.querySelector("#google-button").addEventListener("click", async () => {
    await withStatus(() => signInGoogle());
  });

  document.querySelector("#signout-button").addEventListener("click", () => signOutUser());

  document.querySelector("#global-room-button").addEventListener("click", () => {
    activeRoom = { type: "global", id: "global", title: "Global room" };
    attachMessageListener();
    renderRooms();
  });

  document.querySelector("#friend-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!currentUser) return flash("Sign in before adding contacts.");
    await withStatus(async () => {
      await requestContact(currentUser, fieldValue("#friend-email"));
      document.querySelector("#friend-email").value = "";
      flash("Request sent.");
    });
  });

  document.querySelector("#message-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!currentUser) return flash("Sign in first.");
    const text = fieldValue("#message-input");
    const encodedWords = encodeText(text);
    if (!encodedWords.length) return flash("Type at least one alphabetic word.");

    await withStatus(async () => {
      if (activeRoom.type === "global") {
        await sendGlobalMessage(currentUser, encodedWords);
      } else {
        await sendPrivateMessage(activeRoom.id, currentUser, encodedWords);
      }
      document.querySelector("#message-input").value = "";
    });
  });
}

function setFirebaseState() {
  document.querySelector("#config-warning").hidden = hasFirebaseConfig;
  document.querySelectorAll("button, input, textarea").forEach((element) => {
    if (!hasFirebaseConfig && !element.id.includes("fill-demo")) element.disabled = true;
  });
}

function attachRealtimeListeners() {
  unsubscribeMessages?.();
  unsubscribeContacts?.();
  unsubscribeRequests?.();

  if (!currentUser || !hasFirebaseConfig) {
    messages = [];
    contacts = [];
    requests = [];
    renderMessages();
    renderRooms();
    renderRequests();
    return;
  }

  attachMessageListener();
  unsubscribeContacts = watchContacts(currentUser.uid, (items) => {
    contacts = items;
    renderRooms();
  });
  unsubscribeRequests = watchIncomingRequests(currentUser.uid, (items) => {
    requests = items;
    renderRequests();
  });
}

function attachMessageListener() {
  unsubscribeMessages?.();
  if (!currentUser || !hasFirebaseConfig) return;
  if (activeRoom.type === "global") {
    unsubscribeMessages = watchGlobalMessages((items) => {
      messages = items;
      renderMessages();
    });
  } else {
    unsubscribeMessages = watchPrivateMessages(activeRoom.id, (items) => {
      messages = items;
      renderMessages();
    });
  }
  document.querySelector("#room-title").textContent = activeRoom.title;
  renderMessages();
}

function renderAuth() {
  const signedIn = Boolean(currentUser);
  document.querySelector("#auth-state").textContent = signedIn ? "Connected" : "Disconnected";
  document.querySelector("#auth-state").classList.toggle("online", signedIn);
  document.querySelector("#auth-form").hidden = signedIn;
  document.querySelector("#google-button").hidden = signedIn;
  document.querySelector("#signout-button").hidden = !signedIn;
  document.querySelector("#friend-form").hidden = !signedIn;

  const card = document.querySelector("#identity-card");
  card.hidden = !signedIn;
  if (signedIn) {
    card.innerHTML = `
      <div class="avatar">${escapeHtml(initials(currentUser.displayName || currentUser.email || "U"))}</div>
      <div>
        <strong>${escapeHtml(currentUser.displayName || "VCMC user")}</strong>
        <span>${escapeHtml(currentUser.email || "")}</span>
      </div>
    `;
  }
}

function renderRooms() {
  document.querySelector("#global-room-button").classList.toggle("active", activeRoom.type === "global");
  const wrapper = document.querySelector("#private-rooms");
  const activeContacts = contacts.filter((contact) => contact.status === "active");
  wrapper.innerHTML = activeContacts.length
    ? activeContacts.map((contact) => `
        <button class="room-button ${activeRoom.id === contact.roomId ? "active" : ""}" data-room-id="${escapeHtml(contact.roomId)}" data-title="${escapeHtml(contact.displayName || contact.email || "Private room")}" type="button">
          <span class="room-dot private"></span>
          <span>${escapeHtml(contact.displayName || contact.email || "Private room")}</span>
        </button>
      `).join("")
    : `<div class="small-copy muted">No private rooms yet.</div>`;

  wrapper.querySelectorAll("[data-room-id]").forEach((button) => {
    button.addEventListener("click", () => {
      activeRoom = {
        type: "private",
        id: button.dataset.roomId,
        title: button.dataset.title
      };
      attachMessageListener();
      renderRooms();
    });
  });
}

function renderRequests() {
  const wrapper = document.querySelector("#request-list");
  if (!currentUser) {
    wrapper.innerHTML = "";
    return;
  }
  wrapper.innerHTML = requests.length
    ? requests.map((request) => `
        <div class="request-card">
          <span>${escapeHtml(request.displayName || request.fromName || request.email || "New contact")}</span>
          <button type="button" data-accept="${escapeHtml(request.fromUid)}">Accept</button>
        </div>
      `).join("")
    : `<div class="small-copy muted">No incoming requests.</div>`;

  wrapper.querySelectorAll("[data-accept]").forEach((button) => {
    button.addEventListener("click", async () => {
      await withStatus(() => acceptContact(currentUser, button.dataset.accept));
    });
  });
}

function renderMessages() {
  document.querySelector("#room-title").textContent = activeRoom.title;
  document.querySelector("#room-count").textContent = `${messages.length} message${messages.length === 1 ? "" : "s"}`;
  const list = document.querySelector("#message-list");
  if (!currentUser) {
    list.innerHTML = `<div class="empty">Sign in to load live messages.</div>`;
    return;
  }
  if (!messages.length) {
    list.innerHTML = `<div class="empty">No messages in this room yet.</div>`;
    return;
  }

  list.innerHTML = messages.map((message) => {
    const own = message.uid === currentUser.uid;
    const decoded = decodeMessage(message.encodedWords || []);
    return `
      <article class="message ${own ? "own" : ""}" data-message-id="${escapeHtml(message.id)}" data-decoded="${escapeHtml(decoded)}">
        <div class="message-meta">
          <strong>${escapeHtml(message.author || "VCMC user")}</strong>
          <span>${formatTime(message.createdAt)}</span>
        </div>
        <div class="molecule-row">
          ${(message.encodedWords || []).map(renderMoleculeCard).join("")}
        </div>
      </article>
    `;
  }).join("");

  list.querySelectorAll(".message").forEach((element) => {
    element.addEventListener("click", () => {
      document.querySelector("#decode-output").innerHTML = `
        <strong>${escapeHtml(element.dataset.decoded || "No decoded text")}</strong>
        <span>Decoded locally from this message's SMILES payload.</span>
      `;
    });
  });
  list.scrollTop = list.scrollHeight;
}

function renderMoleculeCard(encodedWord) {
  const fallback = makeLocalStructureSvg(encodedWord);
  return `
    <div class="molecule-card">
      <img src="${escapeHtml(pubChemImageUrl(encodedWord.smiles))}"
           data-cactus="${escapeHtml(cactusImageUrl(encodedWord.smiles))}"
           data-fallback="${escapeHtml(fallback)}"
           alt="Molecule from VCMC SMILES"
           loading="lazy">
      <code>${escapeHtml(encodedWord.smiles)}</code>
    </div>
  `;
}

window.addEventListener("error", (event) => {
  const target = event.target;
  if (target?.matches?.(".molecule-card img")) {
    if (!target.dataset.triedCactus) {
      target.dataset.triedCactus = "1";
      target.src = target.dataset.cactus;
    } else {
      target.src = target.dataset.fallback;
    }
  }
}, true);

async function withStatus(action) {
  try {
    await action();
  } catch (error) {
    flash(error.message || "Something went wrong.");
  }
}

function flash(message) {
  const output = document.querySelector("#decode-output");
  output.innerHTML = `<span>${escapeHtml(message)}</span>`;
}

function fieldValue(selector) {
  return document.querySelector(selector).value.trim();
}

function initials(value) {
  return value
    .split(/\s+|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

function formatTime(timestamp) {
  if (!timestamp || typeof timestamp !== "number") return "sending";
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
