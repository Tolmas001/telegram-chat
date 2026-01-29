const express = require('express');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'telegram-chat-secret-key-2024';
const DATA_DIR = path.join(__dirname, 'data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Data file paths
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const CHATS_FILE = path.join(DATA_DIR, 'chats.json');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');

// Middleware
app.use(cors({
    origin: true,
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use(express.static(__dirname));

// Root route - serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ==================== FILE STORAGE ====================

// Load data from files
function loadData() {
    let users = [];
    let chats = [];
    let messages = [];

    try {
        if (fs.existsSync(USERS_FILE)) {
            users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
        }
        if (fs.existsSync(CHATS_FILE)) {
            chats = JSON.parse(fs.readFileSync(CHATS_FILE, 'utf8'));
        }
        if (fs.existsSync(MESSAGES_FILE)) {
            messages = JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf8'));
        }
    } catch (error) {
        console.error('Error loading data files:', error);
    }

    return { users, chats, messages };
}

// Save data to files
function saveData() {
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
        fs.writeFileSync(CHATS_FILE, JSON.stringify(chats, null, 2));
        fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2));
    } catch (error) {
        console.error('Error saving data files:', error);
    }
}

// Initialize data
let { users, chats, messages } = loadData();

// JWT token generation
function generateToken(userId) {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
}

// Verify JWT token
function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        return null;
    }
}

// Authentication middleware
function authenticate(req, res, next) {
    const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
        return res.status(401).json({ error: 'Invalid token' });
    }

    req.userId = decoded.userId;

    // Update lastSeen timestamp
    const user = users.find(u => u.id === req.userId);
    if (user) {
        user.lastSeen = new Date().toISOString();
        saveData();
    }

    next();
}

// ==================== AUTH ROUTES ====================

