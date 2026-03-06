'use strict';

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');
const { v4: uuidv4 } = require('uuid');

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

function createMcpServer({ findRecipe, saveRecipe, getAllRecipes, getRecipeById, updateRecipe, getConfig, sendRecipeEmail }) {
  const server = new Server(
    { name: 'rezeptagent', version: '2.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'erzeuge_vorschlag',
        description:
          'Sucht ein neues Rezept anhand eines Suchbegriffs über das Internet und speichert es in der Datenbank.',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'Suchbegriff, z.B. "vegan mit Reis" oder "schnelles Pasta-Gericht"',
            },
          },
          required: ['prompt'],
        },
      },
      {
        name: 'versende_vorschlag',
        description:
          'Versendet ein gespeichertes Rezept mit Einkaufsliste und Link per E-Mail an die konfigurierte Adresse.',
        inputSchema: {
          type: 'object',
          properties: {
            recipeId: {
              type: 'string',
              description: 'ID des Rezepts (aus zeige_bisherige_gerichte oder erzeuge_vorschlag)',
            },
            email: {
              type: 'string',
              description: 'Optionale Ziel-E-Mail-Adresse. Wenn nicht angegeben, wird die konfigurierte Standard-Adresse verwendet.',
            },
          },
          required: ['recipeId'],
        },
      },
      {
        name: 'zeige_bisherige_gerichte',
        description: 'Gibt eine Liste aller bisher erzeugten Rezepte zurück.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'bewerte_gericht',
        description:
          'Bewertet ein Gericht nach deutschem Schulnotensystem: 1 (sehr gut) bis 6 (ungenügend). Rezepte mit Note 5 oder 6 werden dauerhaft blockiert.',
        inputSchema: {
          type: 'object',
          properties: {
            recipeId: {
              type: 'string',
              description: 'ID des zu bewertenden Rezepts',
            },
            rating: {
              type: 'integer',
              description: 'Note von 1 (sehr gut) bis 6 (ungenügend)',
              minimum: 1,
              maximum: 6,
            },
          },
          required: ['recipeId', 'rating'],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'erzeuge_vorschlag': {
          const prompt = (args.prompt || '').trim() || 'kreatives Gericht';
          const recipe = await findRecipe(prompt);
          const today = new Date().toISOString().slice(0, 10);
          const entry = {
            id: uuidv4(),
            prompt,
            title: recipe.title,
            url: recipe.url,
            ingredients: recipe.ingredients,
            searchedAt: today,
            rating: null,
            blocked: false,
          };
          saveRecipe(entry);
          const ingredientList = entry.ingredients
            .map((ing, i) => `${i + 1}. ${ing}`)
            .join('\n');
          return {
            content: [
              {
                type: 'text',
                text: `✅ Rezeptvorschlag erstellt:\n\n**${entry.title}**\n🔗 ${entry.url}\n\n📋 Zutaten:\n${ingredientList}\n\n🆔 ID: \`${entry.id}\``,
              },
            ],
          };
        }

        case 'versende_vorschlag': {
          const recipe = getRecipeById(args.recipeId);
          if (!recipe) {
            return {
              content: [
                { type: 'text', text: `❌ Rezept mit ID \`${args.recipeId}\` nicht gefunden.` },
              ],
            };
          }
          const rawEmail = args.email ? String(args.email).trim() : null;
          if (rawEmail && !isValidEmail(rawEmail)) {
            return {
              content: [{ type: 'text', text: '❌ Die angegebene E-Mail-Adresse ist ungültig.' }],
            };
          }
          const targetEmail = rawEmail || getConfig().email;
          if (!targetEmail) {
            return {
              content: [
                {
                  type: 'text',
                  text: '❌ Keine E-Mail-Adresse angegeben und keine Standard-Adresse konfiguriert.',
                },
              ],
            };
          }
          await sendRecipeEmail(recipe, targetEmail);
          return {
            content: [
              {
                type: 'text',
                text: `✅ E-Mail erfolgreich gesendet an **${targetEmail}**:\n📧 Rezept: "${recipe.title}"`,
              },
            ],
          };
        }

        case 'zeige_bisherige_gerichte': {
          const recipes = getAllRecipes();
          if (recipes.length === 0) {
            return {
              content: [
                {
                  type: 'text',
                  text: 'Noch keine Gerichte vorhanden. Verwende `erzeuge_vorschlag` um ein neues Rezept zu generieren.',
                },
              ],
            };
          }
          const GRADE = [
            '',
            '1 – Sehr gut',
            '2 – Gut',
            '3 – Befriedigend',
            '4 – Ausreichend',
            '5 – Mangelhaft',
            '6 – Ungenügend',
          ];
          const list = recipes
            .map((r) => {
              const grade = r.rating ? GRADE[r.rating] : 'unbewertet';
              const flag = r.blocked ? ' 🚫' : '';
              return `- **${r.title}**${flag}\n  📅 ${r.searchedAt} | ⭐ ${grade}\n  🔗 ${r.url}\n  🆔 \`${r.id}\``;
            })
            .join('\n\n');
          return {
            content: [
              { type: 'text', text: `📋 Bisherige Gerichte (${recipes.length}):\n\n${list}` },
            ],
          };
        }

        case 'bewerte_gericht': {
          const rating = Math.round(Number(args.rating));
          if (!Number.isInteger(rating) || rating < 1 || rating > 6) {
            return {
              content: [{ type: 'text', text: '❌ Note muss eine ganze Zahl zwischen 1 und 6 sein.' }],
            };
          }
          const blocked = rating >= 5;
          const updated = updateRecipe(args.recipeId, { rating, blocked });
          const GRADE_NAME = [
            '',
            'Sehr gut',
            'Gut',
            'Befriedigend',
            'Ausreichend',
            'Mangelhaft',
            'Ungenügend',
          ];
          const blockNote = blocked ? ' und dauerhaft gesperrt' : '';
          return {
            content: [
              {
                type: 'text',
                text: `✅ "${updated.title}" mit Note **${rating} (${GRADE_NAME[rating]})** bewertet${blockNote}.`,
              },
            ],
          };
        }

        default:
          return {
            content: [{ type: 'text', text: `❌ Unbekanntes Tool: ${name}` }],
            isError: true,
          };
      }
    } catch (err) {
      return {
        content: [{ type: 'text', text: `❌ Fehler: ${err.message}` }],
        isError: true,
      };
    }
  });

  return server;
}

