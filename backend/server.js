'use strict';

require('dotenv').config();

const express = require('express');
const path = require('path');
const { v4: uuidv4, validate: isUUID } = require('uuid');
const {
  getConfig,
  saveConfig,
  getAllRecipes,
  getRecipeById,
  saveRecipe,
  updateRecipe,
  deleteRecipe,
} = require('./database');
const { findRecipe } = require('./recipeService');
const { isSmtpConfigured, sendRecipeEmail } = require('./emailService');
const { setupMcpRoutes } = require('./mcpServer');

const app = express();
const PORT = process.env.PORT || 3270;

app.use(express.json());

// Serve the frontend SPA
app.use(express.static(path.join(__dirname, '../frontend')));

// ── Config ───────────────────────────────────────────────────────────────────

app.get('/api/config', (req, res) => {
  try {
    const config = getConfig();
    res.json({ ...config, smtpConfigured: isSmtpConfigured() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/config', (req, res) => {
  try {
    const updates = {};
    for (const key of ['email', 'recipePrompt']) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    if (updates.email && typeof updates.email === 'string' && updates.email.length > 0) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updates.email)) {
        return res.status(400).json({ error: 'Ungültige E-Mail-Adresse.' });
      }
    }

    res.json(saveConfig(updates));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Recipes ──────────────────────────────────────────────────────────────────

app.get('/api/recipes', (req, res) => {
  try {
    res.json(getAllRecipes());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/recipes/:id', (req, res) => {
  try {
    if (!isUUID(req.params.id)) return res.status(400).json({ error: 'Ungültige Rezept-ID.' });
    const recipe = getRecipeById(req.params.id);
    if (!recipe) return res.status(404).json({ error: 'Rezept nicht gefunden.' });
    res.json(recipe);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/recipes/:id/rating', (req, res) => {
  try {
    if (!isUUID(req.params.id)) return res.status(400).json({ error: 'Ungültige Rezept-ID.' });
    const { rating } = req.body;
    if (!Number.isInteger(rating) || rating < 1 || rating > 6) {
      return res
        .status(400)
        .json({ error: 'Bewertung muss eine ganze Zahl zwischen 1 und 6 sein.' });
    }
    const updated = updateRecipe(req.params.id, { rating, blocked: rating >= 5 });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/recipes/:id', (req, res) => {
  try {
    if (!isUUID(req.params.id)) return res.status(400).json({ error: 'Ungültige Rezept-ID.' });
    deleteRecipe(req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(err.message.includes('nicht gefunden') ? 404 : 500).json({ error: err.message });
  }
});

// ── Generate (On-Demand) ─────────────────────────────────────────────────────

app.post('/api/recipes/generate', async (req, res) => {
  try {
    const config = getConfig();
    const prompt =
      (req.body?.prompt?.trim()) || config.recipePrompt || 'kreatives Gericht';

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
    res.status(201).json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/recipes/:id/send-email', async (req, res) => {
  try {
    if (!isUUID(req.params.id)) return res.status(400).json({ error: 'Ungültige Rezept-ID.' });
    const recipe = getRecipeById(req.params.id);
    if (!recipe) return res.status(404).json({ error: 'Rezept nicht gefunden.' });

    const config = getConfig();
    if (!config.email) {
      return res.status(400).json({ error: 'Keine E-Mail-Adresse konfiguriert.' });
    }

    await sendRecipeEmail(recipe, config.email);
    res.json({ ok: true, message: `E-Mail gesendet an ${config.email}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Health check ─────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// ── MCP Server ────────────────────────────────────────────────────────────────

setupMcpRoutes(app, {
  findRecipe,
  saveRecipe,
  getAllRecipes,
  getRecipeById,
  updateRecipe,
  deleteRecipe,
  getConfig,
  sendRecipeEmail,
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`RezeptAgent läuft auf Port ${PORT}`);
  console.log(`MCP-Server erreichbar unter http://localhost:${PORT}/mcp`);
});
