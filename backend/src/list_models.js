const axios = require('axios');
const dotenv = require('dotenv');
const path = require('path');

// Load env from backend/.env
dotenv.config({ path: path.join(__dirname, '../.env') });

const key = process.env.GEMINI_API_KEY;

if (!key) {
    console.error('No GEMINI_API_KEY found in .env');
    process.exit(1);
}

async function listModels() {
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`;
        const resp = await axios.get(url);
        console.log('Available Models:');
        const models = resp.data.models || [];
        models.forEach(m => {
            if (m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent')) {
                console.log(`- ${m.name} (${m.displayName})`);
            }
        });
    } catch (e) {
        console.error('Error listing models:', e.response?.data || e.message);
    }
}

listModels();
