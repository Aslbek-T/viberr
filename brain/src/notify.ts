/** Phone ping through ntfy.sh. No account needed: install the ntfy app and subscribe to NTFY_TOPIC. */
export async function pingPhone(message: string, title = 'Buildscape: your agent needs you'): Promise<void> {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) return;
  const url = process.env.PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 4321}`;
  await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
    method: 'POST',
    body: message,
    headers: { Title: title, Priority: 'high', Tags: 'raising_hand', Click: url },
  });
}
