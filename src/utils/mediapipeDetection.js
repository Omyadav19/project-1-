import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

class MediaPipeEmotionDetector {
  constructor() {
    this.faceLandmarker = null;
    this.isInitialized = false;
    this.isLoading = false;
    
    
    this.emotions = ['neutral', 'happy', 'sad', 'angry', 'surprised', 'fear'];
    
    // Temporal smoothing state
    this.smoothingSize = 6;
    this._recentEmotionScores = [];
    this._lastDominant = 'neutral';
    this._stateScores = null; // Will be initialized on first frame
  }

  async initialize() {
    if (this.isInitialized || this.isLoading) {
      return this.isInitialized;
    }

    this.isLoading = true;
    
    try {
      console.log('Initializing MediaPipe Face Landmarker...');
      
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      );
      
      this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
          delegate: 'GPU'
        },
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
        runningMode: 'VIDEO',
        numFaces: 1
      });
      
      this.isInitialized = true;
      console.log('MediaPipe Face Landmarker initialized successfully');
      return true;
      
    } catch (error) {
      console.error('Failed to initialize MediaPipe Face Landmarker:', error);
      this.isInitialized = false;
      return false;
    } finally {
      this.isLoading = false;
    }
  }

  analyzeBlendshapes(blendshapes) {
    if (!blendshapes || blendshapes.length === 0) {
      return { emotion: 'neutral', confidence: 0.5, allScores: {} };
    }

    // --- Advanced Heuristics with Multiple Frame Aggregation Logic ---
    const s = {};
    blendshapes.forEach(b => { s[b.categoryName] = b.score; });

    // Internal helper for clean look
    const sum = (...args) => args.reduce((a, b) => a + (s[b] || 0), 0);
    const avg = (...args) => sum(...args) / args.length;
    const max = (...args) => Math.max(...args.map(name => s[name] || 0));

    const scores = {
      neutral: 0.2, // Base stability bias
      happy: 0,
      sad: 0,
      angry: 0,
      surprised: 0,
      fear: 0
    };

    // 1. HAPPY (Duchenne Smile Detection)
    const smile = max('mouthSmileLeft', 'mouthSmileRight');
    const cheek = avg('cheekSquintLeft', 'cheekSquintRight');
    const dimple = avg('mouthDimpleLeft', 'mouthDimpleRight');
    const stretch = avg('mouthStretchLeft', 'mouthStretchRight');
    scores.happy = (smile * 0.9) + (cheek * 0.4) + (dimple * 0.2) - (stretch * 0.1);

    // 2. SAD (Complex Grief Detection)
    const frown = max('mouthFrownLeft', 'mouthFrownRight');
    const browInnerUp = s.browInnerUp || 0; 
    const browDown = avg('browDownLeft', 'browDownRight');
    const mouthShrug = avg('mouthShrugLower', 'mouthShrugUpper');
    const chinRaiser = s.mouthLowerDownLeft || s.mouthLowerDownRight || 0;
    const eyeSquint = avg('eyeSquintLeft', 'eyeSquintRight');
    scores.sad = (frown * 0.7) + (browInnerUp * 0.6) + (browDown * 0.3) + (mouthShrug * 0.4) + (chinRaiser * 0.3) + (eyeSquint * 0.1);

    // 3. ANGRY (Intense Frustration Detection)
    const browLowerer = avg('browLowererLeft', 'browLowererRight');
    const mouthPress = avg('mouthPressLeft', 'mouthPressRight');
    const noseSneer = avg('noseSneerLeft', 'noseSneerRight');
    const mouthPucker = s.mouthPucker || 0;
    const eyeLookDown = avg('eyeLookDownLeft', 'eyeLookDownRight');
    scores.angry = (browLowerer * 1.0) + (eyeSquint * 0.3) + (mouthPress * 0.5) + (noseSneer * 0.5) + (mouthPucker * 0.3) + (eyeLookDown * 0.1);

    // 4. SURPRISE (High Activation Detection)
    const eyeWide = avg('eyeWideLeft', 'eyeWideRight');
    const browUpAll = avg('browInnerUp', 'browOuterUpLeft', 'browOuterUpRight');
    const jawOpen = s.jawOpen || 0;
    scores.surprised = (eyeWide * 0.8) + (browUpAll * 0.5) + (jawOpen * 0.6);

    // 5. FEAR (Tense High Activation Detection)
    const mouthStretch = avg('mouthStretchLeft', 'mouthStretchRight');
    scores.fear = (eyeWide * 0.6) + (browInnerUp * 0.5) + (mouthStretch * 0.7);

    // --- Dynamic Decision Conflict Resolution ---
    // Surprise vs Fear check
    if (scores.surprised > 0.3 && scores.fear > 0.2) {
      if (jawOpen > 0.3 && mouthStretch < 0.2) {
        scores.surprised += 0.2; // Likely surprise
        scores.fear -= 0.1;
      } else if (mouthStretch > 0.3) {
        scores.fear += 0.25; // Likely fear (tension)
        scores.surprised -= 0.15;
      }
    }

    // --- Softmax & Temporal Normalization ---
    const rawVector = this.emotions.map(e => scores[e]);
    const normalizedVector = this._softmax(rawVector);
    const currentFrameScores = {};
    this.emotions.forEach((e, i) => { currentFrameScores[e] = normalizedVector[i]; });

    // Exponential Weighted Moving Average (EWMA) for Multi-Frame Stability
    // alpha 0.3 means 30% current frame, 70% history
    const alpha = 0.7 ;
    if (!this._stateScores) { 
      this._stateScores = { ...currentFrameScores };
    } else {
      this.emotions.forEach(e => {
        this._stateScores[e] = (alpha * currentFrameScores[e]) + ((1 - alpha) * this._stateScores[e]);
      });
    }

    // --- Hysteresis (Sticky Decision for "Most Appropriate Decision") ---
    // Only switch dominant emotion if the new candidate is significantly stronger
    let dominantEmotion = this._lastDominant || 'neutral';
    let maxScore = this._stateScores[dominantEmotion];
    
    this.emotions.forEach(e => {
      if (e === dominantEmotion) return;
      // Requirement: must be at least 15% better than current to switch
      if (this._stateScores[e] > maxScore * 1.15 || this._stateScores[e] > maxScore + 0.15) {
        maxScore = this._stateScores[e];
        dominantEmotion = e;
      }
    });

    this._lastDominant = dominantEmotion;

    return {
      emotion: dominantEmotion,
      confidence: this._stateScores[dominantEmotion],
      allScores: this._stateScores
    };
  }

  _softmax(arr) {
    const maxVal = Math.max(...arr);
    const exps = arr.map(v => Math.exp((v - maxVal) * 5)); // 5 = sharpening factor
    const sumVal = exps.reduce((a, b) => a + b, 0);
    return exps.map(e => e / sumVal);
  }

  applyEmotionLogic(emotionScores, blendshapes) {
  }

  async detectEmotionFromVideo(videoElement, canvasElement) {
    if (!this.isInitialized || !this.faceLandmarker) {
      console.warn('MediaPipe Face Landmarker not initialized');
      return null;
    }

    if (!videoElement || videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
      return null;
    }

    try {
      // Set canvas size to match video
      canvasElement.width = videoElement.videoWidth;
      canvasElement.height = videoElement.videoHeight;
      
      const ctx = canvasElement.getContext('2d');
      ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);
      
      // Detect faces and blendshapes
      const results = this.faceLandmarker.detectForVideo(videoElement, performance.now());
      
      if (!results.faceBlendshapes || results.faceBlendshapes.length === 0) {
        return null;
      }

      // Analyze the first face's blendshapes
      const blendshapes = results.faceBlendshapes[0].categories;
      const emotionResult = this.analyzeBlendshapes(blendshapes);
      
      // Draw face landmarks if available
      if (results.faceLandmarks && results.faceLandmarks.length > 0) {
        this.drawFaceLandmarks(ctx, results.faceLandmarks[0], canvasElement.width, canvasElement.height);
      }
      
      // Draw emotion result
      this.drawEmotionResult(ctx, emotionResult, canvasElement.width, canvasElement.height);

      return {
        emotion: emotionResult.emotion,
        confidence: emotionResult.confidence,
        allScores: emotionResult.allScores,
        blendshapes: blendshapes,
        timestamp: new Date()
      };
      
    } catch (error) {
      console.error('MediaPipe emotion detection error:', error);
      return null;
    }
  }

  drawFaceLandmarks(ctx, landmarks, width, height) {
    ctx.fillStyle = '#00ff00';
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 1;
    
    // Draw key facial landmarks
    landmarks.forEach((landmark, index) => {
      const x = landmark.x * width;
      const y = landmark.y * height;
      
      // Draw landmark points (only key points to avoid clutter)
      if (index % 5 === 0) {
        ctx.beginPath();
        ctx.arc(x, y, 1, 0, 2 * Math.PI);
        ctx.fill();
      }
    });
    
    // Draw face outline (approximate)
    if (landmarks.length > 0) {
      const faceOutline = [
        10, 151, 9, 8, 168, 6, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109
      ];
      
      ctx.beginPath();
      faceOutline.forEach((index, i) => {
        if (landmarks[index]) {
          const x = landmarks[index].x * width;
          const y = landmarks[index].y * height;
          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
      });
      ctx.stroke();
    }
  }

  drawEmotionResult(ctx, emotionResult, width, height) {
    // Draw emotion label background
    const labelWidth = 250;
    const labelHeight = 80;
    const x = 20;
    const y = 20;
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(x, y, labelWidth, labelHeight);
    
    // Draw emotion text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px Arial';
    ctx.fillText(`Emotion: ${emotionResult.emotion.toUpperCase()}`, x + 10, y + 25);
    
    ctx.font = '14px Arial';
    ctx.fillText(`Confidence: ${Math.round(emotionResult.confidence * 100)}%`, x + 10, y + 45);
    
    // Draw confidence bar
    const barWidth = 200;
    const barHeight = 8;
    const barX = x + 10;
    const barY = y + 55;
    
    ctx.fillStyle = '#333';
    ctx.fillRect(barX, barY, barWidth, barHeight);
    
    ctx.fillStyle = '#00ff00';
    ctx.fillRect(barX, barY, barWidth * emotionResult.confidence, barHeight);
    
    // Draw emotion emoji
    ctx.font = '24px Arial';
    const emojis = {
      neutral: '😐',
      happy: '😊',
      sad: '😢',
      angry: '😠',
      surprised: '😲',
      fear: '😨',
    };
    ctx.fillText(emojis[emotionResult.emotion] || '😐', x + labelWidth - 40, y + 35);
  }

  dispose() {
    if (this.faceLandmarker) {
      this.faceLandmarker.close();
      this.faceLandmarker = null;
    }
    this.isInitialized = false;
  }
}

export default MediaPipeEmotionDetector;