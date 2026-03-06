'use strict';

const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, '../data/db.json');

const DEFAULT_DB = {
  config: {
    email: '',
    recipePrompt: 'vegetarisch mit Reis',
  },
  recipes: [],
};

function ensureDbExists() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(DEFAULT_DB, null, 2), 'utf8');
  }
}

function readDb() {
  ensureDbExists();
  const raw = fs.readFileSync(DB_PATH, 'utf8');
  return JSON.parse(raw);
}

function writeDb(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function getConfig() {
  return readDb().config;
}

function saveConfig(updates) {
  const db = readDb();
  db.config = { ...db.config, ...updates };
  writeDb(db);
  return db.config;
}

function getAllRecipes() {
  return readDb().recipes;
}

function getRecipeById(id) {
  return readDb().recipes.find((r) => r.id === id) || null;
}

function saveRecipe(recipe) {
  const db = readDb();
  db.recipes.unshift(recipe);
  writeDb(db);
  return recipe;
}

function updateRecipe(id, updates) {
  const db = readDb();
  const idx = db.recipes.findIndex((r) => r.id === id);
  if (idx === -1) throw new Error(`Rezept mit ID ${id} nicht gefunden.`);
  db.recipes[idx] = { ...db.recipes[idx], ...updates };
  writeDb(db);
  return db.recipes[idx];
}

function deleteRecipe(id) {
  const db = readDb();
  const idx = db.recipes.findIndex((r) => r.id === id);
  if (idx === -1) throw new Error(`Rezept mit ID ${id} nicht gefunden.`);
  db.recipes.splice(idx, 1);
  writeDb(db);
}

/**
 * Returns URLs of recipes whose searchedAt is within the last `days` days.
 */
function getRecentUrls(days = 15) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return readDb()
    .recipes.filter(
      (r) => r.searchedAt && new Date(r.searchedAt) >= cutoff
    )
    .map((r) => r.url);
}

/**
 * Returns URLs of all blocked recipes (rated 5 or 6).
 */
function getBlockedUrls() {
  return readDb()
    .recipes.filter((r) => r.blocked)
    .map((r) => r.url);
}

module.exports = {
  getConfig,
  saveConfig,
  getAllRecipes,
  getRecipeById,
  saveRecipe,
  updateRecipe,
  deleteRecipe,
  getRecentUrls,
  getBlockedUrls,
};
