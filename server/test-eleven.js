const fetch = require("node-fetch");

async function testDirect() {
  const res = await fetch("https://api.elevenlabs.io/v1/text-to-speech/pNInz6obpgDQGcFmaJgB", {
    method: "POST",
    headers: {
      "Accept": "audio/mpeg",
      "Content-Type": "application/json",
      "xi-api-key": process.env.ELEVENLABS_API_KEY,
    },
    body: JSON.stringify({
      text: "Hello dost, direct fetch test.",
      model_id: "eleven_multilingual_v2"
    })
  });

  if (!res.ok) {
    console.error("❌ API call failed:", res.status, await res.text());
    return;
  }

  console.log("✅ Direct fetch success, got audio stream");
}

testDirect();
