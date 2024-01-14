// WARN: The replit-db node module doesn't seem to properly percentcode keys/values
// Users strongly encouraged to do this manually
// Also, it seems to make all values into strings, while bare curl doesn't do this

// NOTE: Some setup required
//
// 1. Make sure you have an .env file with a line pointing to your database folder:
// Example:
// REPLIT_DB_URL=http://localhost:3000/db
//
// 2. Include this db-api.js file in the root folder with your app.js/index.js
//
// 3. Add these lines to your app/index file after intializing express:
// app.use('/db', express.static('db'));
// const dbApi = require('./db-api');
// app.use('/db', dbApi);
//
// 4. Tinker with the settings below to match your environment

// ##########
// # SETTINGS
//
// # Debug mode
// - Shows API calls server receives from clients
const debugMode = true;
//
// # Database path
const dbPathWithLeadingSlash = '/db';
//
// # Express web server port
const port = 3000;
//
// #
// ##########

const fs = require('fs');
const path = require('path');
const express = require('express');

// Make this a router so we can use it as middleware in other express setups
const router = express.Router()

// Log all requests made to API; shows in console
// (Enable by setting debugMode to true)
// Installation via terminal:
// npm install express-requests-logger
if (debugMode) {
	const audit = require('express-requests-logger');
	router.use(audit());
}

// For parsing application/x-www-form-urlencoded
// This allows req.body to receive data during .post()
router.use(express.urlencoded({ extended: true }));

const dbPath = path.join(__dirname, dbPathWithLeadingSlash);

// Create db directory if it doesn't exist
if (!fs.existsSync(dbPath)){
	fs.mkdirSync(dbPath);
}

// NOTE: No explicit endpoint for retrieving value by individual key defined here.
// Such requests should simply work as expected

// Endpoint to list keys
router.get('/', (req, res) => {
	fs.readdir(dbPath, (err, files) => {
		if (err) {
			console.error(`Couldn't read directory at ${dbPath} (${err}).`)
			return res.status(500).send(`[db-api] Error 500: Couldn't read directory (${err}).`);
		}

		// Remove dot files
		files = files.filter(file => !file.startsWith('.'));

		// Filter files by prefix if prefix query param exists
		if (req.query.prefix) {
			files = files.filter(file => file.startsWith(req.query.prefix));
		}
		
		// Percent encode each filename if encode query param is true
		if (req.query.encode === 'true') {
			files = files.map(file => encodeURIComponent(file));
		}

		res.status(200).send(files.join('\n'));
	});
});

function postPairs(pairs, res) {
	// Curl can set multiple keys can be set at once (foo=bar&spam=eggs)
	// But we can only send one status message back
	let badKeys = 0;
	let lastError = '';
	
	for (const key in pairs) {
		const filePath = path.join(dbPath, key);
	
		fs.writeFile(filePath, pairs[key], 'utf8', (err) => {
			if (err) {
				console.error(`Couldn't write ${key} (${err}).`);
				lastError = err;
				badKeys++;
			}
		});
	}
	if (badKeys) {
		res.status(500).send(`[db-api] Error 500: Couldn't write ${badKeys} key(s) (${lastError}).`);
	} else {
		res.status(200).send('[db-api] File(s) successfully written.');
	}
}

// Endpoint #1 to set key+value pair (post to root)
router.post('/', (req, res) => {
	if (JSON.stringify(req.body) === '{}') {
		return res.status(400).send('[db-api] No data provided or no data received.');
	}

	postPairs(req.body, res);
});

// Endpoint #2 to set key+value pair (post to full url)
// Only takes one key and must not include special chars
router.post('*', (req, res) => {
	const fullURL = new URL(req.url, `http://${req.headers.host}`);
	// Get just the `/foo=bar` and strip the slash
	const pathName = fullURL.pathname.slice(1);
	// Make sure it's in `foo=bar` format
	if (!pathName.includes('=')) {
		return res.status(400).send(`[db-api] Must post in format \`url -XPOST http://${req.headers.host}/key=value\`.`);
	}

	// Make into an object
	const mix = pathName.split('=');
	const pairs = {};
	pairs[mix[0]] = mix[1];

	postPairs(pairs, res);
});

// Endpoint to delete key
router.delete('/:filename', (req, res) => {
	const { filename } = req.params;

	if (!filename) {
		return res.status(400).send('[db-api] Filename is required to delete.');
	}

	const filePath = path.join(dbPath, filename);

	fs.access(filePath, fs.constants.F_OK, (err) => {
		// Check file exists
		if (err) {
			return res.status(404).send(`[db-api] Could not delete ${filename}: file not found.`);
		}

		fs.unlink(filePath, (err) => {
			if (err) {
				console.error(`Couldn't delete file at ${filePath} (${err}).`);
				return res.status(500).send(`[db-api] Error 500: Couldn't delete file "${filename}" (${err}).`);
			}
			res.status(200).send(`[db-api] File "${filename}" deleted successfully.`);
		});
	});
});

module.exports = router