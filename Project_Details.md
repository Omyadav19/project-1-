# Project API support  
## Groq api :
    const chatCompletion = await groq.chat.completions.create({ <br>
      messages: conversationHistory, <br>
      model: "moonshotai/kimi-k2-instruct",<br>
    });

## Model-for the face emotion detection :
    The MediaPipe Face Landmarker task requires a trained model that is compatible with this task.<br> For more information on available trained models for Face Landmarker, see the task overview Models <br>section.

## webkit speech :
    if (!('webkitSpeechRecognition' in window)) {<br>
      console.error("Web Speech API is not supported by this browser.");<br>
      return;<br>
    }
