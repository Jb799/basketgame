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
    statistics: profile.statistics || store.getStatistics(profile.id),
  };
}

function isLocalRequest(req) {
  const ip = req.ip || req.socket?.remoteAddress || '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

function buildPhotoUrls(profile) {
  const photos = {};
  for (const v of PLAYER_PHOTO_VARIANTS) {
    photos[v] = profile.photos[v] ? photoUrl(profile.id, v) : null;
  }
  return photos;
}

function rosterEntryFromProfile(profile, slot) {
  return {
    slot,
    profileId: profile.id,
    pseudo: profile.pseudo,
    photos: buildPhotoUrls(profile),
    cutoutUrl: profile.hasCutout ? cutoutUrl(profile.id) : null,
  };
}

/**
 * Résout une liste ordonnée d'ids en roster enrichi pour le jeu.
 * @param {string[]} profileIds — index 0 = slot 1 ; chaînes vides ignorées si allowEmptySlots
 * @param {{ allowEmptySlots?: boolean }} [opts]
 * @returns {{ valid: true, roster: object[] } | { valid: false, error: string }}
 */
function buildEnrichedRoster(profileIds, opts = {}) {
  if (!Array.isArray(profileIds)) {
    return { valid: false, error: 'INVALID_ROSTER' };
  }

  if (opts.allowEmptySlots) {
    const resolved = store.resolveRosterOptional(profileIds);
    if (!resolved.valid) return resolved;
    const roster = resolved.profiles.map(({ profile, slot }) => rosterEntryFromProfile(profile, slot));
    return { valid: true, roster };
  }

  const resolved = store.resolveRoster(profileIds, { requireAllPhotos: true });
  if (!resolved.valid) return resolved;

  const roster = resolved.profiles.map((profile, index) => rosterEntryFromProfile(profile, index + 1));
  return { valid: true, roster };
}

function createPlayersRouter() {
  const router = express.Router();
  const jsonBody = express.json({ limit: '64kb' });
  const photoBody = express.raw({ type: () => true, limit: PHOTO_LIMIT });

  router.get('/', (req, res) => {
    res.json({ success: true, players: store.list().map(withPhotoUrls) });
  });

  router.post('/record-game', jsonBody, (req, res) => {
    if (!isLocalRequest(req)) {
      return res.status(403).json({ success: false, error: 'LOCALHOST_ONLY' });
    }

    const gameId = String(req.body?.gameId || '').trim();
    const results = req.body?.results;
    if (!gameId || !Array.isArray(results) || results.length === 0) {
      return res.status(400).json({ success: false, error: 'INVALID_PAYLOAD' });
    }

    const entries = [];
    for (const row of results) {
      if (!row?.profileId || !row?.result) continue;
      entries.push({
        profileId: row.profileId,
        gameId,
        result: row.result,
        meta: row.meta,
      });
    }

    if (entries.length === 0) {
      return res.status(400).json({ success: false, error: 'NO_VALID_RESULTS' });
    }

    try {
      const updated = store.recordGameResults(entries);
      res.json({ success: true, updated });
    } catch (e) {
      res.status(400).json({ success: false, error: e.message });
    }
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
