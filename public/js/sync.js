// Cloud save client. The game is local-first: localStorage is always the working copy,
// the server only keeps the latest accepted save per account.

const TOKEN_KEY = "r2r.session";
const EMAIL_KEY = "r2r.email";

const store = {
  get(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      if (v == null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      /* private mode: cloud sync just won't survive a reload */
    }
  },
};

export const session = {
  get token() {
    return store.get(TOKEN_KEY);
  },
  get email() {
    return store.get(EMAIL_KEY);
  },
  signIn(token, email) {
    store.set(TOKEN_KEY, token);
    store.set(EMAIL_KEY, email);
  },
  signOut() {
    store.set(TOKEN_KEY, null);
    store.set(EMAIL_KEY, null);
  },
};

async function api(path, { method = "GET", body, keepalive } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (session.token) headers.Authorization = `Bearer ${session.token}`;
  const res = await fetch(`/api/${path}`, { method, headers, body: body && JSON.stringify(body), keepalive });
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (res.status === 401) session.signOut();
  return { ok: res.ok, status: res.status, data };
}

export const requestLink = (email) => api("login", { method: "POST", body: { email } });

export async function verifyLink(token) {
  const r = await api("verify", { method: "POST", body: { token } });
  if (r.ok) session.signIn(r.data.session, r.data.email);
  return r;
}

// Account codes: sign in without an email. The code is only ever shown once by the server.
export async function createCode() {
  const r = await api("code/new", { method: "POST" });
  if (r.ok) session.signIn(r.data.session, null);
  return r;
}

export async function codeLogin(code) {
  const r = await api("code/login", { method: "POST", body: { code } });
  if (r.ok) session.signIn(r.data.session, r.data.email);
  return r;
}

export const rotateCode = () => api("code/rotate", { method: "POST" });
export const me = () => api("me");

export const fetchCloud = () => api("save");

/** force: overwrite a cloud save that has more all-time rows (the player chose this one). */
export const pushSave = (state, { force = false, keepalive = false } = {}) => api("save", { method: "PUT", body: { save: state, force }, keepalive });

export async function signOut() {
  await api("logout", { method: "POST" });
  session.signOut();
}

export async function deleteAccount() {
  const r = await api("account", { method: "DELETE" });
  if (r.ok) session.signOut();
  return r;
}
