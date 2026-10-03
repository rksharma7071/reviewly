const { MongoClient } = require('mongodb');

async function run() {
  const uri = "mongodb+srv://rksharma7071_db_user:hvKLwAVlMWVIZ2IG@cluster0.g3idjqv.mongodb.net/reviewly?retryWrites=true&w=majority&appName=reviewly";
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log("Connected successfully to server");
    await client.close();
  } catch (err) {
    console.error("Connection failed", err);
  }
}

run();
