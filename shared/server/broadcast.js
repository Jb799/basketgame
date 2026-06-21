/**
 * broadcast — Helpers de diffusion WebSocket réutilisables.
 */

const WebSocket = require('ws');

/**
 * Envoie un objet JSON à un client WebSocket si la connexion est ouverte.
 */
function safeSend(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

/**
 * Diffuse un objet JSON à tous les clients d'un ensemble.
 */
function broadcastTo(clients, data) {
  const payload = JSON.stringify(data);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

module.exports = { safeSend, broadcastTo };
