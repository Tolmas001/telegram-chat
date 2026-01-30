// API Base URL - auto-detect based on device
const getApiUrl = () => {
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;
    // If accessed via localhost, use port 3000
    // Otherwise (production like Render), use same host without explicit port
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return `${protocol}//${hostname}:3000/api`;
    }
    // For production (Render, etc.), use same host and port as the page
    return `${protocol}//${hostname}/api`;
};
const API_URL = getApiUrl();

// State
let currentUser = null;
let currentChat = null;
let isRegistering = false;
let currentFile = null;
let currentFilePreview = null;

// Voice Recording State
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let recordingStartTime = null;
let recordingTimer = null;

// Reply State
let replyToMessage = null;

// Forward State
let forwardMessages = [];

// Message Reactions
const reactionEmojis = ['👍', '👎', '❤️', '😂', '😮', '😢', '🙏', '🔥'];

// Call State
let currentCall = null;
let localStream = null;

// Compress image to reduce size
async function compressImage(dataUrl, maxWidth = 200, maxHeight = 200, quality = 0.7) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            // Calculate new dimensions maintaining aspect ratio
            if (width > height) {
                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }
            } else {
                if (height > maxHeight) {
                    width = Math.round((width * maxHeight) / height);
                    height = maxHeight;
                }
            }

            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            // Compress to JPEG with reduced quality
            const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
            resolve(compressedDataUrl);
        };
        img.onerror = () => reject(new Error('Rasmni qayta ishlashda xatolik'));
        img.src = dataUrl;
    });
}

// Mobile detection
function isMobile() {
    return window.innerWidth <= 480;
}

// Toggle mobile sidebar/chat view
function toggleMobileView(showChat) {
    const sidebar = document.getElementById('sidebar');
    const backBtn = document.getElementById('back-btn');

    if (isMobile()) {
        if (showChat) {
            sidebar.classList.add('hidden-mobile');
            backBtn.style.display = 'flex';
        } else {
            sidebar.classList.remove('hidden-mobile');
            backBtn.style.display = 'none';
        }
    }
}

// DOM Elements
const authSection = document.getElementById('auth-section');
const appSection = document.getElementById('app-section');
const authForm = document.getElementById('auth-form');
const authTitle = document.getElementById('auth-title');
const authBtn = document.getElementById('auth-btn');
const authToggle = document.getElementById('auth-toggle');
const chatList = document.getElementById('chat-list');
const messagesContainer = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const searchInput = document.getElementById('search-input');

// Initialize app
function init() {
    checkAuth();
    setupEventListeners();

    // Periodic online status update (every 10 seconds)
    setInterval(async () => {
        if (currentChat && currentChat.type === 'private') {
            try {
                usersCache = await apiRequest('/users');
                updateChatHeader();
            } catch (error) {
                // Ignore errors from periodic updates
            }
        }
    }, 10000);
}

// Check if user is already logged in
async function checkAuth() {
    try {
        const response = await fetch(`${API_URL}/auth/me`, {
            credentials: 'include'
        });

        if (response.ok) {
            const data = await response.json();
            currentUser = data.user;
            showApp();
        }
    } catch (error) {
        console.log('Not authenticated');
    }
}

// API helpers
async function apiRequest(endpoint, options = {}) {
    const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options.headers
        },
        credentials: 'include'
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Request failed');
    }

    return response.json();
}

// Setup event listeners
function setupEventListeners() {
    // Auth form
    authForm.addEventListener('submit', handleAuth);
    authToggle.addEventListener('click', toggleAuthMode);

    // Chat actions
    sendBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    // File attachment
    document.getElementById('attach-btn').addEventListener('click', () => {
        document.getElementById('file-input').click();
    });
    document.getElementById('file-input').addEventListener('change', handleFileSelect);

    // Voice recording
    document.getElementById('voice-btn').addEventListener('click', toggleVoiceRecording);
    document.getElementById('voice-cancel-btn').addEventListener('click', cancelVoiceRecording);
    document.getElementById('voice-send-btn').addEventListener('click', sendVoiceMessage);

    // Emoji picker
    document.getElementById('emoji-btn').addEventListener('click', toggleEmojiPicker);
    document.querySelectorAll('.emoji-category-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.emoji-category-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            loadEmojis(btn.dataset.category);
        });
    });

    // Close emoji picker when clicking outside
    document.addEventListener('click', (e) => {
        const picker = document.getElementById('emoji-picker');
        const btn = document.getElementById('emoji-btn');
        if (!picker.contains(e.target) && !btn.contains(e.target)) {
            picker.classList.add('hidden');
        }
    });

    // Search
    searchInput.addEventListener('input', filterChats);

    // Sidebar buttons
    document.getElementById('create-group-btn').addEventListener('click', showCreateGroupModal);
    document.getElementById('create-channel-btn').addEventListener('click', createChannel);
    document.getElementById('add-user-btn').addEventListener('click', showAddUserModal);
    document.getElementById('profile-btn').addEventListener('click', showProfileModal);
    document.getElementById('dark-mode-btn').addEventListener('click', toggleDarkMode);
    document.getElementById('schedule-btn').addEventListener('click', showScheduleModal);
    document.getElementById('logout-btn').addEventListener('click', logout);

    // Modal buttons
    document.getElementById('cancel-group-btn').addEventListener('click', closeModals);
    document.getElementById('create-group-submit-btn').addEventListener('click', createGroup);
    document.getElementById('cancel-add-user-btn').addEventListener('click', closeModals);
    document.getElementById('cancel-profile-btn').addEventListener('click', closeModals);
    document.getElementById('save-profile-btn').addEventListener('click', saveProfile);
    document.getElementById('cancel-edit-btn').addEventListener('click', closeModals);
    document.getElementById('save-edit-btn').addEventListener('click', saveEditedMessage);
    document.getElementById('cancel-group-edit-btn').addEventListener('click', closeModals);
    document.getElementById('save-group-btn').addEventListener('click', saveGroup);
    document.getElementById('add-group-member-btn').addEventListener('click', showAddGroupUserModal);
    document.getElementById('close-message-actions').addEventListener('click', closeModals);
    document.getElementById('cancel-add-group-user-btn').addEventListener('click', closeModals);
    document.getElementById('save-group-users-btn').addEventListener('click', saveGroupUsers);

    // Message search
    document.getElementById('message-search-input').addEventListener('input', searchMessages);
    document.getElementById('message-search-btn').addEventListener('click', () => {
        document.getElementById('message-search').classList.toggle('active');
    });
    document.getElementById('message-search-close').addEventListener('click', () => {
        document.getElementById('message-search').classList.remove('active');
        document.getElementById('message-search-input').value = '';
        searchMessages();
    });
    document.getElementById('close-message-actions').addEventListener('click', closeModals);
    document.getElementById('action-edit-msg').addEventListener('click', () => {
        if (selectedMessage) editMessage(selectedMessage.id);
    });
    document.getElementById('action-delete-msg').addEventListener('click', () => {
        if (selectedMessage && confirm('Bu xabarni o\'chirmoqchimisiz?')) {
            deleteMessage(selectedMessage.id);
        }
    });

    // Chat actions
    document.getElementById('edit-chat-btn').addEventListener('click', editCurrentChat);
    document.getElementById('delete-chat-btn').addEventListener('click', deleteCurrentChat);

    // Call buttons
    document.getElementById('voice-call-btn').addEventListener('click', initiateVoiceCall);
    document.getElementById('video-call-btn').addEventListener('click', initiateVideoCall);

    // Mobile back button
    document.getElementById('back-btn').addEventListener('click', goBackToChatList);

    // Handle window resize
    window.addEventListener('resize', () => {
        if (!isMobile()) {
            document.getElementById('sidebar').classList.remove('hidden-mobile');
            document.getElementById('back-btn').style.display = 'none';
        }
    });

    // Touch support for messages (long press to show actions)
    let touchTimer = null;
    messagesContainer.addEventListener('touchstart', (e) => {
        if (e.target.closest('.message')) {
            touchTimer = setTimeout(() => {
                const message = e.target.closest('.message');
                message.classList.add('touch-active');
            }, 500);
        }
    });

    messagesContainer.addEventListener('touchend', () => {
        clearTimeout(touchTimer);
        document.querySelectorAll('.message.touch-active').forEach(m => {
            setTimeout(() => m.classList.remove('touch-active'), 2000);
        });
    });

    messagesContainer.addEventListener('touchmove', () => {
        clearTimeout(touchTimer);
        document.querySelectorAll('.message.touch-active').forEach(m => {
            m.classList.remove('touch-active');
        });
    });
}

