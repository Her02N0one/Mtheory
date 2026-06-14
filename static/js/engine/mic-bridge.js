/* mic-bridge.js — Singleton that bridges audio.js mic detection into the
 * content engine event system.
 *
 * After calling MicBridge.start(), any stable guitar note detected by the
 * microphone fires a "mtheory:mic_played" CustomEvent on `document` with
 *   detail: { payload: { midi, noteName, centsOff, shape, color } }
 *
 * Call MicBridge.reset() immediately after accepting a correct note to clear
 * the pitch-stability counter and apply a short cooldown, preventing the held
 * string from triggering the next target.
 *
 * Depends on: audio.js (startListening / stopListening / resetLastNote)
 * Exports: window.MicBridge
 */
(function (global) {
  "use strict";

  let _active        = false;
  let _cooldownUntil = 0;

  function _onNote(noteInfo) {
    if (Date.now() < _cooldownUntil) return;
    document.dispatchEvent(new CustomEvent("mtheory:mic_played", {
      bubbles: false,
      detail:  { payload: noteInfo },
    }));
  }

  const MicBridge = {
    get isActive() { return _active; },

    async start() {
      if (_active) return true;
      if (typeof global.startListening !== "function") {
        console.warn("MicBridge: audio.js not loaded — startListening unavailable");
        return false;
      }
      const ok = await global.startListening(_onNote);
      if (ok) _active = true;
      return ok;
    },

    stop() {
      if (!_active) return;
      if (typeof global.stopListening === "function") global.stopListening();
      _active = false;
    },

    // Reset pitch-stability state and gate out detections for 450 ms so a held
    // string from the previous correct answer doesn't re-trigger the next target.
    reset() {
      if (typeof global.resetLastNote === "function") global.resetLastNote();
      _cooldownUntil = Date.now() + 450;
    },
  };

  global.MicBridge = MicBridge;
})(window);
