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
  startDisplay(serverUrl, displayId) {
    var client = new Socket(serverUrl);

    client.on("open", ()=>{
      client.send("display-init", { displayId: displayId });
    });

    client.on("message", function(data) {
      console.log("Received by: " + displayId + " - " + data);
    });
  }
};
