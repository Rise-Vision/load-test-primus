var Primus = require("primus");
var Socket = Primus.createSocket({
  transformer: "SockJS",
  use_clock_offset: true,
  plugin: {
    "primus-emitter": require("primus-emitter"),
    "primus-spark-latency": require("primus-spark-latency")
  }
});

module.exports = {
  startServer(serverUrl, displayIds, frequency) {
    var client = new Socket(serverUrl);

    client.send("server-init", {});

    setInterval(function () {
      var displayId = displayIds[Math.floor(Math.random() * displayIds.length)];

      client.send("server-message", { displayId: displayId, message: "Message to " + displayId });
    }, Math.floor(1000 / frequency));
  }
};
