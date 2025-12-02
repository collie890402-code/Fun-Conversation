/**
 * CelebChat - Logic
 */

// --- State ---
const state = {
    apiKey: localStorage.getItem('gemini_api_key') || '',
    currentCeleb: null,
    chatHistory: [], // Array of { role: 'user' | 'model', text: string }
    isProcessing: false
};

// --- DOM Elements ---
const views = {
    selection: document.getElementById('selection-view'),
    chat: document.getElementById('chat-view')
};

const modals = {
    settings: document.getElementById('settings-modal'),
    customCeleb: document.getElementById('custom-celeb-modal')
};

const elements = {
    apiKeyInput: document.getElementById('api-key'),
    chatCelebName: document.getElementById('chat-celeb-name'),
    chatHistory: document.getElementById('chat-history'),
    userInput: document.getElementById('user-input'),
    sendBtn: document.getElementById('send-btn'),
    tutorHint: document.getElementById('tutor-hint'),
    hintText: document.getElementById('hint-text')
};

// --- Initialization ---
function init() {
    if (state.apiKey) {
        elements.apiKeyInput.value = state.apiKey;
    }
    setupEventListeners();
}

function setupEventListeners() {
    // Navigation
    document.getElementById('settings-btn').addEventListener('click', () => showModal('settings'));
    document.getElementById('close-settings-btn').addEventListener('click', () => hideModal('settings'));
    document.getElementById('save-settings-btn').addEventListener('click', saveSettings);
    
    document.getElementById('back-btn').addEventListener('click', () => switchView('selection'));

    // Selection
    document.querySelectorAll('.card:not(.custom-card)').forEach(card => {
        card.addEventListener('click', () => {
            startChat(card.dataset.celeb, card.dataset.role);
        });
    });

    document.getElementById('custom-card').addEventListener('click', () => showModal('customCeleb'));
    document.getElementById('close-custom-btn').addEventListener('click', () => hideModal('customCeleb'));
    document.getElementById('start-custom-btn').addEventListener('click', () => {
        const name = document.getElementById('custom-name').value.trim();
        const role = document.getElementById('custom-role').value.trim();
        if (name && role) {
            startChat(name, role);
            hideModal('customCeleb');
        }
    });

    // Chat
    elements.sendBtn.addEventListener('click', handleSendMessage);
    elements.userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSendMessage();
    });

    document.querySelector('.close-hint').addEventListener('click', () => {
        elements.tutorHint.classList.add('hidden');
    });
}

// --- UI Logic ---
function switchView(viewName) {
    Object.values(views).forEach(el => {
        el.classList.add('hidden');
        el.classList.remove('active');
    });
    views[viewName].classList.remove('hidden');
    views[viewName].classList.add('active');
}

function showModal(name) {
    modals[name].classList.remove('hidden');
}

function hideModal(name) {
    modals[name].classList.add('hidden');
}

function saveSettings() {
    const key = elements.apiKeyInput.value.trim();
    if (key) {
        state.apiKey = key;
        localStorage.setItem('gemini_api_key', key);
        hideModal('settings');
        alert('API Key saved!');
    } else {
        alert('Please enter a valid API Key.');
    }
}

function startChat(name, role) {
    state.currentCeleb = { name, role };
    state.chatHistory = [];
    elements.chatCelebName.textContent = name;
    elements.chatHistory.innerHTML = '<div class="message system"><p>Start the conversation!</p></div>';
    elements.tutorHint.classList.add('hidden');
    switchView('chat');
}

function appendMessage(role, text) {
    const div = document.createElement('div');
    div.className = `message ${role}`;
    div.textContent = text;
    elements.chatHistory.appendChild(div);
    elements.chatHistory.scrollTop = elements.chatHistory.scrollHeight;
}

function showTypingIndicator() {
    const div = document.createElement('div');
    div.className = 'message celeb typing';
    div.id = 'typing-indicator';
    div.textContent = '...';
    elements.chatHistory.appendChild(div);
    elements.chatHistory.scrollTop = elements.chatHistory.scrollHeight;
}

function removeTypingIndicator() {
    const el = document.getElementById('typing-indicator');
    if (el) el.remove();
}

function showTutorHint(hint) {
    elements.hintText.textContent = hint;
    elements.tutorHint.classList.remove('hidden');
}

// --- Core Logic ---

async function handleSendMessage() {
    if (state.isProcessing) return;
    
    const text = elements.userInput.value.trim();
    if (!text) return;

    if (!state.apiKey) {
        alert('Please set your Google Gemini API Key in settings first.');
        return;
    }

    // 1. Show User Message
    appendMessage('user', text);
    elements.userInput.value = '';
    elements.tutorHint.classList.add('hidden');
    state.isProcessing = true;
    showTypingIndicator();

    try {
        // 2. Call API
        const response = await callGeminiAPI(text);
        removeTypingIndicator();

        // 3. Handle Response
        if (response.correctionNeeded) {
            showTutorHint(response.tutorFeedback);
            // Even if correction is needed, we might still want the celeb to reply, 
            // or we might want to wait for the user to try again.
            // For a game flow, let's have the celeb reply ANYWAY, but show the hint.
            // Or better: The prompt will handle the "Celebrity Persona" reply in the same JSON.
        }

        if (response.celebReply) {
            appendMessage('celeb', response.celebReply);
            state.chatHistory.push({ role: 'user', parts: [{ text: text }] });
            state.chatHistory.push({ role: 'model', parts: [{ text: response.celebReply }] });
        }

    } catch (error) {
        removeTypingIndicator();
        console.error(error);
        appendMessage('system', 'Error: ' + error.message);
    } finally {
        state.isProcessing = false;
    }
}

async function callGeminiAPI(userText) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${state.apiKey}`;
    
    // Construct the prompt
    // We need a structured JSON response to separate Tutor feedback from Celebrity reply.
    
    const systemPrompt = `
    You are acting as two entities: 
    1. A Celebrity Persona: ${state.currentCeleb.name} (${state.currentCeleb.role}).
    2. An English Tutor for high school students.

    Your task:
    1. Analyze the user's input: "${userText}".
    2. If the user's English has grammatical errors or is unnatural for a high school level:
       - Create a helpful "tutorFeedback" (hint or correction question).
    3. Generate a response as the Celebrity Persona ("celebReply"). 
       - Keep the persona authentic.
       - Use simple but natural English suitable for a high school learner.
    
    Output strictly valid JSON:
    {
        "correctionNeeded": boolean,
        "tutorFeedback": "string or null",
        "celebReply": "string"
    }
    `;

    // We include recent history for context
    // Note: For this simple implementation, we just send the system prompt + last user message.
    // In a full app, we'd format the history properly.
    
    // Let's try to include a bit of history context in the prompt if possible, or just rely on the user text for now to keep it simple and robust.
    // To make it conversational, we should include history.
    
    const historyContext = state.chatHistory.map(msg => 
        `${msg.role === 'user' ? 'User' : state.currentCeleb.name}: ${msg.parts[0].text}`
    ).join('\n');

    const finalPrompt = `
    ${systemPrompt}

    Conversation History:
    ${historyContext}

    User: ${userText}
    `;

    const payload = {
        contents: [{
            parts: [{ text: finalPrompt }]
        }]
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error('API request failed');
    }

    const data = await response.json();
    const rawText = data.candidates[0].content.parts[0].text;
    
    // Clean up markdown code blocks if present
    const jsonString = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    
    return JSON.parse(jsonString);
}

// Start
init();