// Authentication handlers
async function handleAuth(e) {
    e.preventDefault();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    const fullName = document.getElementById('full-name').value.trim();
    const profileImage = document.getElementById('profile-image').files[0];

    try {
        if (isRegistering) {
            // Registration
            const data = await apiRequest('/auth/register', {
                method: 'POST',
                body: JSON.stringify({ username, password, name: fullName })
            });

            currentUser = data.user;

            // Small delay to ensure cookie is set
            await new Promise(resolve => setTimeout(resolve, 100));

            // Upload profile image if selected
            if (profileImage && profileImage.type.startsWith('image/')) {
                try {
                    const reader = new FileReader();
                    const avatarData = await new Promise((resolve, reject) => {
                        reader.onload = (e) => resolve(e.target.result);
                        reader.onerror = () => reject(new Error('Rasm o\'qishda xatolik'));
                        reader.readAsDataURL(profileImage);
                    });

                    // Compress image before saving
                    const compressedAvatar = await compressImage(avatarData);

                    await apiRequest('/users/profile', {
                        method: 'PUT',
                        body: JSON.stringify({ avatar: compressedAvatar })
                    });

                    // Refresh user data
                    const updatedUser = await apiRequest('/auth/me');
                    currentUser = updatedUser.user;
                } catch (avatarError) {
                    console.error('Avatar upload error:', avatarError);
                    // Continue without avatar
                }
            }

            showApp();
        } else {
            // Login
            const data = await apiRequest('/auth/login', {
                method: 'POST',
                body: JSON.stringify({ username, password })
            });

            currentUser = data.user;
            showApp();
        }
    } catch (error) {
        alert(error.message);
    }
}

function toggleAuthMode() {
    isRegistering = !isRegistering;
    authTitle.textContent = isRegistering ? 'Ro\'yxatdan o\'tish' : 'Kirish';
    authBtn.textContent = isRegistering ? 'Ro\'yxatdan o\'tish' : 'Kirish';
    authToggle.textContent = isRegistering ? 'Kirish' : 'Ro\'yxatdan o\'tish';

    document.getElementById('full-name').parentElement.style.display = isRegistering ? 'block' : 'none';
    document.getElementById('profile-image').parentElement.style.display = isRegistering ? 'block' : 'none';

    // Clear form fields
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
    document.getElementById('full-name').value = '';
}

// Show main app
function showApp() {
    authSection.classList.add('hidden');
    appSection.classList.remove('hidden');
    updateUserInfo();
    renderChatList();
}

function getAvatarUrl(avatar) {
    if (avatar && avatar.startsWith('data:')) return avatar;
    if (avatar && avatar.startsWith('http')) return avatar;
    return `https://ui-avatars.com/api/?name=User&background=667eea&color=fff&size=100`;
}

// Update user info in sidebar
function updateUserInfo() {
    const avatar = document.getElementById('current-user-avatar');
    const name = document.getElementById('current-user-name');

    avatar.src = getAvatarUrl(currentUser.avatar);
    avatar.onerror = () => { avatar.src = getAvatarUrl(null); };
    name.textContent = currentUser.name;
}

// Render chat list
async function renderChatList(filter = '') {
    try {
        const chats = await apiRequest('/chats');
        const messages = await apiRequest('/messages');

        chatList.innerHTML = '';

        // Get users for displaying names
        const users = await apiRequest('/users');

        chats.forEach(chat => {
            const otherParticipants = chat.participants.filter(p => p !== currentUser.id);
            const otherUser = otherParticipants.length === 1 ? users.find(u => u.id === otherParticipants[0]) : null;
            const chatName = chat.type === 'group' ? chat.name : (otherUser ? otherUser.name : 'Noma\'lum');
            const chatAvatar = chat.type === 'group' ? (chat.avatar || 'https://via.placeholder.com/50') :
                (otherUser?.avatar || 'https://via.placeholder.com/50');

            if (filter && !chatName.toLowerCase().includes(filter.toLowerCase())) return;

            // Get last message for this chat
            const chatMessages = messages.filter(m => m.chatId === chat.id);
            const lastMessage = chatMessages.length > 0 ? chatMessages[chatMessages.length - 1] : null;
            const lastMessageTime = lastMessage ? formatMessageTime(lastMessage.timestamp) : '';
            const lastMessageText = lastMessage ? (lastMessage.text || 'Rasm') : 'Xabar yo\'q';

            const chatItem = document.createElement('div');
            chatItem.className = 'chat-item' + (currentChat?.id === chat.id ? ' active' : '');
            chatItem.innerHTML = `
                <img src="${getAvatarUrl(chatAvatar)}" alt="${chatName}" class="chat-item-avatar" onerror="this.src='${getAvatarUrl(null)}'">
                <div class="chat-item-info">
                    <div class="chat-item-name">${chatName}</div>
                    <div class="chat-item-last-message">${lastMessageText}</div>
                </div>
                <div class="chat-item-meta">
                    ${lastMessageTime ? `<div class="chat-item-time">${lastMessageTime}</div>` : ''}
                    ${chat.type === 'private' && otherUser?.online ? '<div class="chat-item-online"></div>' : ''}
                </div>
            `;
            chatItem.addEventListener('click', () => openChat(chat));
            chatList.appendChild(chatItem);
        });
    } catch (error) {
        console.error('Error loading chats:', error);
    }
}

