var Primus = require("primus");
var Socket = Primus.createSocket({
  transformer: "websockets",
  use_clock_offset: true,
  plugin: {
    "primus-emitter": require("primus-emitter"),
    "primus-spark-latency": require("primus-spark-latency")
  }
});

module.exports = {
  startServer(serverUrl, displayIds, frequency) {
    var client = new Socket(serverUrl);
    var messageCount = 0;

    client.on("open", ()=>{
      client.send("server-init", {});
    });

    setInterval(function () {
      var displayId = displayIds[Math.floor(Math.random() * displayIds.length)];

      client.send("server-message", { displayId: displayId, message: "Message: " + (++messageCount) });
    }, Math.floor(1000 / frequency));
  }
};
