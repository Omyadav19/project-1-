// TherapySessionPage.jsx (UPDATED: Browser-based TTS with Autoplay Fix)

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Heart, MessageCircle, Mic, MicOff, Home, User, Brain, Shield, Lightbulb } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';
import useSpeechRecognition from '../hooks/useSpeechRecognition';

// Simple Browser-based TTS queue manager using SpeechSynthesis API
class TTSQueue {
    constructor() {
        this.queue = [];
        this.speaking = false;
        this.lastPlayed = null;
        this.isBlocked = false;
    }

    enqueue(text) {
        if (!text || !text.trim()) return;
        if (this.lastPlayed === text) return;
        this.queue.push(text);
        this._process();
    }

    _process() {
        // If already speaking, or queue is empty, or explicitly blocked by browser autoplay
        if (this.speaking || this.queue.length === 0 || this.isBlocked) return;

        this.speaking = true;
        const text = this.queue.shift();

        // Clean text: remove asterisks (actions) and emojis for cleaner speech
        const cleanedText = text
            .replace(/\*.*?\*/g, '')
            .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '');

        const utterance = new SpeechSynthesisUtterance(cleanedText);

        // Try to find a nice female/calm voice
        const voices = window.speechSynthesis.getVoices();
        const preferredVoice = voices.find(v =>
            (v.name.includes('Google') || v.name.includes('Female') || v.name.includes('Samantha') || v.name.includes('Victoria')) &&
            v.lang.startsWith('en')
        ) || voices.find(v => v.lang.startsWith('en'));

        if (preferredVoice) utterance.voice = preferredVoice;

        utterance.rate = 0.9;
        utterance.pitch = 1.0;

        utterance.onend = () => {
            this.speaking = false;
            this.lastPlayed = text;
            this._process();
        };

        utterance.onerror = (event) => {
            console.warn('SpeechSynthesis error:', event.error);
            this.speaking = false;

            if (event.error === 'not-allowed') {
                // Browser blocked autoplay audio. We wait for user interaction to resume.
                console.log('Speech blocked. Queue paused until user interaction.');
                this.isBlocked = true;
                this.queue.unshift(text); // Put back to retry
            } else {
                this._process(); // For other errors, skip and move on
            }
        };

        window.speechSynthesis.speak(utterance);
    }

    // Call this on user interaction (click/keypress) to unlock the queue
    resume() {
        if (this.isBlocked) {
            this.isBlocked = false;
            console.log('Browser interaction detected. Resuming speech queue.');
            this._process();
        }
    }

    cancel() {
        window.speechSynthesis.cancel();
        this.queue = [];
        this.speaking = false;
        this.isBlocked = false;
    }
}

