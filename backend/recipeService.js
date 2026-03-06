'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const { tavily } = require('@tavily/core');
const { getRecentUrls, getBlockedUrls } = require('./database');

function getAnthropicClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

function getTavilyClient() {
  return tavily({ apiKey: process.env.TAVILY_API_KEY });
}

/**
 * Searches the web for a recipe matching `prompt`, extracts title, URL and
 * ingredient list via Claude, and filters out recently-used and blocked recipes.
 *
 * @param {string} prompt  e.g. "vegan mit Reis"
 * @returns {{ title: string, url: string, ingredients: string[] }}
 */
async function findRecipe(prompt) {
  if (!prompt || typeof prompt !== 'string') throw new Error('Kein Suchbegriff angegeben.');
  if (prompt.length > 200) throw new Error('Suchbegriff zu lang (max. 200 Zeichen).');

  const recentUrls = getRecentUrls(15);
  const blockedUrls = getBlockedUrls();
  const excludeUrls = new Set([...recentUrls, ...blockedUrls]);

  const tavilyClient = getTavilyClient();
  const searchResult = await tavilyClient.search(`Kochrezept ${prompt} Zutaten`, {
    maxResults: 10,
    searchDepth: 'basic',
  });

  const candidates = (searchResult.results || []).filter(
    (r) => r.url && !excludeUrls.has(r.url)
  );

  if (candidates.length === 0) {
    throw new Error(
      'Keine neuen Rezepte gefunden. Alle aktuellen Vorschläge wurden kürzlich verwendet oder sind gesperrt.'
    );
  }

  const candidateText = candidates
    .slice(0, 5)
    .map(
      (r, i) =>
        `[${i + 1}] Titel: ${r.title}\nURL: ${r.url}\nBeschreibung: ${r.content || r.snippet || '(keine Beschreibung)'}`
    )
    .join('\n\n');

  const anthropic = getAnthropicClient();
  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
  const message = await anthropic.messages.create({
    model,
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `Du bist ein Kochassistent. Wähle aus den folgenden Suchergebnissen das beste Rezept passend zum Suchbegriff "${prompt}" aus.

Suchergebnisse:
${candidateText}

Antworte NUR mit einem JSON-Objekt (kein Markdown, kein erklärender Text):
{
  "title": "Rezepttitel auf Deutsch",
  "url": "exakte URL aus einem der Suchergebnisse oben",
  "ingredients": ["Zutat 1 mit Menge", "Zutat 2 mit Menge"]
}

Wichtig:
- Verwende ausschließlich eine URL aus den obigen Suchergebnissen.
- Die Zutatenliste soll vollständig und auf Deutsch sein.
- Nur Zutaten mit Mengenangaben, keine Zubereitungsschritte.`,
      },
    ],
  });

  const raw = message.content[0].text.trim();
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Claude hat kein gültiges JSON zurückgegeben.');
    parsed = JSON.parse(match[0]);
  }

  // Safety: validate the URL is from our candidate list to prevent hallucinations
  const validCandidate = candidates.find((c) => c.url === parsed.url);
  if (!validCandidate) {
    parsed.url = candidates[0].url;
    if (!parsed.title) parsed.title = candidates[0].title;
  }

  if (!Array.isArray(parsed.ingredients) || parsed.ingredients.length === 0) {
    throw new Error('Claude hat keine Zutatenliste zurückgegeben.');
  }

  return {
    title: String(parsed.title),
    url: String(parsed.url),
    ingredients: parsed.ingredients.map(String),
  };
}

module.exports = { findRecipe };
