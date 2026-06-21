/**
 * player-profiles — Profils joueurs persistés (pseudo + 3 photos).
 *
 * Module réutilisable et pur côté logique : toute l'I/O fichier est isolée ici
 * (même discipline que le module `scoring`). Aucune dépendance réseau, aucun
 * couplage à un jeu précis.
 *
 * Chaque profil vit dans son propre dossier :
 *   <dir>/<id>/profile.json   → { id, pseudo, createdAt, updatedAt }
 *   <dir>/<id>/idle.jpg       → photo de profil
 *   <dir>/<id>/win.jpg        → photo de fierté (victoire)
 *   <dir>/<id>/lose.jpg       → photo de défaite
 *   <dir>/<id>/cutout.png     → tête détourée (fond transparent), optionnelle
 *
 * Le scan du dossier fait foi (pas d'index séparé à maintenir).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { PLAYER_PHOTO_VARIANTS } = require('../../constants');

const PHOTO_FILES = { idle: 'idle.jpg', win: 'win.jpg', lose: 'lose.jpg' };
const CUTOUT_FILE = 'cutout.png';

class PlayerProfiles {
  /**
   * @param {object} options
   * @param {string} options.dir - Dossier racine de stockage des profils.
   */
  constructor({ dir } = {}) {
    if (!dir) throw new Error('PlayerProfiles: "dir" requis');
    this.dir = dir;
    this._ensureDir();
  }

  _ensureDir() {
    try {
      fs.mkdirSync(this.dir, { recursive: true });
    } catch (e) {
      console.error('[PlayerProfiles] Création du dossier échouée :', e.message);
    }
  }

  _profileDir(id) {
    return path.join(this.dir, id);
  }

  _profileFile(id) {
    return path.join(this._profileDir(id), 'profile.json');
  }

  _photoPath(id, variant) {
    return path.join(this._profileDir(id), PHOTO_FILES[variant]);
  }

  _cutoutPath(id) {
    return path.join(this._profileDir(id), CUTOUT_FILE);
  }

  _photoStatus(id) {
    const photos = {};
    for (const v of PLAYER_PHOTO_VARIANTS) {
      photos[v] = fs.existsSync(this._photoPath(id, v));
    }
    return photos;
  }

  _readProfile(id) {
    try {
      return JSON.parse(fs.readFileSync(this._profileFile(id), 'utf8'));
    } catch {
      return null;
    }
  }

  _writeProfile(profile) {
    fs.writeFileSync(this._profileFile(profile.id), JSON.stringify(profile, null, 2), 'utf8');
  }

  _toPublic(profile) {
    const photos = this._photoStatus(profile.id);
    return {
      id: profile.id,
      pseudo: profile.pseudo,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
      photos,
      hasAllPhotos: PLAYER_PHOTO_VARIANTS.every((v) => photos[v]),
      hasCutout: fs.existsSync(this._cutoutPath(profile.id)),
    };
  }

  /** Liste tous les profils (métadonnées + état des photos), triés par pseudo. */
  list() {
    let entries;
    try {
      entries = fs.readdirSync(this.dir, { withFileTypes: true });
    } catch {
      return [];
    }
    const profiles = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const profile = this._readProfile(entry.name);
      if (profile && profile.id) profiles.push(this._toPublic(profile));
    }
    profiles.sort((a, b) => (a.pseudo || '').localeCompare(b.pseudo || '', 'fr'));
    return profiles;
  }

  /** Retourne un profil public par son id, ou null. */
  get(id) {
    const profile = this._readProfile(id);
    return profile ? this._toPublic(profile) : null;
  }

  /** Crée un profil avec un pseudo (les photos sont ajoutées ensuite). */
  create({ pseudo }) {
    const clean = String(pseudo || '').trim();
    if (!clean) throw new Error('PSEUDO_REQUIRED');
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    fs.mkdirSync(this._profileDir(id), { recursive: true });
    const profile = { id, pseudo: clean, createdAt: now, updatedAt: now };
    this._writeProfile(profile);
    return this._toPublic(profile);
  }

  /** Met à jour le pseudo d'un profil. Retourne le profil public ou null. */
  update(id, { pseudo }) {
    const profile = this._readProfile(id);
    if (!profile) return null;
    if (pseudo !== undefined) {
      const clean = String(pseudo).trim();
      if (!clean) throw new Error('PSEUDO_REQUIRED');
      profile.pseudo = clean;
    }
    profile.updatedAt = new Date().toISOString();
    this._writeProfile(profile);
    return this._toPublic(profile);
  }

  /** Enregistre une photo (variant: idle | win | lose) depuis un Buffer. */
  setPhoto(id, variant, buffer) {
    if (!PLAYER_PHOTO_VARIANTS.includes(variant)) throw new Error('INVALID_VARIANT');
    if (!buffer || !buffer.length) throw new Error('EMPTY_PHOTO');
    const profile = this._readProfile(id);
    if (!profile) return null;
    fs.writeFileSync(this._photoPath(id, variant), buffer);
    profile.updatedAt = new Date().toISOString();
    this._writeProfile(profile);
    return this._toPublic(profile);
  }

  /** Chemin absolu d'une photo existante, ou null. */
  getPhotoPath(id, variant) {
    if (!PLAYER_PHOTO_VARIANTS.includes(variant)) return null;
    const p = this._photoPath(id, variant);
    return fs.existsSync(p) ? p : null;
  }

  /** Enregistre la tête détourée (PNG transparent) depuis un Buffer. */
  setCutout(id, buffer) {
    if (!buffer || !buffer.length) throw new Error('EMPTY_PHOTO');
    const profile = this._readProfile(id);
    if (!profile) return null;
    fs.writeFileSync(this._cutoutPath(id), buffer);
    profile.updatedAt = new Date().toISOString();
    this._writeProfile(profile);
    return this._toPublic(profile);
  }

  /** Chemin absolu de la tête détourée existante, ou null. */
  getCutoutPath(id) {
    const p = this._cutoutPath(id);
    return fs.existsSync(p) ? p : null;
  }

  /** Supprime un profil et toutes ses photos. */
  delete(id) {
    const dir = this._profileDir(id);
    if (!fs.existsSync(dir)) return false;
    fs.rmSync(dir, { recursive: true, force: true });
    return true;
  }

  /**
   * Valide une liste ordonnée d'identifiants de profils pour une partie.
   * @param {string[]} profileIds - Index 0 = slot 1, etc.
   * @returns {{ valid: true, profiles: object[] } | { valid: false, error: string }}
   */
  resolveRoster(profileIds) {
    if (!Array.isArray(profileIds) || profileIds.length === 0) {
      return { valid: false, error: 'ROSTER_EMPTY' };
    }
    const seen = new Set();
    const profiles = [];
    for (const id of profileIds) {
      if (typeof id !== 'string' || !id) return { valid: false, error: 'ROSTER_INVALID_ID' };
      if (seen.has(id)) return { valid: false, error: 'ROSTER_DUPLICATE' };
      seen.add(id);
      const profile = this.get(id);
      if (!profile) return { valid: false, error: 'ROSTER_PROFILE_NOT_FOUND' };
      if (!profile.hasAllPhotos) return { valid: false, error: 'ROSTER_PHOTOS_INCOMPLETE' };
      profiles.push(profile);
    }
    return { valid: true, profiles };
  }
}

module.exports = { PlayerProfiles, PHOTO_FILES, CUTOUT_FILE };
