const fs = require('fs');
const filePath = 'control de entrega.html';
let content = fs.readFileSync(filePath, 'utf8');

// Fix broken regex patterns that span multiple lines
content = content.replace(/\/\^\\d\{4\}\s+-\\d\{2\}\s+-\\d\{2\}\s+\$ \//g, '/^\\d{4}-\\d{2}-\\d{2}$/');

// Fix expanded template strings (optional but cleans up a lot)
content = content.replace(/\$\{\s+/g, '${');
content = content.replace(/\s+\}/g, '}');

// Fix the specific broken regex I saw in step 319
content = content.replace(/\/\^\\d\{4\}\s+-\\d\{2\}\s+-\\d\{2\}\s+\$ \//g, '/^\\d{4}-\\d{2}-\\d{2}$/');
// And this one: /^\d{4}\s+-\d{2}\s+-\d{2}\s+\$/
content = content.replace(/\/\^\\d\{4\}\s+-\\d\{2\}\s+-\\d\{2\}\s+\$/g, '/^\\d{4}-\\d{2}-\\d{2}$/');

// Remove duplicated script tags if any
// (I'll just trust the regex fixes for now)

fs.writeFileSync(filePath, content);
console.log('Fixed file content');
