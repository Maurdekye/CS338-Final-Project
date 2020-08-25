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

function log(ip, message) {
  console.log(`${new Date().toISOString()} [${ip}] ${message}`);
}

function isUserSession(session, res) {
  if (session.type === "Anonymous") {
    res.send(JSON.stringify({
      success: false,
      code: "InvalidSession",
      message: "Session invalid; please log back in."
    }));
    return false;
  } else {
    return true;
  }
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
      visitFudgeTime: 86400,
      maxVisitsToCheck: 100
    });
    let jsonParser = bodyParser.json();

    let sql = await mysql.createConnection(config.mysql);

    // middleware installation

    app.use((req, res, next) => {
      log(req.ip, `${req.method} ${req.path}`);
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
        log(req.ip, `Registered new account with username '${req.body.username}'`);
        result.loginAttempt = await model.login(sql, {
          username: req.body.username,
          password: req.body.password
        }, req.ip, config.sessionLength);
        if (result.loginAttempt.success)
          log(req.ip, `User '${req.body.username}' Logged in`);
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
        log(req.ip, `User '${req.body.username}' Logged in`);
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
          log(req.ip, `User '${req.session.user.username}' Logged out`);
      } else if (req.session.type === "Anonymous") {
        res.send(JSON.stringify({
          success: false,
          code: "LoggedOut",
          message: "You are already logged out"
        }));
      }
    });

    app.post("/api/changepassword", jsonParser, async (req, res) => {
      if (isUserSession(req.session, res)) {
        result = await model.changePassword(sql, {
          userid: req.session.user.id,
          newPassword: req.body.newPassword
        });
        if (result.success) {
          log(req.ip, `User '${req.session.user.username}' changed their password`);
        }
        res.send(JSON.stringify(result));
      }
    });

    app.post("/api/updatestatus", jsonParser, async (req, res) => {
      if (isUserSession(req.session, res)) {
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
            log(req.ip, `User ${req.session.user.username} has updated their infection status to ${req.body.status}`);
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
      }
    });

    app.post("/api/getvisits", jsonParser, async (req, res) => {
      if (isUserSession(req.session, res)) {
        let response = await model.getVisits(sql, req.session.user.id, req.body.maxVisits);
        res.send(JSON.stringify(response));
      }
    });

    app.post("/api/contagiousvisits", async (req, res) => {
      if (isUserSession(req.session, res)) {
        let response = await model.getVisits(sql, req.session.user.id, config.maxVisitsToCheck);
        let assesments = await Promise.all(response.visits.map(async visit => {

          let similarVisitsResponse = await model.getNearbyContagiousVisits(sql, req.session.user.id, visit.locationid, visit.time, config.visitFudgeTime);
          let similarVisits = similarVisitsResponse.visits;
          let risk = "NONE";
          let contacts = [];

          for (let v of similarVisits) {
            if (v.contagionRisk === "LOW" && risk !== "HIGH")
              risk = "LOW";
            else if (v.contagionRisk === "HIGH")
              risk = "HIGH";
            contacts.push({
              userid: v.userid,
              username: v.username,
              locationid: v.locationid,
              locationname: v.name,
              time: v.time,
              contagionRisk: v.contagionRisk
            });
          }

          if (similarVisits.some(v => v.contagionRisk == "HIGH")) {
            risk = "HIGH";
          } else if (similarVisits.some(v => v.contagionRisk == "LOW")) {
            risk = "LOW";
          }

          visit.assessedRisk = risk;
          visit.contacts = contacts;
          return visit;

        }));

        let overallRisk = "NONE";
        for (let v of assesments) {
          if (v.assessedRisk == "LOW" && overallRisk !== "HIGH")
            overallRisk = "LOW";
          else if (v.assessedRisk == "HIGH")
            overallRisk = "HIGH";
        }

        res.send(JSON.stringify({
          success: true,
          code: "Success",
          message: "Assessed risk of all prior visits",
          visits: assesments,
          overallRisk: overallRisk
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