// Format message time
function formatMessageTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (date.toDateString() === now.toDateString()) {
        if (diffMins < 1) return 'hozir';
        if (diffMins < 60) return diffMins + ' daq';
        return diffHours + ' soat';
    }
    if (date.toDateString() === new Date(now - 86400000).toDateString()) {
        return 'kecha';
    }
    return date.toLocaleDateString('uz-UZ', { day: 'numeric', month: 'short' });
}

// Open chat
async function openChat(chat) {
    currentChat = chat;
    renderChatList();
    await renderMessages();
    updateChatHeader();
    toggleMobileView(true);
}

// Go back to chat list (mobile)
function goBackToChatList() {
    currentChat = null;
    renderChatList();
    toggleMobileView(false);
}

// Update chat header
function updateChatHeader() {
    if (!currentChat) return;

    const avatar = document.getElementById('chat-avatar');
    const name = document.getElementById('chat-name');
    const status = document.getElementById('chat-status');

    if (currentChat.type === 'group') {
        avatar.src = getAvatarUrl(currentChat.avatar);
        name.textContent = currentChat.name;
        const memberCount = currentChat.participants.length;
        status.textContent = `${memberCount} ta a'zo`;
    } else {
        const otherUserId = currentChat.participants.find(p => p !== currentUser.id);
        const otherUser = usersCache?.find(u => u.id === otherUserId);
        avatar.src = getAvatarUrl(otherUser?.avatar);
        name.textContent = otherUser?.name || 'Noma\'lum';
        if (otherUser?.online) {
            status.textContent = 'Online';
            status.style.color = '#4caf50';
        } else {
            status.textContent = 'Oxirgi ko\'rish: ' + formatLastSeen(otherUser?.lastSeen);
            status.style.color = '#888';
        }
    }

    avatar.onerror = () => { avatar.src = getAvatarUrl(null); };
}

// Format last seen time
function formatLastSeen(lastSeen) {
    if (!lastSeen) return 'noma\'lum';

    const date = new Date(lastSeen);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'hozir';
    if (diffMins < 60) return diffMins + ' daqiqa oldin';
    if (diffHours < 24) return diffHours + ' soat oldin';
    if (diffDays < 7) return diffDays + ' kun oldin';

    return date.toLocaleDateString('uz-UZ', { day: 'numeric', month: 'short' });
}

let usersCache = [];

// Render messages
async function renderMessages() {
    try {
        messagesContainer.innerHTML = '<div class="loading">Yuklanmoqda...</div>';

        const messages = await apiRequest(`/chats/${currentChat.id}/messages`);

        // Cache users
        if (!usersCache.length) {
            usersCache = await apiRequest('/users');
        }

        messagesContainer.innerHTML = '';

        if (messages.length === 0) {
            messagesContainer.innerHTML = `
                <div class="empty-chat">
                    <div class="empty-chat-icon">💬</div>
                    <p>Xabarlar yo'q</p>
                </div>
            `;
            return;
        }

        // Render pinned message if any
        const pinnedMessage = messages.find(m => m.pinned);
        if (pinnedMessage) {
            const pinnedEl = document.createElement('div');
            pinnedEl.className = 'pinned-message';
            pinnedEl.innerHTML = `
                <span class="pinned-message-icon">📌</span>
                <div class="pinned-message-content">
                    <div class="pinned-message-sender">${pinnedMessage.senderId === currentUser.id ? 'Siz' : '...'}</div>
                    <div class="pinned-message-text">${pinnedMessage.text || (pinnedMessage.attachment?.type === 'image' ? 'Rasm' : 'Xabar')}</div>
                </div>
            `;
            messagesContainer.appendChild(pinnedEl);
        }

        messages.forEach(msg => {
            const sender = usersCache.find(u => u.id === msg.senderId);
            const isOwn = msg.senderId === currentUser.id;

            // Generate attachment HTML
            let attachmentHtml = '';
            if (msg.attachment) {
                if (msg.attachment.type === 'image') {
                    attachmentHtml = `<div class="message-attachment image"><img src="${msg.attachment.data}" alt="Rasm" onclick="openImageModal(this.src)"></div>`;
                } else if (msg.attachment.type === 'audio') {
                    attachmentHtml = `
                        <div class="audio-message">
                            <audio id="audio-${msg.id}" src="${msg.attachment.data}" onended="document.getElementById('audio-play-${msg.id}').textContent='▶️'" ontimeupdate="updateAudioProgress(${msg.id})"></audio>
                            <button class="audio-play-btn" id="audio-play-${msg.id}" onclick="toggleAudioPlayback(${msg.id})">▶️</button>
                            <div class="audio-waveform">
                                <div class="audio-waveform-progress" id="audio-progress-${msg.id}" style="width: 0%"></div>
                            </div>
                            <span class="audio-duration" id="audio-duration-${msg.id}">${formatDuration(msg.attachment.duration || 0)}</span>
                        </div>
                    `;
                } else if (msg.attachment.type === 'video') {
                    attachmentHtml = `
                        <div class="video-message" onclick="openVideoModal('${msg.attachment.data}')">
                            <video src="${msg.attachment.data}"></video>
                            <div class="video-message-overlay">
                                <div class="video-play-icon">▶️</div>
                            </div>
                            ${msg.attachment.duration ? `<span class="video-duration">${formatDuration(msg.attachment.duration)}</span>` : ''}
                        </div>
                    `;
                } else {
                    attachmentHtml = `<div class="message-attachment file"><a href="${msg.attachment.data}" download="${msg.attachment.name || 'fayl'}">📎 ${msg.attachment.name || 'Fayl'}</a></div>`;
                }
            }

            // Forward indicator
            let forwardHtml = '';
            if (msg.forwardedFrom) {
                forwardHtml = `<div class="forwarded-indicator">Yuborilgan</div>`;
            }

            // Reply indicator
            let replyHtml = '';
            if (msg.replyTo) {
                const repliedMsg = messages.find(m => m.id === msg.replyTo);
                if (repliedMsg) {
                    replyHtml = `
                        <div class="thread-preview" onclick="scrollToMessage(${msg.replyTo})">
                            ↩️ ${repliedMsg.text || (repliedMsg.attachment?.type === 'image' ? 'Rasm' : 'Xabar')}
                        </div>
                    `;
                }
            }

            // Reactions
            let reactionsHtml = '';
            if (msg.reactions) {
                const reactionCounts = [];
                Object.entries(msg.reactions).forEach(([emoji, users]) => {
                    if (users.length > 0) {
                        reactionCounts.push(`<span class="message-reaction ${users.includes(currentUser.id) ? 'my-reaction' : ''}">${emoji} ${users.length}</span>`);
                    }
                });
                if (reactionCounts.length > 0) {
                    reactionsHtml = `<div class="message-reactions">${reactionCounts.join('')}</div>`;
                }
            }

            // Scheduled badge
            let scheduledBadge = '';
            if (msg.scheduledFor) {
                scheduledBadge = '<span class="scheduled-badge">Rejalashtirilgan</span>';
            }

            // Add image preview for sending
            let previewHtml = '';
            if (currentFilePreview) {
                previewHtml = `
                    <div class="image-preview">
                        <img src="${currentFilePreview}" alt="Preview">
                        <button type="button" class="remove-preview" onclick="removeFilePreview()">✕</button>
                    </div>
                `;
            }

            const messageEl = document.createElement('div');
            messageEl.className = `message ${isOwn ? 'sent' : 'received'}`;
            messageEl.id = `message-${msg.id}`;
            messageEl.innerHTML = `
                ${currentChat?.type === 'group' && !isOwn ? `<div class="message-sender">${sender?.name || 'Noma\'lum'} (@${sender?.username || 'unknown'})</div>` : ''}
                ${forwardHtml}
                ${previewHtml}
                ${replyHtml}
                ${attachmentHtml}
                ${msg.text ? `<div class="message-text">${msg.text}</div>` : ''}
                ${scheduledBadge}
                <div class="message-meta">
                    <span class="message-time">${formatTime(msg.timestamp)}</span>
                    ${isOwn ? `<span class="message-status-icon">${getMessageStatus(msg.status)}</span>` : ''}
                </div>
                ${reactionsHtml}
                <div class="message-actions">
                    <button class="message-action-btn" onclick="showReactionsModal(${msg.id})">😀</button>
                    <button class="message-action-btn" onclick="setReplyTo(messages.find(m => m.id === ${msg.id})); renderMessages();">↩️</button>
                    <button class="message-action-btn" onclick="showForwardModal(${msg.id})">↗️</button>
                    ${isOwn ? `
                        <button class="message-action-btn" onclick="pinMessage(${msg.id})">📌</button>
                        <button class="message-action-btn" onclick="editMessage(${msg.id})">✏️</button>
                        <button class="message-action-btn" onclick="deleteMessage(${msg.id})">🗑️</button>
                    ` : ''}
                </div>
            `;
            messagesContainer.appendChild(messageEl);
        });

        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    } catch (error) {
        console.error('Error loading messages:', error);
    }
}

