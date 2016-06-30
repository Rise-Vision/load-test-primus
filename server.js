var PORT = process.env.PORT || 3000;

var Primus = require("primus");
var emitter = require("primus-emitter");
var latency = require("primus-spark-latency");
var http = require("http");
var server = http.createServer();
var redis = require("./redis.js");
var displayServer = null;
var displaysById = {};
var displaysBySpark = {};

return redis.init()
.then(startPrimus)
.then(registerPrimusEventListeners)
.then(startServer)
.catch((err)=>{
  console.log(err);
});

function startPrimus() {
  var primus = new Primus(server, { transformer: "SockJS", use_clock_offset: true });

  primus.use("emitter", emitter);
  primus.use("spark-latency", latency);

  return primus;
}

function registerPrimusEventListeners(primus) {
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
    spark.on("server-init", function () {
      if(displayServer) {
        displayServer.end();
      }

      displayServer = spark;
    });

    spark.on("display-init", function (data) {
      if(data.displayId) {
        if(displaysById[data.displayId]) {
          displaysById[data.displayId].end();
        }

        displaysById[data.displayId] = spark;
        displaysBySpark[spark] = data.displayId;

        loadQueuedMessages(data.displayId).then((messages)=>{
          messages.forEach((message)=>{
            spark.send("message", message);
          });

          if(messages.length > 0) {
            console.log("Sent pending messages to: " + data.displayId + " - " + messages);
            return clearQueuedMessages(data.displayId);
          }
        });
      }
    });

    spark.on("server-message", function(data) {
      if(data.displayId) {
        if(displaysById[data.displayId]) {
          displaysById[data.displayId].send("message", data.message);
        }
        else {
          enqueueMessage(data.displayId, data.message);
        }
      }
    });
  });
}

function enqueueMessage(displayId, message) {
  return redis.saveMessage(displayId, message)
  .catch((err)=>{
    console.log("Error saving messages", displayId, err);
  });
}

function loadQueuedMessages(displayId) {
  return redis.readMessages(displayId)
  .catch((err)=>{
    console.log("Error loading messages", displayId, err);
    return [];
  });
}

function clearQueuedMessages(displayId) {
  return redis.clearMessages(displayId)
  .catch((err)=>{
    console.log("Error deleting messages", displayId, err);
  });
}

function startServer() {
  server.listen(PORT, function() {
    console.log("Running on http://localhost:3000");
  });
}
