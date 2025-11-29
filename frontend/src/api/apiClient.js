// Lightweight API client replacing prior vendor SDK. No external auth provider dependency.

const API_BASE_URL = (typeof globalThis !== 'undefined' && globalThis['__API_BASE_URL__']) || 'http://localhost:5000';

const jsonHeaders = { 'Content-Type': 'application/json' };

const safeJson = async (resp) => { try { return await resp.json(); } catch { return null; } };

async function request(method, path, body, headers = {}) {
  const init = { method, headers: { ...jsonHeaders, ...headers } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const resp = await fetch(`${API_BASE_URL}${path}`, init);
  if (!resp.ok) {
    const msg = await safeJson(resp);
    throw new Error(msg?.message || `Request failed: ${resp.status}`);
  }
  return await safeJson(resp);
}

const get = (p) => request('GET', p);
const post = (p, b) => request('POST', p, b);
const patchReq = (p, b) => request('PATCH', p, b);
const del = (p) => request('DELETE', p);

// Map entity model name -> backend route
const entityToPath = {
  User: '/api/users',
  UserProfile: '/api/user-profiles',
  FriendRequest: '/api/friend-requests',
  Notification: '/api/notifications',
  Tournament: '/api/tournaments',
  TournamentRegistration: '/api/tournament-registrations',
  GDRoom: '/api/gd-rooms',
  DebateRoom: '/api/debate-rooms',
  GDSession: '/api/gd-sessions',
  ExtemporeSession: '/api/extempore-sessions',
  AIInterview: '/api/ai-interviews',
  ChatMessage: '/api/chat-messages',
  ExtemporeTopic: '/api/extempore-topics',
};

const makeEntity = (path) => ({
  async list(sort, limit) {
    const params = new URLSearchParams();
    if (sort) params.set('sort', sort === '-created_date' ? '-createdAt' : (sort === 'created_date' ? 'createdAt' : String(sort)));
    if (limit) params.set('limit', String(limit));
    const url = `${path}${params.toString() ? `?${params.toString()}` : ''}`;
    const data = await get(url);
    return Array.isArray(data) ? data : (data ? [data] : []);
  },
  async filter(query = {}, sort, limit) {
    // If filtering by id, hit /:id directly
    const q = query || {};
    if (q && typeof q === 'object' && Object.keys(q).length === 1 && (q['id'] || q['_id'])) {
      const id = q['id'] || q['_id'];
      const item = await get(`${path}/${id}`);
      return item ? [item] : [];
    }
    const hasNested = Object.values(q).some(v => typeof v === 'object' && v !== null);
    if (hasNested) {
      const all = await get(path);
      return (all || []).filter(item => {
        return Object.entries(q).every(([k, v]) => {
          const val = item?.[k];
          if (v && typeof v === 'object') {
            if (Array.isArray(v.$in)) return v.$in.includes(val);
          }
          return val === v;
        });
      });
    }
    const params = new URLSearchParams(Object.entries(q).map(([k, v]) => [k, String(v)]));
    if (sort) params.set('sort', sort === '-created_date' ? '-createdAt' : (sort === 'created_date' ? 'createdAt' : String(sort)));
    if (limit) params.set('limit', String(limit));
    const data = await get(`${path}${params.toString() ? `?${params.toString()}` : ''}`);
    return Array.isArray(data) ? data : (data ? [data] : []);
  },
  async create(data) { return post(path, data); },
  async update(id, patch) { return patchReq(`${path}/${id}`, patch); },
  async delete(id) { return del(`${path}/${id}`); },
});

const entities = {
  User: makeEntity(entityToPath.User),
  UserProfile: makeEntity(entityToPath.UserProfile),
  FriendRequest: makeEntity(entityToPath.FriendRequest),
  Notification: makeEntity(entityToPath.Notification),
  Tournament: makeEntity(entityToPath.Tournament),
  TournamentRegistration: makeEntity(entityToPath.TournamentRegistration),
  GDRoom: makeEntity(entityToPath.GDRoom),
  DebateRoom: makeEntity(entityToPath.DebateRoom),
  GDSession: makeEntity(entityToPath.GDSession),
  ExtemporeSession: makeEntity(entityToPath.ExtemporeSession),
  AIInterview: makeEntity(entityToPath.AIInterview),
  ChatMessage: makeEntity(entityToPath.ChatMessage),
  ExtemporeTopic: makeEntity(entityToPath.ExtemporeTopic),
};

function ensureGuest() {
  try {
    const existing = localStorage.getItem('app_guest_user');
    if (existing) return JSON.parse(existing);
  } catch {}
  const guest = { id: 'guest', email: 'guest@example.com', full_name: 'Guest User' };
  try { localStorage.setItem('app_guest_user', JSON.stringify(guest)); } catch {}
  return guest;
}

const auth = {
  async me() { return ensureGuest(); },
  logout(redirectUrl) {
    try { localStorage.removeItem('app_guest_user'); } catch {}
    if (redirectUrl) window.location.href = redirectUrl;
  },
  redirectToLogin(url) { if (url) window.location.href = url; },
};

const appLogs = {
  async logUserInApp(pageName) {
    try {
      const key = 'app_logs';
      const logs = JSON.parse(localStorage.getItem(key) || '[]');
      logs.push({ page: pageName, ts: Date.now() });
      localStorage.setItem(key, JSON.stringify(logs));
    } catch {}
    return { success: true };
  },
};

const integrations = {
  Core: {
    async InvokeLLM(args) {
      const prompt = args && args.prompt;
      const response_json_schema = args && args.response_json_schema;
      const props = response_json_schema?.properties || {};
      const keys = Object.keys(props);
      if (keys.includes('message') && keys.includes('question')) {
        return { message: "Hello! Let's begin your interview.", question: 'Tell me about yourself.' };
      }
      if (keys.includes('feedback') && keys.includes('next_question')) {
        return { feedback: 'Thanks, that was a clear response.', next_question: "What's a challenging problem you've solved recently?" };
      }
      if (keys.includes('response')) {
        return { response: 'Welcome! Please introduce yourself and share your background briefly.' };
      }
      return { content: `LLM is not connected. Stub for prompt: ${String(prompt || '').slice(0, 80)}...` };
    },
    async SendEmail(_payload) { return { success: true }; },
    async SendSMS(_payload) { return { success: true }; },
    async UploadFile(_payload) { return { success: true }; },
    async GenerateImage(_payload) { return { success: true }; },
    async ExtractDataFromUploadedFile(_payload) { return { success: true }; },
  }
};

export const api = { auth, entities, appLogs, integrations };
