const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs').promises;
const mysql = require('promise-mysql');
const model = require('./model.js')

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

const legalAnonymousPaths = [
  "/",
  "/login/",
  "/register/",
  "/favicon.ico"
]

try{
  (async () => {

    // initialization

    const app = express();
    const config = await get_config('./config.json', {
      port: 8080,
      static_path: "public_html",
      mysql: {
        host: 'localhost',
        user: 'user',
        password: 'password',
        database: 'database'
      },
      sessionLength: 86400
    });
    let jsonParser = bodyParser.json();

    let sql_conn = await mysql.createConnection(config.mysql);

    // middleware installation

    app.use((req, res, next) => {
      console.log(`[${req.ip}] ${req.method} ${req.path}`);
      next();
    })

    app.use(async (req, res, next) => {
      let sessionResult = await model.getSession(sql_conn, req.ip);
      if (sessionResult.success) {
        req.sessionToken = sessionResult.id;
      }
      if (req.method == "GET" && !legalAnonymousPaths.includes(req.path) && !sessionResult.success) {
        res.redirect("/login/");
      } else {
        next();
      }
    });

    app.use(express.static(config.static_path));

    // endpoints

    app.post("/api/register", jsonParser, async (req, res) => {
      let result = await model.registerNewAccount(sql_conn, req.body);
      if (result.success) {
        console.log(`Registered new account with username '${req.body.username}'`);
        result.loginAttempt = await model.login(sql_conn, req.body, req.ip, config.sessionLength);
        if (result.loginAttempt.success)
          console.log(`User '${req.body.username}' Logged in`);
      }
      res.send(JSON.stringify(result));
    });

    app.post("/api/login", jsonParser, async (req, res) => {
      let result = await model.login(sql_conn, req.body, req.ip, config.sessionLength);
      res.send(JSON.stringify(result));
      if (result.success) 
        console.log(`User '${req.body.username}' Logged in`);
    });

    app.post("/api/getsession", jsonParser, async (req, res) => {
      let result = await model.getSession(sql_conn, req.ip);
      if (result.success) {
        result = await model.getSessionUser(sql_conn, result.id)
      }
      res.send(JSON.stringify(result));
    });

    app.post("/api/logout", async (req, res) => {
      let result = await model.getSession(sql_conn, req.ip);
      if (result.success) {
        let userdata = await model.getSessionUser(sql_conn, result.id);
        result = await model.logout(sql_conn, userdata.userid);
        res.send(JSON.stringify(result));
        if (result.success) 
          console.log(`User '${userdata.username}' Logged out`);
      } else {
        res.send(JSON.stringify({
          success: false,
          code: "LoggedOut",
          message: "You are already logged out"
        }));
      }
    })

    // end of endpoints

    app.listen(config.port, () => {
      console.log(`Server listening on port ${config.port}`);
    });
  })();
} catch (err) {
  console.log(err);
}