const TherapySessionPage = () => {
    const navigate = useNavigate();
    const { user, addTherapySession, setSadDetectionCount, currentEmotion, apiProvider, setApiProvider } = useApp();
    const location = useLocation();
    const specialtyState = location.state || {};
    const specialtyName = specialtyState.specialtyName || 'Professional Therapy';
    const specialtyPrompt = specialtyState.specialtyPrompt || '';

    const [messages, setMessages] = useState([]);
    const [inputMessage, setInputMessage] = useState('');
    const [sessionStartTime] = useState(new Date());
    const [isTyping, setIsTyping] = useState(false);
    const [sessionPhase] = useState('introduction');
    const [userEmotionalState] = useState('');
    const [welcomeMessageSent, setWelcomeMessageSent] = useState(false);
    const messagesEndRef = useRef(null);
    const chatContainerRef = useRef(null);

    const { isListening, transcript, startListening, stopListening } = useSpeechRecognition();

    const ttsQueueRef = useRef(null);
    const [ttsReady, setTtsReady] = useState(false);
    const playedInitialRef = useRef(false);

    // initialize queue and setup autoplay "unlocker"
    useEffect(() => {
        if (!ttsQueueRef.current) {
            ttsQueueRef.current = new TTSQueue();
        }
        setTtsReady(true);

        const handleUnlock = () => {
            ttsQueueRef.current?.resume();
            // Optional: can also play a tiny silent sound to further "warm up" the audio context if needed
            // But resume() should be enough for SpeechSynthesis
        };

        // Browser allows sound after any click or keypress
        window.addEventListener('click', handleUnlock);
        window.addEventListener('keydown', handleUnlock);

        return () => {
            ttsQueueRef.current?.cancel();
            window.removeEventListener('click', handleUnlock);
            window.removeEventListener('keydown', handleUnlock);
        };
    }, []);

    useEffect(() => {
        if (transcript) {
            setInputMessage(transcript);
        }
    }, [transcript]);

    const getTherapeuticResponse = async (userMessage, messageHistory) => {
        try {
            const response = await fetch('/api/get-response', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userMessage,
                    messageHistory: messageHistory.slice(-6),
                    emotion: currentEmotion?.emotion || 'neutral',
                    specialty: specialtyName,
                    specialtyPrompt,
                    apiProvider
                }),
            });
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            const data = await response.json();
            return data.therapistResponse;
        } catch (error) {
            console.error('Error fetching therapeutic response:', error);
            return "I'm having a little trouble connecting right now, but I'm still here to listen. Please tell me more.";
        }
    };

    // welcome message logic
    useEffect(() => {
        if (!user) {
            navigate('/login');
            return;
        }

        if (user && !welcomeMessageSent && ttsReady) {
            const emotion = currentEmotion?.emotion || 'neutral';
            const welcomeText = `${specialtyName} — I notice you're feeling ${emotion}. I'm here to listen. Want to share what's on your mind?`;

            if (messages.length > 0) {
                const latest = messages[messages.length - 1];
                if (latest && !playedInitialRef.current) {
                    const textToPlay = latest.text;
                    if (ttsQueueRef.current && ttsQueueRef.current.lastPlayed !== textToPlay) {
                        ttsQueueRef.current.enqueue(textToPlay);
                    }
                    playedInitialRef.current = true;
                }
            } else {
                if (!playedInitialRef.current) {
                    const initialMessage = {
                        id: Date.now().toString(),
                        text: welcomeText,
                        sender: 'therapist',
                        timestamp: new Date(),
                    };
                    setMessages([initialMessage]);
                    if (ttsQueueRef.current && ttsQueueRef.current.lastPlayed !== initialMessage.text) {
                        ttsQueueRef.current.enqueue(initialMessage.text);
                    }
                    playedInitialRef.current = true;
                }
            }
            setWelcomeMessageSent(true);
        }
    }, [user, navigate, welcomeMessageSent, ttsReady, currentEmotion, specialtyName, messages]);

    useEffect(() => {
        // Scoped scrolling: only scroll the chat container, not the entire page
        const timer = setTimeout(() => {
            if (chatContainerRef.current) {
                chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
            }
            ttsQueueRef.current?.resume();
        }, 100);
        return () => clearTimeout(timer);
    }, [messages, isTyping]);

    const handleSendMessage = async () => {
        if (!inputMessage.trim()) return;

        const userMessage = {
            id: Date.now().toString(),
            text: inputMessage,
            sender: 'user',
            timestamp: new Date(),
        };
        setMessages((prev) => [...prev, userMessage]);
        setInputMessage('');
        setIsTyping(true);

        const therapeuticResponse = await getTherapeuticResponse(inputMessage, [...messages, userMessage]);

        setIsTyping(false);

        const therapistMessage = {
            id: (Date.now() + 1).toString(),
            text: therapeuticResponse,
            sender: 'therapist',
            timestamp: new Date(),
        };

        setMessages((prev) => [...prev, therapistMessage]);
        ttsQueueRef.current?.enqueue(therapistMessage.text);
    };

    const handleEndSession = () => {
        const session = {
            id: Date.now().toString(),
            date: sessionStartTime,
            duration: Math.max(1, Math.ceil((new Date().getTime() - sessionStartTime.getTime()) / 1000 / 60)),
            messages,
            detectedEmotion: currentEmotion?.emotion || userEmotionalState || 'neutral',
            specialty: specialtyName,
            specialtyPrompt,
        };
        addTherapySession(session);
        setSadDetectionCount(0);
        navigate('/emotion-detection');
    };

    const toggleVoice = () => {
        if (isListening) {
            stopListening();
        } else {
            startListening();
        }
    };

    const bgClass = (() => {
        const mood = currentEmotion?.emotion || 'neutral';
        switch (mood) {
            case 'happy': return 'from-green-50 via-green-100 to-cyan-100';
            case 'sad': return 'from-blue-50 via-indigo-50 to-slate-100';
            case 'angry': return 'from-red-50 via-orange-50 to-amber-50';
            case 'surprised': return 'from-yellow-50 via-orange-50 to-pink-50';
            case 'fear': return 'from-purple-50 via-pink-50 to-indigo-50';
            default: return 'from-purple-50 via-blue-50 to-indigo-100';
        }
    })();

    return (
        <div className={`min-h-screen bg-gradient-to-br ${bgClass}`}>
            {/* Enhanced Header */}
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="sticky top-0 z-50 bg-white/90 backdrop-blur-sm border-b border-white/50 p-4 shadow-lg"
            >
                <div className="max-w-4xl mx-auto flex justify-between items-center">
                    <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 flex items-center justify-center shadow-lg">
                            <Heart className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-800">Professional Therapy Session</h1>
                            <p className="text-sm text-gray-600">Confidential • Safe Space • Judgment-Free</p>
                        </div>
                    </div>

                    <div className="flex items-center space-x-3">
                        <div className="hidden md:flex items-center space-x-2 bg-purple-100 px-3 py-1 rounded-full">
                            <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></div>
                            <span className="text-sm font-medium text-purple-700 capitalize">Session Active</span>
                        </div>

                        {/* API Selection Dropdown */}
                        <div className="relative">
                            <select
                                value={apiProvider}
                                onChange={(e) => setApiProvider(e.target.value)}
                                className="appearance-none bg-white border border-purple-200 text-gray-700 py-2 px-4 pr-8 rounded-full text-sm leading-tight focus:outline-none focus:bg-white focus:border-purple-500 transition-all cursor-pointer hover:shadow-md"
                            >
                                <option value="groq">Groq (Llama 3)</option>
                                <option value="gemini">Google Gemini</option>
                                <option value="chatgpt">OpenAI ChatGPT</option>
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-purple-600">
                                <Brain className="w-4 h-4" />
                            </div>
                        </div>

                        <motion.button
                            onClick={toggleVoice}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            className={`p-3 rounded-full transition-all duration-300 shadow-lg ${isListening ? 'bg-red-500 text-white shadow-red-200' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                                }`}
                        >
                            {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                        </motion.button>

                        <motion.button
                            onClick={handleEndSession}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            className="flex items-center px-6 py-3 bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-full text-sm font-medium shadow-lg hover:shadow-xl transition-all duration-300"
                        >
                            <Home className="w-4 h-4 mr-2" />
                            End Session
                        </motion.button>
                    </div>
                </div>
            </motion.div>

            {/* Enhanced Chat Area */}
            <div className="max-w-4xl mx-auto p-6">
                <div className="bg-white/90 backdrop-blur-sm rounded-3xl shadow-2xl border border-white/50 h-[75vh] flex flex-col">
                    {/* Messages */}
                    <div
                        ref={chatContainerRef}
                        className="flex-1 overflow-y-auto p-6 space-y-6"
                    >
                        {/* Autoplay Warning */}
                        <AnimatePresence>
                            {ttsQueueRef.current?.isBlocked && (
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0 }}
                                    className="bg-purple-100 text-purple-700 p-3 rounded-xl text-center text-sm font-medium border border-purple-200"
                                >
                                    Click anywhere to enable voice support 🔊
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <AnimatePresence>
                            {messages.map((message) => (
                                <motion.div
                                    key={message.id}
                                    layout
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0 }}
                                    className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                                >
                                    <div className={`max-w-2xl ${message.sender === 'user' ? 'order-2' : 'order-1'}`}>
                                        {message.sender === 'therapist' && (
                                            <div className="flex items-center mb-3">
                                                <div className="w-8 h-8 rounded-full bg-gradient-to-r from-green-400 to-blue-500 flex items-center justify-center mr-3 shadow-lg">
                                                    <Brain className="w-4 h-4 text-white" />
                                                </div>
                                                <span className="text-sm font-semibold text-gray-700">Professional Therapist</span>
                                                <div className="ml-2 px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">Licensed</div>
                                            </div>
                                        )}

                                        {message.sender === 'user' && (
                                            <div className="flex items-center justify-end mb-3">
                                                <span className="text-sm font-semibold text-gray-700 mr-3">You</span>
                                                <div className="w-8 h-8 rounded-full bg-gradient-to-r from-purple-400 to-pink-400 flex items-center justify-center shadow-lg">
                                                    <User className="w-4 h-4 text-white" />
                                                </div>
                                            </div>
                                        )}

                                        <div
                                            className={`px-6 py-4 rounded-2xl shadow-lg ${message.sender === 'user' ? 'bg-gradient-to-r from-purple-500 to-blue-500 text-white' : 'bg-gray-50 text-gray-800 border border-gray-200'
                                                }`}
                                        >
                                            <p className="text-sm leading-relaxed">{message.text}</p>
                                            <p className={`text-xs mt-3 ${message.sender === 'user' ? 'text-purple-100' : 'text-gray-500'}`}>
                                                {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                        </div>
                                    </div>
                                </motion.div>
                            ))}

                            {isTyping && (
                                <motion.div
                                    layout
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0 }}
                                    className="flex justify-start"
                                >
                                    <div className="max-w-2xl">
                                        <div className="flex items-center mb-3">
                                            <div className="w-8 h-8 rounded-full bg-gradient-to-r from-green-400 to-blue-500 flex items-center justify-center mr-3 shadow-lg">
                                                <Brain className="w-4 h-4 text-white" />
                                            </div>
                                            <span className="text-sm font-semibold text-gray-700">Professional Therapist</span>
                                            <div className="ml-2 px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">Thinking...</div>
                                        </div>
                                        <div className="bg-gray-50 px-6 py-4 rounded-2xl border border-gray-200 shadow-lg">
                                            <div className="flex space-x-2">
                                                {[0, 0.3, 0.6].map((delay, i) => (
                                                    <motion.div
                                                        key={i}
                                                        animate={{ scale: [1, 1.3, 1] }}
                                                        transition={{ duration: 1.5, repeat: Infinity, delay }}
                                                        className="w-3 h-3 bg-gray-400 rounded-full"
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Enhanced Input Area */}
                    <div className="border-t border-gray-200 p-6 bg-gray-50/50">
                        <div className="flex items-center space-x-4">
                            <div className="flex-1 relative">
                                <input
                                    type="text"
                                    value={inputMessage}
                                    onChange={(e) => setInputMessage(e.target.value)}
                                    onKeyPress={(e) => {
                                        if (e.key === 'Enter') {
                                            handleSendMessage();
                                            ttsQueueRef.current?.resume(); // interaction backup
                                        }
                                    }}
                                    placeholder="Share what's on your mind... this is your safe space"
                                    className="w-full px-6 py-4 rounded-full border border-gray-300 focus:border-purple-400 focus:ring-4 focus:ring-purple-100 transition-all duration-300 bg-white shadow-sm text-gray-800 placeholder-gray-500"
                                />
                            </div>

                            <motion.button
                                onClick={() => {
                                    handleSendMessage();
                                    ttsQueueRef.current?.resume(); // interaction backup
                                }}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                disabled={!inputMessage.trim() && !isListening}
                                className="w-14 h-14 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 text-white flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transition-all duration-300"
                            >
                                <Send className="w-6 h-6" />
                            </motion.button>
                        </div>
                    </div>
                </div>

                {/* Professional Info Section */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="mt-6 bg-gradient-to-r from-purple-100 to-blue-100 rounded-2xl p-6 shadow-lg">
                    <div className="flex items-start space-x-4">
                        <div className="w-14 h-14 rounded-full bg-gradient-to-r from-green-400 to-blue-500 flex items-center justify-center flex-shrink-0 shadow-lg">
                            <Shield className="w-7 h-7 text-white" />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-xl font-bold text-gray-800 mb-3">Professional AI Therapy Support</h3>
                            <p className="text-gray-700 text-sm leading-relaxed mb-4">
                                You're in a professional therapeutic environment designed to provide evidence-based mental health support.
                                This session uses advanced therapeutic techniques including Cognitive Behavioral Therapy (CBT),
                                mindfulness-based interventions, and solution-focused therapy approaches.
                            </p>
                            <div className="grid md:grid-cols-3 gap-4">
                                <div className="flex items-center space-x-2 text-sm text-gray-600">
                                    <div className="w-3 h-3 bg-green-400 rounded-full"></div>
                                    <span>Confidential Session</span>
                                </div>
                                <div className="flex items-center space-x-2 text-sm text-gray-600">
                                    <MessageCircle className="w-4 h-4" />
                                    <span>Voice Enabled</span>
                                </div>
                                <div className="flex items-center space-x-2 text-sm text-gray-600">
                                    <Brain className="w-4 h-4" />
                                    <span>Evidence-Based</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Techniques */}
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }} className="mt-4 grid md:grid-cols-3 gap-4">
                        <div className="bg-white/80 backdrop-blur-sm rounded-xl p-6 text-center shadow-lg border border-white/50">
                            <Brain className="w-8 h-8 text-purple-600 mx-auto mb-3" />
                            <h4 className="font-bold text-gray-800 mb-2">CBT Techniques</h4>
                            <p className="text-xs text-gray-600 leading-relaxed">Cognitive behavioral therapy methods to identify and change negative thought patterns</p>
                        </div>
                        <div className="bg-white/80 backdrop-blur-sm rounded-xl p-6 text-center shadow-lg border border-white/50">
                            <Heart className="w-8 h-8 text-pink-600 mx-auto mb-3" />
                            <h4 className="font-bold text-gray-800 mb-2">Emotional Support</h4>
                            <p className="text-xs text-gray-600 leading-relaxed">Empathetic listening, validation, and emotional regulation techniques</p>
                        </div>
                        <div className="bg-white/80 backdrop-blur-sm rounded-xl p-6 text-center shadow-lg border border-white/50">
                            <Lightbulb className="w-8 h-8 text-yellow-600 mx-auto mb-3" />
                            <h4 className="font-bold text-gray-800 mb-2">Solution-Focused</h4>
                            <p className="text-xs text-gray-600 leading-relaxed">Goal-oriented therapy focusing on solutions and personal strengths</p>
                        </div>
                    </motion.div>

                    {/* Crisis Support */}
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }} className="mt-4 bg-gradient-to-r from-red-50 to-orange-50 border-l-4 border-red-400 rounded-xl p-6 shadow-lg">
                        <h4 className="font-bold text-red-800 mb-3 flex items-center"><Shield className="w-5 h-5 mr-2" />Crisis Support Available 24/7</h4>
                        <p className="text-sm text-red-700 leading-relaxed">
                            If you're experiencing thoughts of self-harm or suicide, please reach out to a crisis helpline immediately.
                            This AI therapy provides professional support but cannot replace emergency mental health services.
                            Your safety and well-being are the top priority.
                        </p>
                    </motion.div>
                </motion.div>
            </div>
        </div>
    );
};

export default TherapySessionPage;