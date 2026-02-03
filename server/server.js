// --- 1. ALL IMPORTS AT THE TOP ---
const fetch = require("node-fetch");
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const dotenv = require('dotenv');
const Groq = require('groq-sdk');
const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { validateEmail, validateUsername, validatePassword } = require('./validation');

dotenv.config();

// --- 2. INITIALIZE APP AND MIDDLEWARE (ONLY ONCE) ---
const app = express();
app.use(express.json());
app.use(cors());

// --- SERVE STATIC FILES IN PRODUCTION ---
const path = require('path');
const distPath = path.join(__dirname, '..', 'dist');

// Serve static files from the React app build directory
app.use(express.static(distPath));

// --- 3. INITIALIZE API CLIENTS AND DATABASE ---
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ---------- GROQ RETRY + FALLBACK ----------
const GROQ_MODELS = [
  "moonshotai/kimi-k2-instruct",
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant"
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function groqWithRetry(messages, maxRetries = 3) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    for (const model of GROQ_MODELS) {
      try {
        return await groq.chat.completions.create({
          model,
          messages
        });
      } catch (err) {
        lastError = err;

        if (err?.status === 503) {
          const retryAfter =
            Number(err.headers?.['retry-after'] || 15) * 1000;

          console.warn(
            `Groq overload on ${model}. Retrying in ${retryAfter / 1000}s`
          );

          await sleep(retryAfter);
          continue;
        }

        throw err;
      }
    }
  }

  throw lastError;
}
// ------------------------------------------

const dns = require('dns');
const dnsPromises = dns.promises;

async function connectWithDnsFallback() {
  const uri = process.env.MONGO_URI;
  const hostMatch = uri && uri.match(/@([^/]+)\//);
  const host = hostMatch ? hostMatch[1] : '';
  const srvName = `_mongodb._tcp.${host}`;

  try {
    await dnsPromises.resolveSrv(srvName);
  } catch {
    dns.setServers(['8.8.8.8', '8.8.4.4']);
  }

  mongoose.connect(uri, {
    tls: true,
    connectTimeoutMS: 10000,
    serverSelectionTimeoutMS: 10000
  })
    .then(() => console.log("✅ MongoDB connected"))
    .catch(err => console.error("❌ MongoDB connection error:", err));
}

connectWithDnsFallback();

// --- 4. DEFINE DATABASE MODELS ---
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  username: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
}, { timestamps: true });

const User = mongoose.model('User', userSchema, 'usertable');

const emotionHistorySchema = new mongoose.Schema({
  userid: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  emotion: { type: String, required: true },
  confidence: { type: Number },
  timestamp: { type: Date, default: Date.now },
}, { timestamps: false });

const EmotionHistory = mongoose.model('EmotionHistory', emotionHistorySchema, 'emotion_history');

const therapySessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: Date, default: Date.now },
  duration: { type: Number }, // in minutes
  detectedEmotion: { type: String },
  specialty: { type: String },
  messages: [{
    sender: String,
    text: String,
    timestamp: Date
  }]
}, { timestamps: true });

const TherapySession = mongoose.model('TherapySession', therapySessionSchema, 'therapy_session');

// Middleware to verify JWT token
const auth = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: "Access denied" });

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    req.user = verified;
    next();
  } catch (err) {
    res.status(400).json({ message: "Invalid token" });
  }
};

// GET EMOTION HISTORY
app.get('/api/emotion-history', auth, async (req, res) => {
  try {
    const history = await EmotionHistory.find({ userid: req.user.id }).sort({ timestamp: -1 });
    res.json(history);
  } catch (err) {
    console.error('Error fetching emotion history:', err);
    res.status(500).json({ message: "Error fetching emotion history" });
  }
});

// SAVE EMOTION DETECTION
app.post('/api/emotion-history', auth, async (req, res) => {
  try {
    const { emotion, confidence, timestamp } = req.body;
    const newEntry = new EmotionHistory({
      userid: req.user.id,
      emotion,
      confidence,
      timestamp: timestamp || new Date()
    });
    const saved = await newEntry.save();
    res.json(saved);
  } catch (err) {
    console.error('Error saving emotion:', err);
    res.status(500).json({ message: "Error saving emotion" });
  }
});

// GET THERAPY SESSIONS
app.get('/api/therapy-sessions', auth, async (req, res) => {
  try {
    const sessions = await TherapySession.find({ userId: req.user.id }).sort({ date: -1 });
    res.json(sessions);
  } catch (err) {
    console.error('Error fetching therapy sessions:', err);
    res.status(500).json({ message: "Error fetching therapy sessions" });
  }
});

// SAVE THERAPY SESSION
app.post('/api/therapy-sessions', auth, async (req, res) => {
  try {
    const { date, duration, messages, detectedEmotion, specialty } = req.body;
    const newSession = new TherapySession({
      userId: req.user.id,
      date: date || new Date(),
      duration,
      messages,
      detectedEmotion: detectedEmotion || 'neutral',
      specialty
    });
    const saved = await newSession.save();
    res.json(saved);
  } catch (err) {
    console.error('Error saving therapy session:', err);
    res.status(500).json({ message: "Error saving therapy session" });
  }
});

