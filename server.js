var PORT = process.env.PORT || 3000;

var Primus = require("primus");
var emitter = require("primus-emitter");
var latency = require("primus-spark-latency");
var http = require("http");
var fs = require("fs");
var server = http.createServer();
var storage = require("./storage.js");
var displayServer = null;
var displaysById = {};
var displaysBySpark = {};
var pendingMessages = {};
var pendingTasks = {};
var stats = {
  clients: 0,
  newClients: 0,
  disconnectedClients: 0,
  unknownDisconnectedClients: 0,
  newErrors: 0,
  sentMessages: 0,
  savedMessagesSent: 0,
  savedMessages: 0
};

return storage.init()
.then(startPrimus)
.then(registerPrimusEventListeners)
.then(startStats)
.then(startServer)
.catch((err)=>{
  console.log(err);
});

function startPrimus() {
  var primus = new Primus(server, { transformer: "websockets", use_clock_offset: true });

  primus.use("emitter", emitter);
  primus.use("spark-latency", latency);

  return primus;
}

function registerPrimusEventListeners(primus) {
  primus.on("connection", function(spark) {
    spark.on("end", function() {
      if(spark === displayServer) {
        displayServer = null;
      }
      else if(displaysBySpark[spark.id]) {
        stats.clients--;
        stats.disconnectedClients++;

        var displayId = displaysBySpark[spark.id];

        delete displaysById[displayId];
        delete displaysBySpark[spark.id];
      }
      else {
        stats.unknownDisconnectedClients++;
      }
    });

    spark.on("end", function() {
      stats.newErrors++;
    });

    spark.on("server-init", function () {
      if(displayServer) {
        displayServer.end();
      }

      displayServer = spark;
    });

    spark.on("display-init", function (data) {
      if(data.displayId) {
        stats.clients++;
        stats.newClients++;
        displaysById[data.displayId] = spark;
        displaysBySpark[spark.id] = data.displayId;

        loadGCSMessages(data.displayId).then((messages)=>{
          messages.forEach((message)=>{
            stats.savedMessagesSent++;
            spark.send("message", message);
          });

          if(messages.length > 0) {
            return clearGCSMessages(data.displayId);
          }
        });
      }
    });

    spark.on("server-message", function(data) {
      if(data.displayId) {
        if(displaysById[data.displayId]) {
          stats.sentMessages++;
          displaysById[data.displayId].send("message", data.message);
        }
        else {
          stats.savedMessages++;
          appendGCSMessage(data.displayId, data.message);
        }
      }
    });
  });
}

function startStats() {
  setInterval(function () {
    var currStats = [
      stats.clients, stats.newClients, stats.disconnectedClients, stats.unknownDisconnectedClients,
      stats.newErrors, stats.sentMessages, stats.savedMessagesSent, stats.savedMessages
    ].join(",");

    console.log(JSON.stringify(stats));

    stats.newClients = 0;
    stats.disconnectedClients = 0;
    stats.unknownDisconnectedClients = 0;
    stats.newErrors = 0;
    stats.sentMessages = 0;
    stats.savedMessagesSent = 0;
    stats.savedMessages = 0;

    fs.appendFile("stats.csv", currStats + "\n", function (err) {
      if(err) { console.log("Error saving stats", err); }
    });
  }, 5000);
}

function appendGCSMessage(displayId, message) {
  if(pendingMessages[displayId]) {
    pendingMessages[displayId].push(message);
  }
  else {
    pendingMessages[displayId] = [message];
  }

  enqueueTask(displayId, processPendingMessages.bind(null, displayId));
}

function loadGCSMessages(displayId) {
  return storage.readFile(displayId + ".json", true)
  .then((contents)=>{
    return contents.trim() ? JSON.parse(contents) : [];
  })
  .catch((err)=>{
    console.log("Error loading messages", displayId, err);
  });
}

function clearGCSMessages(displayId) {
  enqueueTask(displayId, function() {
    return storage.deleteFile(displayId + ".json", true)
    .catch((err)=>{
      console.log("Error deleting messages", displayId, err);
    });
  });
}

function processPendingMessages(displayId) {
  if(pendingMessages[displayId] && pendingMessages[displayId].length > 0) {
    var messages = pendingMessages[displayId].splice(0, pendingMessages[displayId].length);

    return saveGCSMessages(displayId, messages);
  }
}

function saveGCSMessages(displayId, newMessages) {
  var fileName = displayId + ".json";

  return storage.readFile(fileName, true)
  .then((contents)=>{
    var json = contents.trim() ? JSON.parse(contents) : [];

    var messages = Array.isArray(json) ? json : [];
    messages = messages.concat(newMessages);

    return storage.saveFile(fileName, JSON.stringify(messages));
  })
  .catch((err)=>{
    console.log("Error saving messages", displayId, err, newMessages);
  });
}

function enqueueTask(displayId, task) {
  if(pendingTasks[displayId]) {
    pendingTasks[displayId].push(task);
  }
  else {
    pendingTasks[displayId] = [task];
    return runNextTask(displayId);
  }
}

function runNextTask(displayId) {
  if(pendingTasks[displayId] && pendingTasks[displayId].length > 0) {
    var task = pendingTasks[displayId].shift();

    return Promise.resolve()
    .then(task)
    .catch((err)=>{
      console.log("Error running task", err);
    })
    .then(()=>{
      if(pendingTasks[displayId].length === 0) {
        delete pendingTasks[displayId];
      }
      else {
        return runNextTask(displayId);
      }
    });
  }
}

function startServer() {
  server.listen(PORT, function() {
    console.log("Running on http://localhost:3000");
  });
}
