var thisModule = {
  /*
    Get the current session id

    sql: connection to sql database
    ip: the source ip of the request

    returns: object containing information about session id fetch:
      {
        succes: true | false,
        code: "SessionFound" | "NoSession",
        message: "lorum ipsum",
        id: 123
      }
  */
  getSession: async (sql, ip) => {
    let query = `SELECT id FROM sessions WHERE ip = '${ip}' AND sessionExpiry > UNIX_TIMESTAMP();`;
    try {
      let result = await sql.query(query);
      if (result.length === 0) {
        return {
          success: false,
          code: "NoSession",
          message: `No session was found for the ip '${ip}'`
        }
      } else {
        let id = result[0].id;
        return {
          success: true,
          code: "SessionFound",
          message: `Successfully found session id for ip ${ip}`,
          id: id
        }
      }
    } catch (e) {
      console.log(e);
      return {
        success: false,
        code: "Failure",
        message: `Session Retrieval Unsuccessful`,
        error: "" + e
      }
    }
  },

  getSessionUser: async (sql, sessionId) => {
    let checkSessionExistsQuery = `SELECT id FROM sessions WHERE id = ${sessionId};`;
    try {
      let result = await sql.query(checkSessionExistsQuery);
      if (result.length === 0) {
        return {
          success: false,
          code: "NoSession",
          message: `No session was found with id ${sessionId}`
        }
      } else {
        let getSessionDetailsQuery = `SELECT id, username, email, status FROM users WHERE id = (SELECT userid FROM sessions WHERE id = ${sessionId});`;
        let result = await sql.query(getSessionDetailsQuery);
        if (result.length === 0) {
          return {
            success: false,
            code: "Failure",
            message: `Session Retrieval Unsuccessful`
          }
        } else {
          return {
            success: true,
            code: "Success",
            message: `Session Retrieval Successfull`,
            userid: result[0].id,
            username: result[0].username,
            email: result[0].email,
            status: result[0].status
          }
        }
      }
    } catch (e) {
      console.log(e);
      return {
        success: false,
        code: "Failure",
        message: `Session Retrieval Unsuccessful`,
        error: "" + e
      }
    }

  },

  getUser: async (sql, userid) => {
    let getUserQuery = `SELECT username, email, password, status FROM users WHERE userid = ${userid};`;
    try {
      let response = await sql.query(getUserQuery);
      if (response.length === 0) {
        return {
          success: false,
          code: "NoUser",
          message: `No user was found with id ${userid}`
        }
      } else {
        return {
          success: true,
          code: "Success",
          message: `Found user ${response[0].username}`,
          username: response[0].username,
          email: response[0].email,
          password: response[0].password,
          status: result[0].status
        }
      }
    } catch (e) {
      console.log(e);
      return {
        success: false,
        code: "Failure",
        message: `Userdata retrieval Unsuccessful`,
        error: "" + e
      }
    } 
  },

  /*
    Attempt to register a new account

    sql: connection to sql database
    registration: object containing registration information:
      {
        username: 'abcxyz',
        password: 'hunter2',
        email:    'mikehunt@gmail.com'
      }

    returns: object containing information about registration attempt:
      {
        success: true | false,
        code: "Success" | "AccountExists" | "Failure",
        message: "Registration completed successfully" | "registration failed"
      }
  */
  registerNewAccount: async (sql, registration) => {
    let checkAccountNameQuery = `SELECT username FROM users WHERE username = '${registration.username}';`;
    try {
      let result = await sql.query(checkAccountNameQuery);
      if (result.length > 0) {
        return {
          success: false,
          code: "AccountExists",
          message: `Registration failed: an account with the username '${registration.username}' already exists`
        }
      } else {
        let registrationUpdate = `INSERT INTO users (username, password, email, status) VALUES ('${registration.username}', '${registration.password}', '${registration.email}', 'HEALTHY');`;
        await sql.query(registrationUpdate);
        return {
          success: true,
          code: "Success",
          message: `Registration Successful`
        }
      }
    } catch (e) {
      console.log(e);
      return {
        success: false,
        code: "Failure",
        message: `Registration Unsuccessful`,
        error: "" + e
      }
    }
  },
  /*
    Attempts to log in using the account credentials provided, and creates a new user session

    sql: connection to sql database
    account: object containing account details to log in with
      {
        username: 'abcxyz',
        password: 'hunter2'
      }
    ip: the source ip of the request
    sessionLength: length of time session will last, in seconds

    returns: object containing information about login attempt:
      {
        success: true | false,
        code: "Success" | "AccountNotExist" | "WrongPassword",
        message: "Successfully logged in!"
      }
  */
  login: async (sql, account, ip, sessionLength) => {
    let checkUserDetailsQuery = `SELECT id, password FROM users WHERE username = '${account.username}';`;
    try {
      let result = await sql.query(checkUserDetailsQuery);
      if (result.length === 0) {
        return {
          success: false,
          code: "AccountNotExist",
          message: `No account associated with the username '${account.username}' exists.`
        }
      } else if (result[0].password !== account.password) {
        return {
          success: false,
          code: "WrongPassword",
          message: `The password you entered is incorrect.`
        }
      } else {
        let createOrUpdateSession = `INSERT INTO sessions (userid, ip, sessionExpiry) VALUES ('${result[0].id}', '${ip}', UNIX_TIMESTAMP() + ${sessionLength}) ON DUPLICATE KEY UPDATE userid = VALUES(userid), sessionExpiry = VALUES(sessionExpiry);`;
        await sql.query(createOrUpdateSession);
        return {
          success: true,
          code: "Success",
          message: `Successfully logged in.`
        }
      }
    } catch (e) {
      console.log(e);
      return {
        success: false,
        code: "Failure",
        message: `Failed to create new session.`,
        error: "" + e
      }
    }
  },

  logout: async (sql, userid) => {
    let deleteSessionUpdate = `DELETE FROM sessions WHERE userid = '${userid}';`;
    try {
      await sql.query(deleteSessionUpdate);
      return {
        success: true,
        code: "Success",
        message: "Successfully logged out"
      }
    } catch (e) {
      console.log(e);
      return {
        success: false,
        code: "Failure",
        message: "Failed to log out",
        error: "" + e
      }
    }
  },

  /*
    changePasswordData:
      {
        userid: 123,
        newPassword: "abc456"
      }
  */
  changePassword: async (sql, changePasswordData) => {
    let changePasswordUpdate = `UPDATE users SET password = '${changePasswordData.newPassword}' WHERE id = ${changePasswordData.userid};`;
    try {
      await sql.query(changePasswordUpdate);
      return {
        success: true,
        code: "Success",
        message: "Successfully changed password",
      }    
    } catch (e) {
      console.log(e);
      return {
        success: false,
        code: "Failure",
        message: "Failed to changed password",
        error: "" + e
      }    
    }
  },

  /*
    changeStatusData:
      {
        userid: 123,
        status: "HEALTHY"
      }
  */
  changeStatus: async (sql, changeStatusData) => {
    if (!["HEALTHY", "SYMPTOMATIC", "INFECTED", "RECOVERING", "HEALTHY-IMMUNE"].includes(changeStatusData.status)) {
      return {
        success: false,
        code: "InvalidStatus",
        message: "Given status is invalid. Valid statuses are HEALTHY, SYMPTOMATIC, INFECTED, RECOVERING, and HEALTHY-IMMUNE"
      }
    } else {
      let statusUpdate = `UPDATE users SET status = '${changeStatusData.status}' WHERE id = ${changeStatusData.userid};`;
      try {
        await sql.query(statusUpdate);
        return {
          success: true,
          code: "Success",
          message: "Successfully updated status",
        }    
      } catch (e) {
        console.log(e);
        return {
          success: false,
          code: "Failure",
          message: "Failed to update status",
          error: "" + e
        }    
      }
    }
  },

  /*
    retroPropogationData:
      {
        uaserid: 123,
        retroTime: 86400,
        contagionRisk: LOW
      }
  */
  contagionRetroPropogation: async (sql, retroPropogationData) => {
    if (!["LOW", "HIGH"].includes(retroPropogationData.contagionRisk)) {
      return {
        success: false,
        code: "InvalidRisk",
        message: "Given contagion risk is invalid. Valid risk values are LOW and HIGH"
      }
    } else {
      let contagionRiskUpdate = `UPDATE visits SET contagionRisk = '${retroPropogationData.contagionRisk}' WHERE userid = ${retroPropogationData.userid} AND time < UNIX_TIMESTAMP() AND time > UNIX_TIMESTAMP() - ${retroPropogationData.retroTime};`;
      if (retroPropogationData.contagionRisk == "LOW") {
        contagionRiskUpdate = `UPDATE visits SET contagionRisk = '${retroPropogationData.contagionRisk}' WHERE userid = ${retroPropogationData.userid} AND time < UNIX_TIMESTAMP() AND time > UNIX_TIMESTAMP() - ${retroPropogationData.retroTime} AND contagionRisk != 'HIGH';`;
      }
      try {
        await sql.query(contagionRiskUpdate);
        return {
          success: true,
          code: "Success",
          message: "Successfully retropropogated contagion risk"
        }
      } catch (e) {
        console.log(e);
        return {
          success: false,
          code: "Failure",
          message: "Failed to retropropogate contagion risk",
          error: "" + e
        }    
      }
    }
  }
}

Object.assign(exports, thisModule);