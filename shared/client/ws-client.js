/**
 * ws-client.js — Petit client WebSocket réutilisable avec reconnexion auto.
 *
 * Expose window.WSClient.connect(url, handlers).
 * Utilisé par les interfaces du hub (lobby, télé). Les jeux peuvent aussi s'en
 * servir plutôt que de réécrire la logique de reconnexion.
 */

window.WSClient = (function () {
  const RECONNECT_DELAY = 3000;

  /**
   * @param {string} url - URL WebSocket (ws:// ou wss://).
   * @param {object} handlers
   * @param {(msg: object) => void} [handlers.onMessage]
   * @param {() => void} [handlers.onOpen]
   * @param {() => void} [handlers.onClose]
   * @returns {{ send: (data: object) => void, close: () => void }}
   */
  function connect(url, handlers = {}) {
    let ws = null;
    let reconnectTimer = null;
    let closedByUser = false;

    function open() {
      ws = new WebSocket(url);
      ws.addEventListener('open', () => handlers.onOpen && handlers.onOpen());
      ws.addEventListener('message', (event) => {
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch (e) {
          return;
        }
        handlers.onMessage && handlers.onMessage(msg);
      });
      ws.addEventListener('close', () => {
        handlers.onClose && handlers.onClose();
        ws = null;
        if (!closedByUser) scheduleReconnect();
      });
      ws.addEventListener('error', () => ws && ws.close());
    }

    function scheduleReconnect() {
      if (reconnectTimer) return;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        open();
      }, RECONNECT_DELAY);
    }

    open();

    return {
      send(data) {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(data));
        }
      },
      close() {
        closedByUser = true;
        if (reconnectTimer) clearTimeout(reconnectTimer);
        if (ws) ws.close();
      },
    };
  }

  return { connect };
})();
