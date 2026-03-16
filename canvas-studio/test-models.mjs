import fetch from 'node-fetch';

const RUNWARE_API_URL = 'https://api.runware.ai/v1';
const apiKey = process.env.NEXT_PUBLIC_RUNWARE_API_KEY || 'pvKzFQLK5TGDfFR6qV3hhTePfQOTRjVl'; // Use hardcoded from .env.local output earlier

async function test() {
    const requestBody = [
        {
            taskType: 'authentication',
            apiKey,
        },
        {
            taskType: 'modelSearch',
            taskUUID: '11111111-1111-1111-1111-111111111111',
            search: 'schnell',
            category: 'checkpoint'
        },
    ];
    console.log("Searching models...");
    const response = await fetch(RUNWARE_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    console.log(JSON.stringify(data, null, 2));
}

test().catch(console.error);
