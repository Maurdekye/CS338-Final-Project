# CS338-Final-Project
Final project for CS 338, a responsive webapp for managing potential coronavirus contacts.

## Setup

1. Set up a MySQL server, and initialize a schema using the included `database.sql` file in the `mysql/` folder.
2. Run the app once with `npm start` to generate a default config file `config.json`, and then stop it.
3. Set up access to the MySQL schema you just generated in the config file. 
4. Modify any other settings you see fit, then run the app again using `npm start`.
5. The app is accessible via a browser at `https://localhost:8080` by default if all config settings are left unchanged.

This is something I threw together in a couple of days for a school project; don't expect any sort of redundancy, robustness, or user account security. Stored passwords are not hashed. Database access is taken for granted and the program *will* crash if the connection goes down. There are likely many uncaught bugs and security vulnerabilities sprinkled throughout, so use at your own risk.