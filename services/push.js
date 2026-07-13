async function enviarPush(titulo, corpo) {
  const appId = process.env.ONESIGNAL_APP_ID;
  const apiKey = process.env.ONESIGNAL_REST_API_KEY;
  if (!appId || !apiKey) return;

  try {
    const res = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${apiKey}`,
      },
      body: JSON.stringify({
        app_id: appId,
        included_segments: ["All"],
        headings: { en: titulo },
        contents: { en: corpo },
      }),
    });
    const data = await res.json();
    if (!res.ok) console.error("OneSignal push falhou:", data);
  } catch (err) {
    console.error("OneSignal push erro:", err.message);
  }
}

module.exports = { enviarPush };
