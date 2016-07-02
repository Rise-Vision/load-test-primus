var PORT = process.env.PORT || 3000;

var Primus = require("primus");
var emitter = require("primus-emitter");
var latency = require("primus-spark-latency");
var http = require("http");
var server = http.createServer();
var storage = require("./storage.js");
var displayServer = null;
var displaysById = {};
var displaysBySpark = {};
var pendingMessages = {};
var pendingTasks = {};

return storage.init()
.then(startPrimus)
.then(registerPrimusEventListeners)
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
        console.log("Removing client spark");
        var displayId = displaysBySpark[spark.id];

        delete displaysById[displayId];
        delete displaysBySpark[spark.id];
      }
      else {
        console.log("No client spark found");
      }
    });

    spark.on("server-init", function () {
      if(displayServer) {
        displayServer.end();
      }

      displayServer = spark;
    });

    spark.on("display-init", function (data) {
      if(data.displayId) {
        displaysById[data.displayId] = spark;
        displaysBySpark[spark.id] = data.displayId;

        loadGCSMessages(data.displayId).then((messages)=>{
          messages.forEach((message)=>{
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
          displaysById[data.displayId].send("message", data.message);
        }
        else {
          appendGCSMessage(data.displayId, data.message);
        }
      }
    });
  });
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

    console.log("Saving", fileName, JSON.stringify(messages));

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
