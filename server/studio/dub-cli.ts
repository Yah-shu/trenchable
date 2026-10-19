/**
 * Dub's last-resort translator, used when no AI model with a key is set in Settings → AI. There is no local
 * fallback here, so it says what to do instead.
 */
export async function translateWithCli(_prompt: string, _agentDir: string): Promise<unknown> {
  throw new Error('Translating needs an AI model: open Advanced → Settings → AI, add a key (Gemini, OpenAI, Anthropic or xAI) and pick it as the default.')
}
