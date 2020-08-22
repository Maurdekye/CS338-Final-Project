const express = require('express');
const fs = require('fs').promises;
const mysql = require('promise-mysql');

async function get_config(conf_path, default_config) {
  let config = JSON.parse(JSON.stringify(default_config));
  try {
    let raw_cfg = await fs.readFile(conf_path);
    let loaded_cfg = JSON.parse(raw_cfg);
    Object.assign(config, loaded_cfg);
  } catch(e) {}

  await fs.writeFile(conf_path, JSON.stringify(config, null, 4));
  return config;
}

try{
  (async () => {
    const app = express();
    const config = await get_config('./config.json', {
      port: 8080,
      mysql: {
        host: 'localhost',
        user: 'user',
        password: 'password',
        database: 'database'
      }
    });

    let mysql_connection = await mysql.createConnection(config.mysql);

    app.use(express.static("public_html"));

    app.listen(config.port, () => {
      console.log(`Server listening on port ${config.port}`);
    })
  })();
} catch (err) {
  throw err;
}
