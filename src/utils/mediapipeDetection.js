import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

class MediaPipeEmotionDetector {
  constructor() {
    this.faceLandmarker = null;
    this.isInitialized = false;
    this.isLoading = false;
    
    // Emotion mapping from MediaPipe blendshapes to standard emotions
    this.emotionMapping = {
      // Happy emotions
      'mouthSmileLeft': 'happy',
      'mouthSmileRight': 'happy',
      'cheekSquintLeft': 'happy',
      'cheekSquintRight': 'happy',
      
      // Sad emotions
      'mouthFrownLeft': 'sad',
      'mouthFrownRight': 'sad',
      'browDownLeft': 'sad',
      'browDownRight': 'sad',
      
      // Angry emotions
      'browLowererLeft': 'angry',
      'browLowererRight': 'angry',
      'eyeSquintLeft': 'angry',
      'eyeSquintRight': 'angry',
      
      // Surprised emotions
      'browInnerUp': 'surprised',
      'eyeWideLeft': 'surprised',
      'eyeWideRight': 'surprised',
      'jawOpen': 'surprised',
      
      // Fear emotions
      'eyeWideLeft': 'fear',
      'eyeWideRight': 'fear',
      'browInnerUp': 'fear',
      
      // Disgust emotions
      'noseSneerLeft': 'disgust',
      'noseSneerRight': 'disgust',
      'mouthUpperUpLeft': 'disgust',
      'mouthUpperUpRight': 'disgust',
    };
    
    this.emotions = ['neutral', 'happy', 'sad', 'angry', 'surprised', 'fear', 'disgust'];

    // Calibration and smoothing state
    this.calibrationFrames = 10; // number of frames to build neutral baseline (reduced for faster readiness)
    this._calibrationCount = 0;
    this._baseline = {}; // blendshape baseline averages
    this.smoothingSize = 4; // temporal smoothing window (smaller for more responsiveness)
    this._recentEmotionScores = []; // circular buffer of recent normalized score vectors
  }

