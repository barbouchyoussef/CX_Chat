const fs = require('fs');
const path = 'src/components/ui/client-interview-hub.tsx';
let content = fs.readFileSync(path, 'utf8');

// Normalize line endings to LF for easier index processing
let lines = content.replace(/\r\n/g, '\n').split('\n');

console.log('--- BEFORE FIX ---');
for (let i = 1060; i < 1085; i++) {
  console.log(`${i+1}: ${lines[i]}`);
}

// Replace the lines between index 1066 (line 1067) and index 1081 (line 1082) inclusive
// 0-indexed: index 1066 to 1081
const before = lines.slice(0, 1066);
const after = lines.slice(1082);

const replacement = [
  '          </div>',
  '',
  '        </div>',
  '      </div>',
  '    );',
  '  }'
];

const newLines = before.concat(replacement, after);
fs.writeFileSync(path, newLines.join('\n'), 'utf8');
console.log('--- Successfully replaced layout range ---');
