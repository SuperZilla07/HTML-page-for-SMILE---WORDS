// Minimal SMILE Chat app
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signInAnonymously,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import {
  getDatabase,
  ref,
  set,
  push,
  onChildAdded,
  onValue,
  get
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";

// TODO: replace with your Firebase project's config
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  databaseURL: "YOUR_DATABASE_URL",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// DOM
const landing = document.getElementById('landing');
const chat = document.getElementById('chat');
const demoBtn = document.getElementById('demo-signin');
const authArea = document.getElementById('auth-area');
const meInfo = document.getElementById('me-info');
const usersList = document.getElementById('users-list');
const addUserInput = document.getElementById('add-user-input');
const addUserBtn = document.getElementById('add-user-btn');
const signoutBtn = document.getElementById('signout');
const globalRoomBtn = document.getElementById('global-room');
const messagesEl = document.getElementById('messages');
const sendForm = document.getElementById('send-form');
const messageInput = document.getElementById('message-input');
const roomTitle = document.getElementById('room-title');

let currentUser = null;
let currentRoom = 'global';

// small SMILES pool to map messages deterministically to molecules
const SMILES_POOL = [
  'CCO', 'c1ccccc1', 'CC(=O)O', 'C1CCCCC1', 'O=C=O', 'C', 'N', 'CCN', 'CCOCC', 'C#N'
];

function textToSmiles(text) {
  // deterministic mapping: simple hash -> index
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return SMILES_POOL[h % SMILES_POOL.length];
}

function renderMessage(msg) {
  const wrap = document.createElement('div');
  wrap.className = 'message';
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = `${msg.senderName || 'Anon'} • ${new Date(msg.ts || Date.now()).toLocaleTimeString()}`;
  wrap.appendChild(meta);

  const svgHolder = document.createElement('div');
  svgHolder.className = 'molecule';
  wrap.appendChild(svgHolder);

  // draw smiles using SmilesDrawer
  try {
    const drawer = new SmilesDrawer.Drawer({ width: 240, height: 160 });
    SmilesDrawer.parse(msg.smiles, function(tree) {
      drawer.draw(tree, svgHolder, 'light', false);
    }, function(err) {
      svgHolder.textContent = msg.smiles;
    });
  } catch (e) {
    svgHolder.textContent = msg.smiles;
  }

  const reveal = document.createElement('button');
  reveal.className = 'reveal';
  reveal.textContent = 'Tap to decode';
  let decoded = false;
  reveal.addEventListener('click', () => {
    if (!decoded) {
      const plain = document.createElement('div');
      plain.className = 'decoded';
      plain.textContent = msg.text;
      wrap.appendChild(plain);
      reveal.textContent = 'Hide';
      decoded = true;
    } else {
      const d = wrap.querySelector('.decoded');
      if (d) d.remove();
      reveal.textContent = 'Tap to decode';
      decoded = false;
    }
  });
  wrap.appendChild(reveal);

  messagesEl.appendChild(wrap);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function clearMessages() { messagesEl.innerHTML = ''; }

async function startListening(roomId) {
  currentRoom = roomId;
  roomTitle.textContent = roomId === 'global' ? 'Global' : `Private: ${roomId}`;
  clearMessages();
  const roomRef = ref(db, `rooms/${roomId}/messages`);
  onChildAdded(roomRef, snapshot => {
    const msg = snapshot.val();
    renderMessage(msg);
  });
}

async function sendMessage(text) {
  if (!currentUser) return alert('Sign in first');
  if (!text) return;
  const smiles = textToSmiles(text);
  const msg = {
    senderUid: currentUser.uid,
    senderName: currentUser.displayName || currentUser.uid.slice(0,6),
    text,
    smiles,
    ts: Date.now()
  };
  await push(ref(db, `rooms/${currentRoom}/messages`), msg);
}

// auth handlers
demoBtn.addEventListener('click', async () => {
  try {
    const cred = await signInAnonymously(auth);
  } catch (e) { console.error(e); }
});

globalRoomBtn.addEventListener('click', () => startListening('global'));

addUserBtn.addEventListener('click', async () => {
  const v = addUserInput.value.trim();
  if (!v) return;
  // try to find user by uid or email
  let targetUid = v;
  // if email, try to find in /users
  if (v.includes('@')) {
    const usersRef = ref(db, 'users');
    onValue(usersRef, snap => {
      const users = snap.val() || {};
      for (const uid in users) {
        if (users[uid].email === v) {
          targetUid = uid;
        }
      }
      if (targetUid) {
        const ids = [currentUser.uid, targetUid].sort();
        const roomId = `p_${ids[0]}_${ids[1]}`;
        startListening(roomId);
      }
    }, { onlyOnce: true });
  } else {
    const ids = [currentUser.uid, targetUid].sort();
    const roomId = `p_${ids[0]}_${ids[1]}`;
    startListening(roomId);
  }
});

sendForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const t = messageInput.value.trim();
  if (!t) return;
  await sendMessage(t);
  messageInput.value = '';
});

signoutBtn.addEventListener('click', async () => {
  await signOut(auth);
});

// on auth state change
onAuthStateChanged(auth, async user => {
  currentUser = user;
  if (user) {
    landing.classList.add('hidden');
    chat.classList.remove('hidden');
    meInfo.textContent = `You: ${user.displayName || user.uid.slice(0,6)}`;
    // write user to DB
    set(ref(db, `users/${user.uid}`), {
      uid: user.uid,
      displayName: user.displayName || null,
      email: user.email || null
    });
    startListening('global');
  } else {
    landing.classList.remove('hidden');
    chat.classList.add('hidden');
    currentUser = null;
  }
});

// small helper to populate users list
onValue(ref(db, 'users'), snap => {
  const users = snap.val() || {};
  usersList.innerHTML = '';
  for (const uid in users) {
    const u = users[uid];
    const item = document.createElement('div');
    item.className = 'user-item';
    item.textContent = `${u.displayName || uid.slice(0,6)} ${u.email ? '(' + u.email + ')' : ''}`;
    const addBtn = document.createElement('button');
    addBtn.textContent = 'Add';
    addBtn.addEventListener('click', () => {
      addUserInput.value = uid;
    });
    item.appendChild(addBtn);
    usersList.appendChild(item);
  }
});
