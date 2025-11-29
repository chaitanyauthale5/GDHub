const dotenv = require('dotenv');
dotenv.config();
const getOrigins = () => (process.env.CORS_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173').split(',').map(s => s.trim()).filter(Boolean);
module.exports = {
    port: process.env.PORT || 5000,
    jwtSecret: process.env.JWT_SECRET || 'change-me',
    mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/speakup',
    corsOrigins: getOrigins(),
    nodeEnv: process.env.NODE_ENV || 'development'
};
