const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs').promises;
const mysql = require('promise-mysql');
const model = require('./model.js')

async function getConfig(confPath, defaultConfig) {
  let config = JSON.parse(JSON.stringify(defaultConfig));
  try {
    let rawCfg = await fs.readFile(confPath);
    let loadedCfg = JSON.parse(rawCfg);
    Object.assign(config, loadedCfg);
  } catch(e) {}

  await fs.writeFile(confPath, JSON.stringify(config, null, 4));
  return config;
}

const legalAnonymousPaths = [
  "/",
  "/navbar.htm",
  "/navbar.js",
  "/login/",
  "/register/",
  "/favicon.ico"
]

async function matchSessionUser(sql, ip, userid) {
  let result = await model.getSession(sql, ip);
  if (result.success) {
    result = await model.getSessionUser(sql, result.id);
    if (result.success && result.userid !== userid) {
      return {
        success: false,
        code: "SessionMismatch",
        message: "User-session mismatch during password change request, possible account breach attempt detected"
      }
    }
  }
  return result;
}

try{
  (async () => {

    // initialization

    const app = express();
    const config = await getConfig('./config.json', {
      port: 8080,
      staticPath: "public_html",
      mysql: {
        host: 'localhost',
        user: 'user',
        password: 'password',
        database: 'database'
      },
      sessionLength: 86400,
      infectionRetropropogation: {
        "SYMPTOMATIC": 5 * 86400,
        "INFECTED": 14 * 86400,
        "RECOVERING": 5 * 86400
      },
      infectionPropogationRisk: {
        "SYMPTOMATIC": "LOW",
        "INFECTED": "HIGH",
        "RECOVERING": "LOW"
      },
      visitFudgeTime: 86400
    });
    let jsonParser = bodyParser.json();

    let sqlConn = await mysql.createConnection(config.mysql);

    // middleware installation

    app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} [${req.ip}] ${req.method} ${req.path}`);
      next();
    })

    app.use(async (req, res, next) => {
      let sessionResult = await model.getSession(sqlConn, req.ip);
      if (sessionResult.success) {
        req.sessionToken = sessionResult.id;
      }
      if (req.method == "GET" && !legalAnonymousPaths.includes(req.path) && !sessionResult.success) {
        res.redirect("/login/");
      } else {
        next();
      }
    });

    app.use(express.static(config.staticPath));

    // API endpoints

    app.post("/api/register", jsonParser, async (req, res) => {
      let result = await model.registerNewAccount(sqlConn, req.body);
      if (result.success) {
        console.log(`Registered new account with username '${req.body.username}'`);
        result.loginAttempt = await model.login(sqlConn, req.body, req.ip, config.sessionLength);
        if (result.loginAttempt.success)
          console.log(`User '${req.body.username}' Logged in`);
      }
      res.send(JSON.stringify(result));
    });

    app.post("/api/login", jsonParser, async (req, res) => {
      let result = await model.login(sqlConn, req.body, req.ip, config.sessionLength);
      res.send(JSON.stringify(result));
      if (result.success) 
        console.log(`User '${req.body.username}' Logged in`);
    });

    app.post("/api/getsession", jsonParser, async (req, res) => {
      let result = await model.getSession(sqlConn, req.ip);
      if (result.success) {
        let newResult = await model.getSessionUser(sqlConn, result.id)
        result.sessionid = newResult.id;
        result = newResult;
      }
      res.send(JSON.stringify(result));
    });

    app.post("/api/logout", async (req, res) => {
      let result = await model.getSession(sqlConn, req.ip);
      if (result.success) {
        let userdata = await model.getSessionUser(sqlConn, result.id);
        result = await model.logout(sqlConn, userdata.userid);
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
    });

    app.post("/api/changepassword", jsonParser, async (req, res) => {
      let result = await matchSessionUser(sqlConn, req.ip, req.body.userid);
      if (result.success) {
        let username = result.username;
        result = await model.changePassword(sqlConn, req.body);
        if (result.success) {
          console.log(`User '${username}' changed their password`);
        }
      }
      res.send(JSON.stringify(result));
    });

    app.post("/api/updatestatus", jsonParser, async (req, res) => {
      let result = await matchSessionUser(sqlConn, req.ip, req.body.userid);
      if (result.success) {
        if (result.status == req.body.status) {
          result = {
            success: true,
            code: "StatusUnchanged",
            message: `Your status is already set to ${result.status}`
          };
        } else {
          let userdata = result;
          result = await model.changeStatus(sqlConn, req.body);
          if (result.success) {
            console.log(`User ${userdata.username} has updated their infection status to ${req.body.status}`);
            if (config.infectionRetropropogation.hasOwnProperty(req.body.status)) {
              result = await model.contagionRetroPropogation(sqlConn, {
                userid: userdata.userid,
                retroTime: config.infectionRetropropogation[req.body.status],
                contagionRisk: config.infectionPropogationRisk[req.body.status]
              });
            }
          }
        }
      }
      res.send(JSON.stringify(result));
    });

    // end of endpoints

    app.listen(config.port, () => {
      console.log(`Server listening on port ${config.port}`);
    });

  })();
} catch (err) {
  console.log(err);
}