  async initialize() {
    if (this.isInitialized || this.isLoading) {
      return this.isInitialized;
    }

    this.isLoading = true;
    
    try {
      console.log('Initializing MediaPipe Face Landmarker...');
      
      // Initialize MediaPipe
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      );

      // Try GPU delegate first, fall back to CPU if GPU is unavailable
      try {
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
      } catch (gpuErr) {
        console.warn('GPU delegate failed, retrying with CPU delegate:', gpuErr);
        // Retry with CPU (or without specifying delegate)
        this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
          },
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: true,
          runningMode: 'VIDEO',
          numFaces: 1
        });
      }
      
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
    // Convert blendshapes array into a lookup map
    const shapeMap = {};
    blendshapes.forEach(b => { shapeMap[b.categoryName] = b.score; });

    // If still calibrating, accumulate baseline then return neutral
    if (this._calibrationCount < this.calibrationFrames) {
      // accumulate averages
      blendshapes.forEach(b => {
        if (!this._baseline[b.categoryName]) this._baseline[b.categoryName] = 0;
        this._baseline[b.categoryName] += b.score;
      });
      this._calibrationCount += 1;
      if (this._calibrationCount === this.calibrationFrames) {
        // finalize baseline averages
        Object.keys(this._baseline).forEach(k => { this._baseline[k] = this._baseline[k] / this.calibrationFrames; });
      }
      return { emotion: 'neutral', confidence: 0.35, allScores: { neutral: 0.35 } };
    }

    // Adjust each blendshape score by subtracting baseline (reduce personal idiosyncrasies)
    const adjusted = {};
    blendshapes.forEach(b => {
      const baseline = this._baseline[b.categoryName] || 0;
      adjusted[b.categoryName] = Math.max(0, b.score - baseline * 0.8); // subtract a portion of baseline
    });

    // Build weighted emotion scores using multiple contributing blendshapes and stronger logic
    const emotionScores = {
      neutral: 0.1,
      happy: 0,
      sad: 0,
      angry: 0,
      surprised: 0,
      fear: 0,
      disgust: 0
    };

    // Helper to read adjusted scores
    const s = (name) => adjusted[name] || 0;

    // Weighted contributions (more robust, based on multiple cues)
    // Happiness: lip corner up (smile) + cheek raise
    const smile = Math.max(s('mouthSmileLeft'), s('mouthSmileRight'));
    const cheek = (s('cheekSquintLeft') + s('cheekSquintRight')) / 2;
    emotionScores.happy += smile * 0.7 + cheek * 0.5;

    // Sad: lip corner down + inner brow down
    const frown = Math.max(s('mouthFrownLeft'), s('mouthFrownRight'));
    const browDown = (s('browDownLeft') + s('browDownRight')) / 2;
    emotionScores.sad += frown * 0.7 + browDown * 0.6;

    // Angry: brow lowerer + eye squint + nostril flare
    const browLowerer = (s('browLowererLeft') + s('browLowererRight')) / 2;
    const eyeSquint = (s('eyeSquintLeft') + s('eyeSquintRight')) / 2;
    const nostril = (s('noseSneerLeft') + s('noseSneerRight')) / 2;
    emotionScores.angry += browLowerer * 0.7 + eyeSquint * 0.4 + nostril * 0.25;

    // Surprise: wide eyes + raised brows + jaw open
    const eyeWide = (s('eyeWideLeft') + s('eyeWideRight')) / 2;
    const browInnerUp = s('browInnerUp');
    const jawOpen = s('jawOpen');
    emotionScores.surprised += eyeWide * 0.7 + browInnerUp * 0.6 + jawOpen * 0.5;

    // Fear: similar to surprise but with tension: eye wide + brow inner up + less jaw open + mouth stretch
    const mouthStretch = (s('mouthStretchLeft') || 0) + (s('mouthStretchRight') || 0);
    emotionScores.fear += eyeWide * 0.5 + browInnerUp * 0.4 + (1 - Math.min(1, jawOpen)) * 0.2 + mouthStretch * 0.2;

    // Disgust: nose sneer + upper lip raise
    const upperLip = (s('mouthUpperUpLeft') + s('mouthUpperUpRight')) / 2;
    emotionScores.disgust += nostril * 0.7 + upperLip * 0.6;

    // Reduce neutral if any emotion appears
    const maxEmotionScore = Math.max(
      emotionScores.happy, emotionScores.sad, emotionScores.angry,
      emotionScores.surprised, emotionScores.fear, emotionScores.disgust
    );
    emotionScores.neutral = Math.max(0.02, 0.15 - maxEmotionScore * 0.5);

    // Apply some cross-check adjustments (avoid confusing surprise & fear)
    if (emotionScores.surprised > 0.6 && emotionScores.fear > 0.4) {
      // prefer fear if mouth is tense / jaw not open
      if (jawOpen < 0.15) {
        emotionScores.fear += 0.2;
        emotionScores.surprised -= 0.15;
      }
    }

    // Assemble vector and normalize using softmax-like scaling for better confidence distribution
    const rawVector = this.emotions.map(e => Math.max(0, emotionScores[e] || 0));
    const softmax = this._softmax(rawVector);

    // Map back to object
    const normalizedScores = {};
    this.emotions.forEach((e, i) => { normalizedScores[e] = softmax[i]; });

    // Temporal smoothing: keep running buffer of recent normalized scores
    this._recentEmotionScores.push(normalizedScores);
    if (this._recentEmotionScores.length > this.smoothingSize) this._recentEmotionScores.shift();

    // Average across buffer
    const averaged = {};
    this.emotions.forEach(e => {
      averaged[e] = this._recentEmotionScores.reduce((acc, s) => acc + (s[e] || 0), 0) / this._recentEmotionScores.length;
    });

    // Find dominant after smoothing
    let dominantEmotion = 'neutral';
    let maxScore = averaged.neutral;
    Object.entries(averaged).forEach(([emotion, score]) => {
      if (score > maxScore) { maxScore = score; dominantEmotion = emotion; }
    });

    const confidence = Math.min(0.999, Math.max(0.02, maxScore));

    return {
      emotion: dominantEmotion,
      confidence: confidence,
      allScores: averaged
    };
  }

  _softmax(arr) {
    // small stable softmax
    const max = Math.max(...arr);
    const exps = arr.map(v => Math.exp((v - max) * 6)); // sharpen factor
    const sum = exps.reduce((a, b) => a + b, 0) || 1;
    return exps.map(e => e / sum);
  }

  applyEmotionLogic(emotionScores, blendshapes) {
    // Get specific blendshape values
    const getBlendshapeScore = (name) => {
      const blendshape = blendshapes.find(b => b.categoryName === name);
      return blendshape ? blendshape.score : 0;
    };

    // Happy detection logic
    const smileLeft = getBlendshapeScore('mouthSmileLeft');
    const smileRight = getBlendshapeScore('mouthSmileRight');
    const cheekRaise = (getBlendshapeScore('cheekSquintLeft') + getBlendshapeScore('cheekSquintRight')) / 2;
    
    if (smileLeft > 0.3 || smileRight > 0.3) {
      emotionScores.happy += 0.4;
      if (cheekRaise > 0.2) {
        emotionScores.happy += 0.3; // Genuine smile (Duchenne)
      }
    }

    // Sad detection logic
    const frownLeft = getBlendshapeScore('mouthFrownLeft');
    const frownRight = getBlendshapeScore('mouthFrownRight');
    const browDown = (getBlendshapeScore('browDownLeft') + getBlendshapeScore('browDownRight')) / 2;
    
    if (frownLeft > 0.2 || frownRight > 0.2) {
      emotionScores.sad += 0.4;
      if (browDown > 0.2) {
        emotionScores.sad += 0.3;
      }
    }

    // Angry detection logic
    const browLowerer = (getBlendshapeScore('browLowererLeft') + getBlendshapeScore('browLowererRight')) / 2;
    const eyeSquint = (getBlendshapeScore('eyeSquintLeft') + getBlendshapeScore('eyeSquintRight')) / 2;
    
    if (browLowerer > 0.3) {
      emotionScores.angry += 0.4;
      if (eyeSquint > 0.2) {
        emotionScores.angry += 0.3;
      }
    }

    // Surprised detection logic
    const browInnerUp = getBlendshapeScore('browInnerUp');
    const eyeWide = (getBlendshapeScore('eyeWideLeft') + getBlendshapeScore('eyeWideRight')) / 2;
    const jawOpen = getBlendshapeScore('jawOpen');
    
    if (browInnerUp > 0.3 && eyeWide > 0.3) {
      emotionScores.surprised += 0.5;
      if (jawOpen > 0.2) {
        emotionScores.surprised += 0.3;
      }
    }

    // Fear detection logic (similar to surprise but with different intensity)
    if (browInnerUp > 0.4 && eyeWide > 0.4 && jawOpen < 0.1) {
      emotionScores.fear += 0.4;
    }

    // Disgust detection logic
    const noseSneer = (getBlendshapeScore('noseSneerLeft') + getBlendshapeScore('noseSneerRight')) / 2;
    const upperLipRaise = (getBlendshapeScore('mouthUpperUpLeft') + getBlendshapeScore('mouthUpperUpRight')) / 2;
    
    if (noseSneer > 0.3 || upperLipRaise > 0.3) {
      emotionScores.disgust += 0.4;
    }

    // Reduce neutral score if any strong emotion is detected
    const maxEmotionScore = Math.max(
      emotionScores.happy, emotionScores.sad, emotionScores.angry,
      emotionScores.surprised, emotionScores.fear, emotionScores.disgust
    );
    
    if (maxEmotionScore > 0.3) {
      emotionScores.neutral = Math.max(0.1, emotionScores.neutral - maxEmotionScore);
    }
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
      
      // Detect faces and blendshapes (detectForVideo may be sync or return a promise)
      let results = this.faceLandmarker.detectForVideo(videoElement, performance.now());
      if (results && typeof results.then === 'function') {
        results = await results;
      }
      
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
      disgust: '🤢'
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