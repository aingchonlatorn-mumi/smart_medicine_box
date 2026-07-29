export async function sendLinePushMessage(lineUserId: string, messageText: string) {
    const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!token) throw new Error("Missing LINE_CHANNEL_ACCESS_TOKEN");
  
    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        to: lineUserId,
        messages: [{ type: 'text', text: messageText }],
      }),
    });
  
    if (!res.ok) {
      const errorData = await res.json();
      console.error('LINE Push Error Detail:', errorData);
    }
    return res;
  }