function setupMcpRoutes(app, deps) {
  // Session map: sessionId → transport
  const transports = {};

  // POST: new sessions (initialize) + subsequent message calls
  app.post('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'];

    if (sessionId) {
      // Existing session
      const transport = transports[sessionId];
      if (!transport) {
        return res.status(404).json({ error: 'MCP-Session nicht gefunden.' });
      }
      try {
        await transport.handleRequest(req, res, req.body);
      } catch (err) {
        console.error('[MCP] handleRequest error:', err.message);
        if (!res.headersSent) res.status(500).json({ error: err.message });
      }
    } else {
      // New session – create transport + server per session
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: uuidv4,
        onsessioninitialized: (id) => {
          transports[id] = transport;
        },
      });
      transport.onclose = () => {
        if (transport.sessionId) delete transports[transport.sessionId];
      };

      const server = createMcpServer(deps);
      try {
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
      } catch (err) {
        console.error('[MCP] new session error:', err.message);
        if (!res.headersSent) res.status(500).json({ error: err.message });
      }
    }
  });

  // GET: SSE stream for server-to-client notifications
  app.get('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'];
    const transport = transports[sessionId];
    if (!transport) {
      return res.status(400).json({
        error: 'Keine gültige MCP-Session. Sende zuerst eine POST-Anfrage mit initialize.',
      });
    }
    try {
      await transport.handleRequest(req, res);
    } catch (err) {
      console.error('[MCP] GET stream error:', err.message);
      if (!res.headersSent) res.status(500).json({ error: err.message });
    }
  });

  // DELETE: close session
  app.delete('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'];
    const transport = transports[sessionId];
    if (transport) {
      try { await transport.close(); } catch (_) {}
      delete transports[sessionId];
    }
    res.status(204).end();
  });
}

module.exports = { setupMcpRoutes };
