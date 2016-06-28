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

client.send("display-init", { displayId: "AAA" });

client.on("message", function(data) {
  console.log("message received", data);
});
