import fs from 'fs';

const html = fs.readFileSync('dist/index.html', 'utf8');
const cssFile = fs.readdirSync('dist/assets').find(f => f.endsWith('.css'));
const jsFile = fs.readdirSync('dist/assets').find(f => f.endsWith('.js'));
const css = fs.readFileSync(`dist/assets/${cssFile}`, 'utf8');
const js = fs.readFileSync(`dist/assets/${jsFile}`, 'utf8');
const muralB64 = fs.readFileSync('public/MURAL.jpeg').toString('base64');
const showroomB64 = fs.readFileSync('public/SHOWROOM2.jpg').toString('base64');

// body inner markup (strip the module <script src> tag and any <link>)
let body = html.split('<body>')[1].split('</body>')[0];
body = body.replace(/<script[^>]*src=[^>]*><\/script>/g, '').trim();

const out = `<style>
${css}
</style>
${body}
<script>window.__MURAL_DATA_URI="data:image/jpeg;base64,${muralB64}";
window.__SHOWROOM2_DATA_URI="data:image/jpeg;base64,${showroomB64}";</script>
<script type="module">
${js}
</script>
`;

fs.mkdirSync('artifact', { recursive: true });
fs.writeFileSync('artifact/house-of-sextillion.html', out);
console.log('artifact bytes:', out.length, '(', (out.length/1048576).toFixed(2), 'MB )');
