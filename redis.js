var redis = require("redis");
var client;

module.exports = {
  init() {
    return new Promise((res, rej)=>{
      client = redis.createClient();

      client.on("ready", function() {
        res();
      });

      client.on("error", function(err) {
        rej(err);
      });
    });
  },
  saveMessage(displayId, message) {
    return new Promise((res, rej)=>{
      client.rpush([displayId, JSON.stringify(message)], (err, reply)=>{
        if(!err) {
          res(reply);
        }
        else {
          rej(err);
        }
      });
    });
  },
  readMessages(displayId) {
    return new Promise((res, rej)=>{
      client.lrange(displayId, 0, -1, (err, reply)=>{
        if(!err) {
          res(reply.map(JSON.parse));
        }
        else {
          rej(err);
        }
      });
    });
  },
  clearMessages(displayId) {
    return new Promise((res, rej)=>{
      client.del(displayId, (err, reply)=>{
        if(!err) {
          res(reply);
        }
        else {
          rej(err);
        }
      });
    });
  }
};
