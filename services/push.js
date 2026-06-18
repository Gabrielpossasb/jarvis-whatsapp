const webpush = require("web-push");
const { supabase } = require("./supabase");

webpush.setVapidDetails(
  process.env.VAPID_EMAIL || "mailto:gabrielpossas2014@gmail.com",
  process.env.VAPID_PUBLIC_KEY || "",
  process.env.VAPID_PRIVATE_KEY || ""
);

async function salvarSubscription(subscription) {
  await supabase.from("push_subscriptions").upsert({
    endpoint: subscription.endpoint,
    subscription: JSON.stringify(subscription),
  });
}

async function enviarPush(titulo, corpo) {
  if (!process.env.VAPID_PUBLIC_KEY) return;
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