// Register
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password, name } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        const existingUser = users.find(u => u.username === username);
        if (existingUser) {
            return res.status(400).json({ error: 'Username already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = {
            id: Date.now(),
            username,
            password: hashedPassword,
            name: name || username,
            avatar: '',
            online: true,
            createdAt: new Date().toISOString()
        };

        users.push(newUser);
        saveData();

        const token = generateToken(newUser.id);
        res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });

        res.json({
            user: { id: newUser.id, username: newUser.username, name: newUser.name, avatar: newUser.avatar, online: newUser.online },
            token
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        const user = users.find(u => u.username === username);
        if (!user) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        user.online = true;
        user.lastSeen = new Date().toISOString();
        saveData();

        const token = generateToken(user.id);
        res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });

        res.json({
            user: { id: user.id, username: user.username, name: user.name, avatar: user.avatar, online: user.online },
            token
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Logout
app.post('/api/auth/logout', authenticate, (req, res) => {
    const user = users.find(u => u.id === req.userId);
    if (user) {
        user.online = false;
        saveData();
    }
    res.clearCookie('token');
    res.json({ success: true });
});

// Get current user
app.get('/api/auth/me', authenticate, (req, res) => {
    const user = users.find(u => u.id === req.userId);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    res.json({
        user: { id: user.id, username: user.username, name: user.name, avatar: user.avatar, online: user.online }
    });
});

// ==================== USER ROUTES ====================

// Get all users
app.get('/api/users', authenticate, (req, res) => {
    const userList = users.map(u => ({
        id: u.id,
        username: u.username,
        name: u.name,
        avatar: u.avatar,
        online: u.online
    }));
    res.json(userList);
});

// Update profile
app.put('/api/users/profile', authenticate, (req, res) => {
    const user = users.find(u => u.id === req.userId);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    const { name, avatar } = req.body;
    if (name) user.name = name;
    if (avatar) user.avatar = avatar;

    saveData();

    res.json({
        user: { id: user.id, username: user.username, name: user.name, avatar: user.avatar, online: user.online }
    });
});

// ==================== CHAT ROUTES ====================

// Get user chats
app.get('/api/chats', authenticate, (req, res) => {
    const userChats = chats.filter(c => c.participants.includes(req.userId));
    res.json(userChats);
});

// Create group chat
app.post('/api/chats/group', authenticate, (req, res) => {
    const { name, participants } = req.body;

    if (!name) {
        return res.status(400).json({ error: 'Group name is required' });
    }

    const newChat = {
        id: Date.now(),
        type: 'group',
        name,
        participants: [req.userId, ...(participants || [])],
        avatar: '',
        createdAt: new Date().toISOString()
    };

    chats.push(newChat);
    saveData();

    res.json(newChat);
});

// Get or create private chat
app.post('/api/chats/private', authenticate, (req, res) => {
    const { userId } = req.body;

    if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
    }

    // Check if private chat already exists
    let existingChat = chats.find(c =>
        c.type === 'private' &&
        c.participants.includes(req.userId) &&
        c.participants.includes(parseInt(userId))
    );

    if (!existingChat) {
        existingChat = {
            id: Date.now(),
            type: 'private',
            participants: [req.userId, parseInt(userId)],
            createdAt: new Date().toISOString()
        };
        chats.push(existingChat);
        saveData();
    }

    res.json(existingChat);
});

// Update chat
app.put('/api/chats/:id', authenticate, (req, res) => {
    const chat = chats.find(c => c.id === parseInt(req.params.id));
    if (!chat) {
        return res.status(404).json({ error: 'Chat not found' });
    }

    if (!chat.participants.includes(req.userId)) {
        return res.status(403).json({ error: 'Access denied' });
    }

    const { name, avatar } = req.body;
    if (name && chat.type === 'group') chat.name = name;
    if (avatar) chat.avatar = avatar;

    saveData();

    res.json(chat);
});

// Delete chat
app.delete('/api/chats/:id', authenticate, (req, res) => {
    const chatIndex = chats.findIndex(c => c.id === parseInt(req.params.id));
    if (chatIndex === -1) {
        return res.status(404).json({ error: 'Chat not found' });
    }

    const chat = chats[chatIndex];
    if (!chat.participants.includes(req.userId)) {
        return res.status(403).json({ error: 'Access denied' });
    }

    // Remove chat and its messages
    chats.splice(chatIndex, 1);
    messages = messages.filter(m => m.chatId !== chat.id);
    saveData();

    res.json({ success: true });
});

// Add user to chat
app.post('/api/chats/:id/users', authenticate, (req, res) => {
    const chat = chats.find(c => c.id === parseInt(req.params.id));
    if (!chat) {
        return res.status(404).json({ error: 'Chat not found' });
    }

    if (!chat.participants.includes(req.userId)) {
        return res.status(403).json({ error: 'Access denied' });
    }

    const { userId } = req.body;
    if (userId && !chat.participants.includes(parseInt(userId))) {
        chat.participants.push(parseInt(userId));
        saveData();
    }

    res.json(chat);
});

// Remove user from chat
app.delete('/api/chats/:id/users/:userId', authenticate, (req, res) => {
    const chat = chats.find(c => c.id === parseInt(req.params.id));
    if (!chat) {
        return res.status(404).json({ error: 'Chat not found' });
    }

    if (!chat.participants.includes(req.userId)) {
        return res.status(403).json({ error: 'Access denied' });
    }

    const userIdToRemove = parseInt(req.params.userId);
    if (userIdToRemove === req.userId) {
        return res.status(400).json({ error: 'Cannot remove yourself' });
    }

    const index = chat.participants.indexOf(userIdToRemove);
    if (index > -1) {
        chat.participants.splice(index, 1);
        saveData();
    }

    res.json(chat);
});

// ==================== MESSAGE ROUTES ====================

// Get chat messages
app.get('/api/chats/:id/messages', authenticate, (req, res) => {
    const chat = chats.find(c => c.id === parseInt(req.params.id));
    if (!chat) {
        return res.status(404).json({ error: 'Chat not found' });
    }

    if (!chat.participants.includes(req.userId)) {
        return res.status(403).json({ error: 'Access denied' });
    }

    const chatMessages = messages.filter(m => m.chatId === parseInt(req.params.id));

    // Mark messages as seen if sender is not the current user
    chatMessages.forEach(msg => {
        if (msg.senderId !== req.userId && msg.status !== 'seen') {
            msg.status = 'seen';
        }
    });
    saveData();

    res.json(chatMessages);
});

// Send message
app.post('/api/chats/:id/messages', authenticate, (req, res) => {
    const chat = chats.find(c => c.id === parseInt(req.params.id));
    if (!chat) {
        return res.status(404).json({ error: 'Chat not found' });
    }

    if (!chat.participants.includes(req.userId)) {
        return res.status(403).json({ error: 'Access denied' });
    }

    const { text, attachment } = req.body;
    if (!text && !attachment) {
        return res.status(400).json({ error: 'Message text or attachment is required' });
    }

    const newMessage = {
        id: Date.now(),
        chatId: chat.id,
        senderId: req.userId,
        text: text || '',
        attachment: attachment || null,
        status: 'sent',
        timestamp: new Date().toISOString()
    };

    messages.push(newMessage);
    saveData();

    res.json(newMessage);
});

// Update message
app.put('/api/messages/:id', authenticate, (req, res) => {
    const message = messages.find(m => m.id === parseInt(req.params.id));
    if (!message) {
        return res.status(404).json({ error: 'Message not found' });
    }

    if (message.senderId !== req.userId) {
        return res.status(403).json({ error: 'Access denied' });
    }

    const { text } = req.body;
    if (text) message.text = text;

    saveData();

    res.json(message);
});

// Delete message
app.delete('/api/messages/:id', authenticate, (req, res) => {
    const messageIndex = messages.findIndex(m => m.id === parseInt(req.params.id));
    if (messageIndex === -1) {
        return res.status(404).json({ error: 'Message not found' });
    }

    const message = messages[messageIndex];
    if (message.senderId !== req.userId) {
        return res.status(403).json({ error: 'Access denied' });
    }

    messages.splice(messageIndex, 1);
    saveData();

    res.json({ success: true });
});

// ==================== SAMPLE DATA ====================

async function loadSampleData() {
    if (users.length === 0) {
        const hashedPassword = await bcrypt.hash('123', 10);

        users = [
            { id: 1, username: 'ali', password: hashedPassword, name: 'Ali Valiyev', avatar: '', online: false, createdAt: new Date().toISOString() },
            { id: 2, username: 'botir', password: hashedPassword, name: 'Botir Jo\'rayev', avatar: '', online: true, createdAt: new Date().toISOString() },
            { id: 3, username: 'dilshod', password: hashedPassword, name: 'Dilshod Rahimov', avatar: '', online: false, createdAt: new Date().toISOString() },
        ];
        saveData();
    }
}

loadSampleData();

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Telegram Chat Server running on http://localhost:${PORT}`);
    console.log(`📁 Data saved to: ${DATA_DIR}`);
    console.log(`   - ${USERS_FILE}`);
    console.log(`   - ${CHATS_FILE}`);
    console.log(`   - ${MESSAGES_FILE}`);
    console.log(`📝 API Documentation:`);
    console.log(`   POST /api/auth/register - Register new user`);
    console.log(`   POST /api/auth/login - Login`);
    console.log(`   POST /api/auth/logout - Logout`);
    console.log(`   GET /api/auth/me - Get current user`);
    console.log(`   GET /api/users - Get all users`);
    console.log(`   PUT /api/users/profile - Update profile`);
    console.log(`   GET /api/chats - Get user chats`);
    console.log(`   POST /api/chats/group - Create group`);
    console.log(`   POST /api/chats/private - Create/get private chat`);
    console.log(`   GET /api/chats/:id/messages - Get chat messages`);
    console.log(`   POST /api/chats/:id/messages - Send message`);
    console.log(`   PUT /api/messages/:id - Edit message`);
    console.log(`   DELETE /api/messages/:id - Delete message`);
});
