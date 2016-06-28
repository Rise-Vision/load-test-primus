var PORT = process.env.PORT || 3000;

var Primus = require("primus");
var emitter = require("primus-emitter");
var latency = require("primus-spark-latency");
var http = require("http");
var displayServer = null;
var displaysById = {};
var displaysBySpark = {};

var server = http.createServer();
var primus = new Primus(server, { transformer: "SockJS", use_clock_offset: true });

primus.use("emitter", emitter);
primus.use("spark-latency", latency);

primus.on("disconnection", function(spark) {
  if(spark === displayServer) {
    displayServer = null;
  }
  else if(displaysBySpark[spark]) {
    var displayId = displaysBySpark[spark];

    delete displaysById[displayId];
    delete displaysBySpark[spark];
  }
});

primus.on("connection", function(spark) {
  console.log("on conn");
  spark.on("server-init", function () {
    console.log("server init");
    if(displayServer) {
      displayServer.end();
    }

    displayServer = spark;
  });

  spark.on("display-init", function (data) {
    console.log("server init");
    if(data.displayId) {
      if(displaysById[data.displayId]) {
        displaysById[data.displayId].end();
      }

      displaysById[data.displayId] = spark;
      displaysBySpark[spark] = data.displayId;
    }
  });

  spark.on("server-message", function(data) {
    console.log("server message", data);
    if(data.displayId) {
      if(displaysById[data.displayId]) {
        displaysById[data.displayId].send("message", data);
      }
    }
  });
});

// Start HTTP server
server.listen(PORT, function() {
  console.log("Running on http://localhost:3000");
});
