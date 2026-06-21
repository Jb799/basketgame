/**
 * createGameServer — Factory de serveur de jeu pour la plateforme BasketGame.
 *
 * Monte tout le boilerplate commun à chaque jeu :
 *   - Express + CORS + JSON
 *   - Serveur WebSocket (avec INIT à la connexion)
 *   - Fichiers statiques du jeu (publicDir) et du client partagé (/shared)
 *   - Endpoint /api/health et /api/log
 *   - Helper broadcast()
 *
 * La logique propre au jeu (routes /api/trigger, /api/reset, etc.) est
 * enregistrée par le jeu via le callback `routes(app, broadcast)`.
 *
 * Chaque serveur de jeu démarre sur le port fourni par le hub (env GAME_PORT).
 */

const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const WebSocket = require('ws');
const { safeSend, broadcastTo } = require('./broadcast');

const SHARED_CLIENT_DIR = path.join(__dirname, '..', 'client');

/**
 * @param {object} options
 * @param {string} options.name - Nom lisible du jeu (logs).
 * @param {string} options.publicDir - Dossier des fichiers statiques du jeu.
 * @param {() => object} options.getInitMessage - Message envoyé à chaque connexion WS.
 * @param {(app: import('express').Express, broadcast: (data: object) => void) => void} options.routes
 *        - Enregistre les routes spécifiques au jeu.
 * @returns {{ app, server, wss, broadcast, listen }}
 */
function createGameServer({ name, publicDir, getInitMessage, routes }) {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocket.Server({ server });
  const clients = new Set();

  app.use(cors());
  app.use(express.json());

  // Logs du navigateur relayés vers la console serveur (debug).
  app.post('/api/log', (req, res) => {
    const { type, message } = req.body || {};
    console.log(`[${name}][BrowserConsole][${type}]`, message);
    res.sendStatus(200);
  });

  function broadcast(data) {
    broadcastTo(clients, data);
  }

  wss.on('connection', (ws) => {
    clients.add(ws);
    console.log(`[${name}][WS] Client connecté — Total: ${clients.size}`);

    if (typeof getInitMessage === 'function') {
      safeSend(ws, getInitMessage());
    }

    ws.on('close', () => {
      clients.delete(ws);
      console.log(`[${name}][WS] Client déconnecté — Total: ${clients.size}`);
    });
    ws.on('error', (err) => {
      console.error(`[${name}][WS] Erreur:`, err.message);
      clients.delete(ws);
    });
  });

  // Routes spécifiques au jeu.
  if (typeof routes === 'function') {
    routes(app, broadcast);
  }

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', game: name, clients: clients.size });
  });

  // Client partagé (sons, confettis, layout 7 colonnes…) accessible via /shared.
  app.use('/shared', express.static(SHARED_CLIENT_DIR));

  // Fichiers statiques du jeu.
  app.use(express.static(publicDir));

  // Fallback SPA : sert index.html pour les routes non-API.
  app.get('*', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  function listen(port, cb) {
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`[${name}] Port ${port} déjà utilisé — arrêtez l'ancien processus ou relancez le hub.`);
        process.exit(1);
      }
      console.error(`[${name}] Erreur serveur :`, err.message);
      process.exit(1);
    });
    server.listen(port, '0.0.0.0', cb);
  }

  return { app, server, wss, broadcast, clients, listen };
}

module.exports = { createGameServer };
module.exports.parseStartParams = require('./parseStartParams').parseStartParams;
