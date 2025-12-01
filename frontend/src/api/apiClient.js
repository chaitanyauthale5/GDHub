// Lightweight API client replacing prior vendor SDK. No external auth provider dependency.

const inferBase = () => {
  try {
    const proto = window.location.protocol.startsWith('https') ? 'https' : 'http';
    const host = window.location.hostname || 'localhost';
    const port = '5000';
    return `${proto}://${host}:${port}`;
  } catch {
    return 'http://localhost:5000';
  }
};
const API_BASE_URL = (typeof globalThis !== 'undefined' && globalThis['__API_BASE_URL__']) || inferBase();

const jsonHeaders = { 'Content-Type': 'application/json' };

const safeJson = async (resp) => { try { return await resp.json(); } catch { return null; } };

/**
 * Makes a request to the API.
 * 
 * @param {string} method - The HTTP method to use.
 * @param {string} path - The path to the API endpoint.
 * @param {object} [body] - The request body.
 * @param {object} [headers] - Additional headers to include in the request.
 * @returns {Promise<object>} The response data.
 */
async function request(method, path, body, headers = {}) {
  /** @type {RequestInit} */
  const init = { method, headers: { ...jsonHeaders, ...headers }, credentials: 'include' };
  if (body !== undefined) init.body = JSON.stringify(body);
  const resp = await fetch(`${API_BASE_URL}${path}`, init);
  if (!resp.ok) {
    const msg = await safeJson(resp);
    const error = new Error(msg?.message || `Request failed: ${resp.status}`);
    // Attach status so callers can distinguish 401, 403, etc.
    error['status'] = resp.status;
    throw error;
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
  GDTranscript: '/api/gd-transcripts',
  DebateRoom: '/api/debate-rooms',
  GDSession: '/api/gd-sessions',
  ExtemporeSession: '/api/extempore-sessions',
  AIInterview: '/api/ai-interviews',
  AIInterviewSession: '/api/ai-interview-sessions',
  ChatMessage: '/api/chat-messages',
  ExtemporeTopic: '/api/extempore-topics',
  SoloPracticeSession: '/api/solo-practice-sessions',
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
  GDTranscript: makeEntity(entityToPath.GDTranscript),
  DebateRoom: makeEntity(entityToPath.DebateRoom),
  GDSession: makeEntity(entityToPath.GDSession),
  ExtemporeSession: makeEntity(entityToPath.ExtemporeSession),
  AIInterview: makeEntity(entityToPath.AIInterview),
  AIInterviewSession: makeEntity(entityToPath.AIInterviewSession),
  ChatMessage: makeEntity(entityToPath.ChatMessage),
  ExtemporeTopic: makeEntity(entityToPath.ExtemporeTopic),
  SoloPracticeSession: makeEntity(entityToPath.SoloPracticeSession),
};

function ensureGuest() {
  try {
    const existing = localStorage.getItem('app_guest_user');
    if (existing) return JSON.parse(existing);
  } catch { }
  const guest = { id: 'guest', email: 'guest@example.com', full_name: 'Guest User' };
  try { localStorage.setItem('app_guest_user', JSON.stringify(guest)); } catch { }
  return guest;
}

const auth = {
  async me() {
    try {
      return await get('/api/auth/me');
    } catch (error) {
      // If not logged in, backend returns 401. Represent this as null instead of throwing.
      if (error && Number(error['status']) === 401) return null;
      throw error;
    }
  },
  async login({ email, password }) {
    return post('/api/auth/login', { email, password });
  },
  async register({ email, password, full_name }) {
    return post('/api/auth/register', { email, password, full_name });
  },
  async logout(redirectUrl) {
    try {
      await post('/api/auth/logout', {});
    } catch {
      // ignore logout errors
    }
    try { localStorage.removeItem('app_guest_user'); } catch { }
    if (redirectUrl) window.location.href = redirectUrl;
  },
  redirectToLogin() {
    window.location.href = '/Login';
  },
};

const appLogs = {
  async logUserInApp(pageName) {
    try {
      const key = 'app_logs';
      const logs = JSON.parse(localStorage.getItem(key) || '[]');
      logs.push({ page: pageName, ts: Date.now() });
      localStorage.setItem(key, JSON.stringify(logs));
    } catch { }
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
      // Generic chat style
      if (keys.includes('message') && keys.includes('question')) {
        return { message: "Hello! Let's begin your interview.", question: 'Tell me about yourself.' };
      }
      // Interview turn feedback
      if (keys.includes('feedback') && keys.includes('next_question')) {
        return { feedback: 'Thanks, that was a clear response.', next_question: "What's a challenging problem you've solved recently?" };
      }
      // Single text response
      if (keys.includes('response')) {
        return { response: 'Welcome! Please introduce yourself and share your background briefly.' };
      }
      // GDAnalysis overall schema
      if (keys.includes('overallScore') && keys.includes('participationScore') && keys.includes('communicationScore')) {
        return {
          overallScore: 72,
          participationScore: 68,
          communicationScore: 74,
          knowledgeScore: 70,
          teamworkScore: 76,
          strengths: ['Clear articulation', 'Good listening', 'Positive tone'],
          improvements: ['More concise points', 'Include examples', 'Invite others to speak'],
          detailedFeedback: 'You contributed steadily and summarized key points. Work on being more concise and adding evidence to strengthen arguments.',
          tips: ['Lead with your main point', 'Use 1 concrete example per point', 'Summarize and handoff to a teammate']
        };
      }
      // Per-participant schema
      if (keys.includes('participationSummary') && keys.includes('overallScore') && keys.includes('knowledgeScore')) {
        return {
          overallScore: 70,
          communicationScore: 72,
          knowledgeScore: 66,
          participationSummary: 'Shared multiple points and responded to peers with respect.',
          strengths: ['Structured points', 'Good eye contact', 'Calm tone'],
          improvements: ['Add data points', 'Trim filler words', 'Summarize more often']
        };
      }
      // Fallback
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
