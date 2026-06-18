const webpush = require("web-push");
const { supabase } = require("./supabase");

function configurarVapid() {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const email = process.env.VAPID_EMAIL || "mailto:gabrielpossas2014@gmail.com";
  if (!pub || !priv) return false;
  try {
    webpush.setVapidDetails(email, pub, priv);
    return true;
  } catch {
    return false;
  }
}

async function salvarSubscription(subscription) {
  await supabase.from("push_subscriptions").upsert({
    endpoint: subscription.endpoint,
    subscription: JSON.stringify(subscription),
  });
}

async function enviarPush(titulo, corpo) {
  if (!configurarVapid()) return;
  const { data } = await supabase.from("push_subscriptions").select("subscription");
  for (const row of data || []) {
    try {
      await webpush.sendNotification(
        JSON.parse(row.subscription),
        JSON.stringify({ title: titulo, body: corpo })
      );
    } catch {
      // subscription expirada ou inválida — ignora
    }
  }
}

module.exports = { salvarSubscription, enviarPush };
