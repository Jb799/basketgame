/**
 * playerProfiles.js — Couche hub des profils joueurs.
 *
 * Branche le module pur `shared/modules/player-profiles` sur le dossier
 * `data/players/` et expose :
 *   - un routeur Express (CRUD + upload/service des photos)
 *   - `buildEnrichedRoster()` : résout des ids de profils en roster enrichi
 *     (slot, pseudo, URLs des photos) injecté dans GAME_START_PARAMS.
 *
 * Les images ne sont jamais servies en statique : elles passent par le hub
 * (origine :3000), ce qui les rend accessibles à la télé comme au contrôleur.
 */

const express = require('express');
const path = require('path');

const { PlayerProfiles } = require('../shared/modules/player-profiles');
const { PLAYER_PHOTO_VARIANTS } = require('../shared/constants');

const DATA_DIR = path.join(__dirname, '..', 'data', 'players');
const PHOTO_LIMIT = '8mb';

const store = new PlayerProfiles({ dir: DATA_DIR });

function photoUrl(id, variant) {
  return `/api/players/${id}/photos/${variant}`;
}

function cutoutUrl(id) {
  return `/api/players/${id}/cutout`;
}

function withPhotoUrls(profile) {
  const urls = {};
  for (const v of PLAYER_PHOTO_VARIANTS) {
    urls[v] = profile.photos[v] ? photoUrl(profile.id, v) : null;
  }
  return {
    ...profile,
    photoUrls: urls,
    cutoutUrl: profile.hasCutout ? cutoutUrl(profile.id) : null,
  };
}

/**
 * Résout une liste ordonnée d'ids en roster enrichi pour le jeu.
 * @param {string[]} profileIds
 * @returns {{ valid: true, roster: object[] } | { valid: false, error: string }}
 */
function buildEnrichedRoster(profileIds) {
  const resolved = store.resolveRoster(profileIds);
  if (!resolved.valid) return resolved;

  const roster = resolved.profiles.map((profile, index) => ({
    slot: index + 1,
    profileId: profile.id,
    pseudo: profile.pseudo,
    photos: {
      idle: photoUrl(profile.id, 'idle'),
      win: photoUrl(profile.id, 'win'),
      lose: photoUrl(profile.id, 'lose'),
    },
    cutoutUrl: profile.hasCutout ? cutoutUrl(profile.id) : null,
  }));
  return { valid: true, roster };
}

function createPlayersRouter() {
  const router = express.Router();
  const jsonBody = express.json({ limit: '64kb' });
  const photoBody = express.raw({ type: () => true, limit: PHOTO_LIMIT });

  router.get('/', (req, res) => {
    res.json({ success: true, players: store.list().map(withPhotoUrls) });
  });

  router.post('/', jsonBody, (req, res) => {
    try {
      const profile = store.create({ pseudo: req.body?.pseudo });
      res.status(201).json({ success: true, player: withPhotoUrls(profile) });
    } catch (e) {
      res.status(400).json({ success: false, error: e.message });
    }
  });

  router.get('/:id', (req, res) => {
    const profile = store.get(req.params.id);
    if (!profile) return res.status(404).json({ success: false, error: 'PROFILE_NOT_FOUND' });
    res.json({ success: true, player: withPhotoUrls(profile) });
  });

  router.patch('/:id', jsonBody, (req, res) => {
    try {
      const profile = store.update(req.params.id, { pseudo: req.body?.pseudo });
      if (!profile) return res.status(404).json({ success: false, error: 'PROFILE_NOT_FOUND' });
      res.json({ success: true, player: withPhotoUrls(profile) });
    } catch (e) {
      res.status(400).json({ success: false, error: e.message });
    }
  });

  router.delete('/:id', (req, res) => {
    const ok = store.delete(req.params.id);
    if (!ok) return res.status(404).json({ success: false, error: 'PROFILE_NOT_FOUND' });
    res.json({ success: true });
  });

  router.put('/:id/photos/:variant', photoBody, (req, res) => {
    const { id, variant } = req.params;
    if (!PLAYER_PHOTO_VARIANTS.includes(variant)) {
      return res.status(400).json({ success: false, error: 'INVALID_VARIANT' });
    }
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ success: false, error: 'EMPTY_PHOTO' });
    }
    try {
      const profile = store.setPhoto(id, variant, req.body);
      if (!profile) return res.status(404).json({ success: false, error: 'PROFILE_NOT_FOUND' });
      res.json({ success: true, player: withPhotoUrls(profile) });
    } catch (e) {
      res.status(400).json({ success: false, error: e.message });
    }
  });

  router.get('/:id/photos/:variant', (req, res) => {
    const photoPath = store.getPhotoPath(req.params.id, req.params.variant);
    if (!photoPath) return res.status(404).json({ success: false, error: 'PHOTO_NOT_FOUND' });
    // Cache court : assez pour une partie, sans masquer une photo ré-éditée.
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.type('image/jpeg').sendFile(photoPath);
  });

  router.put('/:id/cutout', photoBody, (req, res) => {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ success: false, error: 'EMPTY_PHOTO' });
    }
    try {
      const profile = store.setCutout(req.params.id, req.body);
      if (!profile) return res.status(404).json({ success: false, error: 'PROFILE_NOT_FOUND' });
      res.json({ success: true, player: withPhotoUrls(profile) });
    } catch (e) {
      res.status(400).json({ success: false, error: e.message });
    }
  });

  router.get('/:id/cutout', (req, res) => {
    const cutoutPath = store.getCutoutPath(req.params.id);
    if (!cutoutPath) return res.status(404).json({ success: false, error: 'CUTOUT_NOT_FOUND' });
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.type('image/png').sendFile(cutoutPath);
  });

  return router;
}

module.exports = { createPlayersRouter, buildEnrichedRoster, store };
