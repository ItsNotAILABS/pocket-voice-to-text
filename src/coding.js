/**
 * Voice while coding — dictate, commands, spoken status without blocking the editor.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./stt"), require("./tts"), require("./coding-core"));
  } else
    root.PocketVoiceCoding = factory(
      root.PocketVoiceSTT,
      root.PocketVoiceTTS,
      root.PocketVoiceCodingCore
    );
})(typeof self !== "undefined" ? self : this, function (STT, TTS, Core) {
  "use strict";

  var CoreSafe = Core || {
    parseCommand: function () {
      return { ok: false };
    },
    appendDictate: function (b, t) {
      return (b || "") + " " + (t || "");
    },
    announceJobMessage: function () {
      return "Job finished.";
    },
    listCommands: function () {
      return [];
    },
    COMMANDS: [],
  };

  function create(opts) {
    opts = opts || {};
    var target = opts.target || null;
    var onCommand = opts.onCommand || function () {};
    var onDictate = opts.onDictate || function () {};
    var onStatus = opts.onStatus || function () {};
    var speakStatus = opts.speakStatus !== false;

    var tts = TTS.create({ rate: 1.08, lang: opts.lang || "en-US", remoteSpeak: opts.remoteSpeak });
    var buffer = "";

    function appendText(text) {
      text = String(text || "").trim();
      if (!text) return;
      buffer = CoreSafe.appendDictate(buffer, text);
      if (target && typeof target === "object" && "value" in target) {
        target.value = CoreSafe.appendDictate(target.value || "", text);
        try {
          target.dispatchEvent(new Event("input", { bubbles: true }));
        } catch (_) {}
      }
      onDictate(text);
    }

    var stt = STT.create({
      lang: opts.lang || "en-US",
      onFinal: function (text) {
        var parsed = CoreSafe.parseCommand(text);
        if (parsed.type === "command") {
          if (parsed.cmd === "mic_off") {
            stt.stop();
            status("Mic off");
            return;
          }
          onCommand(parsed.cmd, { cmd: parsed.cmd, match: parsed.args, raw: parsed.raw });
          status("Command: " + parsed.cmd);
          return;
        }
        if (parsed.type === "dictate") appendText(parsed.text);
      },
      onInterim: opts.onInterim || function () {},
      onState: opts.onMicState || function () {},
      onError: opts.onError || function () {},
    });

    function status(msg) {
      onStatus(msg);
      if (speakStatus && msg) tts.speak(String(msg).slice(0, 160));
    }

    function announceJob(result) {
      status(CoreSafe.announceJobMessage(result));
    }

    return {
      mic: stt,
      tts: tts,
      start: function () {
        return stt.start();
      },
      stop: function () {
        stt.stop();
      },
      toggle: function () {
        return stt.toggle();
      },
      setTarget: function (el) {
        target = el;
      },
      getBuffer: function () {
        return buffer;
      },
      clearBuffer: function () {
        buffer = "";
      },
      announceJob: announceJob,
      status: status,
      parseCommand: CoreSafe.parseCommand,
    };
  }

  return {
    create: create,
    COMMANDS: CoreSafe.COMMANDS || CoreSafe.listCommands(),
    parseCommand: CoreSafe.parseCommand,
    listCommands: CoreSafe.listCommands,
    appendDictate: CoreSafe.appendDictate,
    announceJobMessage: CoreSafe.announceJobMessage,
  };
});
