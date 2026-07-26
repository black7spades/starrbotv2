export async function validateBotToken(token: string, clientId: string): Promise<boolean> {
  try {
    const res = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bot ${token}` },
    });
    if (!res.ok) return false;

    const data = await res.json();
    return data.id === clientId;
  } catch {
    return false;
  }
}
