const fs = require('fs');
const path = 'src/components/ui/client-interview-hub.tsx';
let code = fs.readFileSync(path, 'utf8');

const regex = /[ \t]*<\/div>\r?\n[ \t]*\{isFrench \? "Charger" : "Load"\}[\s\S]*?\r?\n[ \t]*<\/div>\r?\n[ \t]*<\/div>\r?\n[ \t]*\);\r?\n[ \t]*\}/;

const match = code.match(regex);
if (match) {
  const newCode = code.replace(regex, '          </div>\n\n        </div>\n      </div>\n    );\n  }');
  fs.writeFileSync(path, newCode, 'utf8');
  console.log('Successfully fixed layout!');
} else {
  console.log('Regex not matched');
}
