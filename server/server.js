// --- 1. ALL IMPORTS AT THE TOP ---
const fetch = require("node-fetch");
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');   
const dotenv = require('dotenv');
const Groq = require('groq-sdk'); 
const { validateEmail, validateUsername, validatePassword } = require('./validation');

dotenv.config();

// --- 2. INITIALIZE APP AND MIDDLEWARE (ONLY ONCE) ---
const app = express();
app.use(express.json());
app.use(cors());

// --- 3. INITIALIZE API CLIENTS AND DATABASE ---
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY }); 

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected successfully."))
  .catch(err => console.error("MongoDB connection error:", err));

// --- 4. DEFINE DATABASE MODELS ---
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  username: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
}, { timestamps: true });
const User = mongoose.model('User', userSchema, 'usertable');

// --- 5. DEFINE ALL API ENDPOINTS ---

// CHATBOT RESPONSE ENDPOINT
app.post('/api/get-response', async (req, res) => {
  try {
    const { userMessage, messageHistory } = req.body;
    const systemPrompt = `
You are Dost, a compassionate AI companion. Your goal is to be a trustworthy Indian friend who listens with heart and provides warm, empathetic support.

Language: Mirror user's language (English or Hinglish)
Tone: warm, validating, encouraging
Length: 2-4 sentences
Never use asterisks or markdown
    `;

    const conversationHistory = [
      { role: "system", content: systemPrompt },
      ...messageHistory.map(m => ({ role: m.sender === 'user' ? 'user' : 'assistant', content: m.text })),
      { role: "user", content: userMessage }
    ];

    const chatCompletion = await groq.chat.completions.create({
      messages: conversationHistory,
      model: "moonshotai/kimi-k2-instruct",
    });

    const responseText = chatCompletion.choices[0]?.message?.content || "I'm here to listen. Tell me more.";
    res.json({ therapistResponse: responseText });
  } catch (error) {
    console.error("Groq error:", error);
    res.status(500).json({ error: "AI failed to respond" });
  }
});

// TEXT TO SPEECH ENDPOINT (FIXED)
app.post('/api/text-to-speech', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "Text is required" });

    const cleanedText = text
      .replace(/\*.*?\*/g, '')
      .replace(/[\u{1F600}-\u{1F64F}]/gu, '');

    const voiceId = "21m00Tcm4TlvDq8ikWAM"; // Rachel therapist voice

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
      {
        method: "POST",
        headers: {
          "xi-api-key": process.env.ELEVENLABS_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          text: cleanedText,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.4,
            similarity_boost: 0.8
          }
        })
      }
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error(err);
    }

    res.setHeader("Content-Type", "audio/mpeg");
    response.body.pipe(res);
  } catch (error) {
    console.error("ElevenLabs error:", error);
    res.status(500).json({ error: "Speech generation failed" });
  }
});


// REGISTER
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, username, password } = req.body;

    if (!validateEmail(email)) return res.status(400).json({ message: "Invalid email" });
    if (validateUsername(username).length) return res.status(400).json({ message: "Invalid username" });
    if (validatePassword(password).length) return res.status(400).json({ message: "Weak password" });

    const exists = await User.findOne({ $or: [{ email }, { username }] });
    if (exists) return res.status(400).json({ message: "User already exists" });

    const hashed = await bcrypt.hash(password, 10);
    const user = new User({ name, email, username, password: hashed });
    await user.save();

    res.json({ message: "Account created" });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ message: "Registration failed" });
  }
});

// LOGIN
app.post('/api/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;

    const user = await User.findOne({ $or: [{ email: identifier }, { username: identifier }] });
    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: "Invalid credentials" });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "24h" });

    res.json({
      token,
      user: { id: user._id, name: user.name, username: user.username, email: user.email }
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Login failed" });
  }
});

// --- 6. START SERVER ---
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
