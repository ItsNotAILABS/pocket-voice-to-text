/**
 * Voice while coding — dictate, commands, spoken status without blocking the editor.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./stt"), require("./tts"));
  } else root.PocketVoiceCoding = factory(root.PocketVoiceSTT, root.PocketVoiceTTS);
})(typeof self !== "undefined" ? self : this, function (STT, TTS) {
  "use strict";

  var COMMANDS = [
    { match: /^(stop listening|mic off)$/i, cmd: "mic_off" },
    { match: /^(read that|read selection|speak selection)$/i, cmd: "read_selection" },
    { match: /^(summarize|summary)$/i, cmd: "summarize" },
    { match: /^(run tests|run the tests)$/i, cmd: "run_tests" },
    { match: /^(new file|create file)\s+(.+)/i, cmd: "new_file" },
    { match: /^(search for|find)\s+(.+)/i, cmd: "search" },
    { match: /^(explain this|what does this do)$/i, cmd: "explain" },
  ];

  function create(opts) {
    opts = opts || {};
    /** HTMLElement or { get value/set value } */
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
      if (target) {
        if (typeof target === "object" && "value" in target) {
          var v = target.value || "";
          target.value = (v ? v + (v.endsWith(" ") || v.endsWith("\n") ? "" : " ") : "") + text;
          try {
            target.dispatchEvent(new Event("input", { bubbles: true }));
          } catch (_) {}
        }
      }
      onDictate(text);
    }

    function matchCommand(text) {
      for (var i = 0; i < COMMANDS.length; i++) {
        var m = text.match(COMMANDS[i].match);
        if (m) return { cmd: COMMANDS[i].cmd, match: m, raw: text };
      }
      return null;
    }

    var stt = STT.create({
      lang: opts.lang || "en-US",
      onFinal: function (text) {
        var c = matchCommand(text);
        if (c) {
          if (c.cmd === "mic_off") {
            stt.stop();
            status("Mic off");
            return;
          }
          onCommand(c.cmd, c);
          status("Command: " + c.cmd);
          return;
        }
        // default: dictation into editor / buffer
        buffer += (buffer ? " " : "") + text;
        appendText(text);
      },
      onInterim: opts.onInterim || function () {},
      onState: opts.onMicState || function () {},
      onError: opts.onError || function () {},
    });

    function status(msg) {
      onStatus(msg);
      if (speakStatus && msg) tts.speak(String(msg).slice(0, 160));
    }

    /** Call when a long coding job finishes */
    function announceJob(result) {
      var msg =
        typeof result === "string"
          ? result
          : result && result.ok
            ? "Job finished successfully."
            : "Job finished with issues.";
      status(msg);
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
    };
  }

  return { create: create, COMMANDS: COMMANDS };
});
