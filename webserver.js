const express = require('express');
const multer = require('multer');
const bodyParser = require('body-parser');
const fs = require('fs');
const fca = require("fca-unofficial");

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(bodyParser.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    res.send(`
        <form action="/setup" method="post">
            <label>How many IDs do you want to login with?</label>
            <input type="number" name="numberOfIds" required>
            <button type="submit">Next</button>
        </form>
    `);
});

app.post('/setup', (req, res) => {
    const numberOfIds = parseInt(req.body.numberOfIds);
    let idInputs = '';

    for (let i = 1; i <= numberOfIds; i++) {
        idInputs += `
            <label>Choose AppState File for ID ${i}</label>
            <input type="file" name="appStateFile${i}" required><br>
        `;
    }

    res.send(`
        <form action="/targets" method="post" enctype="multipart/form-data">
            ${idInputs}
            <input type="hidden" name="numberOfIds" value="${numberOfIds}">
            <label>How many targets do you want to message?</label>
            <input type="number" name="numberOfTargets" required>
            <button type="submit">Next</button>
        </form>
    `);
});

app.post('/targets', upload.any(), (req, res) => {
    const numberOfIds = parseInt(req.body.numberOfIds);
    const numberOfTargets = parseInt(req.body.numberOfTargets);

    let idFiles = [];
    for (let i = 1; i <= numberOfIds; i++) {
        const appStateFile = req.files.find(file => file.fieldname === `appStateFile${i}`);
        idFiles.push(appStateFile.path);
    }

    let targetInputs = '';
    for (let i = 1; i <= numberOfTargets; i++) {
        targetInputs += `
            <label>Enter Target ID ${i}</label>
            <input type="text" name="targetId${i}" required><br>
            <label>Choose Message File for Target ${i}</label>
            <input type="file" name="messageFile${i}" required><br>
            <label>Enter Hater Name for Target ${i}</label>
            <input type="text" name="haterName${i}" required><br>
        `;
    }

    res.send(`
        <form action="/sendMessages" method="post" enctype="multipart/form-data">
            ${targetInputs}
            <input type="hidden" name="numberOfTargets" value="${numberOfTargets}">
            ${idFiles.map((file, index) => `<input type="hidden" name="appStatePath${index + 1}" value="${file}">`).join('')}
            <label>Enter Time Interval (in seconds)</label>
            <input type="number" name="interval" required>
            <button type="submit">Start Messaging</button>
        </form>
    `);
});

app.post('/sendMessages', upload.any(), (req, res) => {
    const numberOfTargets = parseInt(req.body.numberOfTargets);
    const interval = parseInt(req.body.interval) * 1000;
    let apis = [];

    for (let i = 1; i <= numberOfTargets; i++) {
        const appStatePath = req.body[`appStatePath${i}`];
        const appState = JSON.parse(fs.readFileSync(appStatePath, 'utf8'));

        fca({ appState: appState }, (err, api) => {
            if (err) {
                res.send(`Error logging in with AppState file for ID ${i}: ${err.message}`);
                return;
            }
            apis.push(api);

            if (apis.length === numberOfTargets) {
                startMessaging(req, res, apis, interval);
            }
        });
    }
});

function startMessaging(req, res, apis, interval) {
    const targets = [];
    for (let i = 1; i <= parseInt(req.body.numberOfTargets); i++) {
        const targetId = req.body[`targetId${i}`];
        const haterName = req.body[`haterName${i}`];
        const messageFile = req.files.find(file => file.fieldname === `messageFile${i}`);
        const messages = fs.readFileSync(messageFile.path, 'utf8').split('\n').filter(Boolean);

        targets.push({
            id: targetId,
            haterName: haterName,
            messages: messages,
            currentIndex: 0
        });
    }

    let currentTargetIndex = 0;
    let currentApiIndex = 0;

    setInterval(() => {
        const target = targets[currentTargetIndex];
        const api = apis[currentApiIndex];
        const message = `${target.haterName} ${target.messages[target.currentIndex]}`;

        api.sendMessage(message, target.id, () => {});

        target.currentIndex = (target.currentIndex + 1) % target.messages.length;
        currentTargetIndex = (currentTargetIndex + 1) % targets.length;
        currentApiIndex = (currentApiIndex + 1) % apis.length;

    }, interval);

    res.send('Messaging started successfully!');
}

app.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});
