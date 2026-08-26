import fs from 'fs';

const html = fs.readFileSync('dist/index.html', 'utf8');
const cssFile = fs.readdirSync('dist/assets').find(f => f.endsWith('.css'));
const jsFile = fs.readdirSync('dist/assets').find(f => f.endsWith('.js'));
const css = fs.readFileSync(`dist/assets/${cssFile}`, 'utf8').replace(/<\/style/gi, '<\\/style');
// Escape any </script> occurrences in the bundle, or they close the inline
// <script> tag early and truncate everything after them.
const js = fs.readFileSync(`dist/assets/${jsFile}`, 'utf8').replace(/<\/script/gi, '<\\/script');

// Inline the section images so the single-file artifact is self-contained.
const imgMap = {
  'collection': 'public/collection.jpg',
  'lookbook/1': 'public/lookbook/1.jpg',
  'lookbook/2': 'public/lookbook/2.jpg',
  'lookbook/3': 'public/lookbook/3.jpg',
};
const IMG = {};
for (const [k, p] of Object.entries(imgMap)) {
  if (fs.existsSync(p)) {
    const ext = p.endsWith('.png') ? 'png' : 'jpeg';
    IMG[k] = `data:image/${ext};base64,` + fs.readFileSync(p).toString('base64');
  }
}

// body inner markup (the <body> tag now carries data-bg/data-fg attributes, so
// match it with a regex rather than a literal split). Strip the module <script src>.
const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
if (!bodyMatch) throw new Error('could not find <body> in dist/index.html');
let body = bodyMatch[1];
body = body.replace(/<script[^>]*src=[^>]*><\/script>/g, '').trim();

// Duru Sans is self-hosted via an inlined @font-face in the CSS, so no font <link>
// is needed — the artifact is fully self-contained.
// __IMG must be defined before the module runs — put it first.
const out = `<title>SEXTILLION</title>
<script>window.__IMG=${JSON.stringify(IMG)};</script>
<style>
${css}
</style>
${body}
<script type="module">
${js}
</script>
`;

fs.mkdirSync('artifact', { recursive: true });
fs.writeFileSync('artifact/house-of-sextillion.html', out);
console.log('artifact bytes:', out.length, '(', (out.length/1048576).toFixed(2), 'MB )');