// Format duration (seconds to MM:SS)
function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Scroll to message
function scrollToMessage(messageId) {
    const messageEl = document.getElementById(`message-${messageId}`);
    if (messageEl) {
        messageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        messageEl.classList.add('highlight');
        setTimeout(() => messageEl.classList.remove('highlight'), 2000);
    }
}

// Search messages
function searchMessages() {
    const searchTerm = document.getElementById('message-search-input').value.toLowerCase().trim();
    const messageElements = messagesContainer.querySelectorAll('.message');

    messageElements.forEach(el => {
        const text = el.querySelector('.message-text');
        if (text) {
            const textContent = text.textContent.toLowerCase();
            if (searchTerm === '' || textContent.includes(searchTerm)) {
                el.style.display = '';
                if (searchTerm !== '') {
                    el.classList.add('highlight');
                    // Highlight matching text
                    const regex = new RegExp(`(${searchTerm})`, 'gi');
                    text.innerHTML = text.textContent.replace(regex, '<span class="highlight-text">$1</span>');
                } else {
                    el.classList.remove('highlight');
                }
            } else {
                el.style.display = 'none';
            }
        }
    });
}

// Handle file selection
async function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file || !currentChat) return;

    const isImage = file.type.startsWith('image/');
    const fileName = file.name;

    // Convert file to base64
    const reader = new FileReader();
    const fileData = await new Promise((resolve) => {
        reader.onload = (ev) => resolve({
            name: fileName,
            type: isImage ? 'image' : 'file',
            data: ev.target.result
        });
        reader.readAsDataURL(file);
    });

    try {
        await apiRequest(`/chats/${currentChat.id}/messages`, {
            method: 'POST',
            body: JSON.stringify({
                text: messageInput.value.trim(),
                attachment: fileData
            })
        });

        messageInput.value = '';
        document.getElementById('file-input').value = '';
        renderMessages();
        renderChatList();
    } catch (error) {
        alert(error.message);
    }
}

// Send message
async function sendMessage() {
    const text = messageInput.value.trim();
    if (!text && !currentFile && !currentChat) return;

    try {
        const data = {
            text: text || ''
        };

        // Include attachment if selected
        if (currentFile) {
            data.attachment = currentFile;
        }

        // Include reply if selected
        if (replyToMessage) {
            data.replyTo = replyToMessage.id;
        }

        await apiRequest(`/chats/${currentChat.id}/messages`, {
            method: 'POST',
            body: JSON.stringify(data)
        });

        // Reset input and file
        messageInput.value = '';
        currentFile = null;
        currentFilePreview = null;
        document.getElementById('file-input').value = '';
        clearReply();

        renderMessages();
        renderChatList();
    } catch (error) {
        alert(error.message);
    }
}

// ==================== VOICE RECORDING ====================

async function toggleVoiceRecording() {
    if (isRecording) {
        // Stop recording
        stopRecording();
    } else {
        // Start recording
        await startRecording();
    }
}

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };

        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            const audioUrl = await blobToBase64(audioBlob);

            // Stop all tracks
            stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorder.start();
        isRecording = true;
        recordingStartTime = Date.now();

        // Update UI
        document.getElementById('voice-btn').classList.add('recording');
        document.getElementById('message-input-area').classList.add('hidden');
        document.getElementById('voice-recording-ui').classList.remove('hidden');

        // Start timer
        recordingTimer = setInterval(updateRecordingTime, 1000);

    } catch (error) {
        alert('Mikrofon ruxsati berilmagan yoki mavjud emas!');
        console.error('Microphone error:', error);
    }
}

function stopRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;

        // Clear timer
        clearInterval(recordingTimer);

        // Update UI
        document.getElementById('voice-btn').classList.remove('recording');
        document.getElementById('message-input-area').classList.remove('hidden');
        document.getElementById('voice-recording-ui').classList.add('hidden');
    }
}

function cancelVoiceRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;

        // Clear timer
        clearInterval(recordingTimer);

        // Clear audio chunks
        audioChunks = [];

        // Update UI
        document.getElementById('voice-btn').classList.remove('recording');
        document.getElementById('message-input-area').classList.remove('hidden');
        document.getElementById('voice-recording-ui').classList.add('hidden');
        document.getElementById('voice-recording-time').textContent = '00:00';
    }
}

async function sendVoiceMessage() {
    if (audioChunks.length === 0) return;

    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
    const audioUrl = await blobToBase64(audioBlob);

    const duration = Math.round((Date.now() - recordingStartTime) / 1000);

    try {
        await apiRequest(`/chats/${currentChat.id}/messages`, {
            method: 'POST',
            body: JSON.stringify({
                text: '',
                attachment: {
                    type: 'audio',
                    data: audioUrl,
                    duration: duration
                }
            })
        });

        // Reset UI
        cancelVoiceRecording();

        renderMessages();
        renderChatList();
    } catch (error) {
        alert(error.message);
    }
}