// CHATBOT RESPONSE ENDPOINT
app.post("https://server-wvln.onrender.com/api/get-response", async (req, res) => {
  try {
    const { userMessage, messageHistory, emotion, specialty, specialtyPrompt, apiProvider = 'groq' } = req.body;

    // Base system prompt: concise, casual therapist voice
    const basePrompt = `You are a calm, cozy, professional therapist who speaks like a caring friend on WhatsApp: brief, warm, and practical.
  Keep replies very short — 1–2 short sentences or lines. Open by acknowledging feelings, then offer one practical next step or coping idea.
  Use casual, friendly language (light humor occasionally to ease tension), keep tone soothing and respectful, and include 1 simple emoji when it fits.
  Be practical and action-oriented but gentle — avoid long explanations or clinical lists unless asked.

  If the user mixes languages, mirror their language (reply in Hinglish if they do).

  CRITICAL: If the user mentions suicide, self-harm, or imminent danger, respond with urgent, non-judgmental care, say their life matters, encourage contacting emergency services or trusted people immediately, provide crisis hotline suggestions, and do NOT provide methods or instructions.`;

    // Specialty guidance
    const specialtyInstruction = specialtyPrompt
      || (specialty ? `Focus the session on ${specialty}. Tailor your language and suggestions to ${specialty}.` : 'Provide empathetic, open-ended emotional support.');

    // Mood-specific guidance
    const moodInstructionMap = {
      sad: 'Be extra gentle and validating; normalize feelings and encourage small supportive steps.',
      angry: 'Acknowledge the intensity; provide calming suggestions and encourage safe expression.',
      happy: 'Reinforce positive feelings and invite reflection on what is working well.',
      surprised: 'Invite exploration about the surprise and its context in a calm manner.',
      fear: 'Use reassuring language and suggest grounding techniques.',
      neutral: 'Maintain a warm, open tone and invite sharing.'
    };

    const moodInstruction = emotion ? (moodInstructionMap[emotion] || '') : '';
    const systemPrompt = [basePrompt, specialtyInstruction, moodInstruction].filter(Boolean).join('\n\n');

    let responseText = "";

    if (apiProvider === 'chatgpt') {
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: systemPrompt },
          ...messageHistory.map(m => ({
            role: m.sender === 'user' ? 'user' : 'assistant',
            content: m.text
          })),
          { role: "user", content: userMessage }
        ],
      });
      responseText = completion.choices[0]?.message?.content;
    }
    else if (apiProvider === 'gemini') {
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const chat = model.startChat({
        history: [
          { role: "user", parts: [{ text: systemPrompt + "\n\nUnderstood. I will act as this therapist." }] },
          { role: "model", parts: [{ text: "I understand. I am ready to help as your therapist." }] },
          ...messageHistory.map(m => ({
            role: m.sender === 'user' ? 'user' : 'model',
            parts: [{ text: m.text }]
          })),
        ],
      });
      const result = await chat.sendMessage(userMessage);
      responseText = result.response.text();
    }
    else {
      // Default: Groq
      const conversationHistory = [
        { role: "system", content: systemPrompt },
        ...messageHistory.map(m => ({
          role: m.sender === 'user' ? 'user' : 'assistant',
          content: m.text
        })),
        { role: "user", content: userMessage }
      ];
      const chatCompletion = await groqWithRetry(conversationHistory);
      responseText = chatCompletion.choices[0]?.message?.content;
    }

    if (!responseText) {
      responseText = "I'm here with you. Tell me what’s going on.";
    }

    res.json({ therapistResponse: responseText });

  } catch (error) {
    console.error("AI Error:", error?.message || error);
    res.status(503).json({
      error: "The selected AI service is currently unavailable. Please try another one."
    });
  }
});



// REGISTER
app.post("/api/register", async (req, res) => {
  try {
    const { name, email, username, password } = req.body;

    if (!validateEmail(email)) return res.status(400).json({ message: "Invalid email" });
    if (validateUsername(username).length) return res.status(400).json({ message: "Invalid username" });
    if (validatePassword(password).length) return res.status(400).json({ message: "Weak password" });

    const exists = await User.findOne({ $or: [{ email }, { username }] });
    if (exists) return res.status(400).json({ message: "User already exists" });

    const hashed = await bcrypt.hash(password, 10);
    await new User({ name, email, username, password: hashed }).save();

    res.json({ message: "Account created" });

  } catch {
    res.status(500).json({ message: "Registration failed" });
  }
});

// LOGIN


app.post("/api/login", async (req, res) => {
  try {
    const { identifier, password } = req.body;

    const user = await User.findOne({
      $or: [{ email: identifier }, { username: identifier }]
    });

    if (!user || !(await bcrypt.compare(password, user.password)))
      return res.status(400).json({ message: "Invalid credentials" });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "24h"
    });

    res.json({
      token,
      user: { id: user._id, name: user.name, username: user.username, email: user.email }
    });

  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Login failed" });
  }
});

// --- CATCH-ALL ROUTE FOR REACT ROUTER ---
// This must be AFTER all API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// --- 6. START SERVER ---
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
