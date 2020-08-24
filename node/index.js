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

const invalidSessionResponse = JSON.stringify({
  success: false,
  code: "InvalidSession",
  message: "Session invalid; please log back in."
});

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

    let sql = await mysql.createConnection(config.mysql);

    // middleware installation

    app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} [${req.ip}] ${req.method} ${req.path}`);
      next();
    })

    app.use(async (req, res, next) => {
      let sessionResponse = await model.getSession(sql, req.ip);
      req.session = {
        type: "Anonymous"
      }
      if (sessionResponse.success) {
        let userDataResponse = await model.getSessionUser(sql, sessionResponse.id);
        req.session.type = "User";
        req.session.id = sessionResponse.id;
        if (userDataResponse.success) {
          req.session.user = {
            id: userDataResponse.userid,
            username: userDataResponse.username,
            password: userDataResponse.password,
            email: userDataResponse.email,
            status: userDataResponse.status
          };
        }
      }
      if (req.method == "GET" && !legalAnonymousPaths.includes(req.path) && req.session.type === "Anonymous") {
        res.redirect("/login/");
      } else {
        next();
      }
    });

    app.use(express.static(config.staticPath));

    // API endpoints

    app.post("/api/register", jsonParser, async (req, res) => {
      let result = await model.registerNewAccount(sql, {
        username: req.body.username,
        password: req.body.password,
        email: req.body.email
      });
      if (result.success) {
        console.log(`Registered new account with username '${req.body.username}'`);
        result.loginAttempt = await model.login(sql, {
          username: req.body.username,
          password: req.body.password
        }, req.ip, config.sessionLength);
        if (result.loginAttempt.success)
          console.log(`User '${req.body.username}' Logged in`);
      }
      res.send(JSON.stringify(result));
    });

    app.post("/api/login", jsonParser, async (req, res) => {
      let result = await model.login(sql, {
          username: req.body.username,
          password: req.body.password
      }, req.ip, config.sessionLength);
      res.send(JSON.stringify(result));
      if (result.success) 
        console.log(`User '${req.body.username}' Logged in`);
    });

    app.post("/api/getsession", jsonParser, async (req, res) => {
      let session = JSON.parse(JSON.stringify(req.session));
      if (session.type === "User")
        delete session.user.password;
      res.send(JSON.stringify({
        success: true,
        code: "Success",
        message: "Successfully fetched session information",
        session: session
      }));
    });

    app.post("/api/logout", async (req, res) => {
      if (req.session.type === "User") {
        result = await model.logout(sql, req.session.user.id);
        res.send(JSON.stringify(result));
        if (result.success) 
          console.log(`User '${req.session.user.username}' Logged out`);
      } else if (req.session.type === "Anonymous") {
        res.send(JSON.stringify({
          success: false,
          code: "LoggedOut",
          message: "You are already logged out"
        }));
      }
    });

    app.post("/api/changepassword", jsonParser, async (req, res) => {
      if (req.session.type === "User") {
        result = await model.changePassword(sql, {
          userid: req.session.user.id,
          newPassword: req.body.newPassword
        });
        if (result.success) {
          console.log(`User '${req.session.user.username}' changed their password`);
        }
        res.send(JSON.stringify(result));
      } else if (req.session.type === "Anonymous") {
        res.send(invalidSessionResponse);
      }
    });

    app.post("/api/updatestatus", jsonParser, async (req, res) => {
      if (req.session.type === "User") {
        if (req.session.user.status == req.body.status) {
          res.send(JSON.stringify({
            success: true,
            code: "StatusUnchanged",
            message: `Your status is already set to ${req.session.user.status}`
          }));
        } else {
          let result = await model.changeStatus(sql, {
            userid: req.session.user.id,
            status: req.body.status 
          });
          if (result.success) {
            console.log(`User ${req.session.user.username} has updated their infection status to ${req.body.status}`);
            if (config.infectionRetropropogation.hasOwnProperty(req.body.status)) {
              result = await model.contagionRetroPropogation(sql, {
                userid: req.session.user.id,
                retroTime: config.infectionRetropropogation[req.body.status],
                contagionRisk: config.infectionPropogationRisk[req.body.status]
              });
            }
          }
          res.send(JSON.stringify(result));
        }
      } else if (req.session.type === "Anonymous") {
        res.send(invalidSessionResponse);
      }
    });

    // app.post("/api/getlocations", async (req, res) => {
    //   if (req.session.type === "User") {
    //     let response = await model.getLocations(sql, req.session.user.id);

    //   } else if (req.session.type === "Anonymous") {
    //     res.send(invalidSessionResponse);
    //   }
    // });

    // end of endpoints

    app.listen(config.port, () => {
      console.log(`Server listening on port ${config.port}`);
    });

  })();
} catch (err) {
  console.log(err);
}
