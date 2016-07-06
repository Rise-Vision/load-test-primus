var cluster = require("cluster");
var Primus = require("primus");
var emitter = require("primus-emitter");
var latency = require("primus-spark-latency");
var http = require("http");
var fs = require("fs");
var argv = require("yargs")
  .default({ address: "localhost", port: 3000 })
  .argv;
var server = http.createServer();
var storage = require("./storage.js");
var displayServers = {};
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
  newGCSErrors: 0,
  sentMessages: 0,
  savedMessagesSent: 0,
  savedMessages: 0
};

if(cluster.isMaster) {
  var numWorkers = require("os").cpus().length;
  var updateMasterStats = (message)=>{
    if(message.stats) {
      stats.clients += (message.stats.newClients - message.stats.disconnectedClients);
      stats.newClients += message.stats.newClients;
      stats.disconnectedClients += message.stats.disconnectedClients;
      stats.unknownDisconnectedClients += message.stats.unknownDisconnectedClients;
      stats.newErrors += message.stats.newErrors;
      stats.newGCSErrors += message.stats.newGCSErrors;
      stats.sentMessages += message.stats.sentMessages;
      stats.savedMessagesSent += message.stats.savedMessagesSent;
      stats.savedMessages += message.stats.savedMessages;
    }
  };

  console.log("Master cluster setting up " + numWorkers + " workers...");

  for(var i = 0; i < numWorkers; i++) {
    var worker = cluster.fork();

    worker.on("message", updateMasterStats);
  }

  cluster.on("online", function(worker) {
    console.log("Worker " + worker.process.pid + " is online");
  });

  cluster.on("exit", function(worker, code, signal) {
    console.log("Worker " + worker.process.pid + " died with code: " + code + ", and signal: " + signal);
    console.log("Starting a new worker");
    cluster.fork();
  });

  startStats();
}
else {
  return storage.init()
  .then(startPrimus)
  .then(registerPrimusEventListeners)
  .then(startStats)
  .then(startServer)
  .catch((err)=>{
    console.log(err);
  });
}

function startPrimus() {
  var primus = new Primus(server, { transformer: "uws", use_clock_offset: true });

  primus.use("emitter", emitter);
  primus.use("spark-latency", latency);

  return primus;
}

function registerPrimusEventListeners(primus) {
  primus.on("connection", function(spark) {
    spark.on("end", function() {
      if(displayServers[spark.id]) {
        delete displayServers[spark.id];
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
      displayServers[spark.id] = spark;
    });

    spark.on("display-init", function (data) {
      if(data.displayId) {
        stats.clients++;
        stats.newClients++;
        displaysById[data.displayId] = spark;
        displaysBySpark[spark.id] = data.displayId;

        enqueueTask(data.displayId, sendSavedMessages.bind(null, data.displayId, 3));
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
    if(cluster.isMaster) {
      var currStats = [
        Date.now(), stats.clients, stats.newClients, stats.disconnectedClients, stats.unknownDisconnectedClients,
        stats.newErrors, stats.newGCSErrors, stats.sentMessages, stats.savedMessagesSent, stats.savedMessages
      ].join(",");

      console.log(JSON.stringify(stats));

      fs.appendFile("stats.csv", currStats + "\n", function (err) {
        if(err) { console.log("Error saving stats", err); }
      });
    }
    else {
      console.log(process.pid, JSON.stringify(stats));
      process.send({ stats: stats });
    }

    stats.newClients = 0;
    stats.disconnectedClients = 0;
    stats.unknownDisconnectedClients = 0;
    stats.newErrors = 0;
    stats.newGCSErrors = 0;
    stats.sentMessages = 0;
    stats.savedMessagesSent = 0;
    stats.savedMessages = 0;
  }, cluster.isMaster ? 5000 : 1000);
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

function processPendingMessages(displayId) {
  if(pendingMessages[displayId] && pendingMessages[displayId].length > 0) {
    var messages = pendingMessages[displayId].splice(0, pendingMessages[displayId].length);

    return saveGCSMessages(displayId, messages, 3);
  }
}

function sendSavedMessages(displayId, retries) {
  var fileName = displayId + ".json";

  return storage.readFile(fileName, true)
  .then((contents)=>{
    return contents.trim() ? JSON.parse(contents) : [];
  })
  .then((messages)=>{
    if(displaysById[displayId]) {
      var spark = displaysById[displayId];

      messages.forEach((message)=>{
        stats.savedMessagesSent++;
        spark.send("message", message);
      });

      return storage.deleteFile(fileName, true);
    }
  })
  .catch((err)=>{
    stats.newGCSErrors++;

    if(--retries > 0) {
      enqueueTask(displayId, sendSavedMessages.bind(null, displayId, retries));
    }
    else {
      console.log("Error loading messages", displayId, err);
    }
  });
}

function saveGCSMessages(displayId, newMessages, retries) {
  var fileName = displayId + ".json";

  return storage.readFile(fileName, true)
  .then((contents)=>{
    var json = contents.trim() ? JSON.parse(contents) : [];

    var messages = Array.isArray(json) ? json : [];
    messages = messages.concat(newMessages);

    return storage.saveFile(fileName, JSON.stringify(messages));
  })
  .catch((err)=>{
    stats.newGCSErrors++;

    if(--retries > 0) {
      return saveGCSMessages(displayId, newMessages, retries);
    }
    else {
      console.log("Error saving messages", displayId, err, newMessages);
    }
  });
}

function enqueueTask(displayId, task) {
  return;

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
  server.listen(argv.port, argv.address, function() {
    console.log("Running on http://" + server.address().address + ":" + server.address().port);
  });
}
