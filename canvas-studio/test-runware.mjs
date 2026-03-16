import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';

const RUNWARE_API_URL = 'https://api.runware.ai/v1';
const MODEL_ID = 'google:4@2';
const apiKey = process.env.NEXT_PUBLIC_RUNWARE_API_KEY;

async function test() {
    if (!apiKey) {
        console.error("No API key found.");
        return;
    }

    const requestBody = [
        {
            taskType: 'authentication',
            apiKey,
        },
        {
            taskType: 'imageInference',
            taskUUID: uuidv4(),
            model: MODEL_ID,
            width: 1024,
            height: 1024,
            numberResults: 1,
            outputType: ['URL'],
            outputFormat: 'JPEG',
            positivePrompt: "A beautiful sunset over the mountains",
            referenceImages: ["data:image/jpeg;base64,/9j/4AAQSkZ...", "data:image/jpeg;base64,/9j/4AAQSkZ..."],
        },
    ];
    console.log("Sending request...");
    const response = await fetch(RUNWARE_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    console.log(JSON.stringify(data, null, 2));
}

test().catch(console.error);
