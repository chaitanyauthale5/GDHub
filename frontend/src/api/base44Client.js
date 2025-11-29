const ensureUser = () => {
    try {
        const existing = localStorage.getItem('stub_user');
        if (existing) return JSON.parse(existing);
    } catch { }
    const guest = {
        id: 'guest',
        email: 'guest@example.com',
        full_name: 'Guest User'
    };
    try { localStorage.setItem('stub_user', JSON.stringify(guest)); } catch { }
    return guest;
};

const entityStoreKey = (name) => `stub_entity_${name}`;
const readStore = (name) => {
    try { return JSON.parse(localStorage.getItem(entityStoreKey(name)) || '[]'); } catch { return []; }
};
const writeStore = (name, data) => {
    try { localStorage.setItem(entityStoreKey(name), JSON.stringify(data)); } catch { }
};
const makeId = () => Math.random().toString(36).slice(2, 10);

const makeEntity = (name) => ({
    async list() { return readStore(name); },
    async filter(query = {}) {
        const all = readStore(name);
        const keys = Object.keys(query);
        if (keys.length === 0) return all;
        return all.filter(item => keys.every(k => item?.[k] === query[k]));
    },
    async create(data) {
        const all = readStore(name);
        const item = { id: makeId(), ...data };
        all.push(item);
        writeStore(name, all);
        return item;
    },
    async update(id, patch) {
        const all = readStore(name);
        const idx = all.findIndex(i => i.id === id);
        if (idx >= 0) {
            all[idx] = { ...all[idx], ...patch };
            writeStore(name, all);
            return all[idx];
        }
        return null;
    }
});

const entitiesProxy = new Proxy({}, {
    get: (_t, prop) => makeEntity(String(prop))
});

export const base44 = {
    auth: {
        async me() { return ensureUser(); },
        logout(redirectUrl) {
            try { localStorage.removeItem('stub_user'); } catch { }
            if (redirectUrl) window.location.href = redirectUrl;
        },
        redirectToLogin(url) {
            window.location.href = url || '/';
        }
    },
    entities: entitiesProxy,
    appLogs: {
        async logUserInApp(pageName) {
            try {
                const key = 'stub_app_logs';
                const logs = JSON.parse(localStorage.getItem(key) || '[]');
                logs.push({ page: pageName, ts: Date.now() });
                localStorage.setItem(key, JSON.stringify(logs));
            } catch { }
            return { success: true };
        }
    },
    integrations: {
        Core: {
            async InvokeLLM({ prompt }) {
                return {
                    content: `LLM disconnected. Stub response for prompt: ${prompt ? String(prompt).slice(0, 80) : ''}...`
                };
            },
            async SendEmail() { return { success: true }; },
            async SendSMS() { return { success: true }; },
            async UploadFile() { return { success: true }; },
            async GenerateImage() { return { success: true }; },
            async ExtractDataFromUploadedFile() { return { success: true }; }
        }
    }
};
