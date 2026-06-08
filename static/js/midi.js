/* midi.js — Web MIDI input bridge for Mtheory
 *
 * Requests MIDI access once on init(), then listens on all inputs.  For every
 * note-on (velocity > 0) it dispatches `mtheory:midi_note` on `document` with
 * detail: { midi, velocity }.  Note-off (or note-on vel=0) dispatches
 * `mtheory:midi_release` with detail: { midi }.
 *
 * Keeps a small status badge in the bottom-right corner so the user knows
 * whether a controller is connected.
 */
(function (global) {
  "use strict";

  let _access = null;
  let _badge = null;

  function _badge_el() {
    if (_badge) return _badge;
    _badge = document.createElement("div");
    _badge.id = "midi-status";
    _badge.style.cssText = [
      "position:fixed", "bottom:14px", "right:14px", "z-index:9999",
      "font:600 11px/1 system-ui,sans-serif", "padding:4px 9px",
      "border-radius:20px", "pointer-events:none",
      "background:rgba(0,0,0,.55)", "border:1px solid rgba(255,255,255,.12)",
      "color:#7777aa", "letter-spacing:.04em", "transition:opacity .4s",
    ].join(";");
    document.body.appendChild(_badge);
    return _badge;
  }

  function _setStatus(text, color) {
    const b = _badge_el();
    b.textContent = "MIDI " + text;
    b.style.color = color || "#7777aa";
    b.style.opacity = "1";
  }

  function _onMessage(ev) {
    const data = ev.data;
    if (!data || data.length < 2) return;
    const status  = data[0] & 0xf0;
    const midi     = data[1];
    const velocity = data.length > 2 ? data[2] : 0;

    if (status === 0x90 && velocity > 0) {
      document.dispatchEvent(
        new CustomEvent("mtheory:midi_note", { detail: { midi: midi, velocity: velocity } })
      );
    } else if (status === 0x80 || (status === 0x90 && velocity === 0)) {
      document.dispatchEvent(
        new CustomEvent("mtheory:midi_release", { detail: { midi: midi } })
      );
    }
  }

  function _attach(access) {
    _access = access;
    let count = 0;
    access.inputs.forEach((input) => {
      input.onmidimessage = _onMessage;
      count++;
    });
    // Re-attach whenever devices are plugged/unplugged.
    access.onstatechange = function (ev) {
      if (ev.port && ev.port.type === "input") {
        ev.port.onmidimessage = _onMessage;
        _updateCount();
      }
    };
    _updateCount();
  }

  function _updateCount() {
    if (!_access) return;
    let n = 0;
    _access.inputs.forEach((input) => {
      if (input.state === "connected") n++;
    });
    if (n === 0) {
      _setStatus("ready — plug in a controller", "#7777aa");
    } else {
      _setStatus(n === 1 ? "1 device" : n + " devices", "#00ba35");
    }
  }

  function init() {
    if (!navigator.requestMIDIAccess) {
      _setStatus("not supported", "#ee0043");
      return;
    }
    _setStatus("...", "#7777aa");
    navigator.requestMIDIAccess({ sysex: false }).then(
      function (access) { _attach(access); },
      function () { _setStatus("access denied", "#ee0043"); }
    );
  }

  global.MtheoryMidi = { init: init };
})(window);
