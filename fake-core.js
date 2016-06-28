var Primus = require("primus");
var Socket = Primus.createSocket({
  transformer: "SockJS",
  use_clock_offset: true,
  plugin: {
    "primus-emitter": require("primus-emitter"),
    "primus-spark-latency": require("primus-spark-latency")
  }
});
var client = new Socket("http://localhost:3000");

client.send("server-init", {});

setInterval(function () {
  var displayId = Math.random() < 0.5 ? "AAA" : "BBB";

  client.send("server-message", { displayId: displayId, message: "Message" });
}, 1000);
