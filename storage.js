var gcloud = require("gcloud");
var gcs;
var gcsBucket;

module.exports = {
  init() {
    return new Promise((res, rej)=>{
      try {
        gcs = gcloud.storage({
          projectId: "primus-messaging-server-test",
          keyFilename: "/home/francisco/primus-messaging-server-test-5810f6ace265.json"
        });
        gcsBucket = gcs.bucket("primus-messaging-server-test.appspot.com");
        res();
      } catch (err) {
        rej(err);
      }
    });
  },
  getMetadata(name) {
    return new Promise((res, rej)=>{
      gcsBucket.file(name).getMetadata((err, metadata)=>{
        if(!err) {
          res(metadata);
        }
        else {
          rej(err);
        }
      });
    });
  },
  readFile(name, ignoreNotFound) {
    return new Promise((res, rej)=>{
      var contents = "";

      gcsBucket.file(name).createReadStream()
        .on("error", function(err) {
          if(err.code === 404 && ignoreNotFound) {
            res("");
          }
          else {
            rej(err);
          }
        })
        .on("data", function(data) {
          contents += data;
         })
        .on("end", function() {
          res(contents);
        });
    });
  },
  saveFile(name, contents) {
    return new Promise((res, rej)=>{
      var options = {
        public: true,
        predefinedAcl: "publicRead",
        metadata: {
          contentType: "text/plain",
          cacheControl: "public, max-age=0, no-cache, no-store"
        }
      };

      gcsBucket.file(name).save(contents, options, (err)=>{
        if(!err) {
          res();
        }
        else {
          rej(err);
        }
      });
    });
  },
  deleteFile(name, ignoreNotFound) {
    return new Promise((res, rej)=>{
      gcsBucket.file(name).delete((err)=>{
        if(!err) {
          res();
        }
        else if(err.code === 404 && ignoreNotFound) {
          res();
        }
        else {
          rej(err);
        }
      });
    });
  }
};