function updateRecordingTime() {
    const elapsed = Math.round((Date.now() - recordingStartTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    document.getElementById('voice-recording-time').textContent =
        `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// ==================== MESSAGE REACTIONS ====================

function showReactionsModal(messageId) {
    document.getElementById('modal-overlay').classList.remove('hidden');

    let modalHtml = `
        <div class="modal">
            <h3>Reaksiya</h3>
            <div class="reactions-grid">
    `;

    reactionEmojis.forEach(emoji => {
        modalHtml += `<button class="reaction-btn" onclick="addReaction(${messageId}, '${emoji}')">${emoji}</button>`;
    });

    modalHtml += `
            </div>
            <div class="modal-actions">
                <button class="btn secondary" onclick="closeModals()">Bekor qilish</button>
            </div>
        </div>
    `;

    document.getElementById('modal-overlay').innerHTML = modalHtml;
}

async function addReaction(messageId, emoji) {
    try {
        // Get current messages and add reaction
        const messages = await apiRequest(`/chats/${currentChat.id}/messages`);
        const message = messages.find(m => m.id === messageId);

        if (message) {
            if (!message.reactions) message.reactions = {};

            // Toggle reaction
            if (message.reactions[emoji] && message.reactions[emoji].includes(currentUser.id)) {
                message.reactions[emoji] = message.reactions[emoji].filter(id => id !== currentUser.id);
            } else {
                if (!message.reactions[emoji]) message.reactions[emoji] = [];
                message.reactions[emoji].push(currentUser.id);
            }

            // Save to server
            await apiRequest(`/messages/${messageId}/reactions`, {
                method: 'POST',
                body: JSON.stringify({ reactions: message.reactions })
            });

            closeModals();
            renderMessages();
        }
    } catch (error) {
        console.error('Reaction error:', error);
    }
}

// ==================== REPLY FUNCTIONALITY ====================

function setReplyTo(message) {
    replyToMessage = message;
    updateReplyIndicator();
}

function clearReply() {
    replyToMessage = null;
    const indicator = document.getElementById('reply-indicator');
    if (indicator) {
        indicator.remove();
    }
}

function updateReplyIndicator() {
    // Remove existing indicator
    const existing = document.getElementById('reply-indicator');
    if (existing) existing.remove();

    if (replyToMessage) {
        const inputArea = document.getElementById('message-input-area');
        const indicator = document.createElement('div');
        indicator.id = 'reply-indicator';
        indicator.className = 'reply-indicator';
        indicator.innerHTML = `
            <span>↩️</span>
            <div class="reply-content">
                <div class="reply-sender">${replyToMessage.senderId === currentUser.id ? 'Siz' : '...'}</div>
                <div class="reply-text">${replyToMessage.text || (replyToMessage.attachment?.type === 'image' ? 'Rasm' : 'Xabar')}</div>
            </div>
            <button class="reply-close" onclick="clearReply()">✕</button>
        `;
        inputArea.parentNode.insertBefore(indicator, inputArea);
    }
}

// ==================== PIN MESSAGES ====================

async function pinMessage(messageId) {
    try {
        await apiRequest(`/messages/${messageId}/pin`, {
            method: 'POST'
        });
        closeModals();
        renderMessages();
    } catch (error) {
        alert(error.message);
    }
}

async function unpinMessage(messageId) {
    try {
        await apiRequest(`/messages/${messageId}/unpin`, {
            method: 'POST'
        });
        renderMessages();
    } catch (error) {
        console.error('Unpin error:', error);
    }
}

// ==================== FORWARD MESSAGES ====================

function showForwardModal(messageId) {
    forwardMessages = [messageId];
    showChatSelectionModal();
}

async function showChatSelectionModal() {
    document.getElementById('modal-overlay').classList.remove('hidden');

    try {
        const chats = await apiRequest('/chats');

        let modalHtml = `
            <div class="modal">
                <h3>Xabarni yuborish</h3>
                <div class="chat-selection-list">
        `;

        chats.forEach(chat => {
            const chatName = chat.type === 'group' ? chat.name : '...';
            modalHtml += `
                <div class="chat-select-item" onclick="forwardToChat(${chat.id})">
                    <span>${chatName}</span>
                </div>
            `;
        });

        modalHtml += `
                </div>
                <div class="modal-actions">
                    <button class="btn secondary" onclick="closeModals()">Bekor qilish</button>
                </div>
            </div>
        `;

        document.getElementById('modal-overlay').innerHTML = modalHtml;
    } catch (error) {
        alert(error.message);
    }
}

async function forwardToChat(chatId) {
    try {
        const messages = await apiRequest(`/chats/${currentChat.id}/messages`);

        for (const msgId of forwardMessages) {
            const message = messages.find(m => m.id === msgId);
            if (message) {
                await apiRequest(`/chats/${chatId}/messages`, {
                    method: 'POST',
                    body: JSON.stringify({
                        text: message.text,
                        attachment: message.attachment,
                        forwardedFrom: message.senderId
                    })
                });
            }
        }

        closeModals();
        alert('Xabar yuborildi!');
    } catch (error) {
        alert(error.message);
    }
}

// ==================== SCHEDULED MESSAGES ====================

function showScheduleModal() {
    document.getElementById('modal-overlay').classList.remove('hidden');

    const modalHtml = `
        <div class="modal">
            <h3>Xabarni rejalashtirish</h3>
            <input type="datetime-local" id="schedule-time" style="width: 100%; padding: 12px; margin: 10px 0; border: 1px solid #ddd; border-radius: 12px;">
            <div class="modal-actions">
                <button class="btn secondary" onclick="closeModals()">Bekor qilish</button>
                <button class="btn primary" onclick="scheduleMessage()">Rejalashtirish</button>
            </div>
        </div>
    `;

    document.getElementById('modal-overlay').innerHTML = modalHtml;
}

async function scheduleMessage() {
    const scheduleTime = document.getElementById('schedule-time').value;
    const text = messageInput.value.trim();

    if (!scheduleTime) {
        alert('Sana va vaqtni tanlang!');
        return;
    }

    try {
        await apiRequest(`/chats/${currentChat.id}/messages`, {
            method: 'POST',
            body: JSON.stringify({
                text: text || '',
                attachment: currentFile,
                scheduledFor: new Date(scheduleTime).toISOString()
            })
        });

        closeModals();
        messageInput.value = '';
        currentFile = null;
        document.getElementById('file-input').value = '';

        alert('Xabar rejalashtirildi!');
        renderChatList();
    } catch (error) {
        alert(error.message);
    }
}

// ==================== AUDIO MESSAGE PLAYBACK ====================

function toggleAudioPlayback(audioId) {
    const audio = document.getElementById(`audio-${audioId}`);
    const playBtn = document.getElementById(`audio-play-${audioId}`);

    if (audio.paused) {
        // Pause all other audio
        document.querySelectorAll('.audio-message audio').forEach(a => {
            if (a.id !== `audio-${audioId}`) {
                a.pause();
                a.closest('.audio-message').querySelector('.audio-play-btn').textContent = '▶️';
            }
        });
        audio.play();
        playBtn.textContent = '⏸️';
    } else {
        audio.pause();
        playBtn.textContent = '▶️';
    }
}

function updateAudioProgress(audioId) {
    const audio = document.getElementById(`audio-${audioId}`);
    const progress = document.getElementById(`audio-progress-${audioId}`);
    const duration = document.getElementById(`audio-duration-${audioId}`);

    if (audio && progress) {
        const percent = (audio.currentTime / audio.duration) * 100;
        progress.style.width = percent + '%';
    }

    if (duration && audio.duration) {
        const mins = Math.floor(audio.duration / 60);
        const secs = Math.floor(audio.duration % 60);
        duration.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
    }
}

// ==================== CHANNELS SUPPORT ====================

async function createChannel() {
    const channelName = prompt('Kanal nomini kiriting:');
    if (!channelName) return;

    try {
        const channel = await apiRequest('/chats/channel', {
            method: 'POST',
            body: JSON.stringify({ name: channelName })
        });

        renderChatList();
        openChat(channel);
    } catch (error) {
        alert(error.message);
    }
}

// ==================== READ RECEIPTS ====================

function getMessageStatus(status) {
    if (status === 'seen') {
        return '<span class="message-status-icon seen">✓✓</span>';
    } else if (status === 'delivered') {
        return '<span class="message-status-icon delivered">✓✓</span>';
    } else {
        return '<span class="message-status-icon sent">✓</span>';
    }
}

// Format time
function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();

    // Check if today
    const isToday = date.toDateString() === now.toDateString();

    // Check if yesterday
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();

    if (isToday) {
        return date.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
    } else if (isYesterday) {
        return 'Kecha ' + date.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
    } else {
        return date.toLocaleDateString('uz-UZ', { day: 'numeric', month: 'short' }) + ' ' +
            date.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
    }
}

// Get message status icon
function getMessageStatus(status) {
    if (status === 'seen') {
        return '<span class="message-status seen">✓✓</span>';
    } else if (status === 'delivered') {
        return '<span class="message-status delivered">✓✓</span>';
    } else {
        return '<span class="message-status sent">✓</span>';
    }
}

// Filter chats
function filterChats() {
    renderChatList(searchInput.value.trim());
}

// Modal functions
async function showCreateGroupModal() {
    document.getElementById('modal-overlay').classList.remove('hidden');
    document.getElementById('create-group-modal').classList.remove('hidden');

    const usersList = document.getElementById('group-members');
    usersList.innerHTML = '';

    // Refresh users cache
    usersCache = await apiRequest('/users');

    usersCache.filter(u => u.id !== currentUser.id).forEach(user => {
        usersList.innerHTML += `
            <label class="user-checkbox">
                <input type="checkbox" value="${user.id}">
                ${user.name}
            </label>
        `;
    });
}

async function showAddUserModal() {
    document.getElementById('modal-overlay').classList.remove('hidden');
    document.getElementById('add-user-modal').classList.remove('hidden');

    const usersList = document.getElementById('available-users');
    usersList.innerHTML = '<p style="margin-bottom: 10px; color: #666;">Yangi suhbat bosish uchun foydalanuvchini bosing:</p>';

    // Refresh users cache
    usersCache = await apiRequest('/users');

    // Get all users except current user
    const availableUsers = usersCache.filter(u => u.id !== currentUser.id);

    if (availableUsers.length === 0) {
        usersList.innerHTML += '<p>Boshqa foydalanuvchilar yo\'q</p>';
        return;
    }

    availableUsers.forEach(user => {
        usersList.innerHTML += `
            <div class="user-item" onclick="startPrivateChat(${user.id})" style="cursor: pointer; padding: 10px; border-bottom: 1px solid #eee; display: flex; align-items: center; gap: 10px;">
                <img src="${getAvatarUrl(user.avatar)}" alt="${user.name}" style="width: 40px; height: 40px; border-radius: 50%;">
                <div>
                    <div style="font-weight: 600;">${user.name}</div>
                    <div style="font-size: 12px; color: ${user.online ? '#4caf50' : '#888'};">${user.online ? 'Online' : 'Offline'}</div>
                </div>
            </div>
        `;
    });
}

// Start private chat with user
async function startPrivateChat(userId) {
    try {
        const chat = await apiRequest('/chats/private', {
            method: 'POST',
            body: JSON.stringify({ userId })
        });
        closeModals();
        openChat(chat);
    } catch (error) {
        alert(error.message);
    }
}

function showProfileModal() {
    document.getElementById('modal-overlay').classList.remove('hidden');
    document.getElementById('profile-modal').classList.remove('hidden');

    document.getElementById('profile-avatar').src = getAvatarUrl(currentUser.avatar);
    document.getElementById('edit-profile-name').value = currentUser.name;
}

function closeModals() {
    document.getElementById('modal-overlay').classList.add('hidden');
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
}

// Create group
async function createGroup() {
    const groupName = document.getElementById('group-name').value.trim();
    const groupImage = document.getElementById('group-image').files[0];

    if (!groupName) {
        alert('Guruh nomini kiriting!');
        return;
    }

    const selectedMembers = Array.from(document.querySelectorAll('#group-members input:checked'))
        .map(input => parseInt(input.value));

    try {
        const newChat = await apiRequest('/chats/group', {
            method: 'POST',
            body: JSON.stringify({ name: groupName, participants: selectedMembers })
        });

        closeModals();
        renderChatList();
        openChat(newChat);
    } catch (error) {
        alert(error.message);
    }
}

// Save profile
async function saveProfile() {
    const newName = document.getElementById('edit-profile-name').value.trim();
    const newImage = document.getElementById('edit-profile-image').files[0];

    try {
        const updates = { name: newName };
        if (newImage) {
            // Check if it's an image
            if (newImage.type.startsWith('image/')) {
                // Convert image to base64
                const reader = new FileReader();
                updates.avatar = await new Promise((resolve, reject) => {
                    reader.onload = (e) => resolve(e.target.result);
                    reader.onerror = (e) => reject(new Error('Rasm o\'qishda xatolik'));
                    reader.readAsDataURL(newImage);
                });
            } else {
                // For non-image files, show alert
                alert('Iltimos, rasm fayli tanlang!');
                return;
            }
        }

        const data = await apiRequest('/users/profile', {
            method: 'PUT',
            body: JSON.stringify(updates)
        });

        currentUser = data.user;
        updateUserInfo();
        closeModals();
    } catch (error) {
        alert('Xatolik: ' + (error.message || 'Noma\'lum xatolik'));
        console.error('Profile save error:', error);
    }
}

// Edit current chat
async function editCurrentChat() {
    if (!currentChat) return;

    if (currentChat.type === 'group') {
        showEditGroupModal();
    } else {
        showProfileModal();
    }
}

// Show edit group modal
async function showEditGroupModal() {
    document.getElementById('modal-overlay').classList.remove('hidden');
    document.getElementById('edit-group-modal').classList.remove('hidden');

    document.getElementById('group-avatar-preview').src = getAvatarUrl(currentChat.avatar);
    document.getElementById('edit-group-name').value = currentChat.name;

    // Load members with checkboxes
    const membersList = document.getElementById('edit-group-members');
    membersList.innerHTML = '<p>Yuklanmoqda...</p>';

    try {
        // Refresh users cache
        if (!usersCache.length) {
            usersCache = await apiRequest('/users');
        }

        const memberIds = currentChat.participants || [];
        const members = usersCache.filter(u => memberIds.includes(u.id));

        membersList.innerHTML = '';
        members.forEach(member => {
            const isCurrentUser = member.id === currentUser.id;
            membersList.innerHTML += `
                <div class="member-item ${isCurrentUser ? 'current-user-member' : ''}">
                    ${!isCurrentUser ? `<button class="remove-member-btn" data-id="${member.id}" style="margin-left:auto; background:none;border:none;cursor:pointer;color:#ff4444;font-size:12px;">❌</button>` : ''}
                    <img src="${getAvatarUrl(member.avatar)}" alt="${member.name}" class="member-avatar">
                    <span>${member.name} ${isCurrentUser ? '(Siz)' : ''}</span>
                </div>
            `;
        });

        // Add event listeners for remove buttons
        document.querySelectorAll('.remove-member-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const userId = e.target.dataset.id;
                if (confirm('Bu a\'zoni guruhdan chiqarmoqchimisiz?')) {
                    try {
                        await apiRequest(`/chats/${currentChat.id}/users/${userId}`, {
                            method: 'DELETE'
                        });
                        // Refresh chat data
                        const updatedChats = await apiRequest('/chats');
                        currentChat = updatedChats.find(c => c.id === currentChat.id);
                        showEditGroupModal();
                        renderChatList();
                    } catch (error) {
                        alert(error.message);
                    }
                }
            });
        });
    } catch (error) {
        membersList.innerHTML = '<p>Xatolik yuz berdi</p>';
    }
}

// Show add group user modal
async function showAddGroupUserModal() {
    document.getElementById('modal-overlay').classList.remove('hidden');
    document.getElementById('add-group-user-modal').classList.remove('hidden');

    const usersList = document.getElementById('group-available-users');
    usersList.innerHTML = '<p>Yuklanmoqda...</p>';

    try {
        // Refresh users cache
        if (!usersCache.length) {
            usersCache = await apiRequest('/users');
        }

        const existingParticipants = currentChat.participants || [];
        const availableUsers = usersCache.filter(u => !existingParticipants.includes(u.id) && u.id !== currentUser.id);

        usersList.innerHTML = '';
        if (availableUsers.length === 0) {
            usersList.innerHTML = '<p>Qo\'shish uchun foydalanuvchilar yo\'q</p>';
            return;
        }

        availableUsers.forEach(user => {
            usersList.innerHTML += `
                <div class="user-checkbox">
                    <input type="checkbox" class="add-user-checkbox" value="${user.id}">
                    <img src="${getAvatarUrl(user.avatar)}" alt="${user.name}" class="member-avatar">
                    <span>${user.name} (@${user.username})</span>
                </div>
            `;
        });
    } catch (error) {
        usersList.innerHTML = '<p>Xatolik yuz berdi</p>';
    }
}

// Save group users
async function saveGroupUsers() {
    const selectedUsers = Array.from(document.querySelectorAll('.add-user-checkbox:checked'))
        .map(input => parseInt(input.value));

    if (selectedUsers.length === 0) {
        alert('Foydalanuvchi tanlamadingiz!');
        return;
    }

    try {
        for (const userId of selectedUsers) {
            await apiRequest(`/chats/${currentChat.id}/users`, {
                method: 'POST',
                body: JSON.stringify({ userId })
            });
        }

        // Refresh chat data
        const updatedChats = await apiRequest('/chats');
        currentChat = updatedChats.find(c => c.id === currentChat.id);

        closeModals();
        showEditGroupModal();
        renderChatList();
    } catch (error) {
        alert(error.message);
    }
}

// Save group
async function saveGroup() {
    const newName = document.getElementById('edit-group-name').value.trim();
    const newImage = document.getElementById('edit-group-image').files[0];

    if (!newName) {
        alert('Guruh nomini kiriting!');
        return;
    }

    try {
        const updates = { name: newName };
        if (newImage) {
            // Convert image to base64
            const reader = new FileReader();
            updates.avatar = await new Promise((resolve) => {
                reader.onload = (e) => resolve(e.target.result);
                reader.readAsDataURL(newImage);
            });
        }

        const data = await apiRequest(`/chats/${currentChat.id}`, {
            method: 'PUT',
            body: JSON.stringify(updates)
        });

        currentChat = data;
        updateChatHeader();
        renderChatList();
        closeModals();
    } catch (error) {
        alert(error.message);
    }
}

// Delete current chat
async function deleteCurrentChat() {
    if (!currentChat) return;

    if (confirm('Bu suhbatni o\'chirmoqchimisiz?')) {
        try {
            await apiRequest(`/chats/${currentChat.id}`, {
                method: 'DELETE'
            });

            currentChat = null;
            renderChatList();
            messagesContainer.innerHTML = `
                <div class="empty-chat">
                    <div class="empty-chat-icon">💬</div>
                    <p>Suhbatni tanlang</p>
                </div>
            `;
            document.getElementById('chat-name').textContent = '';
            document.getElementById('chat-status').textContent = '';
        } catch (error) {
            alert(error.message);
        }
    }
}

let selectedMessage = null;

// Show message actions modal
function showMessageActions(msg) {
    if (msg.senderId !== currentUser.id) return; // Only show for own messages

    selectedMessage = msg;
    document.getElementById('modal-overlay').classList.remove('hidden');
    document.getElementById('message-actions-modal').classList.remove('hidden');
}

// Edit message
function editMessage(messageId) {
    closeModals();

    const message = messagesContainer.querySelector(`[onclick*="editMessage(${messageId})"]`)?.closest('.message');
    if (!message) return;

    const textElement = message.querySelector('.message-text');
    currentEditingMessage = { id: messageId, text: textElement.textContent };

    document.getElementById('edit-message-text').value = currentEditingMessage.text;
    document.getElementById('modal-overlay').classList.remove('hidden');
    document.getElementById('edit-message-modal').classList.remove('hidden');
}

let currentEditingMessage = null;

async function saveEditedMessage() {
    if (!currentEditingMessage) return;

    const newText = document.getElementById('edit-message-text').value.trim();
    if (newText) {
        try {
            await apiRequest(`/messages/${currentEditingMessage.id}`, {
                method: 'PUT',
                body: JSON.stringify({ text: newText })
            });

            renderMessages();
            renderChatList();
        } catch (error) {
            alert(error.message);
        }
    }
    closeModals();
    currentEditingMessage = null;
}

// Delete message
async function deleteMessage(messageId) {
    closeModals();

    try {
        await apiRequest(`/messages/${messageId}`, {
            method: 'DELETE'
        });

        renderMessages();
        renderChatList();
    } catch (error) {
        alert(error.message);
    }

    selectedMessage = null;
}

// Logout
async function logout() {
    if (!confirm('Chiqishni xohlaysizmi?')) return;

    try {
        await apiRequest('/auth/logout', { method: 'POST' });
    } catch (error) {
        console.log('Logout error:', error);
    }

    currentUser = null;
    currentChat = null;

    authSection.classList.remove('hidden');
    appSection.classList.add('hidden');
}

// Toggle dark mode
function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    document.getElementById('dark-mode-btn').textContent = isDark ? '☀️' : '🌙';
    localStorage.setItem('darkMode', isDark ? 'enabled' : 'disabled');
}

// Initialize dark mode from localStorage
if (localStorage.getItem('darkMode') === 'enabled') {
    document.body.classList.add('dark-mode');
    document.getElementById('dark-mode-btn').textContent = '☀️';
}

// ==================== EMOJI PICKER ====================
const emojis = {
    smile: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶'],
    gest: ['👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💪', '🦾'],
    love: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '♥️', '💌', '👀', '👁️', '👅', '👄', '🥰', '😘', '😗', '😙', '😚'],
    obj: ['🎯', '🎨', '🎭', '🎪', '🎤', '🎧', '🎼', '🎹', '🥁', '🎷', '🎺', '🎸', '🪕', '🎻', '🎲', '♟️', '🎯', '🎳', '🎮', '🎰', '🧩']
};

function toggleEmojiPicker() {
    const picker = document.getElementById('emoji-picker');
    picker.classList.toggle('hidden');
    if (!picker.classList.contains('hidden')) {
        loadEmojis('smile');
        document.querySelector('.emoji-category-btn[data-category="smile"]').classList.add('active');
    }
}

function loadEmojis(category) {
    const grid = document.getElementById('emoji-grid');
    grid.innerHTML = '';

    emojis[category].forEach(emoji => {
        const item = document.createElement('div');
        item.className = 'emoji-item';
        item.textContent = emoji;
        item.addEventListener('click', () => {
            const input = document.getElementById('message-input');
            input.value += emoji;
            input.focus();
        });
        grid.appendChild(item);
    });
}

// ==================== VOICE/VIDEO CALLS ====================

function initiateVoiceCall() {
    if (!currentChat || currentChat.type === 'group') {
        alert('Bu funksiya faqat shaxsiy suhbatlar uchun mavjud!');
        return;
    }

    showCallModal('audio');
}

function initiateVideoCall() {
    if (!currentChat || currentChat.type === 'group') {
        alert('Bu funksiya faqat shaxsiy suhbatlar uchun mavjud!');
        return;
    }

    showCallModal('video');
}

function showCallModal(type) {
    const isVideo = type === 'video';

    document.getElementById('modal-overlay').classList.remove('hidden');
    document.getElementById('modal-overlay').innerHTML = `
        <div class="modal" style="text-align: center;">
            <h3>${isVideo ? 'Video' : 'Ovoz'} qo'ng'iroq</h3>
            <div id="call-status" style="margin: 20px 0;">
                <p>${isVideo ? '📹' : '📞'} Qo'ng'iroq boshlanmoqda...</p>
            </div>
            <div class="call-actions" style="display: flex; justify-content: center; gap: 20px; margin-top: 20px;">
                <button class="icon-btn" style="background: #ff4444; width: 60px; height: 60px; font-size: 24px;" onclick="endCall()">📞</button>
            </div>
            <p style="margin-top: 15px; font-size: 12px; color: #888;">Real vaqtda qo'ng'iroq uchun WebRTC serveri kerak</p>
        </div>
    `;

    // Simulate call
    setTimeout(() => {
        document.getElementById('call-status').innerHTML = `
            <p>☎️ ${currentChat.name || 'Foydalanuvchi'}</p>
            <p style="color: #4caf50;">00:00</p>
        `;
    }, 2000);
}

function endCall() {
    closeModals();
    alert('Qo\'ng\'iroq tugatildi');
}

// Initialize
init();
