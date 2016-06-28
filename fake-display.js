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
  startDisplay(serverUrl, displayId) {
    var client = new Socket(serverUrl);

    client.send("display-init", { displayId: displayId });

    client.on("message", function(data) {
      console.log("message received", data);
    });
  }
};
