const express = require('express');
const fsSync = require('fs');
const fs = fsSync.promises;

async function get_config(conf_path, default_config) {
  let config = Object.assign({}, default_config);
  try {
    let raw_cfg = await fs.readFile(conf_path);
    let loaded_cfg = JSON.parse(raw_cfg);
    Object.assign(config, loaded_cfg);
  } catch(e) {}

  await fs.writeFile(conf_path, JSON.stringify(config, null, 4));
  return config;
}

(async () => {
  const app = express();
  const config = await get_config('./config.json', {
    port: 8080
  });

  app.get('/', (req, res) => {
    res.send('Hello World!');
  });

  app.listen(config.port, () => {
    console.log(`Server listening on port ${config.port}`);
  })

})();
