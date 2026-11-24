// מאחד את כל הקבצים לדף אחד לתצוגה מקדימה: node tools/build-preview.js <קובץ פלט>
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), r = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const out = `<title>מאגר המקוואות</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Assistant:wght@400;600;700&family=Frank+Ruhl+Libre:wght@700&display=swap">
<style>
${r('css/styles.css')}
</style>
<div id="app"></div>
<script>
${['js/data.js', 'js/sun.js', 'js/app.js'].map(r).join('\n')}
</script>
`;
fs.writeFileSync(process.argv[2], out);
