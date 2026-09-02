const axios = require('axios');

async function run() {
    try {
        const r1 = await axios.post('https://menasearch.mawsool.tech/search/people', { industry: ['"Computer Games"'], limit: 1 });
        console.log('Quotes:', r1.data.total);
        
        const r2 = await axios.post('https://menasearch.mawsool.tech/search/people', { industry: [{ match: 'exact', value: 'Computer Games' }], limit: 1 });
        console.log('Object match:', r2.data.total);

    } catch (e) {
        console.error(e.message);
    }
}
run();